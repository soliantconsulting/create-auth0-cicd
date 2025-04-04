#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { IAM } from "@aws-sdk/client-iam";
import { S3 } from "@aws-sdk/client-s3";
import { STS } from "@aws-sdk/client-sts";
import type { GetCallerIdentityResponse } from "@aws-sdk/client-sts/dist-types/models/models_0.js";
import { ListrEnquirerPromptAdapter } from "@listr2/prompt-adapter-enquirer";
import { getAccessToken } from "@soliantconsulting/bitbucket-cloud-cli-auth";
import camelcase from "camelcase";
import { Listr, ListrLogLevels, ListrLogger } from "listr2";
import meow from "meow";
import semver from "semver/preload.js";
import slug from "slug";
import "source-map-support/register.js";
import { type Auth0Credential, setupTenant } from "./auth0.js";
import { type AwsDeployResult, deployAwsStack } from "./aws-stack.js";
import { BitBucketClient } from "./bitbucket.js";
import { type ApiSettings, type SpaSettings, type TenantSettings, synthProject } from "./synth.js";
import { type ExecuteResult, execute } from "./util.js";

const logger = new ListrLogger();

const cli = meow(
    `
  Usage

    $ npm init @soliantconsulting/auth0-cicd [name|-v|--version|-h|--help]
`,
    {
        booleanDefault: undefined,
        flags: {
            help: {
                type: "boolean",
                shortFlag: "h",
            },
            version: {
                type: "boolean",
                shortFlag: "v",
            },
        },
        importMeta: import.meta,
    },
);

const [name] = cli.input;

type Context = {
    accountId: string;
    workspace: string;
    repository: string;
    deployRoleArn: string;
    bitbucketAccessToken: string;
    name: string;
    region: string;
    repositoryUuid: string;
    projectPath: string;
    projectId: string;
    tenant: TenantSettings;
    spa: SpaSettings | null;
    api: ApiSettings | null;
    awsDeployResult: AwsDeployResult;
    awsAuth0Credentials: {
        accessKeyId: string;
        secretAccessKey: string;
    };
    auth0Credentials: {
        development: Auth0Credential;
        staging: Auth0Credential;
        production: Auth0Credential;
    };
};

