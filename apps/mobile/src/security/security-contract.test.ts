import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { createDeviceIdentity } from "./device-identity.shared";

const migration = readFileSync(
  new URL(
    "../../../../supabase/migrations/20260723190000_organa_encrypted_sync.sql",
    import.meta.url,
  ),
  "utf8",
);

describe("Supabase security contract", () => {
  it("creates a separate proof secret for each device identity", () => {
    const first = createDeviceIdentity();
    const second = createDeviceIdentity();

    expect(first.id).not.toBe(second.id);
    expect(first.secret).not.toBe(second.secret);
    expect(first.secret).toHaveLength(72);
    expect(first.secret).not.toContain(first.id);
  });

  it("keeps enrollment verifiers hidden behind proof-aware RPCs", () => {
    expect(migration).toContain("device_proof_hash text not null");
    expect(migration).toContain("recovery_proof_hash text not null");
    expect(migration).toContain(
      "create or replace function public.enroll_account_key(",
    );
    expect(migration).not.toContain(
      "grant insert, update on public.account_keys to authenticated",
    );
    expect(migration).not.toMatch(
      /grant select[\s\S]*device_proof_hash[\s\S]*on public\.devices to authenticated/,
    );
  });

  it("requires device proof for writes and enforces deletion read-only state", () => {
    const mutationFunction = functionBody("apply_encrypted_mutation");
    const configureFunction = functionBody("configure_reminder_device");
    const revokeFunction = functionBody("revoke_trusted_device");

    expect(mutationFunction).toContain("p_device_proof text");
    expect(mutationFunction).toContain("device_proof_is_valid");
    expect(mutationFunction).toContain(
      "The account is read-only while deletion is pending.",
    );
    expect(configureFunction).toContain("p_current_device_proof text");
    expect(configureFunction).toContain("device_proof_is_valid");
    expect(revokeFunction).toContain("p_current_device_proof text");
    expect(revokeFunction).toContain("device_proof_is_valid");
  });
});

function functionBody(name: string) {
  const start = migration.indexOf(`create or replace function public.${name}(`);
  const end = migration.indexOf("\n$$;", start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return migration.slice(start, end);
}
