import { type ExecuteResult, execute } from "@soliantconsulting/starter-lib";
import type { ListrTask } from "listr2";
import semver from "semver/preload.js";

export const terraformVersionTask: ListrTask = {
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
};
