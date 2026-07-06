import type { Event, PostLoginAPI } from "@auth0/actions/post-login/v3";

// Placeholder action, kept so tsconfig.action.json always has something to
// compile. Replace it with a real action and register that one in
// auth0-stack.ts via actionCode() — see the README.
export const onExecutePostLogin = async (event: Event, api: PostLoginAPI): Promise<void> => {
    if (event.user.email?.endsWith("@example.com")) {
        api.user.setAppMetadata("department", "internal");
    }
};