const tasks = new Listr<Context>(
    [
        {
            title: "Check pnpm version",
            task: async (_context, task): Promise<void> => {
                let result: ExecuteResult;

                try {
                    result = await execute(task.stdout(), "pnpm", ["--version"]);
                } catch {
                    throw new Error(
                        "pnpm not found, please install latest version: https://pnpm.io/installation",
                    );
                }

                const version = result.stdout.trim();

                if (!semver.gte(version, "8.14.0")) {
                    throw new Error(`pnpm version ${version} found, need at least 8.14.0`);
                }
            },
        },
        {
            title: "Check auth0 version",
            task: async (_context, task): Promise<void> => {
                let result: ExecuteResult;

                try {
                    result = await execute(task.stdout(), "auth0", ["--version"]);
                } catch {
                    throw new Error(
                        "auth0 not found, please install latest version: https://github.com/auth0/auth0-cli?tab=readme-ov-file#installation",
                    );
                }

                const versionMatch = result.stdout.match(/version ([^ ]+)/);

                if (!versionMatch) {
                    throw new Error("Could not match version");
                }

                const version = versionMatch[1];

                if (!semver.gte(version, "1.4.0")) {
                    throw new Error(`auth0 version ${version} found, need at least 1.4.0`);
                }
            },
        },
        {
            title: "Check terraform version",
            task: async (_context, task): Promise<void> => {
                let result: ExecuteResult;

                try {
                    result = await execute(task.stdout(), "terraform", ["--version"]);
                } catch {
                    throw new Error(
                        "terraform not found, please install latest version: https://developer.hashicorp.com/terraform/tutorials/aws-get-started/install-cli",
                    );
                }

                const versionMatch = result.stdout.match(/v([0-9.]+)/);

                if (!versionMatch) {
                    throw new Error("Could not match version");
                }

                const version = versionMatch[1];

                if (!semver.gte(version, "1.7.4")) {
                    throw new Error(`terraform version ${version} found, need at least 1.7.4`);
                }
            },
        },
        {
            title: "Retrieve AWS account ID",
            task: async (context, _task): Promise<void> => {
                const sts = new STS({ region: "us-east-1" });
                let identity: GetCallerIdentityResponse;

                try {
                    identity = await sts.getCallerIdentity({});
                } catch (error) {
                    throw new Error(
                        "Could not acquire account ID, have you set up AWS env variables?",
                    );
                }

                if (!identity.Account) {
                    throw new Error("Failed to acquire account ID from identity");
                }

                context.accountId = identity.Account;
            },
        },
        {
            title: "Setup tenants",
            task: async (_context, task): Promise<void> => {
                const prompt = task.prompt(ListrEnquirerPromptAdapter);
                const confirmed = await prompt.run<boolean>({
                    type: "confirm",
                    message: "Created and logged into all tenants?",
                    footer:
                        "You must create three tenants (<name>, <name>-development, <name>-staging).\n" +
                        "Set each tenants enviornment tag to their respective environment.\n" +
                        "Then run `auth0 login --scopes create:client_grants,delete:connections` for each tenant.",
                });

                if (!confirmed) {
                    throw new Error("Tenants not prepared");
                }
            },
        },
        {
            title: "Configure tenants",
            task: async (context, task): Promise<Listr> => {
                const rawTenants = await execute(null, "auth0", [
                    "tenants",
                    "ls",
                    "--csv",
                    "--no-color",
                ]);

                const tenants = rawTenants.stdout
                    .split("\n")
                    .slice(1)
                    .map((raw) => {
                        const parts = raw.split(",");
                        return parts[parts.length - 1];
                    })
                    .sort();

                if (tenants.length === 0) {
                    throw new Error("No tenants found");
                }

                const envs = ["development", "staging", "production"] as const;
                context.auth0Credentials = {} as unknown as Context["auth0Credentials"];

                return task.newListr<Context>(
                    envs.map((env) => ({
                        title: `Environment ${env}`,
                        task: async (context, task) => {
                            const prompt = task.prompt(ListrEnquirerPromptAdapter);

                            const tenant = await prompt.run<string>({
                                type: "select",
                                message: `Tenant for ${env}:`,
                                choices: tenants,
                            });

                            const confirmed = await prompt.run<boolean>({
                                type: "confirm",
                                message: `WARNING: Confirm to delete all connections and default resources from ${tenant}`,
                            });

                            if (!confirmed) {
                                throw new Error("Operation aborted");
                            }

                            context.auth0Credentials[env] = await setupTenant(
                                tenant,
                                task.stdout(),
                            );
                        },
                    })),
                    { concurrent: false },
                );
            },
        },
        {
            title: "Gather project settings",
            task: async (context, task): Promise<void> => {
                context.projectId = randomUUID();

                const prompt = task.prompt(ListrEnquirerPromptAdapter);

                const repositoryClonePrompt = await prompt.run<string>({
                    type: "input",
                    message: "Repository clone prompt:",
                });

                const repositoryMatch = repositoryClonePrompt.match(
                    /@bitbucket\.org[:\/]([^\/]+)\/(.+)\.git/,
                );

                if (!repositoryMatch) {
                    throw new Error("Invalid repository clone prompt");
                }

                const [, workspace, repository] = repositoryMatch;
                context.workspace = workspace;
                context.repository = repository;

                context.name = await prompt.run<string>({
                    type: "input",
                    message: "Name:",
                    initial: name,
                });

                context.projectPath = path.join(process.cwd(), context.name);
                let projectPathExists = false;

                try {
                    await stat(context.projectPath);
                    projectPathExists = true;
                } catch {
                    // Noop
                }

                if (projectPathExists) {
                    throw new Error(`Path ${context.projectPath} already exists`);
                }

                context.region = await prompt.run<string>({
                    type: "input",
                    message: "AWS region:",
                    initial: "us-east-1",
                });
            },
        },
        {
            title: "Gather tenant settings",
            task: async (context, task): Promise<void> => {
                const prompt = task.prompt(ListrEnquirerPromptAdapter);

                context.tenant = await prompt.run<TenantSettings>([
                    {
                        name: "friendlyName",
                        type: "input",
                        message: "Friendly Name:",
                    },
                    {
                        name: "supportUrl",
                        type: "input",
                        message: "Support URL:",
                    },
                    {
                        name: "supportEmailAddress",
                        type: "input",
                        message: "Support Email Address:",
                    },
                    {
                        name: "defaultFromAddress",
                        type: "input",
                        message: "Default From Address:",
                    },
                ]);
            },
        },
        {
            title: "Gather SPA settings",
            task: async (context, task): Promise<void> => {
                const prompt = task.prompt(ListrEnquirerPromptAdapter);

                const enableSpa = await prompt.run<boolean>({
                    type: "toggle",
                    message: "Enable SPA:",
                    initial: true,
                });

                if (!enableSpa) {
                    context.spa = null;
                    return;
                }

                const name = await prompt.run<string>({
                    type: "input",
                    message: "Friendly name (e.g. My Web):",
                });

                const identifier = slug(name);
                const resourceName = `${camelcase(identifier, { pascalCase: true })}Client`;

                context.spa = {
                    name,
                    identifier,
                    resourceName,
                    propPrefix: camelcase(identifier),
                };
            },
        },
        {
            title: "Gather API settings",
            task: async (context, task): Promise<void> => {
                const prompt = task.prompt(ListrEnquirerPromptAdapter);

                const enableApi = await prompt.run<boolean>({
                    type: "toggle",
                    message: "Enable API:",
                    initial: true,
                });

                if (!enableApi) {
                    context.api = null;
                    return;
                }

                const name = await prompt.run<string>({
                    type: "input",
                    message: "Friendly name (e.g. My API):",
                });

                const identifier = slug(name);
                const resourceName = `${camelcase(identifier, { pascalCase: true })}ResourceServer`;

                context.api = {
                    name,
                    identifier,
                    resourceName,
                };
            },
        },
        {
            title: "Connect to BitBucket",
            task: async (context): Promise<void> => {
                context.bitbucketAccessToken = await getAccessToken("knXh7CKqDtCUHLrhVW", 31337);
            },
        },
        {
            title: "Retrieve repository UUID",
            task: async (context): Promise<void> => {
                const bitbucket = new BitBucketClient(
                    context.bitbucketAccessToken,
                    context.workspace,
                    context.repository,
                );
                context.repositoryUuid = await bitbucket.getRepositoryUuid();
            },
        },
        {
            title: "Configure pipeline environments",
            task: async (context): Promise<void> => {
                const bitbucket = new BitBucketClient(
                    context.bitbucketAccessToken,
                    context.workspace,
                    context.repository,
                );
                await bitbucket.enablePipeline();
                const environments = await bitbucket.getEnvironments();
                const envs = [
                    ["Test", "development"],
                    ["Staging", "staging"],
                    ["Production", "production"],
                ] as const;

                for (const [pipelineEnv, auth0Env] of envs) {
                    const credentials = context.auth0Credentials[auth0Env];
                    const environment = environments.find(
                        (environment) => environment.name === pipelineEnv,
                    );

                    if (!environment) {
                        throw new Error(`Could not find pipeline environment ${pipelineEnv}`);
                    }

                    await bitbucket.createEnvVariable(
                        environment.uuid,
                        "AUTH0_DOMAIN",
                        credentials.tenant,
                        false,
                    );
                    await bitbucket.createEnvVariable(
                        environment.uuid,
                        "AUTH0_CLIENT_ID",
                        credentials.clientId,
                        false,
                    );
                    await bitbucket.createEnvVariable(
                        environment.uuid,
                        "AUTH0_CLIENT_SECRET",
                        credentials.clientSecret,
                        true,
                    );
                }
            },
        },
        {
            title: "Bootstrap CDK",
            task: async (context, task): Promise<void> => {
                await execute(
                    task.stdout(),
                    "pnpm",
                    ["exec", "cdk", "bootstrap", `aws://${context.accountId}/${context.region}`],
                    {
                        cwd: fileURLToPath(new URL(".", import.meta.url)),
                        env: {
                            AWS_REGION: context.region,
                        },
                    },
                );
            },
        },
        {
            title: "Setup AWS resources",
            task: async (context): Promise<void> => {
                const deployResult = await deployAwsStack(context.region);
                const iam = new IAM({ region: context.region });
                const listAccessKeysResult = await iam.listAccessKeys({
                    UserName: deployResult.auth0UserName,
                });

                for (const accessKey of listAccessKeysResult.AccessKeyMetadata ?? []) {
                    await iam.deleteAccessKey({
                        UserName: deployResult.auth0UserName,
                        AccessKeyId: accessKey.AccessKeyId,
                    });
                }

                const createAccessKeyResult = await iam.createAccessKey({
                    UserName: deployResult.auth0UserName,
                });

                if (
                    !(
                        createAccessKeyResult.AccessKey?.AccessKeyId &&
                        createAccessKeyResult.AccessKey?.SecretAccessKey
                    )
                ) {
                    throw new Error("Could not create access key");
                }

                context.awsAuth0Credentials = {
                    accessKeyId: createAccessKeyResult.AccessKey.AccessKeyId,
                    secretAccessKey: createAccessKeyResult.AccessKey.SecretAccessKey,
                };

                const logo = await readFile(
                    fileURLToPath(new URL("../assets/logo.svg", import.meta.url)),
                );

                const s3 = new S3({ region: context.region });
                await s3.putObject({
                    Bucket: deployResult.staticBucketName,
                    Key: "tenant-logo.svg",
                    Body: logo,
                    ContentType: "image/svg+xml",
                });
                await s3.putObject({
                    Bucket: deployResult.staticBucketName,
                    Key: "branding-logo.svg",
                    Body: logo,
                    ContentType: "image/svg+xml",
                });

                if (context.spa) {
                    await s3.putObject({
                        Bucket: deployResult.staticBucketName,
                        Key: `${context.spa.identifier}-logo.svg`,
                        Body: logo,
                        ContentType: "image/svg+xml",
                    });
                }

                context.awsDeployResult = deployResult;
            },
        },
        {
            title: "Configure repository variables",
            task: async (context): Promise<void> => {
                const bitbucket = new BitBucketClient(
                    context.bitbucketAccessToken,
                    context.workspace,
                    context.repository,
                );

                await bitbucket.createRepositoryVariable(
                    "SES_ACCESS_KEY_ID",
                    context.awsAuth0Credentials.accessKeyId,
                    false,
                );
                await bitbucket.createRepositoryVariable(
                    "SES_SECRET_ACCESS_KEY",
                    context.awsAuth0Credentials.secretAccessKey,
                    true,
                );
            },
        },
        {
            title: "Setup deployment role",
            task: async (context, task): Promise<void> => {
                await execute(
                    task.stdout(),
                    "pnpm",
                    [
                        "exec",
                        "bitbucket-openid-connect",
                        "deploy",
                        "bitbucket-openid-connect",
                        context.name,
                        context.repositoryUuid,
                    ],
                    {
                        cwd: fileURLToPath(new URL(".", import.meta.url)),
                        env: {
                            AWS_REGION: context.region,
                        },
                    },
                );

                const result = await execute(
                    task.stdout(),
                    "pnpm",
                    [
                        "exec",
                        "bitbucket-openid-connect",
                        "get-role-arn",
                        "bitbucket-openid-connect",
                        context.name,
                    ],
                    {
                        cwd: fileURLToPath(new URL(".", import.meta.url)),
                        env: {
                            AWS_REGION: context.region,
                        },
                    },
                );

                context.deployRoleArn = result.stdout;
            },
        },
        {
            title: "Synth project",
            task: async (context, task): Promise<void> => {
                await synthProject(context.projectPath, context, task.stdout());
            },
        },
        {
            title: "Git init",
            task: async (context, task): Promise<void> => {
                await execute(task.stdout(), "git", ["init"], { cwd: context.projectPath });
                await execute(task.stdout(), "git", ["add", "."], { cwd: context.projectPath });
                await execute(task.stdout(), "git", ["commit", "-m", '"feat: initial commit"'], {
                    cwd: context.name,
                });
                await execute(
                    task.stdout(),
                    "git",
                    [
                        "remote",
                        "add",
                        "origin",
                        `git@bitbucket.org:${context.workspace}/${context.repository}.git`,
                    ],
                    { cwd: context.name },
                );
                await execute(task.stdout(), "pnpm", ["exec", "lefthook", "install"], {
                    cwd: context.name,
                });

                let forcePush = false;

                try {
                    await execute(task.stdout(), "git", ["push", "-u", "origin", "main"], {
                        cwd: context.name,
                    });
                } catch {
                    forcePush = await task.prompt(ListrEnquirerPromptAdapter).run<boolean>({
                        type: "toggle",
                        message: "Push failed, try force push?",
                        initial: false,
                    });
                }

                if (forcePush) {
                    await execute(task.stdout(), "git", ["push", "-fu", "origin", "main"], {
                        cwd: context.name,
                    });
                }
            },
        },
    ],
    { concurrent: false },
);

try {
    await tasks.run();

    logger.log(
        ListrLogLevels.COMPLETED,
        "Project creation successful, you must run the pipeline manually once.",
    );
} catch (error) {
    logger.log(ListrLogLevels.FAILED, error as string);
}
