#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import {
    createAwsEnvTask,
    createBitbucketRepositoryTask,
    createDeployRoleTask,
    createGitTask,
    createPnpmVersionTask,
    createProjectTask,
    runPipeline,
} from "@soliantconsulting/starter-lib";
import { apiSettingsTask } from "./tasks/api-settings.js";
import { auth0VersionTask } from "./tasks/auth0-version.js";
import { awsResourcesTask } from "./tasks/aws-resouces.js";
import { bitbucketPipelineTask } from "./tasks/bitbucket-pipeline.js";
import { spaSettingsTask } from "./tasks/spa-settings.js";
import { synth } from "./tasks/synth.js";
import { tenantSettingsTask } from "./tasks/tenant-settings.js";
import { tenantsBootstrapTask } from "./tasks/tenants-bootstrap.js";
import { terraformVersionTask } from "./tasks/terraform-version.js";

export type CdktfContext = {
    cdktf: {
        projectId: string;
    };
};

await runPipeline({
    packageName: "@soliantconsulting/create-auth0-cicd",
    tasks: [
        createPnpmVersionTask("10.0.0"),
        auth0VersionTask,
        terraformVersionTask,
        createAwsEnvTask({
            disallowSkip: true,
        }),
        createBitbucketRepositoryTask({
            disallowSkip: true,
        }),
        createDeployRoleTask(),
        tenantsBootstrapTask,
        tenantSettingsTask,
        spaSettingsTask,
        apiSettingsTask,
        createProjectTask(),
        awsResourcesTask,
        bitbucketPipelineTask,
        synth,
        createGitTask(),
    ],
    baseContext: {
        cdktf: {
            projectId: randomUUID(),
        },
    } satisfies CdktfContext,
});
