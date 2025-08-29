import { fileURLToPath } from "node:url";
import { createSynthTask, execute, type ProjectContext } from "@soliantconsulting/starter-lib";
import type { TenantsBootstrapContext } from "./tenants-bootstrap.js";

export const synthTask = createSynthTask(
    fileURLToPath(new URL("../../skeleton", import.meta.url)),
    {
        postInstall: async (context, task) => {
            await execute(task.stdout(), "node", ["update-provider.js"], {
                cwd: context.project.path,
            });
        },
        ignoreList: (context: ProjectContext & TenantsBootstrapContext) => {
            const list: string[] = [];

            if (!context.tenantsBootstrap.auth0Credentials.development) {
                list.push("src/env-test.ts.liquid");
            }

            if (!context.tenantsBootstrap.auth0Credentials.staging) {
                list.push("src/env-staging.ts.liquid");
            }

            if (!context.tenantsBootstrap.auth0Credentials.production) {
                list.push("src/env-production.ts.liquid");
            }

            return list;
        },
    },
);
