import path from "path";
import { fileURLToPath } from "url";
import merge from "deepmerge";
import { cp, mkdir, readFile, rename, writeFile } from "fs/promises";
import { glob } from "glob";
import Handlebars from "handlebars";
import type { PackageJson, TSConfig } from "pkg-types";
import type { AwsDeployResult } from "./aws-stack.js";
import { execute } from "./util.js";

export type TenantSettings = {
    friendlyName: string;
    supportUrl: string;
    supportEmailAddress: string;
    defaultFromAddress: string;
};

export type SpaSettings = {
    resourceName: string;
    identifier: string;
    name: string;
    propPrefix: string;
};

export type ApiSettings = {
    resourceName: string;
    identifier: string;
    name: string;
};

export type ProjectConfig = {
    accountId: string;
    region: string;
    deployRoleArn: string;
    name: string;
    awsDeployResult: AwsDeployResult;
    tenant: TenantSettings;
    spa: SpaSettings | null;
    api: ApiSettings | null;
};

type ProjectContext = {
    projectPath: string;
    skeletonPath: string;
    stdout: NodeJS.WritableStream;
};

const loadPackageJson = async (basePath: string): Promise<PackageJson> => {
    try {
        const json = await readFile(path.join(basePath, "package.json"), { encoding: "utf-8" });
        return JSON.parse(json) as PackageJson;
    } catch {
        return {};
    }
};

const loadTsConfig = async (basePath: string): Promise<TSConfig> => {
    try {
        const json = await readFile(path.join(basePath, "tsconfig.json"), { encoding: "utf-8" });
        return JSON.parse(json) as TSConfig;
    } catch {
        return {};
    }
};

const orderDeps = (deps: Record<string, string>): Record<string, string> => {
    return Object.keys(deps)
        .sort()
        .reduce(
            (sorted, key) => {
                sorted[key] = deps[key];
                return sorted;
            },
            {} as Record<string, string>,
        );
};

const copyTemplates = async (context: ProjectContext, config: ProjectConfig): Promise<void> => {
    const basePath = path.join(context.skeletonPath, "templates");
    const templatePaths = await glob("**/*.mustache", { cwd: basePath, dot: true });

    for (const templatePath of templatePaths) {
        const rawTemplate = await readFile(path.join(basePath, templatePath), {
            encoding: "utf-8",
        });
        const template = Handlebars.compile(rawTemplate);
        const targetPath = path.join(context.projectPath, templatePath.replace(/\.mustache$/, ""));
        await mkdir(path.dirname(targetPath), { recursive: true });
        await writeFile(targetPath, template(config));
    }
};

export const synthProject = async (
    projectPath: string,
    config: ProjectConfig,
    stdout: NodeJS.WritableStream,
): Promise<void> => {
    const context: ProjectContext = {
        projectPath,
        skeletonPath: fileURLToPath(new URL("../skeleton", import.meta.url)),
        stdout: stdout,
    };

    await cp(path.join(context.skeletonPath, "base"), projectPath, { recursive: true });
    await copyTemplates(context, config);
    const packageJson = merge(
        { name: config.name } as PackageJson,
        await loadPackageJson(context.skeletonPath),
    );
    const tsConfig = await loadTsConfig(context.skeletonPath);

    if (packageJson.dependencies) {
        packageJson.dependencies = orderDeps(packageJson.dependencies);
    }

    if (packageJson.devDependencies) {
        packageJson.devDependencies = orderDeps(packageJson.devDependencies);
    }

    await writeFile(
        path.join(projectPath, "package.json"),
        JSON.stringify(packageJson, undefined, 4),
    );
    await writeFile(
        path.join(projectPath, "tsconfig.json"),
        JSON.stringify(tsConfig, undefined, 4),
    );

    const rmExtPaths = await glob(path.join(projectPath, "**/*.rm-ext"), { dot: true });

    for (const rmExtPath of rmExtPaths) {
        const newPath = rmExtPath.replace(/\.rm-ext$/, "");
        await rename(rmExtPath, newPath);
    }

    await execute(context.stdout, "pnpm", ["install"], { cwd: projectPath });
    await execute(context.stdout, "pnpm", ["exec", "biome", "check", ".", "--apply"], {
        cwd: projectPath,
    });
    await execute(context.stdout, "node", ["update-provider.js"], {
        cwd: projectPath,
    });
};
