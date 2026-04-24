import assert from "node:assert/strict";
import test from "node:test";
import type { ClientInfo, OAuthHelpers } from "@cloudflare/workers-oauth-provider";
import { AuthHandler, tokenBodyWithStoredRedirectUri } from "../src/auth-handler.js";

const baseClient: ClientInfo = {
  clientId: "client-1",
  clientName: "Canvas GPT",
  redirectUris: ["https://old.example/callback"],
  grantTypes: ["authorization_code", "refresh_token"],
  responseTypes: ["code"],
  tokenEndpointAuthMethod: "client_secret_post",
  registrationDate: 0,
};

function createEnv(client: ClientInfo | null = baseClient): Env & { OAUTH_PROVIDER: OAuthHelpers } {
  let clients = client ? [client] : [];
  return {
    ACTIONS_ADMIN_TOKEN: "admin-secret",
    COOKIE_ENCRYPTION_KEY: "cookie-secret",
    MCP_OBJECT: {} as Env["MCP_OBJECT"],
    OAUTH_KV: {} as Env["OAUTH_KV"],
    SOURCE_COMMIT: "test",
    VERSION_METADATA: {
      id: "version-test",
      tag: "test",
      timestamp: "2026-04-24T00:00:00.000Z",
    },
    OAUTH_PROVIDER: {
      listClients: async () => ({
        items: clients,
      }),
      lookupClient: async (clientId: string) => clients.find((item) => item.clientId === clientId) ?? null,
      createClient: async (clientInfo: Partial<ClientInfo>) => {
        const created = {
          clientId: "created-client",
          clientName: clientInfo.clientName,
          clientSecret: clientInfo.tokenEndpointAuthMethod === "none" ? undefined : "created-secret",
          grantTypes: clientInfo.grantTypes,
          redirectUris: clientInfo.redirectUris ?? [],
          registrationDate: 123,
          responseTypes: clientInfo.responseTypes,
          tokenEndpointAuthMethod: clientInfo.tokenEndpointAuthMethod,
        } as ClientInfo;
        clients = [...clients, created];
        return created;
      },
      updateClient: async (clientId: string, updates: Partial<ClientInfo>) => {
        const currentClient = clients.find((item) => item.clientId === clientId);
        if (!currentClient) return null;
        const updatedClient = { ...currentClient, ...updates };
        clients = clients.map((item) => item.clientId === clientId ? updatedClient : item);
        return updatedClient;
      },
      deleteClient: async (clientId: string) => {
        clients = clients.filter((item) => item.clientId !== clientId);
      },
    } as unknown as OAuthHelpers,
  };
}

test("serves the browser admin page", async () => {
  const response = await AuthHandler.request("/admin", {}, createEnv());
  assert.equal(response.status, 200);
  assert.match(await response.text(), /Canvas OAuth Admin/);
});

test("admin client list returns public client details", async () => {
  const response = await AuthHandler.request(
    "/admin/oauth-clients",
    {
      headers: {
        Authorization: "Bearer admin-secret",
      },
    },
    createEnv(),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    clients: [{
      client_id: "client-1",
      client_name: "Canvas GPT",
      registration_date: 0,
      redirect_uris: ["https://old.example/callback"],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "client_secret_post",
    }],
  });
});

test("admin can create a Custom GPT OAuth client", async () => {
  const response = await AuthHandler.request(
    "/admin/oauth-clients",
    {
      body: JSON.stringify({
        client_name: "Canvas LMS Custom GPT",
        redirect_uri: "https://chat.openai.com/aip/g-test/oauth/callback",
        token_endpoint_auth_method: "client_secret_post",
      }),
      headers: {
        Authorization: "Bearer admin-secret",
        "Content-Type": "application/json",
      },
      method: "POST",
    },
    createEnv(),
  );

  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), {
    client_id: "created-client",
    client_name: "Canvas LMS Custom GPT",
    client_secret: "created-secret",
    redirect_uris: [
      "https://chat.openai.com/aip/g-test/oauth/callback",
      "https://chatgpt.com/aip/g-test/oauth/callback",
    ],
    grant_types: ["authorization_code", "refresh_token"],
    registration_date: 123,
    response_types: ["code"],
    token_endpoint_auth_method: "client_secret_post",
  });
});

