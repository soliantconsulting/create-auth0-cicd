# Auth0 CICD

Project for managing Auth0 infrastructure via IaC.

## Setup

- `pnpm install`
- `pnpm start`

## Provider update

If a new version of the Auth0 provider should be used, update the version in `cdktf.json` and then run
`update-provider.js` to generate the new TypeScript files.
