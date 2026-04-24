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
const OAUTH_EVENT_PREFIX = "oauth:event:";

type OAuthEvent = {
  auth_method?: string;
  body_keys?: string[];
  client_id?: string;
  error?: string;
  error_description?: string;
  grant_type?: string | null;
  has_code_verifier?: boolean;
  has_redirect_uri?: boolean;
  id?: string;
  message?: string;
  phase: "authorize" | "token";
  redirect_host?: string;
  redirect_path?: string;
  status: number;
  timestamp?: string;
  token_type?: string;
};

type RuntimeInfo = {
  source_commit: string;
  worker_version_id?: string;
  worker_version_tag?: string;
  worker_version_timestamp?: string;
};

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

function oauthEventKey(timestamp: string, id: string): string {
  return `${OAUTH_EVENT_PREFIX}${timestamp}:${id}`;
}

function summarizeRedirectUri(redirectUri: string | undefined): Pick<OAuthEvent, "redirect_host" | "redirect_path"> {
  if (!redirectUri) return {};
  try {
    const url = new URL(redirectUri);
    return { redirect_host: url.host, redirect_path: url.pathname };
  } catch {
    return {};
  }
}

function parseBasicClientId(authHeader: string | null): string | undefined {
  if (!authHeader?.startsWith("Basic ")) return undefined;
  try {
    const [id] = atob(authHeader.substring(6)).split(":", 2);
    return decodeURIComponent(id);
  } catch {
    return undefined;
  }
}

function summarizeTokenRequest(bodyText: string, request: Request): OAuthEvent {
  const params = new URLSearchParams(bodyText);
  const authClientId = parseBasicClientId(request.headers.get("Authorization"));
  return {
    auth_method: authClientId ? "client_secret_basic" : "client_secret_post",
    body_keys: Array.from(new Set(Array.from(params.keys()))).filter((key) => key !== "client_secret" && key !== "code"),
    client_id: authClientId ?? params.get("client_id") ?? undefined,
    grant_type: params.get("grant_type"),
    has_code_verifier: params.has("code_verifier"),
    has_redirect_uri: params.has("redirect_uri"),
    phase: "token",
    status: 0,
  };
}

function getRuntimeInfo(env: Env): RuntimeInfo {
  return {
    source_commit: env.SOURCE_COMMIT ?? "unknown",
    worker_version_id: env.VERSION_METADATA?.id,
    worker_version_tag: env.VERSION_METADATA?.tag,
    worker_version_timestamp: env.VERSION_METADATA?.timestamp,
  };
}

async function recordOAuthEvent(env: Env, event: OAuthEvent): Promise<void> {
  try {
    const timestamp = new Date().toISOString();
    const id = crypto.randomUUID();
    await env.OAUTH_KV.put(oauthEventKey(timestamp, id), JSON.stringify({ ...event, id, timestamp }), {
      expirationTtl: 60 * 60 * 6,
    });
  } catch {
    // Diagnostics must never break OAuth.
  }
}

