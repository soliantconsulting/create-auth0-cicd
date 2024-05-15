import { rmSync } from "node:fs";
import { execa } from "execa";

await execa("pnpm", ["exec", "cdktf", "get", "--output=./src/gen"]).pipeStdout(process.stdout);
rmSync("./src/gen/providers/auth0/index.ts", { force: true });
rmSync("./src/gen/providers/auth0/lazy-index.ts", { force: true });
