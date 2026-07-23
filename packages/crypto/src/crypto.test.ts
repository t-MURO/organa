import { describe, expect, it } from "vitest";

import {
  createKeyHierarchy,
  createRecoveryEnrollmentProof,
  decryptJson,
  encryptJson,
  normalizeRecoveryCode,
  unwrapContentKey,
} from "./index";

describe("Organa encryption", () => {
  it("round-trips JSON with authenticated record metadata", async () => {
    const hierarchy = await createKeyHierarchy();
    const value = { title: "Private task", mood: 4 };
    const envelope = await encryptJson(
      value,
      hierarchy.contentKey,
      "task",
      "task-1",
    );

    await expect(
      decryptJson(
        envelope,
        hierarchy.contentKey,
        "task",
        "task-1",
      ),
    ).resolves.toEqual(value);
    await expect(
      decryptJson(
        envelope,
        hierarchy.contentKey,
        "task",
        "task-2",
      ),
    ).rejects.toThrow("metadata");
  });

  it("restores the content key from a checked recovery code", async () => {
    const hierarchy = await createKeyHierarchy();
    const restored = await unwrapContentKey(
      hierarchy.recoveryCode,
      hierarchy.recoveryEnvelope,
    );

    expect(restored).toEqual(hierarchy.contentKey);
    expect(normalizeRecoveryCode(hierarchy.recoveryCode)).toHaveLength(72);
  });

  it("rejects mistyped recovery keys before decryption", async () => {
    const hierarchy = await createKeyHierarchy();
    const changed = hierarchy.recoveryCode.replace(/A/, "B");

    await expect(
      unwrapContentKey(changed, hierarchy.recoveryEnvelope),
    ).rejects.toThrow();
  });

  it("derives the same enrollment proof from equivalent recovery formatting", async () => {
    const hierarchy = await createKeyHierarchy();
    const reformatted = hierarchy.recoveryCode.toLowerCase().replaceAll("-", " ");

    const proof = await createRecoveryEnrollmentProof(hierarchy.recoveryCode);
    const repeated = await createRecoveryEnrollmentProof(reformatted);

    expect(proof).toBe(repeated);
    expect(proof).toMatch(/^[a-f0-9]{64}$/);
    expect(proof).not.toContain(
      normalizeRecoveryCode(hierarchy.recoveryCode).slice(0, 64),
    );
  });
});
