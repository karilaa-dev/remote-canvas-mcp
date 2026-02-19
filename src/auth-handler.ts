import type { AuthRequest, OAuthHelpers } from "@cloudflare/workers-oauth-provider";
import { Hono } from "hono";
import { storeCanvasCredentials } from "./credential-store.js";
import type { Props } from "./utils.js";
import {
  addApprovedClient,
  generateCSRFProtection,
  OAuthError,
  renderApprovalDialog,
  validateCSRFToken,
} from "./workers-oauth-utils.js";

type HonoEnv = { Bindings: Env & { OAUTH_PROVIDER: OAuthHelpers } };

const app = new Hono<HonoEnv>();

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
      description: "Provides Canvas LMS tools for AI assistants. Enter your Canvas credentials to authorize access.",
    },
    setCookie,
    state: { oauthReqInfo },
  });
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
    if (!canvasApiToken || !canvasDomain) {
      return c.text("Canvas API token and domain are required", 400);
    }

    const userId = crypto.randomUUID();

    await storeCanvasCredentials(
      c.env.OAUTH_KV,
      userId,
      { canvasApiToken, canvasDomain },
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
      props: { login: userId } satisfies Props,
    });

    const headers = new Headers({ Location: redirectTo });
    headers.append("Set-Cookie", approvedClientCookie);
    return new Response(null, { status: 302, headers });
  } catch (error: unknown) {
    if (error instanceof OAuthError) return error.toResponse();
    return c.text(`Internal server error: ${error instanceof Error ? error.message : String(error)}`, 500);
  }
});

export { app as AuthHandler };
