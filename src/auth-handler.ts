import type { AuthRequest, ClientInfo, OAuthHelpers } from "@cloudflare/workers-oauth-provider";
import { Hono, type Context } from "hono";
import { renderAdminPage as renderAdminUiPage } from "./admin-page.js";
import { getActionsOpenApiDocument } from "./actions-openapi.js";
import { storeCanvasCredentials } from "./credential-store.js";
import { normalizeTimezone, type Props } from "./utils.js";
import {
  addApprovedClient,
  generateCSRFProtection,
  OAuthError,
  renderApprovalDialog,
  validateCSRFToken,
} from "./workers-oauth-utils.js";

type HonoEnv = { Bindings: Env & { OAUTH_PROVIDER: OAuthHelpers } };

const app = new Hono<HonoEnv>();

type RedirectUriUpdateBody = {
  redirect_uri?: unknown;
  redirect_uris?: unknown;
};

type ClientCreateBody = RedirectUriUpdateBody & {
  client_name?: unknown;
  token_endpoint_auth_method?: unknown;
};

type ClientDeleteBody = {
  client_ids?: unknown;
};

const PLACEHOLDER_REDIRECT_URI = "https://canvas-mcp.invalid/oauth/callback-placeholder";
const AUTH_CODE_ALIAS_PREFIX = "oauth:auth-code-alias:";
const AUTH_CODE_REDIRECT_PREFIX = "oauth:auth-code-redirect:";
const INTERNAL_TOKEN_ENDPOINT = "/_oauth/internal-token";

type TokenEndpointProvider = {
  fetch: (request: Request, env: Env, ctx: ExecutionContext) => Promise<Response>;
};

let tokenEndpointProvider: TokenEndpointProvider | null = null;

async function getTokenEndpointProvider(): Promise<TokenEndpointProvider> {
  if (tokenEndpointProvider) return tokenEndpointProvider;

  const { default: OAuthProvider } = await import("@cloudflare/workers-oauth-provider");
  const fallbackHandler = {
    fetch: () => new Response("Not found", { status: 404 }),
  };

  tokenEndpointProvider = new OAuthProvider<Env>({
    apiHandlers: {
      "/__oauth-token-api-unused": fallbackHandler,
    },
    defaultHandler: fallbackHandler,
    authorizeEndpoint: "/authorize",
    tokenEndpoint: INTERNAL_TOKEN_ENDPOINT,
    clientRegistrationEndpoint: "/register",
    scopesSupported: ["canvas.read"],
  });

  return tokenEndpointProvider;
}

function getFormString(formData: FormData, field: string): string | null {
  const value = formData.get(field);
  return typeof value === "string" ? value : null;
}

function parseEncodedState(encoded: string): { oauthReqInfo?: AuthRequest } | null {
  try {
    return JSON.parse(atob(encoded));
  } catch {
    return null;
  }
}

function authCodeRedirectKey(code: string): string | null {
  const [userId, grantId] = code.split(":");
  if (!userId || !grantId) return null;
  return `${AUTH_CODE_REDIRECT_PREFIX}${userId}:${grantId}`;
}

function authCodeAliasKey(alias: string): string {
  return `${AUTH_CODE_ALIAS_PREFIX}${alias}`;
}

function createAuthCodeAlias(): string {
  return crypto.randomUUID().replaceAll("-", "");
}

function normalizeCallbackQueryOrder(redirectTo: string): string {
  try {
    const url = new URL(redirectTo);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    if (!code || !state) return redirectTo;

    url.search = "";
    url.searchParams.set("code", code);
    url.searchParams.set("state", state);
    return url.toString();
  } catch {
    return redirectTo;
  }
}

function addTokenCorsHeaders(headers: Headers, request: Request): Headers {
  const origin = request.headers.get("Origin");
  headers.set("Access-Control-Allow-Origin", origin || "*");
  headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  headers.set(
    "Access-Control-Allow-Headers",
    request.headers.get("Access-Control-Request-Headers") || "authorization, content-type",
  );
  headers.set("Access-Control-Max-Age", "600");
  headers.set("Vary", "Origin, Access-Control-Request-Headers");
  return headers;
}

