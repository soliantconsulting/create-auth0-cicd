import { ListrEnquirerPromptAdapter } from "@listr2/prompt-adapter-enquirer";
import { execute } from "@soliantconsulting/starter-lib";
import type { Listr, ListrTask } from "listr2";
import { type Auth0Credential, setupTenant } from "../auth0.js";

export type TenantsBootstrapContext = {
    tenantsBootstrap: {
        auth0Credentials: {
            development: Auth0Credential | null;
            staging: Auth0Credential | null;
            production: Auth0Credential | null;
        };
    };
};

export const tenantsBootstrapTask: ListrTask<Partial<TenantsBootstrapContext>> = {
    title: "Bootstrap tenants",
    task: async (context, task): Promise<Listr> => {
        const prompt = task.prompt(ListrEnquirerPromptAdapter);
        const confirmed = await prompt.run<boolean>({
            type: "confirm",
            message: "Created and logged into all tenants?",
            footer:
                "You must create one to three tenants (<name>, <name>-development, <name>-staging).\n" +
                "Set each tenants environments tag to their respective environment.\n" +
                "Then run `auth0 login --scopes create:client_grants,delete:connections` for each tenant.",
        });

        if (!confirmed) {
            throw new Error("Tenants not prepared");
        }

        const rawTenants = await execute(null, "auth0", ["tenants", "ls", "--csv", "--no-color"]);

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

        const noneOption = "None";
        tenants.unshift(noneOption);

        const envs = ["development", "staging", "production"] as const;
        const credentials: Record<string, Auth0Credential | null> = {};

        context.tenantsBootstrap = {
            auth0Credentials:
                credentials as unknown as TenantsBootstrapContext["tenantsBootstrap"]["auth0Credentials"],
        };

        return task.newListr(
            envs.map((env) => ({
                title: `Environment ${env}`,
                task: async (_context, task) => {
                    const prompt = task.prompt(ListrEnquirerPromptAdapter);

                    const tenant = await prompt.run<string>({
                        type: "select",
                        message: `Tenant for ${env}:`,
                        choices: tenants,
                    });

                    if (tenant === noneOption) {
                        credentials[env] = null;
                        return;
                    }

                    const confirmed = await prompt.run<boolean>({
                        type: "confirm",
                        message: `WARNING: Confirm to delete all connections and default resources from ${tenant}`,
                    });

                    if (!confirmed) {
                        throw new Error("Operation aborted");
                    }

                    credentials[env] = await setupTenant(tenant, task.stdout());
                },
            })),
            { concurrent: false },
        );
    },
};
