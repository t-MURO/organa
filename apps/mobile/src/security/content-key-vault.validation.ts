import type { ContentKey } from "@organa/crypto";

export function parseContentKey(value: string): ContentKey {
  const parsed: unknown = JSON.parse(value);
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
