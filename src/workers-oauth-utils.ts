import type { ClientInfo } from "@cloudflare/workers-oauth-provider";

// ---------------------------------------------------------------------------
// Shared constants and helpers
// ---------------------------------------------------------------------------

const encoder = new TextEncoder();

const COOKIE_NAMES = {
  csrf: "__Host-CSRF_TOKEN",
  approvedClients: "__Host-APPROVED_CLIENTS",
} as const;

const THIRTY_DAYS_IN_SECONDS = 2592000;

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function getCookieValue(request: Request, cookieName: string): string | null {
  const cookieHeader = request.headers.get("Cookie");
  if (!cookieHeader) return null;
  const prefix = `${cookieName}=`;
  const cookie = cookieHeader.split(";").find((c) => c.trimStart().startsWith(prefix));
  if (!cookie) return null;
  return cookie.trimStart().substring(prefix.length);
}

function sanitizeText(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function sanitizeUrl(url: string): string {
  const normalized = url.trim();
  if (normalized.length === 0) return "";
  for (let i = 0; i < normalized.length; i++) {
    const code = normalized.charCodeAt(i);
    if ((code >= 0x00 && code <= 0x1f) || (code >= 0x7f && code <= 0x9f)) return "";
  }
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(normalized);
  } catch {
    return "";
  }
  const scheme = parsedUrl.protocol.slice(0, -1).toLowerCase();
  if (scheme !== "https" && scheme !== "http") return "";
  return normalized;
}

// ---------------------------------------------------------------------------
// OAuthError
// ---------------------------------------------------------------------------

export class OAuthError extends Error {
  constructor(
    public code: string,
    public description: string,
    public statusCode = 400,
  ) {
    super(description);
    this.name = "OAuthError";
  }

  toResponse(): Response {
    return new Response(
      JSON.stringify({ error: this.code, error_description: this.description }),
      { status: this.statusCode, headers: { "Content-Type": "application/json" } },
    );
  }
}

// ---------------------------------------------------------------------------
// Public result interfaces
// ---------------------------------------------------------------------------

export interface CSRFProtectionResult {
  token: string;
  setCookie: string;
}

// ---------------------------------------------------------------------------
// CSRF protection
// ---------------------------------------------------------------------------

export function generateCSRFProtection(): CSRFProtectionResult {
  const token = crypto.randomUUID();
  const setCookie = `${COOKIE_NAMES.csrf}=${token}; HttpOnly; Secure; Path=/; SameSite=Lax; Max-Age=600`;
  return { token, setCookie };
}

export function validateCSRFToken(formData: FormData, request: Request): void {
  const tokenFromForm = formData.get("csrf_token");
  if (!tokenFromForm || typeof tokenFromForm !== "string") {
    throw new OAuthError("invalid_request", "Missing CSRF token in form data", 400);
  }
  const tokenFromCookie = getCookieValue(request, COOKIE_NAMES.csrf);
  if (!tokenFromCookie) {
    throw new OAuthError("invalid_request", "Missing CSRF token cookie", 400);
  }
  if (tokenFromForm !== tokenFromCookie) {
    throw new OAuthError("invalid_request", "CSRF token mismatch", 400);
  }
}

// ---------------------------------------------------------------------------
// Client approval cookie
// ---------------------------------------------------------------------------

export async function addApprovedClient(request: Request, clientId: string, cookieSecret: string): Promise<string> {
  const existingClients = (await getApprovedClientsFromCookie(request, cookieSecret)) ?? [];
  const updatedClients = Array.from(new Set([...existingClients, clientId]));
  const payload = JSON.stringify(updatedClients);
  const signature = await signData(payload, cookieSecret);
  const cookieValue = `${signature}.${btoa(payload)}`;
  return `${COOKIE_NAMES.approvedClients}=${cookieValue}; HttpOnly; Secure; Path=/; SameSite=Lax; Max-Age=${THIRTY_DAYS_IN_SECONDS}`;
}

// ---------------------------------------------------------------------------
// Approval dialog
// ---------------------------------------------------------------------------

export interface ApprovalDialogOptions {
  client: ClientInfo | null;
  server: { name: string; logo?: string; description?: string };
  state: Record<string, unknown>;
  csrfToken: string;
  setCookie: string;
}

