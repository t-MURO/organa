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
const approvalMigration = readFileSync(
  new URL(
    "../../../../supabase/migrations/20260723213000_trusted_device_approval.sql",
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
    expect(approvalMigration).toContain(
      "create trigger devices_reject_write_while_deleting",
    );
    expect(
      functionBody(
        "reject_device_write_while_deleting",
        approvalMigration,
      ),
    ).toContain(
      "The account is read-only while deletion is pending.",
    );
  });

  it("keeps trusted-device approvals encrypted, short-lived, and proof-gated", () => {
    const requestFunction = functionBody(
      "request_device_approval",
      approvalMigration,
    );
    const approveFunction = functionBody(
      "approve_trusted_device",
      approvalMigration,
    );
    const completeFunction = functionBody(
      "complete_device_approval",
      approvalMigration,
    );

    expect(approvalMigration).toContain(
      "alter table public.device_approvals enable row level security",
    );
    expect(approvalMigration).toContain(
      "encrypted_content_key jsonb",
    );
    expect(approvalMigration).not.toMatch(
      /\bcontent_key\s+(text|jsonb|bytea)\b/,
    );
    expect(requestFunction).toContain(
      "A revoked device requires recovery-key enrollment.",
    );
    expect(requestFunction).toContain("interval '15 minutes'");
    expect(approveFunction).toContain("device_proof_is_valid");
    expect(approveFunction).toContain(
      "The account is read-only while deletion is pending.",
    );
    expect(approveFunction).toContain("'AES-256-GCM'");
    expect(completeFunction).toContain(
      "extensions.digest(p_device_proof, 'sha256')",
    );
    expect(completeFunction).toContain("encrypted_content_key = null");
  });
});

function functionBody(name: string, source = migration) {
  const start = source.indexOf(`create or replace function public.${name}(`);
  const end = source.indexOf("\n$$;", start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}
