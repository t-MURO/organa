import type { ContentKey } from "@organa/crypto";

import type { ContentKeyVaultValue } from "./content-key-vault.types";
import { parseRecoveryKeyEnvelope } from "./security-envelope-validation";

export function parseContentKeyVaultValue(value: string): ContentKeyVaultValue {
  const parsed: unknown = JSON.parse(value);
  if (
    parsed &&
    typeof parsed === "object" &&
    "contentKey" in parsed
  ) {
    const contentKey = parseContentKey(parsed.contentKey);
    return {
      contentKey,
      recoveryEnvelope:
        "recoveryEnvelope" in parsed && parsed.recoveryEnvelope
          ? parseRecoveryKeyEnvelope(
              parsed.recoveryEnvelope,
              contentKey.id,
            )
          : null,
    };
  }
  return { contentKey: parseContentKey(parsed), recoveryEnvelope: null };
}

function parseContentKey(parsed: unknown): ContentKey {
  if (
    !parsed ||
    typeof parsed !== "object" ||
    !("id" in parsed) ||
    typeof parsed.id !== "string" ||
    parsed.id.length === 0 ||
    !("encoded" in parsed) ||
    typeof parsed.encoded !== "string" ||
    parsed.encoded.length === 0
  ) {
    throw new Error("The stored content key is invalid.");
  }
  return { encoded: parsed.encoded, id: parsed.id };
}
