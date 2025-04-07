import { ListrEnquirerPromptAdapter } from "@listr2/prompt-adapter-enquirer";
import camelcase from "camelcase";
import type { ListrTask } from "listr2";
import slug from "slug";

export type SpaSettingsContext = {
    spaSettings: {
        name: string;
        identifier: string;
        resourceName: string;
        propPrefix: string;
    } | null;
};

export const spaSettingsTask: ListrTask<Partial<SpaSettingsContext>> = {
    title: "Gather SPA settings",
    task: async (context, task): Promise<void> => {
        const prompt = task.prompt(ListrEnquirerPromptAdapter);

        const enableSpa = await prompt.run<boolean>({
            type: "toggle",
            message: "Enable SPA:",
            initial: true,
        });

        if (!enableSpa) {
            context.spaSettings = null;
            task.skip("SPA disabled");
            return;
        }

        const name = await prompt.run<string>({
            type: "input",
            message: "Friendly name (e.g. My Web):",
        });

        const identifier = slug(name);
        const resourceName = `${camelcase(identifier, { pascalCase: true })}Client`;

        context.spaSettings = {
            name,
            identifier,
            resourceName,
            propPrefix: camelcase(identifier),
        };
    },
};
