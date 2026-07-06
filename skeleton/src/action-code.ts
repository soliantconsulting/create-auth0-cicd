import { readFileSync } from "node:fs";

// Terraform treats `${` in resource attributes as template interpolation, so
// any occurrence in the action code must be escaped as `$${`.
export const actionCode = (action: string): string =>
    readFileSync(`dist/action/${action}.cjs`, "utf-8").replace(/\$\{/g, () => "$${");
