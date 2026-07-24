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
- Recovery envelopes read from Supabase are accepted only when their version,
  algorithm, ciphertext, and key ID match the account-key row.
- A new device may instead create a 15-minute approval request for an existing
  trusted device. The trusted device encrypts the content key with a fresh
  256-bit one-time AES key and displays that key as a checked approval code.
- The approval envelope is authenticated to the target device ID and content
  key ID. Supabase stores only this encrypted envelope; the one-time approval
  code is transferred directly by the user and is erased from app state after
  use.
- Approval envelopes are structurally validated and must be bound to the
  current pending device before decryption.
- Recovery confirmation, recovery-key input, and one-time approval input are
  scoped to the active account UI. An account identity change unmounts that
  state synchronously, and successfully used codes are cleared immediately.
- The displayed recovery code contains the recovery key plus a short checksum
  for detecting transcription mistakes.
- The recovery key is never uploaded. Supabase stores only its encrypted
  content-key envelope.
- Brain Dump Yjs updates are encrypted records just like other content.
- Realtime payloads are notifications, not a source of truth.

The implementation does not define custom encryption primitives. It composes
the platform AES-GCM and secure-random APIs exposed by Expo.

## Authentication

- Supabase Auth uses PKCE for Google, Apple, and GitHub OAuth. Passwordless
  email access uses a six-digit verification code.
- Native authentication state and the PKCE verifier use Expo SecureStore.
  Web authentication state uses origin-scoped browser storage.
- Native OAuth accepts callbacks only at the configured `organa` app redirect.
  Unrelated deep links and mismatched paths or origins are ignored.
- Both an attached authentication-browser result and native cold-start/resume
  links pass through the same coordinator.
- Simultaneous or repeated delivery of a one-time authorization code causes at
  most one successful exchange during the provider lifecycle. A transiently
  failed exchange may be retried.
- Provider-supplied callback descriptions are not displayed. Cancellation has
  fixed local copy and all other callback failures use a generic local message.
- Callback URLs and authorization codes are not logged.
- Hosted provider credentials, redirect allowlists, and end-to-end provider
  drills remain deployment responsibilities for the selected EU project.

## Key Storage

Native:

- The content key is stored with Expo SecureStore.
- Parsed key-vault values must contain non-empty content-key identifiers and
  encoded key material. Malformed values fail closed instead of entering the
  private application boundary.
- A random per-device proof secret is stored with the device identity in Expo
  SecureStore.
- Stored identities are parsed through one native/web validator. Current
  identities must contain Organa's UUID device ID, valid creation timestamp,
  and two-UUID proof format; the legacy no-proof shape remains eligible for
  its one-time proof migration. Malformed JSON and malformed fields are
  replaced rather than crashing security initialization or being accepted by
  truthiness alone.
- Optional app lock uses platform local authentication and device fallback.
  Its loading and locked boundary wraps every provider that opens private
  repositories or decrypted state.
- A missing or explicit `false` SecureStore value disables app lock. An
  explicit `true` value locks on startup and whenever the app leaves the
  foreground. Malformed or unreadable lock state fails closed.
- A stored enabled lock remains locked when enrolled device authentication is
  no longer available. Native authentication exceptions use generic local
  copy and never reveal private screens.

Web:

- A non-extractable Web Crypto AES-GCM wrapping key and wrapped content key are
  stored in a separate IndexedDB database.
- Decrypted key-vault values receive the same runtime validation as native
  values before use.
- The per-device proof secret is stored with the browser device identity in
  the protected IndexedDB store when available; restricted-browser fallback
  uses local storage. It is an authorization control, not an encryption key.
- If durable CryptoKey storage is blocked, the key remains memory-only and the
  recovery code is needed after the session is lost.
- This protects against simple storage export, not malicious same-origin
  JavaScript. XSS while Organa is unlocked can access decrypted application
  state.
- The browser Push subscription endpoint and its `p256dh`/authentication keys
  are sent only through a proof-gated RPC. They are capability-bearing
  operational metadata, not user content, and authenticated clients cannot
  select the stored rows directly.

In-memory content keys are atomically paired with their owning account ID (or
the isolated local-preview identity). The security context exposes a key only
when that owner matches the active authentication state, so an account change
closes encryption, decryption, synchronization, and private providers before
asynchronous key initialization can finish.

Account-deletion state and trusted-device lists are also exposed only when
their fetched owner matches the active account. Delayed responses from a
previous session therefore cannot place another account into deletion mode or
display its device metadata.

