import { hkdf } from "@noble/hashes/hkdf.js";
import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";
import {
  aesDecryptAsync,
  aesEncryptAsync,
  AESEncryptionKey,
  AESKeySize,
  AESSealedData,
  randomUUID,
} from "expo-crypto";

import type { ContentKey, EncryptedEnvelope } from "./types";

export async function createContentKey(): Promise<ContentKey> {
  const key = await AESEncryptionKey.generate(AESKeySize.AES256);
  return {
    encoded: await key.encoded("base64"),
    id: randomUUID(),
  };
}

export function importContentKey(contentKey: ContentKey) {
  return AESEncryptionKey.import(contentKey.encoded, "base64");
}

export async function deriveOpaqueRecordId(
  contentKey: ContentKey,
  recordType: string,
  stableValue: string,
) {
  if (!recordType || !stableValue) {
    throw new Error("Opaque record IDs require a type and stable value.");
  }
  const key = await importContentKey(contentKey);
  const keyBytes = await key.bytes();
  const identifierKey = hkdf(
    sha256,
    keyBytes,
    utf8ToBytes("organa:record-id:salt:v1"),
    utf8ToBytes(`organa:record-id:key:v1:${recordType}`),
    32,
  );
  let identifier: Uint8Array | undefined;
  try {
    identifier = hmac(
      sha256,
      identifierKey,
      utf8ToBytes(`organa:record-id:value:v1:${stableValue}`),
    );
    return `rid1_${bytesToHex(identifier)}`;
  } finally {
    identifier?.fill(0);
    keyBytes.fill(0);
    identifierKey.fill(0);
  }
}

export async function encryptJson(
  value: unknown,
  contentKey: ContentKey,
  recordType: string,
  recordId: string,
): Promise<EncryptedEnvelope> {
  const aad = additionalData(recordType, recordId);
  const key = await importContentKey(contentKey);
  const sealed = await aesEncryptAsync(
    new TextEncoder().encode(JSON.stringify(value)),
    key,
    { additionalData: new TextEncoder().encode(aad) },
  );

  return {
    aad,
    algorithm: "AES-256-GCM",
    combined: await sealed.combined("base64"),
    keyId: contentKey.id,
    version: 1,
  };
}

export async function decryptJson<T>(
  envelope: EncryptedEnvelope,
  contentKey: ContentKey,
  recordType: string,
  recordId: string,
): Promise<T> {
  const expectedAad = additionalData(recordType, recordId);
  if (
    envelope.version !== 1 ||
    envelope.algorithm !== "AES-256-GCM" ||
    envelope.keyId !== contentKey.id ||
    envelope.aad !== expectedAad
  ) {
    throw new Error("The encrypted record metadata is invalid.");
  }

  const key = await importContentKey(contentKey);
  const sealed = AESSealedData.fromCombined(envelope.combined);
  const plaintext = await aesDecryptAsync(sealed, key, {
    additionalData: new TextEncoder().encode(expectedAad),
  });
  return JSON.parse(new TextDecoder().decode(plaintext)) as T;
}

function additionalData(recordType: string, recordId: string) {
  if (!recordType || !recordId) {
    throw new Error("Encrypted records require a type and identifier.");
  }
  return `organa:record:v1:${recordType}:${recordId}`;
}
