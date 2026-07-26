# Privacy Data Map

Status prepared on 2026-07-24.

This is the engineering inventory for Organa's controlled beta. It is not a
published privacy policy or legal determination. The store-account owner and
legal reviewer must compare the exact deployed services, provider contracts,
request logs, retention settings, and release binary against this document
before completing Apple or Google declarations.

## Runtime Services

| Service | Runtime purpose | Data boundary |
| --- | --- | --- |
| Supabase Auth | Account creation, provider identity, sessions | Email, provider identity, account ID, session and request metadata |
| Supabase Database and Realtime | Durable encrypted sync, device trust, deletion state | Ciphertext plus the operational metadata listed below |
| Supabase Edge Functions | Scheduled deletion and Web Push dispatch | Due account IDs or Push capabilities and generic encrypted Push payloads |
| Google and GitHub | User-selected OAuth authentication | Provider-controlled identity and sign-in request metadata |
| Browser Push service | Closed-tab web reminder transport | Push endpoint/capability and encrypted payload containing only a safe route and opaque tag |
| Apple/Google app distribution | Installation and store updates | Store-account, download, device, and platform diagnostics governed by the stores |

Expo EAS is a build and artifact service, not an application runtime
processor. No analytics, advertising, crash-reporting, or session-recording
SDK is included in the release source.

During self-hosted testing, the home-server operator controls Supabase Auth,
database, Realtime, Edge Functions, reverse-proxy, SMTP, scheduler, backup, and
request-log infrastructure. Use synthetic test accounts and content until
access controls, retention, encrypted backups, restore, monitoring, and
incident handling are reviewed. Self-hosting changes the operator and
processor inventory; it does not change Organa's client-side content
encryption or minimize the operational metadata visible to that operator.

## Local-Only Data

The following plaintext is required locally for offline use and is not sent
off device in plaintext:

- task titles, details, task types, medication text, recurrence, reminders,
  subtasks, completion and dose-confirmation history
- user templates
- Check-In mood, feeling, and reflection
- Brain Dump text and Yjs state
- theme, sound, haptic, and Check-In reminder preferences
- readable exports created by an explicit user action

Native repositories use SQLite. Web repositories use IndexedDB. Device
encryption, operating-system account security, and the optional Organa app
lock protect local plaintext; end-to-end encryption does not protect an
already unlocked compromised device.

Native content keys and device proof secrets use SecureStore. In supported
browsers, content keys, auth sessions, and device proof secrets are encrypted
at rest with non-extractable Web Crypto wrapping keys stored through
IndexedDB. This blocks plaintext storage inspection but does not make an
origin with active malicious script safe. If durable CryptoKey cloning is
blocked, the content key is memory-only; auth/device storage may fall back to
the browser's complete `Storage` implementation so the current session can
survive. Such a browser is outside the controlled-beta capability contract
until its recovery and storage behavior is explicitly accepted.

Content-free authorization, account-deletion deadline, PWA update, and pending
Push-schedule caches may use local storage. They contain booleans, timestamps,
opaque identifiers, and safe routes rather than user-entered content.

## End-To-End Encrypted Cloud Data

Organa encrypts each changed user-content field with AES-256-GCM before it
enters the outbox. Record type, opaque record ID, field name, field timestamp,
version, deletion state, updater device, and synchronization time remain
server-readable. The backend receives no plaintext content key.

Encrypted cloud payloads include:

- tasks, medication fields, reminders, subtasks, recurrence, and history
- private templates
- settings
- Check-In mood, feeling, and reflection
- Brain Dump bullets and Yjs updates
- full encrypted backups when the user retains them locally; backups are not
  uploaded by Organa

The server can distinguish encrypted record types and field names. These are
operational metadata and must never contain user-entered text.

New, restored, and locally stored legacy Check-In records use a versioned
identifier derived locally from the account content key, record type, and date
with HKDF/HMAC-SHA-256. Trusted devices derive the same opaque ID for same-day
convergence, but the backend cannot recover the date or correlate that ID
across accounts. The database rejects active date-bearing Check-In IDs and
physically removes a deleted legacy ID from active, history, and mutation
metadata.

## Server-Readable Data