The deletion cache is deliberately non-authoritative. It can restore read-only
mode and the cancellation deadline while offline, but its deadline never
triggers local erasure. The authenticated, argument-free deletion-status RPC
can inspect only the JWT subject: it uses database time to report whether the
window is irreversibly closed and reports completed server deletion only after
that subject no longer exists in `auth.users`. A cancellation on another device
therefore clears stale cached state on reconnect instead of destroying
recoverable local data.

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

Native auth sessions and per-device proof secrets use platform secure storage.
On supported web clients, auth sessions and device proof secrets migrate out
of plaintext local storage into AES-GCM records with non-extractable wrapping
keys cloned through IndexedDB. Record keys are authenticated as additional
data to prevent record swapping. This is at-rest hardening, not an XSS
boundary: malicious same-origin script can still act as the signed-in user.
Browsers that reject durable CryptoKey storage use a memory or legacy Storage
fallback and require explicit release-browser validation.

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
- browser Push endpoint, Push encryption keys, expiry, opaque schedule scope
  and reminder key, safe task/Check-In route, fire time, and the selected
  Check-In local time/time zone

The account-deletion scheduler uses the server-side service role. Its table
grant is limited to selecting the user ID, execution deadline, cancellation
state, and completion state needed to find due requests. The endpoint disables
the platform JWT check, requires a separate scheduler secret, and accepts only
`POST`.

The Web Push dispatcher also disables the platform JWT check, requires its own
server-only scheduler secret, and accepts only `POST`. The VAPID private key
and scheduler secret are function secrets. Before claiming due reminders, the
function derives the P-256 public key from the private scalar and requires it
to match the configured canonical, unpadded Base64URL VAPID public key;
malformed subjects or keypairs fail the authenticated scheduler request
instead of entering content-delivery retries. Push requests also have a
bounded socket timeout. A server-configured exact/wildcard hostname allowlist
rejects IP literals, credentials, non-HTTPS or nonstandard-port URLs,
fragments, and untrusted Push hosts before network access; rejected
subscriptions are removed. Payloads contain only a safe route and opaque tag
and are encrypted by the Web Push protocol. The service worker always displays
generic copy; task titles, medication data, and Check-In content are never sent
to the Push service.

Supabase must not receive task titles, details, medication text, reminder text,
templates, Check-In content, mood values, Brain Dump text, or the plaintext
content key.

Client backend configuration fails closed unless both public values are
present, the endpoint uses HTTPS (or loopback HTTP for local development), and
the key has the `sb_publishable_` form. URL credentials, query/hash additions,
example placeholders, secret keys, service-role keys, and arbitrary non-empty
strings do not create a Supabase client. Setup feedback never echoes a supplied
URL or key.

Field names and record types are operational metadata. They should not contain
user-entered content.

Check-In dates are also excluded from record identifiers. New, restored, and
locally stored legacy Check-In rows derive a versioned deterministic ID from
the account content key using HKDF-SHA-256 for key separation and
HMAC-SHA-256 over the date. This preserves one-record-per-day convergence
across trusted devices while leaving only an opaque, account-unlinkable
identifier visible to Supabase. The database rejects active Check-In rows
outside that format. It accepts a legacy date-bearing ID only as a deletion
tombstone and immediately purges the matching active, history, and applied
mutation rows.

## Authorization

- Every public user table has RLS.
- Clients can directly read only their own rows.
- Encrypted mutation, device configuration, and deletion writes use validated
  RPCs.
- A local isolated-schema upgrade verifier seeds the original schema with
  synthetic account keys, device metadata, ciphertext records/history, outbox
  state, and deletion state, then requires every row to remain byte-for-byte
  unchanged after every later timestamped migration.
- Initial account-key and device enrollment is atomic. Authenticated clients
  cannot insert or replace account-key rows directly.
- A retry after an ambiguous first-enrollment response may continue only when
  the server already contains the same key ID and the same active trusted
  device.
- New or revoked devices must present the recovery-derived enrollment proof.
- A non-revoked new device may request approval from another trusted device.
  Pending devices remain untrusted until they decrypt the target-bound
  envelope locally, present their per-device proof, and claim the approval.
- Approval requests expire after 15 minutes. A trusted device can reject them,
  claimed envelopes are erased, and revoked devices cannot use approval to
  bypass recovery-key enrollment.
- A trusted device clears its displayed one-time approval code at the
  server-provided expiry even when no realtime event arrives.
