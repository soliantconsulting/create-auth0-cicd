import assert from "node:assert";
import { ListrEnquirerPromptAdapter } from "@listr2/prompt-adapter-enquirer";
import {
    BitBucketClient,
    type BitbucketRepositoryContext,
    type Environment,
    requireContext,
} from "@soliantconsulting/starter-lib";
import type { ListrTask } from "listr2";
import { z } from "zod";
import type { TenantsBootstrapContext } from "./tenants-bootstrap.js";

const stackOutputsSchema = z.object({
    StateBucketName: z.string().min(1),
    StaticBucketName: z.string().min(1),
    StaticBucketDomainName: z.string().min(1),
    Auth0UserName: z.string().min(1),
});

export type StackOutputs = z.output<typeof stackOutputsSchema>;

type AwsResourcesContext = {
    awsResources: {
        accessKeyId: string;
        secretAccessKey: string;
        stackOutputs: StackOutputs;
    };
};

export const bitbucketPipelineTask: ListrTask<
    Partial<BitbucketRepositoryContext & AwsResourcesContext & TenantsBootstrapContext>
> = {
    title: "Configure Bitbucket pipeline",
    task: async (context, task): Promise<void> => {
        const awsResourcesContext = requireContext(context, "awsResources");
        const bitbucketRepositoryContext = requireContext(context, "bitbucketRepository");
        assert(bitbucketRepositoryContext, "Bitbucket repository context not configured");
        const tenantsBootstrapContext = requireContext(context, "tenantsBootstrap");

        const bitbucket = new BitBucketClient(
            bitbucketRepositoryContext.accessToken,
            bitbucketRepositoryContext.workspace,
            bitbucketRepositoryContext.repository,
        );

        const repositoryVariables = bitbucket.variables();

        await repositoryVariables.replace(
            "SES_ACCESS_KEY_ID",
            awsResourcesContext.accessKeyId,
            false,
        );
        await repositoryVariables.replace(
            "SES_SECRET_ACCESS_KEY",
            awsResourcesContext.secretAccessKey,
            true,
        );

        let environments: Environment[] = [];

        while (true) {
            environments = await bitbucket.getEnvironments();

            if (environments.length > 0) {
                break;
            }

            const tryAgain = await task.prompt(ListrEnquirerPromptAdapter).run<boolean>({
                type: "toggle",
                message: "Pipeline environments not found, try again?",
                initial: true,
                footer: "Verify that the following environments exist: Test, Staging & Production",
            });

            if (!tryAgain) {
                throw new Error("Pipeline environments not found");
            }
        }

        const envs = [
            ["Test", "development"],
            ["Staging", "staging"],
            ["Production", "production"],
        ] as const;

        for (const [pipelineEnv, auth0Env] of envs) {
            const credentials = tenantsBootstrapContext.auth0Credentials[auth0Env];

            if (credentials === null) {
                continue;
            }

            const environment = environments.find(
                (environment) => environment.name === pipelineEnv,
            );

            if (!environment) {
                throw new Error(`Could not find pipeline environment ${pipelineEnv}`);
            }

            const envVariables = bitbucket.variables(environment.uuid);

            await envVariables.replace("AUTH0_DOMAIN", credentials.tenant, false);
            await envVariables.replace("AUTH0_CLIENT_ID", credentials.clientId, false);
            await envVariables.replace("AUTH0_CLIENT_SECRET", credentials.clientSecret, true);
        }
    },
};