function getBearerToken(request: Request): string | null {
  const header = request.headers.get("Authorization");
  if (!header) return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

function isAdminAuthorized(request: Request, env: Env): boolean {
  const expected = env.ACTIONS_ADMIN_TOKEN;
  if (!expected) return false;

  const actual = getBearerToken(request) ?? request.headers.get("X-Admin-Token");
  return actual === expected;
}

function publicClientInfo(client: Awaited<ReturnType<OAuthHelpers["lookupClient"]>>) {
  if (!client) return null;

  return {
    client_id: client.clientId,
    client_name: client.clientName,
    client_uri: client.clientUri,
    contacts: client.contacts,
    redirect_uris: client.redirectUris,
    grant_types: client.grantTypes,
    logo_uri: client.logoUri,
    policy_uri: client.policyUri,
    registration_date: client.registrationDate,
    response_types: client.responseTypes,
    tos_uri: client.tosUri,
    token_endpoint_auth_method: client.tokenEndpointAuthMethod,
  };
}

function getChatGptSetupInfo(origin: string, tokenEndpointAuthMethod?: string) {
  return {
    authentication_type: "OAuth",
    authorization_url: `${origin}/authorize`,
    openapi_schema_url: `${origin}/actions/openapi.json`,
    privacy_policy_url: `${origin}/privacy`,
    scope: "canvas.read",
    token_exchange_method: tokenEndpointAuthMethod === "client_secret_basic"
      ? "Basic authorization header"
      : "Default (POST request)",
    token_url: `${origin}/token`,
  };
}

function clientCreationResponse(client: ClientInfo, origin: string) {
  return {
    ...publicClientInfo(client),
    chatgpt_setup: getChatGptSetupInfo(origin, client.tokenEndpointAuthMethod),
    client_secret: client.clientSecret,
  };
}

function sortPublicClients<T extends { client_id?: string; client_name?: string } | null>(clients: T[]): T[] {
  return [...clients].sort((a, b) => {
    const nameCompare = (a?.client_name ?? "Unnamed client").localeCompare(b?.client_name ?? "Unnamed client");
    if (nameCompare !== 0) return nameCompare;
    return (a?.client_id ?? "").localeCompare(b?.client_id ?? "");
  });
}

function parseTokenEndpointAuthMethod(value: unknown): "client_secret_basic" | "client_secret_post" | "none" {
  if (value === undefined || value === null || value === "") return "client_secret_post";
  if (value === "client_secret_basic" || value === "client_secret_post" || value === "none") return value;
  throw new OAuthError("invalid_request", "token_endpoint_auth_method must be client_secret_post, client_secret_basic, or none.", 400);
}

function parseClientIds(body: ClientDeleteBody): string[] {
  if (!Array.isArray(body.client_ids) || body.client_ids.length === 0) {
    throw new OAuthError("invalid_request", "client_ids must be a non-empty array.", 400);
  }

  const ids = new Set<string>();
  for (const value of body.client_ids) {
    if (typeof value !== "string" || !value.trim()) {
      throw new OAuthError("invalid_request", "client_ids must contain only non-empty strings.", 400);
    }
    ids.add(value.trim());
  }

  return Array.from(ids);
}

export async function tokenBodyWithStoredRedirectUri(bodyText: string, kv: KVNamespace): Promise<string> {
  const params = new URLSearchParams(bodyText);
  if (params.get("grant_type") !== "authorization_code") return bodyText;

  const code = params.get("code");
  if (!code) return bodyText;

  const storedCode = await kv.get(authCodeAliasKey(code));
  const providerCode = storedCode ?? code;
  if (storedCode) params.set("code", storedCode);

  const key = authCodeRedirectKey(providerCode);
  if (!key) return bodyText;

  const redirectUri = await kv.get(key);
  if (!redirectUri) return bodyText;

  const requestedRedirectUri = params.get("redirect_uri");
  if (!requestedRedirectUri || areChatGptCallbackHostVariants(requestedRedirectUri, redirectUri)) {
    params.set("redirect_uri", redirectUri);
  }
  return params.toString();
}

function areChatGptCallbackHostVariants(left: string, right: string): boolean {
  try {
    const leftUrl = new URL(left);
    const rightUrl = new URL(right);
    const chatGptHosts = new Set(["chat.openai.com", "chatgpt.com"]);
    return (
      chatGptHosts.has(leftUrl.hostname) &&
      chatGptHosts.has(rightUrl.hostname) &&
      leftUrl.pathname === rightUrl.pathname
    );
  } catch {
    return false;
  }
}

async function normalizeTokenResponse(response: Response, request: Request): Promise<Response> {
  const headers = addTokenCorsHeaders(new Headers(response.headers), request);
  headers.delete("Content-Length");
  const text = await response.text();
  let json: Record<string, unknown> | null = null;

  try {
    json = JSON.parse(text) as Record<string, unknown>;
  } catch {
    json = null;
  }

  if (json && typeof json.token_type === "string" && json.token_type.toLowerCase() === "bearer") {
    json.token_type = "bearer";
  }

  if (json) {
    headers.set("Content-Type", "application/json");
    return new Response(JSON.stringify(json), { headers, status: response.status, statusText: response.statusText });
  }

  return new Response(text, { headers, status: response.status, statusText: response.statusText });
}

function expandChatGptRedirectUri(uri: string): string[] {
  let parsed: URL;
  try {
    parsed = new URL(uri);
  } catch {
    throw new OAuthError("invalid_request", `Invalid redirect URI: ${uri}`, 400);
  }

  if (parsed.protocol !== "https:") {
    throw new OAuthError("invalid_request", "Redirect URI must use https.", 400);
  }

  if (parsed.hostname !== "chat.openai.com" && parsed.hostname !== "chatgpt.com") {
    return [uri];
  }

  const chatOpenAi = new URL(parsed);
  chatOpenAi.hostname = "chat.openai.com";
  const chatGpt = new URL(parsed);
  chatGpt.hostname = "chatgpt.com";
  return [chatOpenAi.toString(), chatGpt.toString()];
}

function parseRedirectUris(body: RedirectUriUpdateBody): string[] {
  const redirectUris = new Set<string>();

  if (typeof body.redirect_uri === "string") {
    for (const uri of expandChatGptRedirectUri(body.redirect_uri)) redirectUris.add(uri);
  }

  if (Array.isArray(body.redirect_uris)) {
    for (const value of body.redirect_uris) {
      if (typeof value !== "string") {
        throw new OAuthError("invalid_request", "redirect_uris must contain only strings.", 400);
      }
      for (const uri of expandChatGptRedirectUri(value)) redirectUris.add(uri);
    }
  }

  if (redirectUris.size === 0) {
    throw new OAuthError("invalid_request", "Provide redirect_uri or redirect_uris.", 400);
  }

  return Array.from(redirectUris);
}

function parseRedirectUrisOrPlaceholder(body: RedirectUriUpdateBody): string[] {
  try {
    return parseRedirectUris(body);
  } catch (error) {
    if (error instanceof OAuthError && error.code === "invalid_request") {
      return [PLACEHOLDER_REDIRECT_URI];
    }
    throw error;
  }
}

app.get("/authorize", async (c) => {
  try {
    const oauthReqInfo = await c.env.OAUTH_PROVIDER.parseAuthRequest(c.req.raw);
    const { clientId } = oauthReqInfo;
    if (!clientId) return c.text("Invalid request: missing client_id", 400);

    const { token: csrfToken, setCookie } = generateCSRFProtection();

    return renderApprovalDialog(c.req.raw, {
      client: await c.env.OAUTH_PROVIDER.lookupClient(clientId),
      csrfToken,
      server: {
        name: "Canvas LMS Connector",
        description: "Provides read-only Canvas LMS access for AI assistants. Enter your Canvas credentials to authorize access.",
      },
      setCookie,
      state: { oauthReqInfo },
    });
  } catch (error: unknown) {
    if (error instanceof OAuthError) return error.toResponse();
    return c.text(`OAuth authorization request error: ${error instanceof Error ? error.message : String(error)}`, 400);
  }
});

app.post("/authorize", async (c) => {
  try {
    const formData = await c.req.raw.formData();
    validateCSRFToken(formData, c.req.raw);

    const encodedState = getFormString(formData, "state");
    if (!encodedState) return c.text("Missing state in form data", 400);

    const state = parseEncodedState(encodedState);
    if (!state?.oauthReqInfo?.clientId) return c.text("Invalid request", 400);

    const canvasApiToken = getFormString(formData, "canvas_api_token");
    const canvasDomain = getFormString(formData, "canvas_domain");
    const timezone = normalizeTimezone(getFormString(formData, "timezone"));
    if (!canvasApiToken || !canvasDomain) {
      return c.text("Canvas API token and domain are required", 400);
    }

    const userId = crypto.randomUUID();

    await storeCanvasCredentials(
      c.env.OAUTH_KV,
      userId,
      { canvasApiToken, canvasDomain, timezone },
      c.env.COOKIE_ENCRYPTION_KEY,
    );

    const approvedClientCookie = await addApprovedClient(
      c.req.raw,
      state.oauthReqInfo.clientId,
      c.env.COOKIE_ENCRYPTION_KEY,
    );

    let { redirectTo } = await c.env.OAUTH_PROVIDER.completeAuthorization({
      request: state.oauthReqInfo,
      userId,
      metadata: { label: `canvas-user-${userId.slice(0, 8)}` },
      scope: state.oauthReqInfo.scope,
      props: { login: userId, timezone } satisfies Props,
    });

    const code = new URL(redirectTo).searchParams.get("code");
    const key = code ? authCodeRedirectKey(code) : null;
    if (key) {
      await c.env.OAUTH_KV.put(key, state.oauthReqInfo.redirectUri, { expirationTtl: 600 });
    }
    if (code) {
      const alias = createAuthCodeAlias();
      await c.env.OAUTH_KV.put(authCodeAliasKey(alias), code, { expirationTtl: 600 });
      const redirectUrl = new URL(redirectTo);
      redirectUrl.searchParams.set("code", alias);
      redirectTo = redirectUrl.toString();
    }
    redirectTo = normalizeCallbackQueryOrder(redirectTo);

    return new Response(null, {
      headers: {
        "Cache-Control": "no-store",
        Location: redirectTo,
        "Set-Cookie": approvedClientCookie,
      },
      status: 302,
    });
  } catch (error: unknown) {
    if (error instanceof OAuthError) return error.toResponse();
    return c.text(`Internal server error: ${error instanceof Error ? error.message : String(error)}`, 500);
  }
});

async function handleTokenRequest(c: Context<HonoEnv>): Promise<Response> {
  const originalBody = await c.req.raw.text();
  const body = await tokenBodyWithStoredRedirectUri(originalBody, c.env.OAUTH_KV);
  const url = new URL(c.req.url);
  url.pathname = INTERNAL_TOKEN_ENDPOINT;

  const headers = new Headers(c.req.raw.headers);
  headers.set("Content-Type", "application/x-www-form-urlencoded");
  headers.delete("Content-Length");

  const provider = await getTokenEndpointProvider();
  const response = await provider.fetch(new Request(url.toString(), {
    body,
    headers,
    method: "POST",
  }), c.env, c.executionCtx);
  return normalizeTokenResponse(response, c.req.raw);
}

async function handleTokenPreflight(c: Context<HonoEnv>): Promise<Response> {
  return new Response(null, {
    headers: addTokenCorsHeaders(new Headers(), c.req.raw),
    status: 204,
  });
}

app.options("/token", handleTokenPreflight);
app.options("/oauth/token", handleTokenPreflight);
app.options(INTERNAL_TOKEN_ENDPOINT, handleTokenPreflight);
app.post("/token", handleTokenRequest);
app.post("/oauth/token", handleTokenRequest);
app.post(INTERNAL_TOKEN_ENDPOINT, handleTokenRequest);

app.get("/actions/openapi.json", (c) => {
  const origin = new URL(c.req.url).origin;
  return c.json(getActionsOpenApiDocument(origin));
});

app.get("/actions/openapi-oauth.json", (c) => {
  const origin = new URL(c.req.url).origin;
  return c.json(getActionsOpenApiDocument(origin, { includeOAuthSecurity: true }));
});

app.get("/privacy", () => new Response(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Canvas LMS GPT Actions Privacy Policy</title>
<style>
body{font:16px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#1f2937;background:#f9fafb;margin:0}
main{max-width:760px;margin:0 auto;padding:40px 20px}
h1{font-size:30px;line-height:1.15;margin:0 0 18px}
h2{font-size:18px;margin:28px 0 8px}
p,li{color:#374151}
code{background:#eef2f7;border-radius:4px;padding:1px 4px}
</style>
</head>
<body>
<main>
<h1>Canvas LMS GPT Actions Privacy Policy</h1>
<p>This server connects a ChatGPT Custom GPT to Canvas LMS with user-provided Canvas credentials.</p>
<h2>Data Collected</h2>
<p>During authorization, the server stores the Canvas domain, Canvas API token, selected timezone, OAuth grant metadata, and encrypted session credentials needed to serve read-only Canvas requests.</p>
<h2>How Data Is Used</h2>
<p>Stored credentials are used only to call Canvas LMS APIs requested by the authorized GPT Action user. The Actions API is read-only and does not modify Canvas data.</p>
<h2>Storage And Security</h2>
<p>Canvas credentials are encrypted before storage in Cloudflare KV. OAuth access tokens identify the authorized user record and are required for requests to <code>/actions/api/*</code>.</p>
<h2>Sharing</h2>
<p>The server does not sell user data. Canvas data is returned to ChatGPT only when the authorized user invokes the GPT Action.</p>
<h2>Revocation</h2>
<p>Users can remove the connected account from ChatGPT's connected account controls. Administrators can also delete OAuth clients from the server admin UI.</p>
</main>
</body>
</html>`, {
  headers: {
    "Content-Type": "text/html; charset=utf-8",
    "Referrer-Policy": "no-referrer",
  },
}));

app.get("/admin", () => renderAdminUiPage());

app.get("/admin/oauth-clients", async (c) => {
  if (!isAdminAuthorized(c.req.raw, c.env)) {
    return c.json({ error: "unauthorized", message: "Missing or invalid admin token.", status: 401 }, 401);
  }

  const clients = await c.env.OAUTH_PROVIDER.listClients({ limit: 100 });
  return c.json({
    clients: sortPublicClients(clients.items.map(publicClientInfo)),
    cursor: clients.cursor,
  });
});

app.post("/admin/oauth-clients", async (c) => {
  try {
    if (!isAdminAuthorized(c.req.raw, c.env)) {
      return c.json({ error: "unauthorized", message: "Missing or invalid admin token.", status: 401 }, 401);
    }

    const body = await c.req.json<ClientCreateBody>();
    const clientName = typeof body.client_name === "string" && body.client_name.trim()
      ? body.client_name.trim()
      : "Canvas LMS Custom GPT";
    const redirectUris = parseRedirectUrisOrPlaceholder(body);
    const tokenEndpointAuthMethod = parseTokenEndpointAuthMethod(body.token_endpoint_auth_method);
    const client = await c.env.OAUTH_PROVIDER.createClient({
      clientName,
      grantTypes: ["authorization_code", "refresh_token"],
      redirectUris,
      responseTypes: ["code"],
      tokenEndpointAuthMethod,
    });

    return c.json(clientCreationResponse(client, new URL(c.req.url).origin), 201);
  } catch (error: unknown) {
    if (error instanceof OAuthError) return error.toResponse();
    return c.json({
      error: "invalid_request",
      message: error instanceof Error ? error.message : String(error),
      status: 400,
    }, 400);
  }
});

app.post("/admin/oauth-clients/delete", async (c) => {
  try {
    if (!isAdminAuthorized(c.req.raw, c.env)) {
      return c.json({ error: "unauthorized", message: "Missing or invalid admin token.", status: 401 }, 401);
    }

    const body = await c.req.json<ClientDeleteBody>();
    const clientIds = parseClientIds(body);
    const deleted: string[] = [];
    const missing: string[] = [];

    for (const clientId of clientIds) {
      const client = await c.env.OAUTH_PROVIDER.lookupClient(clientId);
      if (!client) {
        missing.push(clientId);
        continue;
      }
      await c.env.OAUTH_PROVIDER.deleteClient(clientId);
      deleted.push(clientId);
    }

    return c.json({ deleted, missing });
  } catch (error: unknown) {
    if (error instanceof OAuthError) return error.toResponse();
    return c.json({
      error: "invalid_request",
      message: error instanceof Error ? error.message : String(error),
      status: 400,
    }, 400);
  }
});

app.get("/admin/oauth-clients/:client_id", async (c) => {
  if (!isAdminAuthorized(c.req.raw, c.env)) {
    return c.json({ error: "unauthorized", message: "Missing or invalid admin token.", status: 401 }, 401);
  }

  const client = await c.env.OAUTH_PROVIDER.lookupClient(c.req.param("client_id"));
  if (!client) {
    return c.json({ error: "not_found", message: "OAuth client was not found.", status: 404 }, 404);
  }

  return c.json(publicClientInfo(client));
});

app.post("/admin/oauth-clients/:client_id/redirect-uris", async (c) => {
  try {
    if (!isAdminAuthorized(c.req.raw, c.env)) {
      return c.json({ error: "unauthorized", message: "Missing or invalid admin token.", status: 401 }, 401);
    }

    const clientId = c.req.param("client_id");
    const existingClient = await c.env.OAUTH_PROVIDER.lookupClient(clientId);
    if (!existingClient) {
      return c.json({ error: "not_found", message: "OAuth client was not found.", status: 404 }, 404);
    }

    const body = await c.req.json<RedirectUriUpdateBody>();
    const redirectUris = parseRedirectUris(body);
    const updatedClient = await c.env.OAUTH_PROVIDER.updateClient(clientId, { redirectUris });
    if (!updatedClient) {
      return c.json({ error: "not_found", message: "OAuth client was not found.", status: 404 }, 404);
    }

    return c.json(publicClientInfo(updatedClient));
  } catch (error: unknown) {
    if (error instanceof OAuthError) return error.toResponse();
    return c.json({
      error: "invalid_request",
      message: error instanceof Error ? error.message : String(error),
      status: 400,
    }, 400);
  }
});

export { app as AuthHandler };
