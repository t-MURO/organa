import {
  aesDecryptAsync,
  aesEncryptAsync,
  AESEncryptionKey,
  AESKeySize,
  AESSealedData,
  CryptoDigestAlgorithm,
  digestStringAsync,
} from "expo-crypto";

import type { ContentKey, DeviceApprovalEnvelope } from "./types";

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

function formatApprovalCode(value: string) {
  return `${prefix}-${value.match(/.{1,4}/g)?.join("-") ?? value}`.toUpperCase();
}
