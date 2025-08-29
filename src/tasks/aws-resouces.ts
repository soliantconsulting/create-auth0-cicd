import assert from "node:assert";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { IAM } from "@aws-sdk/client-iam";
import { S3 } from "@aws-sdk/client-s3";
import {
    type AwsEnvContext,
    deployStack,
    type ProjectContext,
    requireContext,
} from "@soliantconsulting/starter-lib";
import { CfnOutput, RemovalPolicy, Stack } from "aws-cdk-lib";
import { Effect, PolicyStatement, User } from "aws-cdk-lib/aws-iam";
import { BlockPublicAccess, Bucket } from "aws-cdk-lib/aws-s3";
import type { Construct } from "constructs";
import type { ListrTask } from "listr2";
import { z } from "zod";
import type { SpaSettingsContext } from "./spa-settings.js";

const stackOutputsSchema = z.object({
    StateBucketName: z.string().min(1),
    StaticBucketName: z.string().min(1),
    StaticBucketDomainName: z.string().min(1),
    Auth0UserName: z.string().min(1),
});

export type StackOutputs = z.output<typeof stackOutputsSchema>;

export type AwsResourcesContext = {
    awsResources: {
        accessKeyId: string;
        secretAccessKey: string;
        stackOutputs: StackOutputs;
    };
};

export const awsResourcesTask: ListrTask<
    Partial<ProjectContext & AwsEnvContext & SpaSettingsContext & AwsResourcesContext>
> = {
    title: "Setup AWS resources",
    task: async (context): Promise<void> => {
        const awsEnvContext = requireContext(context, "awsEnv");
        assert(awsEnvContext, "AWS env context not configured");
        const projectContext = requireContext(context, "project");
        const spaSettingsContext = requireContext(context, "spaSettings");

        const outputs = await deployStack(
            awsEnvContext.region,
            projectContext.name,
            (app, stackName) => {
                new Auth0Stack(app, stackName);
            },
            z.object({
                StateBucketName: z.string().min(1),
                StaticBucketName: z.string().min(1),
                StaticBucketDomainName: z.string().min(1),
                Auth0UserName: z.string().min(1),
            }),
        );

        const iam = new IAM({ region: awsEnvContext.region });
        const listAccessKeysResult = await iam.listAccessKeys({
            UserName: outputs.Auth0UserName,
        });

        for (const accessKey of listAccessKeysResult.AccessKeyMetadata ?? []) {
            await iam.deleteAccessKey({
                UserName: outputs.Auth0UserName,
                AccessKeyId: accessKey.AccessKeyId,
            });
        }

        const createAccessKeyResult = await iam.createAccessKey({
            UserName: outputs.Auth0UserName,
        });

        if (
            !(
                createAccessKeyResult.AccessKey?.AccessKeyId &&
                createAccessKeyResult.AccessKey?.SecretAccessKey
            )
        ) {
            throw new Error("Could not create access key");
        }

        const logo = await readFile(
            fileURLToPath(new URL("../../assets/logo.svg", import.meta.url)),
        );

        const s3 = new S3({ region: awsEnvContext.region });
        await s3.putObject({
            Bucket: outputs.StaticBucketName,
            Key: "tenant-logo.svg",
            Body: logo,
            ContentType: "image/svg+xml",
        });
        await s3.putObject({
            Bucket: outputs.StaticBucketName,
            Key: "branding-logo.svg",
            Body: logo,
            ContentType: "image/svg+xml",
        });

        if (spaSettingsContext) {
            await s3.putObject({
                Bucket: outputs.StaticBucketName,
                Key: `${spaSettingsContext.identifier}-logo.svg`,
                Body: logo,
                ContentType: "image/svg+xml",
            });
        }

        context.awsResources = {
            accessKeyId: createAccessKeyResult.AccessKey.AccessKeyId,
            secretAccessKey: createAccessKeyResult.AccessKey.SecretAccessKey,
            stackOutputs: outputs,
        };
    },
};

class Auth0Stack extends Stack {
    public constructor(scope: Construct, id: string) {
        super(scope, id);

        const stateBucket = new Bucket(this, "StateBucket", {
            autoDeleteObjects: true,
            blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
            removalPolicy: RemovalPolicy.DESTROY,
        });

        const staticBucket = new Bucket(this, "StaticBucket", {
            autoDeleteObjects: true,
            publicReadAccess: true,
            blockPublicAccess: new BlockPublicAccess({
                blockPublicAcls: false,
                blockPublicPolicy: false,
                ignorePublicAcls: false,
                restrictPublicBuckets: false,
            }),
            removalPolicy: RemovalPolicy.DESTROY,
        });

        const auth0User = new User(this, "Auth0User");
        auth0User.addToPolicy(
            new PolicyStatement({
                effect: Effect.ALLOW,
                actions: ["ses:SendRawEmail", "ses:SendEmail"],
                resources: ["*"],
            }),
        );

        new CfnOutput(this, "StateBucketName", {
            value: stateBucket.bucketName,
        });

        new CfnOutput(this, "StaticBucketName", {
            value: staticBucket.bucketName,
        });

        new CfnOutput(this, "StaticBucketDomainName", {
            value: staticBucket.bucketDomainName,
        });

        new CfnOutput(this, "Auth0UserName", {
            value: auth0User.userName,
        });
    }
}
