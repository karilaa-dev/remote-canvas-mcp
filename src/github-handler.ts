import type { AuthRequest, OAuthHelpers } from "@cloudflare/workers-oauth-provider";
import { Hono } from "hono";
import type { CanvasCredentials } from "./credential-store.js";
import { storeCanvasCredentials } from "./credential-store.js";
import { fetchUpstreamAuthToken, getUpstreamAuthorizeUrl, type Props } from "./utils.js";
import {
  addApprovedClient,
  bindStateToSession,
  createOAuthState,
  generateCSRFProtection,
  OAuthError,
  renderApprovalDialog,
  validateCSRFToken,
  validateOAuthState,
} from "./workers-oauth-utils.js";

type HonoEnv = { Bindings: Env & { OAUTH_PROVIDER: OAuthHelpers } };

interface GitHubUser {
  login: string;
  name: string | null;
  email: string | null;
}

const app = new Hono<HonoEnv>();

function getRequiredFormString(formData: FormData, field: string): string | null {
  const value = formData.get(field);
  if (!value || typeof value !== "string") return null;
  return value;
}

// ---------------------------------------------------------------------------
// GET /authorize -- show the approval form
// ---------------------------------------------------------------------------

app.get("/authorize", async (c) => {
  const oauthReqInfo = await c.env.OAUTH_PROVIDER.parseAuthRequest(c.req.raw);
  const { clientId } = oauthReqInfo;
  if (!clientId) return c.text("Invalid request", 400);

  const { token: csrfToken, setCookie } = generateCSRFProtection();

  return renderApprovalDialog(c.req.raw, {
    client: await c.env.OAUTH_PROVIDER.lookupClient(clientId),
    csrfToken,
    server: {
      name: "Canvas LMS MCP Server",
      description: "Provides Canvas LMS tools for AI assistants. Sign in with GitHub to authorize access.",
    },
    setCookie,
    state: { oauthReqInfo },
  });
});

// ---------------------------------------------------------------------------
// POST /authorize -- validate form, store pending credentials, redirect to GitHub
// ---------------------------------------------------------------------------

app.post("/authorize", async (c) => {
  try {
    const formData = await c.req.raw.formData();
    validateCSRFToken(formData, c.req.raw);

    const encodedState = getRequiredFormString(formData, "state");
    if (!encodedState) return c.text("Missing state in form data", 400);

    let state: { oauthReqInfo?: AuthRequest };
    try {
      state = JSON.parse(atob(encodedState));
    } catch {
      return c.text("Invalid state data", 400);
    }

    if (!state.oauthReqInfo?.clientId) return c.text("Invalid request", 400);

    const canvasApiToken = getRequiredFormString(formData, "canvas_api_token");
    const canvasDomain = getRequiredFormString(formData, "canvas_domain");
    if (!canvasApiToken || !canvasDomain) {
      return c.text("Canvas API token and domain are required", 400);
    }

    const approvedClientCookie = await addApprovedClient(c.req.raw, state.oauthReqInfo.clientId, c.env.COOKIE_ENCRYPTION_KEY);
    const { stateToken } = await createOAuthState(state.oauthReqInfo, c.env.OAUTH_KV);
    const { setCookie: sessionBindingCookie } = await bindStateToSession(stateToken);

    await c.env.OAUTH_KV.put(
      `canvas:pending:${stateToken}`,
      JSON.stringify({ canvasApiToken, canvasDomain }),
      { expirationTtl: 600 },
    );

    return redirectToGitHub(c.req.raw, c.env.GITHUB_CLIENT_ID, stateToken, [
      approvedClientCookie,
      sessionBindingCookie,
    ]);
  } catch (error: unknown) {
    if (error instanceof OAuthError) return error.toResponse();
    return c.text(`Internal server error: ${error instanceof Error ? error.message : String(error)}`, 500);
  }
});

function redirectToGitHub(
  request: Request,
  githubClientId: string,
  stateToken: string,
  cookies: string[] = [],
): Response {
  const headers = new Headers({
    location: getUpstreamAuthorizeUrl({
      client_id: githubClientId,
      redirect_uri: new URL("/callback", request.url).href,
      scope: "read:user",
      state: stateToken,
      upstream_url: "https://github.com/login/oauth/authorize",
    }),
  });
  for (const cookie of cookies) {
    headers.append("Set-Cookie", cookie);
  }
  return new Response(null, { status: 302, headers });
}

// ---------------------------------------------------------------------------
// GET /callback -- exchange code for token, store credentials, complete OAuth
// ---------------------------------------------------------------------------

app.get("/callback", async (c) => {
  const stateToken = c.req.query("state");

  let oauthReqInfo: AuthRequest;
  let clearSessionCookie: string;

  try {
    const result = await validateOAuthState(c.req.raw, c.env.OAUTH_KV);
    oauthReqInfo = result.oauthReqInfo;
    clearSessionCookie = result.clearCookie;
  } catch (error: unknown) {
    if (error instanceof OAuthError) return error.toResponse();
    return c.text("Internal server error", 500);
  }

  if (!oauthReqInfo.clientId) return c.text("Invalid OAuth request data", 400);

  const [accessToken, errResponse] = await fetchUpstreamAuthToken({
    client_id: c.env.GITHUB_CLIENT_ID,
    client_secret: c.env.GITHUB_CLIENT_SECRET,
    code: c.req.query("code"),
    redirect_uri: new URL("/callback", c.req.url).href,
    upstream_url: "https://github.com/login/oauth/access_token",
  });
  if (errResponse) return errResponse;

  const userResponse = await fetch("https://api.github.com/user", {
    headers: { Authorization: `Bearer ${accessToken}`, "User-Agent": "Canvas-MCP-Server" },
  });
  const userData = (await userResponse.json()) as GitHubUser;

  await storePendingCanvasCredentials(c.env.OAUTH_KV, stateToken, userData.login, c.env.COOKIE_ENCRYPTION_KEY);

  const { redirectTo } = await c.env.OAUTH_PROVIDER.completeAuthorization({
    metadata: { label: userData.name || userData.login },
    props: {
      login: userData.login,
      name: userData.name || userData.login,
      email: userData.email || "",
    } as Props,
    request: oauthReqInfo,
    scope: oauthReqInfo.scope,
    userId: userData.login,
  });

  const headers = new Headers({ Location: redirectTo });
  if (clearSessionCookie) headers.set("Set-Cookie", clearSessionCookie);

  return new Response(null, { status: 302, headers });
});

async function storePendingCanvasCredentials(
  kv: KVNamespace,
  stateToken: string | undefined,
  githubLogin: string,
  encryptionKey: string,
): Promise<void> {
  if (!stateToken) return;

  const pendingKey = `canvas:pending:${stateToken}`;
  const pendingRaw = await kv.get(pendingKey);
  if (!pendingRaw) return;

  try {
    const pending = JSON.parse(pendingRaw) as CanvasCredentials;
    await storeCanvasCredentials(kv, githubLogin, pending, encryptionKey);
  } catch {
    // Non-fatal -- user can still use canvas_setup_credentials tool as fallback
  }

  await kv.delete(pendingKey);
}

export { app as GitHubHandler };
