# Browser Support

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

If durable CryptoKey storage is unavailable, Organa keeps the key in memory and
the user must restore with the recovery code after that browser session.

## Capability Matrix

| Capability | Safari | Chrome | Edge | Firefox |
| --- | --- | --- | --- | --- |
| Responsive app | Supported | Supported | Supported | Supported |
| IndexedDB local data | Supported | Supported | Supported | Supported |
| Encrypted sync | Supported | Supported | Supported | Supported |
| Offline app shell | Supported | Supported | Supported | Supported |
| Install experience | Browser/OS dependent | Supported | Supported | Browser dependent |
| System web reminders | Not in MVP | Not in MVP | Not in MVP | Not in MVP |
| Active-tab reminders | Supported | Supported | Supported | Supported |
| Biometric app lock | Not in MVP | Not in MVP | Not in MVP | Not in MVP |

The task and Check-In screens always state that web reminders appear only while
Organa is open. A mobile reminder device should remain enabled when closed-tab
delivery is required.

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
10. Confirm the reminder limitation is visible before enabling reminders.
