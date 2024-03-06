import { type ExecaReturnValue, type Options, execa } from "execa";

export const execute = async (
    stdout: NodeJS.WritableStream | null,
    file: string,
    args: readonly string[],
    options?: Options,
): Promise<ExecaReturnValue> => {
    const execute = execa(file, args, options);

    if (stdout) {
        execute.stdout?.pipe(stdout);
        execute.stderr?.pipe(stdout);
    }

    return execute;
};
