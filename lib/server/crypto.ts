import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const PREFIX = "v1";
const AAD = Buffer.from("encopa-sensitive-data-v1", "utf8");

export function sealJson(value: unknown) {
  const key = dataKey();
  if (!key) return JSON.stringify(value);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(AAD);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return [PREFIX, iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(":");
}

export function openJson<T>(value: unknown): T {
  const raw = String(value);
  if (!raw.startsWith(`${PREFIX}:`)) return JSON.parse(raw) as T;
  const parts = raw.split(":");
  if (parts.length !== 4) throw new Error("SENSITIVE_DATA_INVALID");
  const key = dataKey();
  if (!key) throw new Error("DATA_KEY_NOT_CONFIGURED");
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(parts[1], "base64url"));
    decipher.setAAD(AAD);
    decipher.setAuthTag(Buffer.from(parts[2], "base64url"));
    const decrypted = Buffer.concat([decipher.update(Buffer.from(parts[3], "base64url")), decipher.final()]);
    return JSON.parse(decrypted.toString("utf8")) as T;
  } catch {
    throw new Error("SENSITIVE_DATA_INVALID");
  }
}

function dataKey() {
  const raw = process.env.ENCOPA_DATA_KEY?.trim();
  if (!raw) {
    if (process.env.NODE_ENV === "production") throw new Error("DATA_KEY_NOT_CONFIGURED");
    return null;
  }
  const key = /^[a-f0-9]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("DATA_KEY_INVALID");
  return key;
}