- A pending device persists the decrypted content key only after the server
  confirms trust and envelope claim. If an RPC response is lost after commit,
  the client verifies that exact resulting server state before proceeding.
- Active devices must present their per-device proof secret for encrypted
  mutations, reminder-device changes, revocation, and account deletion.
- Promoting a new primary reminder device atomically disables reminder delivery
  on every other active device. A demoted device can receive reminders again
  only after an explicit secondary-device enable action.
- Web Push schedule replacement and current-browser subscription removal both
  require the active device proof. Schedule rows are never client-writable or
  client-readable directly.
- Due Web Push rows can be claimed only by the service role. Claims use row
  locking, bounded retries, and stale-claim recovery.
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

A successful connected device-list read also treats a missing or still
untrusted current identity as unauthorized. Revoked, missing, and untrusted
identities all take the same local-erasure and sign-out path. A failed server
read does not infer revocation, preserving offline-first access from the last
known local state.

Unauthorized-device cleanup and final deletion attempt every local erasure
operation and retry only failed operations once. Credential-dependent cleanup
runs first while the authenticated session and device proof are still
available, sign-out runs next, and content-key/device-identity removal runs
last. A failure in one phase cannot prevent the later privacy phases from
being attempted. Web content-key removal propagates IndexedDB failures instead
of treating an unverified deletion as success. Before cleanup starts, the app
verifies that Supabase's currently persisted session still belongs to the
expected owner. Delayed work from an unmounted account therefore cannot remove
a later account's device identity, notifications, widgets, or session.

Offline reminder authorization can only represent the last server-confirmed
state. A device that remains offline cannot learn that it was revoked; the
reconnect path makes the fresh server state authoritative and performs private
local cleanup.

Normal sign-out has a narrower privacy boundary than revocation or deletion.
It cancels scheduled native notifications, dismisses displayed notifications,
clears the last native notification-response payload, and replaces iOS and
Android widget timelines with content-free states.
Android's bounded widget projection is stored in SecureStore and malformed
cached timelines fail closed to empty widgets. Sign-out retains local
repositories, the content-key vault, and device identity so the same trusted
device can recover its offline state after a future successful sign-in.
On web, explicit sign-out first removes the current server subscription while
the session is authenticated, then closes visible notifications, clears the
content-free pending schedule queue, and unsubscribes locally. A
Supabase-driven `SIGNED_OUT` event repeats the local cleanup; unsubscribe is
the fallback when authenticated server cleanup is no longer possible. Web
active-tab reminder suppression is stored under the current account ID and
sign-out removes every scoped or legacy Organa suppression key, so one account
cannot silence another account's daily Check-In reminder. Browser Focus
snooze timers are also owner-scoped and canceled when that owner leaves the
notification boundary or private platform state is cleared. A surviving
snooze event must match the active owner, and its displayed task title and
presets are rebuilt from that owner's current task rather than trusted from
the captured timeout payload. Browser task and Check-In reminder mutations now
share an owner-aware queue. Initial and reconnect-triggered Web Push flushes
are serialized with authenticated subscription removal, so cleanup drains
earlier writes and later flushes observe an empty pending queue instead of
recreating old-account delivery state.

Native task, Check-In, Focus, and notification-action scheduling operations
share an owner-aware serialized queue. Changing owner inserts a cancel-all
barrier before next-account schedules, and privacy cleanup runs after every
earlier in-flight native operation. Native widget timeline writes use the same
pattern: Android secure timeline persistence and widget redraw are serialized,
and iOS/Android content-free cleanup cannot be undone by a delayed old-account
update.

Content-key rotation after device compromise is not implemented in this MVP.
Treat that as a production threat-model decision, not as a guaranteed remote
wipe.

## Conflict And Recovery

- Structured changes encrypt only changed top-level fields.
- PostgreSQL merges fields by field timestamp and uses last-write-wins for the
  same field.
- Each client reserves a strictly increasing field timestamp synchronously
  before encryption. The largest persisted outbox timestamp seeds the clock
  after restart, preventing same-millisecond actions or out-of-order encryption
  completion from letting an older value win.
- Startup hydration waits until the persisted outbox is indexed. A remote row
  is withheld while that record has an encrypting or queued local mutation,
  then repulled after the final acknowledgement so an older server snapshot
  cannot replace optimistic offline state.
- User-originated structured changes commit their local record and encrypted
  outbox mutation in one owner-validating IndexedDB transaction or exclusive
  SQLite transaction. A failure rolls back the complete batch; the UI reports
  a sticky local-save warning instead of claiming the change remains safe.
