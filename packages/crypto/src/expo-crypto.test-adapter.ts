export enum AESKeySize {
  AES128 = 128,
  AES192 = 192,
  AES256 = 256,
}

export enum CryptoDigestAlgorithm {
  SHA1 = "SHA-1",
  SHA256 = "SHA-256",
  SHA384 = "SHA-384",
  SHA512 = "SHA-512",
}

export class AESEncryptionKey {
  private constructor(
    private readonly key: CryptoKey,
    private readonly raw: Uint8Array,
  ) {}

  static async generate(size = AESKeySize.AES256) {
    const key = await crypto.subtle.generateKey(
      { length: size, name: "AES-GCM" },
      true,
      ["encrypt", "decrypt"],
    );
    const raw = new Uint8Array(await crypto.subtle.exportKey("raw", key));
    return new AESEncryptionKey(key, raw);
  }

  static async import(value: string | Uint8Array, encoding?: "hex" | "base64") {
    const raw =
      typeof value === "string" ? decode(value, encoding ?? "base64") : value;
    const key = await crypto.subtle.importKey(
      "raw",
      toArrayBuffer(raw),
      { name: "AES-GCM" },
      true,
      ["encrypt", "decrypt"],
    );
    return new AESEncryptionKey(key, raw);
  }

  async encoded(encoding: "hex" | "base64") {
    return encode(this.raw, encoding);
  }

  cryptoKey() {
    return this.key;
  }
}

export class AESSealedData {
  private constructor(
    readonly ivBytes: Uint8Array,
    readonly ciphertextBytes: Uint8Array,
  ) {}

  static fromCombined(value: string | Uint8Array) {
    const bytes = typeof value === "string" ? decode(value, "base64") : value;
    return new AESSealedData(bytes.slice(0, 12), bytes.slice(12));
  }

  static create(iv: Uint8Array, ciphertext: Uint8Array) {
    return new AESSealedData(iv, ciphertext);
  }

  async combined(encoding: "base64" | "bytes" = "bytes") {
    const combined = new Uint8Array(
      this.ivBytes.length + this.ciphertextBytes.length,
    );
    combined.set(this.ivBytes);
    combined.set(this.ciphertextBytes, this.ivBytes.length);
    return encoding === "base64" ? encode(combined, "base64") : combined;
  }
}

export async function aesEncryptAsync(
  plaintext: string | Uint8Array | ArrayBuffer,
  key: AESEncryptionKey,
  options?: { additionalData?: string | Uint8Array | ArrayBuffer },
) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    {
      additionalData: binary(options?.additionalData),
      iv: toArrayBuffer(iv),
      name: "AES-GCM",
      tagLength: 128,
    },
    key.cryptoKey(),
    binary(plaintext)!,
  );
  return AESSealedData.create(iv, new Uint8Array(ciphertext));
}

export async function aesDecryptAsync(
  sealed: AESSealedData,
  key: AESEncryptionKey,
  options?: { additionalData?: string | Uint8Array | ArrayBuffer },
) {
  const plaintext = await crypto.subtle.decrypt(
    {
      additionalData: binary(options?.additionalData),
      iv: toArrayBuffer(sealed.ivBytes),
      name: "AES-GCM",
      tagLength: 128,
    },
    key.cryptoKey(),
    toArrayBuffer(sealed.ciphertextBytes),
  );
  return new Uint8Array(plaintext);
}

export async function digestStringAsync(
  algorithm: CryptoDigestAlgorithm,
  value: string,
) {
  const digest = new Uint8Array(
    await crypto.subtle.digest(algorithm, new TextEncoder().encode(value)),
  );
  return encode(digest, "hex");
}

export function randomUUID() {
  return crypto.randomUUID();
}

function binary(value?: string | Uint8Array | ArrayBuffer) {
  if (value === undefined) return undefined;
  if (typeof value === "string") {
    return toArrayBuffer(decode(value, "base64"));
  }
  if (value instanceof ArrayBuffer) return value;
  return toArrayBuffer(value);
}

function toArrayBuffer(value: Uint8Array) {
  const copy = Uint8Array.from(value);
  return copy.buffer;
}

function encode(bytes: Uint8Array, encoding: "hex" | "base64") {
  if (encoding === "hex") {
    return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  return btoa(String.fromCharCode(...bytes));
}

function decode(value: string, encoding: "hex" | "base64") {
  if (encoding === "hex") {
    return new Uint8Array(
      value.match(/.{2}/g)?.map((byte) => Number.parseInt(byte, 16)) ?? [],
    );
  }
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}
