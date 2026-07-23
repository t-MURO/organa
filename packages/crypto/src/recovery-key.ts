import {
  aesDecryptAsync,
  aesEncryptAsync,
  AESEncryptionKey,
  AESKeySize,
  AESSealedData,
  CryptoDigestAlgorithm,
  digestStringAsync,
} from "expo-crypto";

import { createContentKey } from "./record-encryption";
import type {
  ContentKey,
  KeyHierarchy,
  RecoveryKeyEnvelope,
} from "./types";

const prefix = "ORG1";

export async function createKeyHierarchy(): Promise<KeyHierarchy> {
  const contentKey = await createContentKey();
  const recoveryKey = await AESEncryptionKey.generate(AESKeySize.AES256);
  const recoverySecret = await recoveryKey.encoded("hex");
  const checksum = await recoveryChecksum(recoverySecret);
  const aad = recoveryAad(contentKey.id);
  const sealed = await aesEncryptAsync(
    new TextEncoder().encode(contentKey.encoded),
    recoveryKey,
    { additionalData: new TextEncoder().encode(aad) },
  );

  return {
    contentKey,
    recoveryCode: formatRecoveryCode(`${recoverySecret}${checksum}`),
    recoveryEnvelope: {
      algorithm: "AES-256-GCM",
      combined: await sealed.combined("base64"),
      keyId: contentKey.id,
      version: 1,
    },
  };
}

export async function unwrapContentKey(
  recoveryCode: string,
  envelope: RecoveryKeyEnvelope,
): Promise<ContentKey> {
  if (envelope.version !== 1 || envelope.algorithm !== "AES-256-GCM") {
    throw new Error("This recovery envelope is not supported.");
  }

  const normalized = normalizeRecoveryCode(recoveryCode);
  const recoverySecret = normalized.slice(0, 64);
  const checksum = normalized.slice(64);
  if ((await recoveryChecksum(recoverySecret)) !== checksum) {
    throw new Error("The recovery key checksum does not match.");
  }

  const recoveryKey = await AESEncryptionKey.import(recoverySecret, "hex");
  const sealed = AESSealedData.fromCombined(envelope.combined);
  const plaintext = await aesDecryptAsync(sealed, recoveryKey, {
    additionalData: new TextEncoder().encode(recoveryAad(envelope.keyId)),
  });

  return {
    encoded: new TextDecoder().decode(plaintext),
    id: envelope.keyId,
  };
}

export function normalizeRecoveryCode(code: string) {
  const normalized = code
    .trim()
    .toUpperCase()
    .replace(/^ORG1-?/, "")
    .replace(/[^A-F0-9]/g, "");
  if (normalized.length !== 72) {
    throw new Error("The recovery key is incomplete.");
  }
  return normalized.toLowerCase();
}

async function recoveryChecksum(secret: string) {
  const digest = await digestStringAsync(
    CryptoDigestAlgorithm.SHA256,
    `organa:recovery-checksum:v1:${secret}`,
  );
  return digest.slice(0, 8);
}

function recoveryAad(keyId: string) {
  return `organa:recovery-envelope:v1:${keyId}`;
}

function formatRecoveryCode(value: string) {
  return `${prefix}-${value.match(/.{1,4}/g)?.join("-") ?? value}`.toUpperCase();
}
