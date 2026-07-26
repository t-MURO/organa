import { x25519 } from "@noble/curves/ed25519.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import {
  aesDecryptAsync,
  aesEncryptAsync,
  AESEncryptionKey,
  AESKeySize,
  AESSealedData,
  CryptoDigestAlgorithm,
  digestStringAsync,
  getRandomBytes,
} from "expo-crypto";

import type {
  ContentKey,
  DeviceApprovalEnvelope,
  DeviceApprovalExchangeEnvelope,
  DeviceApprovalExchangeKeyPair,
} from "./types";

const prefix = "ODA1";

export async function createDeviceApproval(
  contentKey: ContentKey,
  targetDeviceId: string,
): Promise<{
  approvalCode: string;
  envelope: DeviceApprovalEnvelope;
}> {
  if (!targetDeviceId.trim()) {
    throw new Error("A target device is required.");
  }

  const transferKey = await AESEncryptionKey.generate(AESKeySize.AES256);
  const transferSecret = await transferKey.encoded("hex");
  const checksum = await approvalChecksum(transferSecret, targetDeviceId);
  const sealed = await aesEncryptAsync(
    new TextEncoder().encode(contentKey.encoded),
    transferKey,
    {
      additionalData: new TextEncoder().encode(
        approvalAad(targetDeviceId, contentKey.id),
      ),
    },
  );

  return {
    approvalCode: formatApprovalCode(`${transferSecret}${checksum}`),
    envelope: {
      algorithm: "AES-256-GCM",
      combined: await sealed.combined("base64"),
      keyId: contentKey.id,
      targetDeviceId,
      version: 1,
    },
  };
}

export async function unwrapDeviceApproval(
  approvalCode: string,
  envelope: DeviceApprovalEnvelope,
  targetDeviceId: string,
): Promise<ContentKey> {
  if (
    envelope.version !== 1 ||
    envelope.algorithm !== "AES-256-GCM" ||
    envelope.targetDeviceId !== targetDeviceId
  ) {
    throw new Error("This device approval envelope is not valid.");
  }

  const normalized = normalizeApprovalCode(approvalCode);
  const transferSecret = normalized.slice(0, 64);
  const checksum = normalized.slice(64);
  if ((await approvalChecksum(transferSecret, targetDeviceId)) !== checksum) {
    throw new Error("The device approval code checksum does not match.");
  }

  const transferKey = await AESEncryptionKey.import(transferSecret, "hex");
  const sealed = AESSealedData.fromCombined(envelope.combined);
  const plaintext = await aesDecryptAsync(sealed, transferKey, {
    additionalData: new TextEncoder().encode(
      approvalAad(targetDeviceId, envelope.keyId),
    ),
  });

  return {
    encoded: new TextDecoder().decode(plaintext),
    id: envelope.keyId,
  };
}

export function createDeviceApprovalExchangeKeyPair(): DeviceApprovalExchangeKeyPair {
  const secretKey = getRandomBytes(32);
  try {
    return {
      algorithm: "X25519",
      publicKey: bytesToHex(x25519.getPublicKey(secretKey)),
      secretKey: bytesToHex(secretKey),
      version: 1,
    };
  } finally {
    secretKey.fill(0);
  }
}

export async function createDeviceApprovalExchange(
  contentKey: ContentKey,
  targetDeviceId: string,
  recipientPublicKey: string,
): Promise<DeviceApprovalExchangeEnvelope> {
  assertApprovalExchangePublicKey(recipientPublicKey);
  if (!targetDeviceId.trim()) {
    throw new Error("A target device is required.");
  }

  const senderSecretKey = getRandomBytes(32);
  try {
    const senderPublicKey = bytesToHex(
      x25519.getPublicKey(senderSecretKey),
    );
    const transferKey = await deriveApprovalExchangeKey(
      x25519.getSharedSecret(
        senderSecretKey,
        hexToBytes(recipientPublicKey),
      ),
      targetDeviceId,
      contentKey.id,
      recipientPublicKey,
      senderPublicKey,
    );
    const sealed = await aesEncryptAsync(
      new TextEncoder().encode(contentKey.encoded),
      transferKey,
      {
        additionalData: new TextEncoder().encode(
          approvalExchangeAad(
            targetDeviceId,
            contentKey.id,
            recipientPublicKey,
            senderPublicKey,
          ),
        ),
      },
    );

    return {
      algorithm: "X25519-HKDF-SHA256-AES-256-GCM",
      combined: await sealed.combined("base64"),
      keyId: contentKey.id,
      recipientPublicKey,
      senderPublicKey,
      targetDeviceId,
      version: 2,
    };
  } finally {
    senderSecretKey.fill(0);
  }
}