export function renderApprovalDialog(request: Request, options: ApprovalDialogOptions): Response {
  const { client, server, state, csrfToken, setCookie } = options;
  const encodedState = btoa(JSON.stringify(state));
  const serverName = sanitizeText(server.name);
  const clientName = client?.clientName ? sanitizeText(client.clientName) : "Unknown MCP Client";
  const serverDescription = server.description ? sanitizeText(server.description) : "";
  const logoUrl = server.logo ? sanitizeText(sanitizeUrl(server.logo)) : "";
  const clientUri = client?.clientUri ? sanitizeText(sanitizeUrl(client.clientUri)) : "";

  const htmlContent = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${clientName} | Authorization Request</title>
<style>
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;line-height:1.6;color:#333;background:#f9fafb;margin:0;padding:0}
.container{max-width:600px;margin:2rem auto;padding:1rem}
.precard{padding:2rem;text-align:center}
.card{background:#fff;border-radius:8px;box-shadow:0 8px 36px 8px rgba(0,0,0,.1);padding:2rem}
.header{display:flex;align-items:center;justify-content:center;margin-bottom:1.5rem}
.logo{width:48px;height:48px;margin-right:1rem;border-radius:8px;object-fit:contain}
.title{margin:0;font-size:1.3rem;font-weight:400}
.alert{font-size:1.5rem;font-weight:400;margin:1rem 0;text-align:center}
.form-group{margin-bottom:1rem}
.form-group label{display:block;font-weight:500;margin-bottom:.25rem;font-size:.9rem}
.form-group input[type="text"],.form-group input[type="password"]{width:100%;padding:.5rem .75rem;border:1px solid #d1d5db;border-radius:6px;font-size:.95rem;box-sizing:border-box}
.form-group input:focus{outline:none;border-color:#0070f3;box-shadow:0 0 0 2px rgba(0,112,243,.15)}
.form-group .hint{font-size:.8rem;color:#6b7280;margin-top:.25rem}
.section-label{font-weight:600;font-size:.95rem;margin:1.5rem 0 .75rem;padding-top:1rem;border-top:1px solid #e5e7eb}
.actions{display:flex;justify-content:flex-end;gap:1rem;margin-top:2rem}
.button{padding:.75rem 1.5rem;border-radius:6px;font-weight:500;cursor:pointer;border:none;font-size:1rem}
.button-primary{background:#0070f3;color:#fff}
.button-secondary{background:transparent;border:1px solid #e5e7eb;color:#333}
</style>
</head><body><div class="container">
<div class="precard"><div class="header">${logoUrl ? `<img src="${logoUrl}" alt="${serverName}" class="logo">` : ""}<h1 class="title"><strong>${serverName}</strong></h1></div>${serverDescription ? `<p>${serverDescription}</p>` : ""}</div>
<div class="card"><h2 class="alert"><strong>${clientName}</strong> is requesting access</h2>
${clientUri ? `<p>Website: <a href="${clientUri}" target="_blank">${clientUri}</a></p>` : ""}
<p>This MCP Client is requesting to be authorized on ${serverName}. Your Canvas credentials will be stored securely.</p>
<form method="post" action="${new URL(request.url).pathname}">
<input type="hidden" name="state" value="${encodedState}">
<input type="hidden" name="csrf_token" value="${csrfToken}">
<div class="section-label">Canvas LMS Credentials</div>
<div class="form-group">
<label for="canvas_domain">Canvas Domain</label>
<input type="text" id="canvas_domain" name="canvas_domain" required placeholder="school.instructure.com">
<div class="hint">Your Canvas instance URL without https://</div>
</div>
<div class="form-group">
<label for="canvas_api_token">Canvas API Token</label>
<input type="password" id="canvas_api_token" name="canvas_api_token" required placeholder="Your API access token">
<div class="hint">Generate one in Canvas: Account &rarr; Settings &rarr; New Access Token</div>
</div>
<div class="actions"><button type="button" class="button button-secondary" onclick="window.history.back()">Cancel</button><button type="submit" class="button button-primary">Approve</button></div>
</form>
</div></div></body></html>`;

  return new Response(htmlContent, {
    headers: {
      "Content-Security-Policy": "frame-ancestors 'none'",
      "Content-Type": "text/html; charset=utf-8",
      "Set-Cookie": setCookie,
      "X-Frame-Options": "DENY",
    },
  });
}

// ---------------------------------------------------------------------------
// Cookie signing helpers
// ---------------------------------------------------------------------------

async function getApprovedClientsFromCookie(request: Request, cookieSecret: string): Promise<string[] | null> {
  const cookieValue = getCookieValue(request, COOKIE_NAMES.approvedClients);
  if (!cookieValue) return null;

  const dotIndex = cookieValue.indexOf(".");
  if (dotIndex === -1) return null;

  const signatureHex = cookieValue.substring(0, dotIndex);
  const payload = atob(cookieValue.substring(dotIndex + 1));

  const isValid = await verifySignature(signatureHex, payload, cookieSecret);
  if (!isValid) return null;

  try {
    const parsed = JSON.parse(payload);
    if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === "string")) return null;
    return parsed as string[];
  } catch {
    return null;
  }
}

async function signData(data: string, secret: string): Promise<string> {
  const key = await importHmacKey(secret);
  const signatureBuffer = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  return bytesToHex(new Uint8Array(signatureBuffer));
}

async function verifySignature(signatureHex: string, data: string, secret: string): Promise<boolean> {
  const key = await importHmacKey(secret);
  try {
    const signatureBytes = new Uint8Array(
      signatureHex.match(/.{1,2}/g)!.map((byte) => Number.parseInt(byte, 16)),
    );
    return await crypto.subtle.verify("HMAC", key, signatureBytes.buffer, encoder.encode(data));
  } catch {
    return false;
  }
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign", "verify"],
  );
}
