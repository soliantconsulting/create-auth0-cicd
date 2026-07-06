# Auth0 CICD

Project for managing Auth0 infrastructure via IaC.

## Setup

- `pnpm install`
- `pnpm start`

## Provider update

If a new version of the Auth0 provider should be used, update the version in `cdktf.json` and then run
`update-provider.js` to generate the new TypeScript files.

## Actions

Auth0 actions live in `src/action` as CommonJS TypeScript files (`.cts`). They are compiled by a
separate `tsconfig.action.json`, which targets Node 22 (the Auth0 actions runtime, independent of
the Node version the rest of this project runs on), and end up in `dist/action/<name>.cjs`.

Type definitions for every trigger come from `@auth0/actions`, e.g.:

```ts
import type { Event, PostLoginAPI } from "@auth0/actions/post-login/v3";
```

These imports are type-only and disappear on compile, so the emitted code has no dependencies. The
included `src/action/example-post-login.cts` is a placeholder; replace it with a real action.

To deploy an action, register it in `src/auth0-stack.ts` using the `actionCode` helper, which reads
the compiled bundle and escapes it for Terraform:

```ts
import { actionCode } from "./action-code.js";
import { Action } from "./gen/providers/auth0/action/index.js";
import { TriggerAction } from "./gen/providers/auth0/trigger-action/index.js";

const examplePostLoginAction = new Action(this, "ExamplePostLoginAction", {
    name: "Example post login",
    deploy: true,
    code: actionCode("example-post-login"),
    supportedTriggers: {
        id: "post-login",
        version: "v3",
    },
});

new TriggerAction(this, "ExamplePostLoginTriggerAction", {
    actionId: examplePostLoginAction.id,
    trigger: "post-login",
});
```
