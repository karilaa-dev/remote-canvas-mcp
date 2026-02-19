/**
 * Encrypted per-user Canvas credential storage in Cloudflare KV.
 *
 * Canvas API tokens are encrypted with AES-256-GCM. The encryption key is
 * derived from COOKIE_ENCRYPTION_KEY via HKDF with a distinct "info" tag
 * ("canvas-credentials") so it is cryptographically independent from the
 * cookie-signing key used elsewhere.
 */

const KV_PREFIX = "canvas:credentials:";
const HKDF_INFO = "canvas-credentials";
const IV_BYTES = 12;
const encoder = new TextEncoder();

export interface CanvasCredentials {
  canvasApiToken: string;
  canvasDomain: string;
}

interface StoredCredentials {
  /** base64(IV + ciphertext) */
  encryptedToken: string;
  canvasDomain: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function getCanvasCredentials(
  kv: KVNamespace,
  githubLogin: string,
  encryptionKey: string,
): Promise<CanvasCredentials | null> {
  const raw = await kv.get(`${KV_PREFIX}${githubLogin}`);
  if (!raw) return null;

  let stored: StoredCredentials;
  try {
    stored = JSON.parse(raw) as StoredCredentials;
  } catch {
    return null;
  }

  try {
    const key = await deriveKey(encryptionKey);
    const canvasApiToken = await decrypt(stored.encryptedToken, key);
    return { canvasApiToken, canvasDomain: stored.canvasDomain };
  } catch {
    // Decryption failed (key rotated, corrupted data, etc.) — treat as missing.
    return null;
  }
}

export async function storeCanvasCredentials(
  kv: KVNamespace,
  githubLogin: string,
  credentials: CanvasCredentials,
  encryptionKey: string,
): Promise<void> {
  const key = await deriveKey(encryptionKey);
  const encryptedToken = await encrypt(credentials.canvasApiToken, key);

  const stored: StoredCredentials = {
    encryptedToken,
    canvasDomain: credentials.canvasDomain,
    updatedAt: new Date().toISOString(),
  };

  await kv.put(`${KV_PREFIX}${githubLogin}`, JSON.stringify(stored));
}

export async function deleteCanvasCredentials(
  kv: KVNamespace,
  githubLogin: string,
): Promise<void> {
  await kv.delete(`${KV_PREFIX}${githubLogin}`);
}

// ---------------------------------------------------------------------------
// Encryption helpers
// ---------------------------------------------------------------------------

async function deriveKey(secret: string): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    "HKDF",
    false,
    ["deriveKey"],
  );

  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: encoder.encode("canvas-mcp-salt"),
      info: encoder.encode(HKDF_INFO),
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function encrypt(plaintext: string, key: CryptoKey): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoder.encode(plaintext),
  );

  const combined = new Uint8Array(iv.byteLength + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.byteLength);
  return btoa(String.fromCharCode(...combined));
}

async function decrypt(encoded: string, key: CryptoKey): Promise<string> {
  const combined = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
  const iv = combined.slice(0, IV_BYTES);
  const ciphertext = combined.slice(IV_BYTES);

  const plainBuf = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext,
  );

  return new TextDecoder().decode(plainBuf);
}