export async function unwrapDeviceApprovalExchange(
  envelope: DeviceApprovalExchangeEnvelope,
  targetDeviceId: string,
  keyPair: DeviceApprovalExchangeKeyPair,
): Promise<ContentKey> {
  assertApprovalExchangeKeyPair(keyPair);
  assertApprovalExchangePublicKey(envelope.recipientPublicKey);
  assertApprovalExchangePublicKey(envelope.senderPublicKey);
  if (
    envelope.version !== 2 ||
    envelope.algorithm !== "X25519-HKDF-SHA256-AES-256-GCM" ||
    envelope.targetDeviceId !== targetDeviceId ||
    envelope.recipientPublicKey !== keyPair.publicKey
  ) {
    throw new Error("This device approval envelope is not valid.");
  }

  const secretKey = hexToBytes(keyPair.secretKey);
  try {
    const transferKey = await deriveApprovalExchangeKey(
      x25519.getSharedSecret(
        secretKey,
        hexToBytes(envelope.senderPublicKey),
      ),
      targetDeviceId,
      envelope.keyId,
      envelope.recipientPublicKey,
      envelope.senderPublicKey,
    );
    const plaintext = await aesDecryptAsync(
      AESSealedData.fromCombined(envelope.combined),
      transferKey,
      {
        additionalData: new TextEncoder().encode(
          approvalExchangeAad(
            targetDeviceId,
            envelope.keyId,
            envelope.recipientPublicKey,
            envelope.senderPublicKey,
          ),
        ),
      },
    );

    return {
      encoded: new TextDecoder().decode(plaintext),
      id: envelope.keyId,
    };
  } finally {
    secretKey.fill(0);
  }
}

function normalizeApprovalCode(code: string) {
  const normalized = code
    .trim()
    .toUpperCase()
    .replace(/^ODA1-?/, "")
    .replace(/[^A-F0-9]/g, "");
  if (normalized.length !== 72) {
    throw new Error("The device approval code is incomplete.");
  }
  return normalized.toLowerCase();
}

async function approvalChecksum(secret: string, targetDeviceId: string) {
  const digest = await digestStringAsync(
    CryptoDigestAlgorithm.SHA256,
    `organa:device-approval-checksum:v1:${targetDeviceId}:${secret}`,
  );
  return digest.slice(0, 8);
}

function approvalAad(targetDeviceId: string, keyId: string) {
  return `organa:device-approval:v1:${targetDeviceId}:${keyId}`;
}

async function deriveApprovalExchangeKey(
  sharedSecret: Uint8Array,
  targetDeviceId: string,
  keyId: string,
  recipientPublicKey: string,
  senderPublicKey: string,
) {
  try {
    const encoded = bytesToHex(
      hkdf(
        sha256,
        sharedSecret,
        undefined,
        new TextEncoder().encode(
          approvalExchangeAad(
            targetDeviceId,
            keyId,
            recipientPublicKey,
            senderPublicKey,
          ),
        ),
        32,
      ),
    );
    return AESEncryptionKey.import(encoded, "hex");
  } finally {
    sharedSecret.fill(0);
  }
}

function approvalExchangeAad(
  targetDeviceId: string,
  keyId: string,
  recipientPublicKey: string,
  senderPublicKey: string,
) {
  return [
    "organa:device-approval:v2",
    targetDeviceId,
    keyId,
    recipientPublicKey,
    senderPublicKey,
  ].join(":");
}

function assertApprovalExchangeKeyPair(
  value: DeviceApprovalExchangeKeyPair,
) {
  if (
    value.version !== 1 ||
    value.algorithm !== "X25519" ||
    !isHexKey(value.publicKey) ||
    !isHexKey(value.secretKey) ||
    bytesToHex(x25519.getPublicKey(hexToBytes(value.secretKey))) !==
      value.publicKey
  ) {
    throw new Error("The device approval exchange key is invalid.");
  }
}

function assertApprovalExchangePublicKey(value: string) {
  if (!isHexKey(value)) {
    throw new Error("The device approval public key is invalid.");
  }
}

function isHexKey(value: string) {
  return /^[0-9a-f]{64}$/.test(value);
}

function formatApprovalCode(value: string) {
  return `${prefix}-${value.match(/.{1,4}/g)?.join("-") ?? value}`.toUpperCase();
}
