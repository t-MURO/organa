import {
  CryptoDigestAlgorithm,
  digestStringAsync,
} from "expo-crypto";

import { authStorage } from "./auth-storage";

export interface LocalDevelopmentIdentity {
  email: string;
  ownerId: string;
}

export const localDevelopmentAuthEnabled = __DEV__;

const storageKey = "organa.local-development-auth.v1";

export async function createLocalDevelopmentIdentity(
  emailValue: string,
): Promise<LocalDevelopmentIdentity> {
  if (!localDevelopmentAuthEnabled) {
    throw new Error("Local sign-in is available only in development builds.");
  }

  const email = normalizeEmail(emailValue);
  const digest = await digestStringAsync(
    CryptoDigestAlgorithm.SHA256,
    email,
  );
  return {
    email,
    ownerId: `local-preview-${digest.slice(0, 32)}`,
  };
}

export async function readLocalDevelopmentIdentity() {
  if (!localDevelopmentAuthEnabled) return null;

  const stored = await authStorage.getItem(storageKey);
  if (!stored) return null;
  try {
    const value: unknown = JSON.parse(stored);
    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      typeof (value as { email?: unknown }).email !== "string"
    ) {
      throw new Error("Invalid local identity.");
    }
    return await createLocalDevelopmentIdentity(
      (value as { email: string }).email,
    );
  } catch {
    await authStorage.removeItem(storageKey);
    return null;
  }
}

export async function saveLocalDevelopmentIdentity(
  identity: LocalDevelopmentIdentity,
) {
  if (!localDevelopmentAuthEnabled) {
    throw new Error("Local sign-in is available only in development builds.");
  }
  await authStorage.setItem(
    storageKey,
    JSON.stringify({ email: identity.email }),
  );
}

export async function clearLocalDevelopmentIdentity() {
  await authStorage.removeItem(storageKey);
}

function normalizeEmail(value: string) {
  const email = value.trim().toLowerCase();
  if (
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    throw new Error("Enter a valid email address for local testing.");
  }
  return email;
}
