import { ListrEnquirerPromptAdapter } from "@listr2/prompt-adapter-enquirer";
import camelcase from "camelcase";
import type { ListrTask } from "listr2";
import slug from "slug";

export type ApiSettingsContext = {
    apiSettings: {
        name: string;
        identifier: string;
        resourceName: string;
    } | null;
};

export const apiSettingsTask: ListrTask<Partial<ApiSettingsContext>> = {
    title: "Gather API settings",
    task: async (context, task): Promise<void> => {
        const prompt = task.prompt(ListrEnquirerPromptAdapter);

        const enableApi = await prompt.run<boolean>({
            type: "toggle",
            message: "Enable API:",
            initial: true,
        });

        if (!enableApi) {
            context.apiSettings = null;
            task.skip("API disabled");
            return;
        }

        const name = await prompt.run<string>({
            type: "input",
            message: "Friendly name (e.g. My API):",
        });

        const identifier = slug(name);
        const resourceName = `${camelcase(identifier, { pascalCase: true })}ResourceServer`;

        context.apiSettings = {
            name,
            identifier,
            resourceName,
        };
    },
};
