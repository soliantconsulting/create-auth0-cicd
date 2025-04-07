const loadFromEnv = (name: string): string => {
    const value = process.env[name];

    if (!value) {
        throw new Error(`Env variable with name ${name} not found`);
    }

    return value;
};

export const envVariables = {
    auth0Domain: loadFromEnv("AUTH0_DOMAIN"),
    ses: {
        accessKeyId: loadFromEnv("SES_ACCESS_KEY_ID"),
        secretAccessKey: loadFromEnv("SES_SECRET_ACCESS_KEY"),
    },
};
