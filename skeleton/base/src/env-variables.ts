const loadFromEnv = (name: string): string => {
    if (!process.env[name]) {
        throw new Error(`Env variable with name ${name} not found`);
    }

    return name;
};

export const envVariables = {
    ses: {
        accessKeyId: loadFromEnv("SES_ACCESS_KEY_ID"),
        secretAccessKey: loadFromEnv("SES_SECRET_ACCESS_KEY"),
    },
};
