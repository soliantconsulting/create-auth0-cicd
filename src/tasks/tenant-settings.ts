import { ListrEnquirerPromptAdapter } from "@listr2/prompt-adapter-enquirer";
import type { ListrTask } from "listr2";

export type TenantSettingsContext = {
    tenantSettings: {
        friendlyName: string;
        supportUrl: string;
        supportEmailAddress: string;
        defaultFromAddress: string;
    };
};

export const tenantSettingsTask: ListrTask<Partial<TenantSettingsContext>> = {
    title: "Gather tenant settings",
    task: async (context, task): Promise<void> => {
        const prompt = task.prompt(ListrEnquirerPromptAdapter);

        context.tenantSettings = await prompt.run<TenantSettingsContext["tenantSettings"]>([
            {
                name: "friendlyName",
                type: "input",
                message: "Friendly Name:",
            },
            {
                name: "supportUrl",
                type: "input",
                message: "Support URL:",
            },
            {
                name: "supportEmailAddress",
                type: "input",
                message: "Support Email Address:",
            },
            {
                name: "defaultFromAddress",
                type: "input",
                message: "Default From Address:",
            },
        ]);
    },
};
