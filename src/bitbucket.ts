const BASE_URL = "https://api.bitbucket.org/2.0";

type GetRepositoryResponse = {
    uuid: string;
};

type GetEnvironmentsResponse = {
    values: {
        type: string;
        uuid: string;
        name: string;
    }[];
};

type Environment = {
    uuid: string;
    type: string;
    name: string;
};

export class BitBucketClient {
    public constructor(
        private readonly accessToken: string,
        private readonly workspace: string,
        private readonly repoSlug: string,
    ) {}

    public async getRepositoryUuid(): Promise<string> {
        const response = await fetch(
            `${BASE_URL}/repositories/${this.workspace}/${this.repoSlug}`,
            {
                headers: {
                    authorization: `Bearer ${this.accessToken}`,
                },
            },
        );

        if (!response.ok) {
            throw new Error("Failed to fetch repository");
        }

        const body = (await response.json()) as GetRepositoryResponse;
        return body.uuid;
    }

    public async enablePipeline(): Promise<void> {
        const response = await fetch(
            `${BASE_URL}/repositories/${this.workspace}/${this.repoSlug}/pipelines_config`,
            {
                method: "PUT",
                headers: {
                    authorization: `Bearer ${this.accessToken}`,
                    "content-type": "application/json",
                },
                body: JSON.stringify({
                    enabled: true,
                }),
            },
        );

        if (!response.ok) {
            throw new Error("Failed to enable pipeline");
        }
    }

    public async getEnvironments(): Promise<Environment[]> {
        const response = await fetch(
            `${BASE_URL}/repositories/${this.workspace}/${this.repoSlug}/environments`,
            {
                headers: {
                    authorization: `Bearer ${this.accessToken}`,
                },
            },
        );

        if (!response.ok) {
            throw new Error("Failed to fetch environments");
        }

        const body = (await response.json()) as GetEnvironmentsResponse;

        return body.values.map((value) => ({
            uuid: value.uuid,
            type: value.type,
            name: value.name,
        }));
    }

    public async createRepositoryVariable(
        key: string,
        value: string,
        secured: boolean,
    ): Promise<void> {
        const response = await fetch(
            `${BASE_URL}/repositories/${this.workspace}/${this.repoSlug}/pipelines_config/variables/`,
            {
                method: "POST",
                headers: {
                    authorization: `Bearer ${this.accessToken}`,
                    "content-type": "application/json",
                },
                body: JSON.stringify({ key, value, secured }),
            },
        );

        if (response.status === 409) {
            // Already applied
            return;
        }

        if (!response.ok) {
            throw new Error("Failed to create repository variable");
        }
    }

    public async createEnvVariable(
        envUuid: string,
        key: string,
        value: string,
        secured: boolean,
    ): Promise<void> {
        const response = await fetch(
            `${BASE_URL}/repositories/${this.workspace}/${this.repoSlug}/deployments_config/environments/${envUuid}/variables/`,
            {
                method: "POST",
                headers: {
                    authorization: `Bearer ${this.accessToken}`,
                    "content-type": "application/json",
                },
                body: JSON.stringify({ key, value, secured }),
            },
        );

        if (response.status === 409) {
            // Already applied
            return;
        }

        if (!response.ok) {
            throw new Error("Failed to create env variable");
        }
    }
}
