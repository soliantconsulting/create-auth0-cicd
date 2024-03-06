import { ManagementClient } from "auth0";
import { execute } from "./util.js";

type App = {
    name: string;
    client_id: string;
    client_secret: string;
};

type Apps = App[];

export type Auth0Credential = {
    tenant: string;
    clientId: string;
    clientSecret: string;
};

const getProviderCredential = async (tenant: string, apps: Apps): Promise<Auth0Credential> => {
    const existingProvider = apps.find((app) => app.name === "Auth0 Terraform Provider");

    if (existingProvider) {
        return {
            tenant,
            clientId: existingProvider.client_id,
            clientSecret: existingProvider.client_secret,
        };
    }

    const createResult = await execute(null, "auth0", [
        "apps",
        "create",
        "--name",
        "Auth0 Terraform Provider",
        "--description",
        "Auth0 Terraform Provider M2M",
        "--type",
        "m2m",
        "--tenant",
        tenant,
        "--reveal-secrets",
        "--json",
    ]);

    const credentials = JSON.parse(createResult.stdout) as App;

    return {
        tenant,
        clientId: credentials.client_id,
        clientSecret: credentials.client_secret,
    };
};

type Apis = {
    id: string;
    identifier: string;
    name: string;
    scopes: {
        value: string;
        description: string;
    }[];
}[];

const grantClient = async (
    tenant: string,
    clientId: string,
    stdout: NodeJS.WritableStream,
): Promise<void> => {
    const listApisResult = await execute(null, "auth0", [
        "apis",
        "ls",
        "--tenant",
        tenant,
        "--json",
    ]);
    const apis = JSON.parse(listApisResult.stdout) as Apis;
    const managementApi = apis.find((api) => api.name === "Auth0 Management API");

    if (!managementApi) {
        throw new Error("Could not find management API");
    }

    const data = JSON.stringify({
        client_id: clientId,
        audience: managementApi.identifier,
        scope: managementApi.scopes.map((scope) => scope.value),
    });

    await execute(
        stdout,
        "auth0",
        ["api", "post", "client-grants", "--tenant", tenant, '--data', data],
        { stdin: "ignore" },
    );
};

const deleteDefaultResources = async (
    tenant: string,
    apps: Apps,
    credential: Auth0Credential,
    stdout: NodeJS.WritableStream,
): Promise<void> => {
    const defaultApp = apps.find((app) => app.name === "Default App");

    if (defaultApp) {
        await execute(stdout, "auth0", [
            "apps",
            "rm",
            defaultApp.client_id,
            "--tenant",
            tenant,
            "--force",
        ]);
    }

    const management = new ManagementClient({
        domain: tenant,
        clientId: credential.clientId,
        clientSecret: credential.clientSecret,
    });

    const connections = await management.connections.getAll();

    for (const connection of connections.data) {
        await management.connections.delete({ id: connection.id });
    }
};

export const setupTenant = async (
    tenant: string,
    stdout: NodeJS.WritableStream,
): Promise<Auth0Credential> => {
    const listAppsResult = await execute(null, "auth0", [
        "apps",
        "ls",
        "--reveal-secrets",
        "--json",
        "--tenant",
        tenant,
    ]);

    const apps = JSON.parse(listAppsResult.stdout) as Apps;
    const credential = await getProviderCredential(tenant, apps);
    await grantClient(tenant, credential.clientId, stdout);
    await deleteDefaultResources(tenant, apps, credential, stdout);

    return credential;
};
