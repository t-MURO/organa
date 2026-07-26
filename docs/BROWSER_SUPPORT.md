# Browser Support

Native OS targets and cross-platform capability differences are recorded in
`docs/PLATFORM_SUPPORT.md`.

## Policy

The controlled beta supports the current stable releases of:

- Safari on macOS and iOS
- Chrome on desktop and Android
- Edge on desktop
- Firefox on desktop

Test the exact stable versions again for every beta release. Older browsers may
work but are not release targets.

## Required Capabilities

Core web use requires:

- IndexedDB
- Web Crypto AES-GCM and durable non-extractable CryptoKey cloning
- service workers for installed/offline PWA behavior
- modern JavaScript modules

If durable CryptoKey storage is unavailable, Organa keeps the content key in
memory and the user must restore with the recovery code after that browser
session. Device proof secrets remain protected by non-extractable wrapping
keys in IndexedDB. Auth sessions use durable origin `localStorage` so Supabase
refresh tokens survive reloads consistently; the exact script CSP and
same-origin integrity are required parts of that credential boundary.

## Capability Matrix

| Capability | Safari | Chrome | Edge | Firefox |
| --- | --- | --- | --- | --- |
| Responsive app | Supported | Supported | Supported | Supported |
| IndexedDB local data | Supported | Supported | Supported | Supported |
| Encrypted sync | Supported | Supported | Supported | Supported |
| Offline app shell | Supported | Supported | Supported | Supported |
| Install experience | Browser/OS dependent | Supported | Supported | Browser dependent |
| System web reminders | Supported; iOS/iPadOS requires Home Screen install | Supported | Supported | Supported |
| Active-tab reminders | Supported | Supported | Supported | Supported |
| Biometric app lock | Not in MVP | Not in MVP | Not in MVP | Not in MVP |

System reminders require an HTTPS deployment, a configured VAPID public key,
browser support, and user permission. Organa requests permission only from the
user action that saves an enabled task or Check-In reminder. It uses feature
detection rather than browser detection. On iOS and iPadOS, standards-based
Web Push is available to web apps added to the Home Screen, not ordinary
browser tabs. See the [MDN Push subscription
contract](https://developer.mozilla.org/en-US/docs/Web/API/PushManager/subscribe)
and [WebKit iOS/iPadOS Web Push
requirements](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/).

If Push is unavailable, unconfigured, or denied, the task and Check-In screens
explain that limitation and active-tab reminders remain available. A mobile
reminder device should remain enabled when dependable closed-tab delivery has
not been validated for that browser.

When task or Check-In system permission is not requested, denied, unsupported,
or a schedule update fails, Organa preserves the change and shows a persistent,
dismissible delivery notice. The notice explains that system delivery should
not be relied on and points to an open-app or reminder-enabled-device fallback.

Active-tab reminders follow the signed-in browser's trusted-device reminder
setting. A primary device is enabled by default; a secondary device remains
quiet unless the user explicitly enables reminders for it. During an offline
restart, Organa uses the last server-confirmed content-free authorization
boolean. If no authorization has ever been confirmed, it shows no reminder.

Every snooze preset saved with a task is available in Focus and in the
active-tab reminder card. A snooze selected directly in Focus uses an in-memory
open-app timer and tells the user to keep Organa open. It is not represented as
closed-tab Web Push delivery. At delivery time, Organa checks the current task,
subtask, presets, and reminder-device authorization so completed or edited
work does not produce a stale snooze.

## Release Checks

For each browser:

1. Sign in and confirm recovery setup.
2. Reload and verify the content key unlocks without plaintext key storage.
3. Create, edit, complete, undo, search, and reopen a task.
4. Save and search a Check-In.
5. Add and edit Brain Dump bullets.
6. Go offline, reload the installed PWA, and modify local data.
7. Reconnect and verify outbox reconciliation.
8. Confirm every primary action is keyboard reachable with visible focus.
9. Test light/dark/system themes and reduced motion.
10. Save an enabled reminder and confirm permission is requested from that
    direct action, never at page load.
11. With permission granted, close the app and verify generic system delivery,
    deep linking, schedule replacement, and cancellation.
12. Deny permission and confirm the visible active-tab fallback remains.
13. Sign out and confirm displayed notifications close, the Push subscription
    is removed, and no further system reminder is delivered.
14. Install a newer build over an active older build, dismiss the first update
    prompt, reopen it after the next update-ready signal, then restart and
    confirm exactly one reload into the new worker.
15. Run `pnpm verify:web-deployment -- https://<candidate-origin>` and retain
    the passing security-header and cache-policy evidence.

## Latest Local Evidence

On 2026-07-26, the configured production PWA:

- scored 100% for Lighthouse accessibility and best practices
- passed 26 deterministic production artifact checks
- precached the static routes, JavaScript, manifest, install icons, four
  render-critical Manrope weights, optional interaction sounds, and the Web
  Push handler plus external registration bootstrap across 23 URLs
- emitted a script policy without `unsafe-inline` or `unsafe-eval`, restricted
  connections to the exact paired Supabase HTTPS/WebSocket origins, and
  generated a matching deployment-header artifact with clickjacking, MIME,
  referrer, capability, HTTPS, and cache protections
- reloaded a signed-in account with both the static server and Supabase stopped
- retained existing encrypted local task data
- created and retained a new task plus outbox mutation while fully offline
- reconciled the queued mutation automatically after Supabase returned
- built successfully after adding reminder-device ownership enforcement to
  active-tab task and Check-In reminders
- built successfully with a generated public VAPID key and a service worker
  that displays content-free notification copy and handles safe deep links
- showed the system-reminder capability and fallback copy in the in-app
  browser; that browser did not grant notification permission, so
  permission-granted delivery remains a release-browser gate
- passed update lifecycle tests for waiting-worker discovery, dismissal,
  restart, one-shot controller handoff, timeout fallback, and
  registration/message failure
- generated a worker with the deliberate `SKIP_WAITING` activation protocol
- completed a real same-origin production update drill: version one installed
  and controlled the page, version two entered `waiting`, Later dismissed the
  prompt, reload restored the prompt, and Restart activated a marked
  replacement worker with exactly one navigation and no remaining prompt
