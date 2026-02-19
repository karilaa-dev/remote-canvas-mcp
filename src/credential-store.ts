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
  userId: string,
  encryptionKey: string,
): Promise<CanvasCredentials | null> {
  const raw = await kv.get(`${KV_PREFIX}${userId}`);
  if (!raw) return null;

  try {
    const stored = JSON.parse(raw) as StoredCredentials;
    const key = await deriveKey(encryptionKey);
    const canvasApiToken = await decrypt(stored.encryptedToken, key);
    return { canvasApiToken, canvasDomain: stored.canvasDomain };
  } catch {
    // Parse or decryption failed (corrupted data, key rotated, etc.)
    return null;
  }
}

export async function storeCanvasCredentials(
  kv: KVNamespace,
  userId: string,
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

  await kv.put(`${KV_PREFIX}${userId}`, JSON.stringify(stored), {
    expirationTtl: 15_552_000, // 6 months
  });
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
