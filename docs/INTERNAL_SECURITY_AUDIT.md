# Internal Security Audit

Date: 2026-07-26

## Scope

This is an engineering audit of Organa's controlled-beta implementation. It
reviewed:

- Supabase authentication state, callbacks, and trusted-device enrollment
- content-key generation, recovery, approval, storage, and owner changes
- encrypted mutation validation, RLS, RPC grants, and account deletion
- readable and encrypted export/restore paths
- browser policy, logging, dependencies, and local private-state cleanup

This is not the independent cryptographic and application security review
required before production.

## Resolved Findings

| Severity | Finding | Resolution |
| --- | --- | --- |
| High | Native content keys, auth sessions, device proofs, and related private state used the iOS Keychain's migratable default. A device backup could therefore move credentials that are intended to identify one trusted device. | Added one device-bound SecureStore adapter using `WHEN_UNLOCKED_THIS_DEVICE_ONLY`. Every native private-state caller uses it, and reads rewrite legacy entries so existing installations migrate in place. |
| High | Native readable exports were written to Organa's cache for the system share sheet and were not removed afterward. Imported backup copies could also remain in cache. | Export files are deleted in a `finally` block after sharing. Document-picker cache copies are deleted in a `finally` block after their bounded read. User-chosen destination files remain under the user's control. |
| Medium | Browser content-key vault ciphertext was authenticated by AES-GCM but not bound to its account storage slot. Local record substitution could cause cross-account key confusion and denial of access. | Vault format v2 authenticates `organa:browser-key-vault:v2:<user-id>` as additional data. Legacy records decrypt once and are rewrapped in place without changing recovery codes. |
| Medium | Proof-authorized encrypted mutation RPCs validated shape but did not place explicit resource bounds on ciphertext or field metadata. A malicious authenticated beta user could submit pathological JSON to consume shared database resources. | Migration `20260726120000` adds trigger-enforced limits of 4 MiB ciphertext, 64 KiB field metadata, 128 fields, and 80-character application-controlled field names on incoming mutations and durable encrypted records. Trigger execution is not granted to clients. |

No plaintext user-content logging, service-role key exposure, recovery-key
upload, direct client write grant to protected tables, or unresolved
critical-severity finding was found in this audit.

## Verification

The reviewed source state passed:

- `pnpm verify:security`: 12 device-storage, browser-vault, cache-cleanup, and
  database-bound checks
- `pnpm typecheck`: all three strict TypeScript packages
- `pnpm verify:platform`: 22 platform and generated-native checks
- `pnpm build:web`: 27 production artifact/CSP/header checks, eight routes, and
  23 precache URLs
- `pnpm build:native`: iOS and Android Hermes exports
- `pnpm audit --prod --json`: zero findings at every severity and zero
  advisories
- managed Supabase migration `20260726120000` applied successfully; linked
  schema lint returned no errors, and the local/remote migration list matches
  all ten migrations
- clean commit `8948614388815f2a8a71dabe940e0a3fded2d6f8` passed the
  managed backend-only acceptance phase with all 119 checks, including
  cross-account RLS, proof-gated RPCs, trusted-device lifecycle, encrypted
  Realtime delivery, durable reconciliation, and exact synthetic-user cleanup

The first connected attempt reached the encrypted Realtime probe but missed
its 10-second broadcast deadline. Its RPC had succeeded, cleanup completed,
and the immediate clean rerun passed all 119 checks. The failed and passing
sanitized phase records remain in the ignored evidence directory.

`pnpm verify:migrations` was attempted but Docker was unavailable. Its
isolated-schema preservation result is therefore not claimed for this source
state. No test file was added, changed, or run.

## Remaining Gates

- Commission the independent cryptographic and application security review.
- Exercise migrated device-bound storage on physical iOS and Android devices,
  including backup/restore and biometric/device-PIN behavior.
- Run the Docker-backed migration-preservation verifier when Docker is
  available.
- Repeat the database lint, abuse probes, dependency audit, and web response
  verification against the production release candidate.
- Resolve every critical or high finding from the independent review before
  production.
