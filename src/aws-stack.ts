import {
    AwsCdkCli,
    type ICloudAssemblyDirectoryProducer,
    RequireApproval,
} from "@aws-cdk/cli-lib-alpha";
import { CloudFormation, type Stack } from "@aws-sdk/client-cloudformation";
import * as cdk from "aws-cdk-lib";
import { App, type AppProps, CfnOutput, RemovalPolicy } from "aws-cdk-lib";
import { Effect, PolicyStatement, User } from "aws-cdk-lib/aws-iam";
import { BlockPublicAccess, Bucket } from "aws-cdk-lib/aws-s3";
import type { Construct } from "constructs";

class AwsStack extends cdk.Stack {
    public constructor(scope: Construct, id: string, props: cdk.StackProps) {
        super(scope, id, props);

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

class Producer implements ICloudAssemblyDirectoryProducer {
    public constructor(private readonly region: string) {
    }

    public async produce(context: AppProps["context"]): Promise<string> {
        const app = new App({ context });
        new AwsStack(app, "auth0-cicd", {env: {region: this.region}});
        return app.synth().directory;
    }
}

export type AwsDeployResult = {
    stateBucketName: string;
    staticBucketName: string;
    staticBucketDomainName: string;
    auth0UserName: string;
};

const resolveOutput = (stack: Stack, name: string): string => {
    const output = stack.Outputs?.find((output) => output.OutputKey === name);

    if (!output?.OutputValue) {
        throw new Error(`Could not find ${name} output`);
    }

    return output.OutputValue;
};

export const deployAwsStack = async (region: string): Promise<AwsDeployResult> => {
    const cli = AwsCdkCli.fromCloudAssemblyDirectoryProducer(new Producer(region));
    await cli.deploy({ requireApproval: RequireApproval.NEVER });

    const cf = new CloudFormation({region});
    const result = await cf.describeStacks({
        StackName: "auth0-cicd",
    });

    if (!result.Stacks?.[0]) {
        throw new Error("Could not locate auth0-cicd stack");
    }

    const stack = result.Stacks[0];

    return {
        stateBucketName: resolveOutput(stack, "StateBucketName"),
        staticBucketName: resolveOutput(stack, "StaticBucketName"),
        staticBucketDomainName: resolveOutput(stack, "StaticBucketDomainName"),
        auth0UserName: resolveOutput(stack, "Auth0UserName"),
    };
};