test("admin can create a Custom GPT OAuth client before ChatGPT provides a callback", async () => {
  const response = await AuthHandler.request(
    "/admin/oauth-clients",
    {
      body: JSON.stringify({
        client_name: "Canvas LMS Custom GPT",
        token_endpoint_auth_method: "client_secret_post",
      }),
      headers: {
        Authorization: "Bearer admin-secret",
        "Content-Type": "application/json",
      },
      method: "POST",
    },
    createEnv(),
  );

  assert.equal(response.status, 201);
  assert.equal((await response.json() as { redirect_uris: string[] }).redirect_uris[0], "https://canvas-mcp.invalid/oauth/callback-placeholder");
});

test("admin can delete multiple clients", async () => {
  const response = await AuthHandler.request(
    "/admin/oauth-clients/delete",
    {
      body: JSON.stringify({ client_ids: ["client-1", "missing-client"] }),
      headers: {
        Authorization: "Bearer admin-secret",
        "Content-Type": "application/json",
      },
      method: "POST",
    },
    createEnv(),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    deleted: ["client-1"],
    missing: ["missing-client"],
  });
});

test("admin redirect update requires bearer token", async () => {
  const response = await AuthHandler.request(
    "/admin/oauth-clients/client-1/redirect-uris",
    {
      body: JSON.stringify({ redirect_uri: "https://chat.openai.com/aip/g-test/oauth/callback" }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    },
    createEnv(),
  );

  assert.equal(response.status, 401);
});

test("admin redirect update expands ChatGPT callback host variants", async () => {
  const response = await AuthHandler.request(
    "/admin/oauth-clients/client-1/redirect-uris",
    {
      body: JSON.stringify({
        redirect_uri: "https://chat.openai.com/aip/g-test/oauth/callback",
      }),
      headers: {
        Authorization: "Bearer admin-secret",
        "Content-Type": "application/json",
      },
      method: "POST",
    },
    createEnv(),
  );

  assert.equal(response.status, 200);
  assert.deepEqual((await response.json() as { redirect_uris: string[] }).redirect_uris, [
    "https://chat.openai.com/aip/g-test/oauth/callback",
    "https://chatgpt.com/aip/g-test/oauth/callback",
  ]);
});

test("token compatibility wrapper injects stored redirect_uri for non-PKCE clients", async () => {
  const body = await tokenBodyWithStoredRedirectUri(
    new URLSearchParams({
      client_id: "client-1",
      client_secret: "secret",
      code: "user-1:grant-1:secret",
      grant_type: "authorization_code",
    }).toString(),
    {
      get: async (key: string) => {
        if (key === "oauth:auth-code-alias:user-1:grant-1:secret") return null;
        assert.equal(key, "oauth:auth-code-redirect:user-1:grant-1");
        return "https://chat.openai.com/aip/g-test/oauth/callback";
      },
    } as unknown as KVNamespace,
  );

  assert.equal(
    new URLSearchParams(body).get("redirect_uri"),
    "https://chat.openai.com/aip/g-test/oauth/callback",
  );
});

test("token compatibility wrapper translates authorization code aliases", async () => {
  const body = await tokenBodyWithStoredRedirectUri(
    new URLSearchParams({
      client_id: "client-1",
      client_secret: "secret",
      code: "alias-code",
      grant_type: "authorization_code",
    }).toString(),
    {
      get: async (key: string) => {
        if (key === "oauth:auth-code-alias:alias-code") return "user-1:grant-1:secret";
        if (key === "oauth:auth-code-redirect:user-1:grant-1") return "https://chat.openai.com/aip/g-test/oauth/callback";
        return null;
      },
    } as unknown as KVNamespace,
  );

  const params = new URLSearchParams(body);
  assert.equal(params.get("code"), "user-1:grant-1:secret");
  assert.equal(params.get("redirect_uri"), "https://chat.openai.com/aip/g-test/oauth/callback");
});
