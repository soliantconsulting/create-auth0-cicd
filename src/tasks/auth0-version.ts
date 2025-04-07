import { type ExecuteResult, execute } from "@soliantconsulting/starter-lib";
import type { ListrTask } from "listr2";
import semver from "semver/preload.js";

export const auth0VersionTask: ListrTask = {
    title: "Check auth0 version",
    task: async (_context, task): Promise<void> => {
        let result: ExecuteResult;

        try {
            result = await execute(task.stdout(), "auth0", ["--version"]);
        } catch {
            throw new Error(
                "auth0 not found, please install latest version: https://github.com/auth0/auth0-cli?tab=readme-ov-file#installation",
            );
        }

        const versionMatch = result.stdout.match(/version ([^ ]+)/);

        if (!versionMatch) {
            throw new Error("Could not match version");
        }

        const version = versionMatch[1];

        if (!semver.gte(version, "1.4.0")) {
            throw new Error(`auth0 version ${version} found, need at least 1.4.0`);
        }
    },
};