- If any feature repository cannot initialize or read its saved records, the
  app enters a fail-closed local-data boundary. Editing and navigation are
  withheld rather than presenting empty/default state that could overwrite
  unread records; reopening the app is the recovery path.
- Client commits are serialized in invocation order. Recurring completion and
  its next occurrence, recurring reopen and generated-occurrence deletion, and
  multi-record restores therefore cannot persist as half-applied local/outbox
  pairs.
- Remote rows wait for the ordered local commit chain before delivery. A
  canonical Brain Dump snapshot therefore cannot race the local projection of
  an encrypting delta, while a canonical deletion tombstone remains
  authoritative rather than being suppressed by an alias.
- Remote listeners acknowledge a row only after its local repository mutation
  succeeds. Reconciliation advances its in-memory cursor after all listeners
  finish, so a storage failure remains a visible read-side error and the row
  is eligible for retry instead of being silently skipped.
- Initial pulls, realtime repulls, acknowledgement repulls, and reconciliation
  can overlap. Delivery is serialized per record and rejects a row below the
  highest server version already observed, preventing a delayed stale response
  from overwriting a newer durable projection. Subscriber acknowledgements are
  tracked separately, so a newly mounted listener can still hydrate the current
  version and a failed listener remains eligible for retry.
- Previous encrypted versions are retained for seven days.
- Mutation IDs make outbox retries idempotent.
- Yjs updates make Brain Dump edits commutative and conflict-free.
- Yjs is loaded once, on first CRDT use, rather than during Expo server
  rendering; `pnpm verify:yjs-runtime` guards against duplicate runtime
  evaluation.
- New app-generated Yjs updates use bullet-scoped identifiers. After 64 of
  those updates are confirmed by the server, the client opportunistically
  submits a complete encrypted bullet snapshot plus the exact covered update
  identifiers.
- Compaction takes a per-account, per-bullet advisory transaction lock, locks
  the canonical bullet, and proceeds only when the supplied update set exactly
  matches the server's current compactable set. A concurrent edit therefore
  defers compaction instead of being discarded.
- A successful compaction atomically updates the encrypted canonical snapshot,
  removes only the covered update rows and their temporary history, and clears
  their ciphertext from retained idempotency receipts. Legacy update
  identifiers are never pruned by this protocol, so older clients remain
  compatible.
- Deleting a current structured Brain Dump bullet takes the same advisory lock
  as its updates, then atomically removes its identifiable delta rows and
  history and clears their ciphertext from retained idempotency receipts.
  Later structured updates are rejected when the canonical bullet is missing
  or deleted, and clients ignore an in-flight update after observing the
  tombstone. Legacy opaque update identifiers cannot be associated with a
  parent bullet by the server and are not included in this cleanup guarantee.
- Compaction is optional for correctness. Offline and unconfirmed updates
  remain durable through the normal outbox and are still safe to replay after
  a compacted snapshot because Yjs updates are idempotent.

## Export And Deletion

- Readable JSON and Markdown exports are assembled locally.
- Full backups encrypt the complete export and include the recovery envelope.
- Backup restoration validates the format, unwraps the content key locally with
  the recovery code, authenticates the backup metadata, and rejects tampering
  before returning decrypted data.
- The one-hour deletion period is read-only and cancellable.
- The scheduled Edge Function deletes the Auth user, causing account rows to
  cascade, including browser Push subscriptions and schedules. The app removes
  its local database and content key only after the authenticated status RPC
  confirms that the server deadline is irreversibly closed or that the Auth
  user is already gone.
- A current structured Brain Dump bullet tombstone atomically purges its
  separately encrypted server-side deltas and temporary history and strips
  duplicate ciphertext from mutation receipts.
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

The complete engineering data inventory, actual retention boundaries, and
store-declaration draft are in `docs/PRIVACY_DATA_MAP.md`.

## Required External Review

Before production:

1. Review AES-GCM envelope construction, key lifecycle, and recovery UX.
2. Execute cross-account RLS and RPC abuse tests on the deployed schema.
3. Review the one-time trusted-device handoff, expiry, rejection, and
   target-binding protocol.
4. Test token expiry and device revocation under offline/reconnect conditions.
5. Review XSS/CSP, PWA caching, OAuth redirects, and browser key storage.
6. Review Web Push capability storage, VAPID/scheduler-secret handling,
   delivery retry semantics, and generic payload boundaries.
7. Test native secure storage, biometrics, notifications, and backups.
8. Resolve every critical or high finding and record the evidence.