async function listOAuthEvents(kv: KVNamespace): Promise<OAuthEvent[]> {
  const listed = await kv.list({ prefix: OAUTH_EVENT_PREFIX, limit: 50 });
  const events = await Promise.all(
    listed.keys.map(async (key) => {
      try {
        return await kv.get<OAuthEvent>(key.name, { type: "json" });
      } catch {
        return null;
      }
    }),
  );
  return events.filter((event): event is OAuthEvent => Boolean(event)).sort((a, b) =>
    (b.timestamp ?? "").localeCompare(a.timestamp ?? ""),
  );
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

function clientCreationResponse(client: ClientInfo) {
  return {
    ...publicClientInfo(client),
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

  if (params.get("redirect_uri")) return params.toString();

  const key = authCodeRedirectKey(providerCode);
  if (!key) return bodyText;

  const redirectUri = await kv.get(key);
  if (!redirectUri) return bodyText;

  params.set("redirect_uri", redirectUri);
  return params.toString();
}

async function tokenResponseWithDiagnostics(
  response: Response,
  env: Env,
  requestSummary: OAuthEvent,
): Promise<Response> {
  const headers = new Headers(response.headers);
  headers.delete("Content-Length");
  const text = await response.text();
  let json: Record<string, unknown> | null = null;

  try {
    json = JSON.parse(text) as Record<string, unknown>;
  } catch {
    json = null;
  }

  if (json && typeof json.token_type === "string" && json.token_type.toLowerCase() === "bearer") {
    json.token_type = "Bearer";
  }

  await recordOAuthEvent(env, {
    ...requestSummary,
    error: typeof json?.error === "string" ? json.error : undefined,
    error_description: typeof json?.error_description === "string" ? json.error_description : undefined,
    status: response.status,
    token_type: typeof json?.token_type === "string" ? json.token_type : undefined,
  });

  if (json) {
    headers.set("Content-Type", "application/json");
    return new Response(JSON.stringify(json), { headers, status: response.status, statusText: response.statusText });
  }

  return new Response(text, { headers, status: response.status, statusText: response.statusText });
}

function renderAdminPage(): Response {
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Canvas OAuth Admin</title>
<style>
:root{color-scheme:dark;--bg:#111312;--panel:#191c1b;--panel-2:#202422;--line:#343a37;--text:#f2f5f1;--muted:#9aa39e;--accent:#74d09f;--accent-2:#d2a85b;--danger:#ef7c7c;--radius:8px;--shadow:0 18px 60px rgba(0,0,0,.34)}
*{box-sizing:border-box}
body{margin:0;background:radial-gradient(circle at 0 0,rgba(116,208,159,.1),transparent 31rem),linear-gradient(145deg,#0d0f0e,#151816 45%,#101211);color:var(--text);font:14px/1.45 ui-monospace,SFMono-Regular,Menlo,Consolas,"Liberation Mono",monospace;min-height:100vh}
button,input,textarea{font:inherit}
.shell{max-width:1180px;margin:0 auto;padding:28px}
.top{display:flex;align-items:flex-end;justify-content:space-between;gap:18px;margin-bottom:18px}
.brand{display:grid;gap:4px}
.eyebrow{color:var(--accent);font-size:12px;text-transform:uppercase;letter-spacing:.08em}
h1{font-size:28px;line-height:1.05;margin:0;font-weight:650;letter-spacing:0}
.status{min-height:22px;color:var(--muted);text-align:right}
.grid{display:grid;grid-template-columns:320px 1fr;gap:14px}
.panel{background:linear-gradient(180deg,rgba(255,255,255,.025),transparent),var(--panel);border:1px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow)}
.section{padding:16px;border-bottom:1px solid var(--line)}
.section:last-child{border-bottom:0}
label{display:block;color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.07em;margin:0 0 7px}
input,textarea{width:100%;border:1px solid var(--line);background:#0d0f0e;color:var(--text);border-radius:6px;padding:10px 11px;outline:none}
textarea{min-height:112px;resize:vertical}
input:focus,textarea:focus{border-color:var(--accent);box-shadow:0 0 0 3px rgba(116,208,159,.12)}
.row{display:flex;gap:8px;align-items:center}
.row input{min-width:0}
.button{border:1px solid var(--line);background:var(--panel-2);color:var(--text);border-radius:6px;padding:10px 12px;cursor:pointer;white-space:nowrap}
.button:hover{border-color:#56615b;background:#252b28}
.primary{background:var(--accent);border-color:var(--accent);color:#07100b;font-weight:700}
.primary:hover{background:#88e2b1}
.danger{color:#ffd0d0;border-color:#604040}
.list{display:grid;gap:8px;max-height:520px;overflow:auto}
.client{border:1px solid var(--line);background:#111412;border-radius:6px;padding:10px;text-align:left;cursor:pointer}
.client:hover,.client.active{border-color:var(--accent);background:#17211b}
.client strong{display:block;margin-bottom:3px}
.client span{display:block;color:var(--muted);font-size:12px;overflow:hidden;text-overflow:ellipsis}
.meta{display:grid;grid-template-columns:180px 1fr;gap:8px 12px;margin:0}
.meta dt{color:var(--muted)}
.meta dd{margin:0;overflow-wrap:anywhere}
.uri-list{display:grid;gap:8px;margin:0;padding:0;list-style:none}
.uri-list li{background:#0d0f0e;border:1px solid var(--line);border-radius:6px;padding:9px 10px;overflow-wrap:anywhere}
.hidden{display:none!important}
.empty{color:var(--muted);padding:12px;border:1px dashed var(--line);border-radius:6px}
@media (max-width:820px){.shell{padding:18px}.grid{grid-template-columns:1fr}.top{align-items:flex-start;flex-direction:column}.status{text-align:left}.meta{grid-template-columns:1fr}}
</style>
</head>
<body>
<main class="shell">
  <header class="top">
    <div class="brand">
      <div class="eyebrow">Canvas LMS</div>
      <h1>OAuth Admin</h1>
    </div>
    <div class="status" id="status"></div>
  </header>

  <section class="panel" id="loginPanel">
    <div class="section">
      <label for="token">Admin token</label>
      <div class="row">
        <input id="token" type="password" autocomplete="current-password">
        <button class="button primary" id="saveToken">Login</button>
      </div>
    </div>
  </section>

  <section class="grid hidden" id="appPanel">
    <aside class="panel">
      <div class="section">
        <div class="row">
          <button class="button primary" id="refreshClients">Refresh</button>
          <button class="button danger" id="logout">Logout</button>
        </div>
      </div>
      <div class="section">
        <label for="clientSearch">Client ID</label>
        <div class="row">
          <input id="clientSearch" placeholder="lcxWz465JLWtJRjx">
          <button class="button" id="loadClient">Load</button>
        </div>
      </div>
      <div class="section">
        <label>Clients</label>
        <div class="list" id="clientList"></div>
      </div>
    </aside>

    <section class="panel">
      <div class="section">
        <dl class="meta" id="clientMeta"></dl>
      </div>
      <div class="section">
        <label>Redirect URIs</label>
        <ul class="uri-list" id="redirectUris"></ul>
      </div>
      <div class="section">
        <label for="newRedirect">Current callback URL</label>
        <textarea id="newRedirect" placeholder="https://chat.openai.com/aip/g-.../oauth/callback"></textarea>
        <div class="row" style="margin-top:10px">
          <button class="button primary" id="updateRedirects">Update redirects</button>
        </div>
      </div>
    </section>
  </section>
</main>
<script>
const tokenInput = document.getElementById("token");
const saveToken = document.getElementById("saveToken");
const loginPanel = document.getElementById("loginPanel");
const appPanel = document.getElementById("appPanel");
const statusEl = document.getElementById("status");
const clientList = document.getElementById("clientList");
const clientMeta = document.getElementById("clientMeta");
const redirectUris = document.getElementById("redirectUris");
const clientSearch = document.getElementById("clientSearch");
const newRedirect = document.getElementById("newRedirect");
let selectedClientId = "";

function setStatus(message, tone = "muted") {
  statusEl.textContent = message;
  statusEl.style.color = tone === "error" ? "var(--danger)" : tone === "ok" ? "var(--accent)" : "var(--muted)";
}

function getToken() {
  return localStorage.getItem("canvasAdminToken") || "";
}

function authHeaders(extra = {}) {
  return { ...extra, Authorization: "Bearer " + getToken() };
}

function showApp() {
  loginPanel.classList.add("hidden");
  appPanel.classList.remove("hidden");
}

function showLogin() {
  appPanel.classList.add("hidden");
  loginPanel.classList.remove("hidden");
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: authHeaders(options.headers || {}),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || data.error || "Request failed");
  return data;
}

function renderClientList(clients) {
  clientList.innerHTML = "";
  if (!clients.length) {
    clientList.innerHTML = '<div class="empty">No clients found.</div>';
    return;
  }
  for (const client of clients) {
    const button = document.createElement("button");
    button.className = "client" + (client.client_id === selectedClientId ? " active" : "");
    button.innerHTML = "<strong></strong><span></span><span></span>";
    button.querySelector("strong").textContent = client.client_name || "Unnamed client";
    button.querySelectorAll("span")[0].textContent = client.client_id;
    button.querySelectorAll("span")[1].textContent = (client.redirect_uris || [])[0] || "No redirect URI";
    button.addEventListener("click", () => loadClient(client.client_id));
    clientList.appendChild(button);
  }
}

function renderClient(client) {
  selectedClientId = client.client_id;
  clientSearch.value = client.client_id;
  clientMeta.innerHTML = "";
  for (const [label, value] of [
    ["Client ID", client.client_id],
    ["Name", client.client_name || ""],
    ["Grant types", (client.grant_types || []).join(", ")],
    ["Response types", (client.response_types || []).join(", ")],
    ["Token auth", client.token_endpoint_auth_method || ""],
  ]) {
    const dt = document.createElement("dt");
    const dd = document.createElement("dd");
    dt.textContent = label;
    dd.textContent = value;
    clientMeta.append(dt, dd);
  }
  redirectUris.innerHTML = "";
  for (const uri of client.redirect_uris || []) {
    const li = document.createElement("li");
    li.textContent = uri;
    redirectUris.appendChild(li);
  }
}

async function refreshClients() {
  setStatus("Loading clients...");
  const data = await api("/admin/oauth-clients");
  renderClientList(data.clients || []);
  setStatus("Clients loaded", "ok");
}

async function loadClient(clientId) {
  if (!clientId) return;
  setStatus("Loading client...");
  const client = await api("/admin/oauth-clients/" + encodeURIComponent(clientId));
  renderClient(client);
  await refreshClients();
  setStatus("Client loaded", "ok");
}

async function updateRedirects() {
  if (!selectedClientId) throw new Error("Load a client first.");
  const redirectUri = newRedirect.value.trim();
  if (!redirectUri) throw new Error("Paste a callback URL first.");
  setStatus("Updating redirects...");
  const client = await api("/admin/oauth-clients/" + encodeURIComponent(selectedClientId) + "/redirect-uris", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ redirect_uri: redirectUri }),
  });
  newRedirect.value = "";
  renderClient(client);
  await refreshClients();
  setStatus("Redirects updated", "ok");
}

saveToken.addEventListener("click", async () => {
  localStorage.setItem("canvasAdminToken", tokenInput.value.trim());
  showApp();
  try { await refreshClients(); } catch (error) { setStatus(error.message, "error"); }
});
document.getElementById("refreshClients").addEventListener("click", () => refreshClients().catch((error) => setStatus(error.message, "error")));
document.getElementById("logout").addEventListener("click", () => { localStorage.removeItem("canvasAdminToken"); showLogin(); setStatus(""); });
document.getElementById("loadClient").addEventListener("click", () => loadClient(clientSearch.value.trim()).catch((error) => setStatus(error.message, "error")));
document.getElementById("updateRedirects").addEventListener("click", () => updateRedirects().catch((error) => setStatus(error.message, "error")));
tokenInput.addEventListener("keydown", (event) => { if (event.key === "Enter") saveToken.click(); });
clientSearch.addEventListener("keydown", (event) => { if (event.key === "Enter") document.getElementById("loadClient").click(); });

if (getToken()) {
  showApp();
  refreshClients().catch((error) => setStatus(error.message, "error"));
} else {
  showLogin();
}
</script>
</body>
</html>`;

  return new Response(html, {
    headers: {
      "Content-Security-Policy": "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'",
      "Content-Type": "text/html; charset=utf-8",
      "X-Frame-Options": "DENY",
    },
  });
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

    await recordOAuthEvent(c.env, {
      client_id: state.oauthReqInfo.clientId,
      phase: "authorize",
      status: 302,
      ...summarizeRedirectUri(state.oauthReqInfo.redirectUri),
    });

    const headers = new Headers({ Location: redirectTo });
    headers.append("Set-Cookie", approvedClientCookie);
    return new Response(null, { status: 302, headers });
  } catch (error: unknown) {
    if (error instanceof OAuthError) return error.toResponse();
    await recordOAuthEvent(c.env, {
      message: error instanceof Error ? error.message : String(error),
      phase: "authorize",
      status: 500,
    });
    return c.text(`Internal server error: ${error instanceof Error ? error.message : String(error)}`, 500);
  }
});

async function handleTokenRequest(c: Context<HonoEnv>): Promise<Response> {
  const originalBody = await c.req.raw.text();
  const body = await tokenBodyWithStoredRedirectUri(originalBody, c.env.OAUTH_KV);
  const requestSummary = summarizeTokenRequest(body, c.req.raw);
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
  return tokenResponseWithDiagnostics(response, c.env, requestSummary);
}

app.post("/token", handleTokenRequest);
app.post("/oauth/token", handleTokenRequest);

app.get("/actions/openapi.json", (c) => {
  const origin = new URL(c.req.url).origin;
  return c.json(getActionsOpenApiDocument(origin));
});

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

app.get("/admin/oauth-events", async (c) => {
  if (!isAdminAuthorized(c.req.raw, c.env)) {
    return c.json({ error: "unauthorized", message: "Missing or invalid admin token.", status: 401 }, 401);
  }

  return c.json({ events: await listOAuthEvents(c.env.OAUTH_KV) });
});

app.get("/admin/runtime", async (c) => {
  if (!isAdminAuthorized(c.req.raw, c.env)) {
    return c.json({ error: "unauthorized", message: "Missing or invalid admin token.", status: 401 }, 401);
  }

  return c.json(getRuntimeInfo(c.env));
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

    return c.json(clientCreationResponse(client), 201);
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
