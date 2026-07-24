# Security Design

## Scope

This document describes the controlled-beta implementation. It is not an
independent security assessment. Production requires external review of the
cryptography, authentication, database policies, web threat model, native
storage, and deletion operations.

## Encryption

- Each account receives a random 256-bit content key.
- User fields are encrypted independently with AES-256-GCM from `expo-crypto`.
- Authenticated additional data binds each envelope to its record type,
  record ID, and field name.
- A random 256-bit recovery key encrypts the content key.
- A one-way SHA-256 verifier derived from the recovery key authorizes enrollment
  of a new or previously revoked device without uploading the recovery key.
- A new device may instead create a 15-minute approval request for an existing
  trusted device. The trusted device encrypts the content key with a fresh
  256-bit one-time AES key and displays that key as a checked approval code.
- The approval envelope is authenticated to the target device ID and content
  key ID. Supabase stores only this encrypted envelope; the one-time approval
  code is transferred directly by the user and is erased from app state after
  use.
- The displayed recovery code contains the recovery key plus a short checksum
  for detecting transcription mistakes.
- The recovery key is never uploaded. Supabase stores only its encrypted
  content-key envelope.
- Brain Dump Yjs updates are encrypted records just like other content.
- Realtime payloads are notifications, not a source of truth.

The implementation does not define custom encryption primitives. It composes
the platform AES-GCM and secure-random APIs exposed by Expo.

## Key Storage

Native:

- The content key is stored with Expo SecureStore.
- A random per-device proof secret is stored with the device identity in Expo
  SecureStore.
- Optional app lock uses platform local authentication and device fallback.

Web:

- A non-extractable Web Crypto AES-GCM wrapping key and wrapped content key are
  stored in a separate IndexedDB database.
- The per-device proof secret is stored with the browser device identity in
  local storage. It is an authorization control, not an encryption key.
- If durable CryptoKey storage is blocked, the key remains memory-only and the
  recovery code is needed after the session is lost.
- This protects against simple storage export, not malicious same-origin
  JavaScript. XSS while Organa is unlocked can access decrypted application
  state.

Reminder authorization:

- Native stores the last server-confirmed per-user reminder authorization as a
  boolean in Expo SecureStore. Web stores the same content-free boolean in
  `localStorage`.
- The cache contains no task, Check-In, medication, schedule, or reminder
  content and is not an authentication credential.
- Fresh trusted-device state from Supabase is authoritative and replaces the
  cache. Until either cached or server state is available, reminder
  authorization remains unresolved: schedulers neither create nor cancel
  notifications.
- The authorization cache is removed when device revocation is observed and
  during final local account deletion.

Local task, Check-In, template, and Brain Dump repositories contain plaintext
needed for offline use. They rely on device encryption, OS account security,
and optional app lock. End-to-end encryption protects synchronized cloud
payloads; it does not make a compromised unlocked device safe.

## Server-Readable Metadata

Supabase can read:

- Auth account ID, email, provider identities, and session metadata
- content-key ID and recovery-envelope metadata/ciphertext
- device ID, display name, platform, trust/revocation time, last-seen time, and
  reminder-device booleans
- one-way recovery-enrollment and per-device proof verifiers; authenticated
  clients cannot select these verifier columns
- encrypted record type, opaque record ID, encrypted field names, ciphertext,
  field-version timestamps, record version, deletion state, updater device,
  and update time
- mutation ID, operation, base/applied version, and synchronization timestamps
- account-deletion request and execution timestamps
- device-approval request, approval, expiry, and claim timestamps, the
  approving device ID, and a target-bound encrypted content-key envelope
- user-scoped Realtime topic plus opaque changed record/device identifiers

The account-deletion scheduler uses the server-side service role. Its table
grant is limited to selecting the user ID, execution deadline, cancellation
state, and completion state needed to find due requests. The endpoint disables
the platform JWT check, requires a separate scheduler secret, and accepts only
`POST`.

Supabase must not receive task titles, details, medication text, reminder text,
templates, Check-In content, mood values, Brain Dump text, or the plaintext
content key.

Field names and record types are operational metadata. They should not contain
user-entered content.

## Authorization

- Every public user table has RLS.
- Clients can directly read only their own rows.
- Encrypted mutation, device configuration, and deletion writes use validated
  RPCs.
