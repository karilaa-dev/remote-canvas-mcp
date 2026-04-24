import type { AuthRequest, OAuthHelpers } from "@cloudflare/workers-oauth-provider";
import { Hono } from "hono";
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
    redirect_uris: client.redirectUris,
    grant_types: client.grantTypes,
    response_types: client.responseTypes,
    token_endpoint_auth_method: client.tokenEndpointAuthMethod,
  };
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

    const { redirectTo } = await c.env.OAUTH_PROVIDER.completeAuthorization({
      request: state.oauthReqInfo,
      userId,
      metadata: { label: `canvas-user-${userId.slice(0, 8)}` },
      scope: state.oauthReqInfo.scope,
      props: { login: userId, timezone } satisfies Props,
    });

    const headers = new Headers({ Location: redirectTo });
    headers.append("Set-Cookie", approvedClientCookie);
    return new Response(null, { status: 302, headers });
  } catch (error: unknown) {
    if (error instanceof OAuthError) return error.toResponse();
    return c.text(`Internal server error: ${error instanceof Error ? error.message : String(error)}`, 500);
  }
});

app.get("/actions/openapi.json", (c) => {
  const origin = new URL(c.req.url).origin;
  return c.json(getActionsOpenApiDocument(origin));
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
