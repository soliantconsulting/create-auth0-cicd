import { fileURLToPath } from "node:url";
import { createSynthTask, execute } from "@soliantconsulting/starter-lib";

export const synthTask = createSynthTask(
    fileURLToPath(new URL("../../skeleton", import.meta.url)),
    {
        postInstall: async (context, task) => {
            await execute(task.stdout(), "node", ["update-provider.js"], {
                cwd: context.project.path,
            });
        },
    },
);