| Data | Purpose | Current retention boundary |
| --- | --- | --- |
| Account ID, email, provider identities, session metadata | Authentication and account management | Until account deletion, provider policy, or session expiry |
| Random device ID, generic display name, platform | Trusted-device management | Until device/account deletion; revoked rows remain until account deletion |
| Trust, revocation, last-seen, reminder-device booleans | Security and notification ownership | Until account deletion |
| One-way recovery and device proof hashes | Enrollment and authenticated device operations | Until account deletion; proof columns are not client-selectable |
| Key ID and recovery envelope ciphertext | Recovery | Until account deletion or future key rotation |
| Record type, opaque ID, encrypted field names, versions, timestamps, tombstones | Durable field merge and reconciliation | Current records until account deletion |
| Previous encrypted record versions | Temporary conflict recovery | Seven days, pruned opportunistically on later mutations |
| Brain Dump Yjs update ciphertext | Offline and concurrent text merge | New bullet-scoped updates compact into the canonical encrypted snapshot after 64 server-confirmed deltas; covered update/history rows are deleted and their mutation-receipt ciphertext is cleared. Legacy-format updates remain until account deletion for backward compatibility |
| Mutation ID, operation, versions, timestamps | Idempotent retry evidence | Currently until account deletion |
| Device approval timestamps and target-bound envelope ciphertext | Short-lived trusted-device handoff | One row per device; envelope clears on claim, row may remain until replacement, rejection, or account deletion |
| Account-deletion timestamps | One-hour cancellation and finalization | Until Auth user deletion cascades the account |
| Browser Push endpoint and encryption capabilities | Closed-tab reminder delivery | Until unsubscribe, device quieting/revocation, endpoint expiry, or account deletion |
| Opaque Push scope/key, safe route, fire time, Check-In local time/time zone | Schedule and advance generic reminders | One-off rows delete after delivery; failed rows delete after five attempts; repeating rows remain until replacement, unsubscribe, or account deletion |
| IP address, TLS and HTTP request metadata | Hosting, abuse prevention, and service operation | Determined by deployed providers and contracts; must be confirmed before release |

Web Push sends a generic title/body. Task names, medication data, mood values,
reflection text, and Brain Dump content are never placed in a Push payload.

## User Controls

- Export creates readable JSON/Markdown or an encrypted backup locally after
  explicit user action.
- Trusted devices can be viewed and revoked.
- Reminder delivery on secondary devices is opt-in.
- Sign-out removes sessions, displayed/scheduled reminders, Push
  subscriptions, and private widget content. It intentionally retains local
  repositories, content key, and device identity for the same returning
  trusted device.
- Revocation and final account deletion erase local private stores, content
  key, proof secret, reminders, Push state, and widget content.
- Account deletion is read-only and cancellable for one hour before Auth and
  account rows are permanently removed.
- User-created export files remain under the user's control.

## Data Not Collected By Organa

The release source contains no product analytics, advertising identifier
access, behavioral tracking, session recording, background crash telemetry,
contacts access, location permission, camera/photo-library access, microphone
recording, payment collection, or marketing profile.

Organa does not currently send crash reports. Any future support-report path
must require an explicit user action and remove user content, tokens, recovery
codes, content keys, device proof secrets, and encrypted envelopes paired with
keys before transmission.

## Store Declaration Draft

This section is a conservative engineering starting point, not the final
answer entered in a store console.

Apple App Privacy candidates:

- Email Address, User ID, and Device ID are linked to the account and used for
  app functionality/account management.
- No data is used for tracking, third-party advertising, developer
  advertising, or analytics.
- The legal reviewer must decide how Apple classifies inaccessible
  end-to-end-encrypted user content, especially medication and mood content,
  and whether provider IP/request logs add diagnostics or coarse-location
  declarations.

Google Play Data safety candidates:

- Email address, User IDs, and Device or other IDs are collected for app
  functionality, account management, and security.
- Data is not sold and no advertising/analytics purpose exists.
- Production application-controlled network paths must use encrypted
  transport; verify the signed artifact and every deployed endpoint before
  selecting that store answer.
- The app provides an in-app deletion mechanism.
- Google documents an exclusion for data that is end-to-end encrypted and
  unreadable by intermediaries. Legal and security reviewers must confirm that
  Organa's deployed key lifecycle satisfies that exclusion before omitting
  task, medication, mood, reflection, template, and Brain Dump categories.
- Confirm whether each OAuth, hosting, Push, and store provider qualifies as a
  service provider rather than reportable sharing under the final contracts.

Authoritative declaration guidance:

- Apple: <https://developer.apple.com/app-store/app-privacy-details/>
- Google Play: <https://support.google.com/googleplay/android-developer/answer/10787469>

## Required Sign-Off

Before store submission:

1. Re-run the dependency, permission, endpoint, schema, Push-payload, and
   runtime-traffic inventory against the signed artifact.
2. Confirm the selected Supabase project is in the promised EU region.
3. Obtain processor/subprocessor and retention details for Supabase, OAuth
   providers, browser Push services, Expo EAS, Apple, and Google.
4. Decide retention for mutation receipts, revoked device rows, expired
   approvals, and provider request logs.
5. Publish a legally reviewed privacy policy and account/privacy choices URL.
6. Complete Apple App Privacy and Google Play Data safety in the owning store
   accounts.
7. Keep screenshots or exports of the submitted declarations with the exact
   release commit and artifact IDs.