- Initial account-key and device enrollment is atomic. Authenticated clients
  cannot insert or replace account-key rows directly.
- New or revoked devices must present the recovery-derived enrollment proof.
- A non-revoked new device may request approval from another trusted device.
  Pending devices remain untrusted until they decrypt the target-bound
  envelope locally, present their per-device proof, and claim the approval.
- Approval requests expire after 15 minutes. A trusted device can reject them,
  claimed envelopes are erased, and revoked devices cannot use approval to
  bypass recovery-key enrollment.
- Active devices must present their per-device proof secret for encrypted
  mutations, reminder-device changes, revocation, and account deletion.
- Promoting a new primary reminder device atomically disables reminder delivery
  on every other active device. A demoted device can receive reminders again
  only after an explicit secondary-device enable action.
- Security-definer RPC execution is revoked from `public` and `anon`.
- Mutation RPCs validate authentication, trusted-device state, record type,
  patch shape, and future clock skew.
- Private Realtime authorization compares the authenticated user ID with the
  exact user-scoped topic.
- The mutation, recovery enrollment, approval, and device-control RPCs reject
  writes while an uncancelled account-deletion request is active.

Trusted-device revocation is enforced when the target reconnects: local Organa
data, content key, and per-device proof secret are removed, its session signs
out, and encrypted writes from the revoked device ID are rejected. Revoking
also expires refresh tokens for other sessions. Existing access-token JWTs
remain valid until expiry, and revocation is not retroactive against data
already copied from a device.

Offline reminder authorization can only represent the last server-confirmed
state. A device that remains offline cannot learn that it was revoked; the
reconnect path makes the fresh server state authoritative and performs private
local cleanup.

Normal sign-out has a narrower privacy boundary than revocation or deletion.
It cancels scheduled native notifications, dismisses displayed notifications,
and replaces iOS widget timelines with content-free states. It retains local
repositories, the content-key vault, and device identity so the same trusted
device can recover its offline state after a future successful sign-in.
Supabase-driven `SIGNED_OUT` events use the same private-surface cleanup.

Content-key rotation after device compromise is not implemented in this MVP.
Treat that as a production threat-model decision, not as a guaranteed remote
wipe.

## Conflict And Recovery

- Structured changes encrypt only changed top-level fields.
- PostgreSQL merges fields by field timestamp and uses last-write-wins for the
  same field.
- Previous encrypted versions are retained for seven days.
- Mutation IDs make outbox retries idempotent.
- Yjs updates make Brain Dump edits commutative and conflict-free.
- Yjs is loaded once, on first CRDT use, rather than during Expo server
  rendering; `pnpm verify:yjs-runtime` guards against duplicate runtime
  evaluation.
- Yjs update records currently accumulate and need a compaction policy before
  high-volume production use.

## Export And Deletion

- Readable JSON and Markdown exports are assembled locally.
- Full backups encrypt the complete export and include the recovery envelope.
- Backup restoration validates the format, unwraps the content key locally with
  the recovery code, authenticates the backup metadata, and rejects tampering
  before returning decrypted data.
- The one-hour deletion period is read-only and cancellable.
- The scheduled Edge Function deletes the Auth user, causing account rows to
  cascade. The app removes its local database and content key when deletion is
  due.
- Local deletion clears every known SQLite/IndexedDB store before attempting
  database-file removal, so an open database handle cannot silently preserve
  readable records. The per-device proof secret is removed at the same time.
- Files exported by the user are outside Organa's deletion boundary.

## Logging And Telemetry

The app includes no analytics, advertising identifiers, session recording, or
automatic crash telemetry. Do not add logs containing:

- user content
- OAuth or Supabase tokens
- recovery codes
- content keys
- encrypted envelopes paired with keys

## Required External Review

Before production:

1. Review AES-GCM envelope construction, key lifecycle, and recovery UX.
2. Execute cross-account RLS and RPC abuse tests on the deployed schema.
3. Review the one-time trusted-device handoff, expiry, rejection, and
   target-binding protocol.
4. Test token expiry and device revocation under offline/reconnect conditions.
5. Review XSS/CSP, PWA caching, OAuth redirects, and browser key storage.
6. Test native secure storage, biometrics, notifications, and backups.
7. Resolve every critical or high finding and record the evidence.
