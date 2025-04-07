import { rmSync } from "node:fs";
import { execa } from "execa";

await execa("pnpm", ["cdktf", "get", "--output=./src/gen"], { stdout: "inherit" });
rmSync("./src/gen/providers/auth0/index.ts", { force: true });
rmSync("./src/gen/providers/auth0/lazy-index.ts", { force: true });
