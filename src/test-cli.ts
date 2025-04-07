#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import {
    type AwsEnvContext,
    type DeployRoleContext,
    type ProjectContext,
    runPipeline,
} from "@soliantconsulting/starter-lib";
import type { CdktfContext } from "./cli.js";
import type { ApiSettingsContext } from "./tasks/api-settings.js";
import type { AwsResourcesContext } from "./tasks/aws-resouces.js";
import type { SpaSettingsContext } from "./tasks/spa-settings.js";
import { synthTask } from "./tasks/synth.js";
import type { TenantSettingsContext } from "./tasks/tenant-settings.js";

type BaseContext = ProjectContext &
    AwsEnvContext &
    DeployRoleContext &
    CdktfContext &
    ApiSettingsContext &
    AwsResourcesContext &
    SpaSettingsContext &
    TenantSettingsContext;

await runPipeline({
    packageName: "@soliantconsulting/create-auth0-cicd",
    tasks: [synthTask],
    baseContext: {
        cdktf: {
            projectId: randomUUID(),
        },
        project: {
            name: "test-synth",
            path: fileURLToPath(new URL("../test-synth", import.meta.url)),
        },
        awsEnv: {
            accountId: "123456789",
            region: "us-east-1",
        },
        deployRole: {
            arn: "arn://unknown",
        },
        tenantSettings: {
            friendlyName: "Test Tenant",
            supportUrl: "https://example.com",
            supportEmailAddress: "support@example.com",
            defaultFromAddress: "auth0@example.com",
        },
        spaSettings: {
            name: "Test SPA",
            identifier: "test-spa",
            resourceName: "TestSpa",
            propPrefix: "testSpa",
        },
        apiSettings: {
            name: "Test API",
            identifier: "test-api",
            resourceName: "TestApi",
        },
        awsResources: {
            accessKeyId: "",
            secretAccessKey: "",
            stackOutputs: {
                StateBucketName: "state-bucket",
                StaticBucketName: "static-bucket",
                StaticBucketDomainName: "static-bucket.example.com",
                Auth0UserName: "auth0-user",
            },
        },
    } satisfies BaseContext,
});
