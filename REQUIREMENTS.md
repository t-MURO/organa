# Organa Product Requirements

**Status:** Draft for implementation  
**Version:** 0.1  
**Date:** 2026-07-23  
**Working product name:** Organa

## Development Scope

This document describes product behavior and release acceptance, not a
mandatory checklist for every commit. Routine UI-only changes do not require
Supabase verification, connected drills, native builds, dependency audits,
release-evidence updates, or production deployment.

Use `pnpm verify:ui` for layout, styling, copy, animation, and presentational
component changes. Escalate only when a change crosses a domain, persistence,
authentication, synchronization, encryption, reminder, native, dependency,
or backend boundary. Run the full acceptance and release gates once for an
intentional release candidate.

## 1. Purpose

Organa is a calm, organization-focused productivity app for people with ADHD. It helps users capture, plan, remember, and complete everyday responsibilities without adding pressure or turning self-care into a performance system.

The product combines task management, configurable reminders, daily planning, lightweight focus support, a pressure-free daily Check-In, and a persistent Brain Dump. It must remain dependable offline and synchronize changes quickly across a user's devices.

## 2. Product Goals

1. Make it easy to capture and organize daily responsibilities.
2. Support recurring routines ranging from simple habits to medication schedules.
3. Reduce the mental effort required to decide what to do next.
4. Deliver reminders that are configurable without becoming overwhelming.
5. Keep personal reflections available without pushing users to journal.
6. Provide a calm, minimal, and accessible experience across devices.
7. Protect sensitive personal data with end-to-end encryption.

## 3. Product Principles

- **Pressure-free:** Avoid shame, punishment, forced streaks, and alarming language.
- **Task-first:** Today's responsibilities are the primary home-screen content.
- **Calm control:** Present clear choices and status without visual overload.
- **Progressive complexity:** Simple defaults first; advanced settings remain optional.
- **Offline-first:** Core features continue working after the user's initial sign-in.
- **Private by design:** User content is encrypted before leaving the device.
- **Cross-device:** Online changes should appear on other active devices in near real time.
- **User-controlled:** Reminders, journaling, sound, themes, and secondary-device notifications remain configurable.

## 4. Target Audience

### Primary Audience

People with ADHD who want help organizing daily tasks, routines, appointments, self-care, medication, and miscellaneous thoughts.

### User Needs

- Quickly capture a responsibility before it is forgotten.
- Distinguish urgent or important work from optional work.
- Remember recurring tasks with different frequencies.
- Break intimidating tasks into approachable steps.
- Start one task without being distracted by the full backlog.
- See a realistic daily plan.
- Keep private thoughts and mood observations without being pressured to write.
- Use the same current data from a phone, tablet, or browser.

## 5. Release Scope

### MVP Platforms

- iOS native app
- Android native app
- Responsive web app
- Installable Progressive Web App

The PWA must support offline access, an application icon, and installation from supported browsers.

### Deferred Platforms

- macOS desktop app
- Windows desktop app
- Linux desktop app

Desktop applications will use Tauri 2 and the shared web interface after the MVP is stable. The repository architecture must allow these clients to be added without restructuring the domain layer.

### User Model

- The MVP is single-user.
- An account is required.
- Collaboration, household sharing, delegated tasks, and team workspaces are out of scope.

## 6. Information Architecture

The primary navigation must give Tasks, Check-In, and Brain Dump equal top-level status and clear access.

### Home

Home is task-first and shows today's tasks before quick capture or reflective features.

Today's work is organized into two lanes:

1. **Priority lane**
   - Must do
   - Should do
   - Nice to do
2. **Time lane**
   - Contains only tasks explicitly scheduled for today.

Unscheduled tasks with duration estimates remain in planning areas and do not appear in the time lane. Completed tasks remain available in a visible but collapsed section.

### Responsive Navigation

- Mobile uses bottom navigation and focused single-column screens.
- Web, tablet, and future desktop layouts use adaptive navigation.
- Wide screens may use a persistent sidebar and multi-column planning views.

## 7. Functional Requirements

### 7.1 Tasks

Organa must support these first-class task types:

1. One-off task
2. Repeating habit or routine
3. Medication task

Every task must support:

- Title
- Optional details
- Optional due date
- Optional due time
- Optional scheduled date and time
- Manual priority: Must do, Should do, or Nice to do
- Optional estimated duration
- Completion state
- Optional reminders
- Optional subtasks
- Optional grace-day configuration where applicable
- Created, updated, and completed timestamps

A task may exist without a due date.

### 7.2 Medication Tasks

Medication is a specialized task type, not merely a label.

Medication tasks must support:

- Repeating schedules
- Standard task reminder behavior
- Optional dose confirmation
- Completion history

Dose confirmation must remain optional and must not prevent normal task completion. The product must describe medication features as organizational aids and must not present itself as a medical device or substitute for professional advice.

### 7.3 Repeating Tasks

Repeating tasks must support common routine patterns required for activities such as:

- Brushing teeth
- Watering plants
- Taking medication
- Weekly chores
- Monthly responsibilities

The recurrence model must be calendar-aware and preserve historical completion records rather than rewriting prior occurrences.

Exact recurrence rules, including end conditions and skipped-occurrence
behavior, are defined in `docs/DOMAIN_MODEL.md`.

### 7.4 Subtasks

- Subtasks are optional, lightweight steps within a task.
- All task types may have subtasks.
- Subtasks must not turn the MVP into a full project-management system.
- Subtask reminders are optional and configurable per task.
- Parent-task completion behavior is defined explicitly in
  `docs/DOMAIN_MODEL.md`.

### 7.5 Reminders

The default task reminder is a single reminder at the due time.

Users may configure multiple standard reminder stages:

- Before due
- At due
- After due

Requirements:

- Reminder stages are selected from standard options rather than entered as unrestricted expressions.
- Reminder settings are stored per task.
- Snooze uses preset chips.
- Snooze presets are configurable per task.
- A task may use more than one reminder.
- Reminders must continue to work offline when supported by the device.
- Reminder actions must deep-link to the relevant task or focus view.

### 7.6 Reminder Devices

- The user selects one primary reminder device.
- Notifications on additional devices must be enabled explicitly.
- Organa must not send automatic fallback reminders to another device when a reminder is unacknowledged.
- Device notification settings must synchronize without exposing notification content to the server.
- The app must minimize accidental duplicate reminders across devices.

### 7.7 Templates

Organa must include a separate template library with:

- Official presets supplied by Organa
- Private user-created templates

Users must be able to:

- Use an official template
- Edit a preset for their own use
- Create a new template
- Modify their templates
- Delete their templates

User templates are private in the MVP.

### 7.8 Daily Planning

Daily planning must combine:

- Today's task list
- Priority lanes
- Scheduled-time lane
- Calendar access
- Manual prioritization
- Optional duration estimates

The calendar defaults to a week view and can toggle to a month view.

Automatic prioritization is out of scope for the initial release. The user remains in control of task priority.

### 7.9 Inbox and History

The in-app task inbox must expose:

- Upcoming
- Overdue
- Completed

Completion history must remain available for repeating tasks and medication tasks.

### 7.10 Consistency Support

Organa may show lightweight consistency information through:

- Completion history
- Optional streak representation
- Grace days

Grace days are configured per task. The initial product direction allows three
grace days per applicable task; reset and consumption rules are defined in
`docs/DOMAIN_MODEL.md`.

Consistency features must:

- Avoid punitive copy.
- Avoid public comparison.
- Make recovery after a missed day easy.
- Never apply streak pressure to Check-In.

### 7.11 Focus Mode

Focus mode must provide:

- Single-task lock-in
- Optional timer
- Direct opening from a reminder
- Break or reset action
- Exit action

Focus mode is lightweight and must not block emergency access to the rest of the app.

### 7.12 Quick Add

- Quick Add must be available from Home.
- It must support plain task creation with minimal input.
- Natural-language parsing may create dates, recurrence, or reminders only when confidence is high.
- When parsing is uncertain, the input must become a plain task rather than silently creating incorrect reminder behavior.

### 7.13 Widgets

Mobile widgets must support:

- Next reminder
- Today's task list

Widget actions should deep-link into the corresponding app location. Exact widget capabilities may differ by operating system.

## 8. Check-In Requirements

Check-In is a separate, optional, pressure-free journal and mood feature.

Requirements:

- One Check-In opportunity per day
- User-selected evening reminder window
- Gentle reminder when enabled
- Reminder settings separate from task reminders
- Mood rating from 1 to 5
- Optional one-word feeling label
- Optional free-text reflection
- Searchable entries
- Mood trend visualization
- Trend toggle between 7 days and 30 days
- No streaks
- No punishment, guilt, or missed-day warning

Check-In must not be forced into onboarding, Home, or task completion flows.

## 9. Brain Dump Requirements

Brain Dump is a separate top-level feature for capturing miscellaneous thoughts.

Requirements:

- Always easy to reach
- One continuous note
- Bullets only
- Pressing Enter creates the next bullet automatically
- Searchable
- No headings, checklists, or rich-text formatting in the MVP
- No capture reminder
- No automatic conversion into tasks or reminders
- Live conflict-free editing across multiple devices

Simultaneous edits from multiple devices must merge without overwriting existing thoughts. The implementation must use a conflict-free replicated data model or equivalent safe merge mechanism.

## 10. Search

Search must operate locally over decrypted content and support:

- Tasks
- Completed tasks
- Check-In entries
- Brain Dump bullets
- User templates

Because content is end-to-end encrypted, the server must not maintain a plaintext full-text index.

## 11. Visual and Interaction Requirements

### Visual Direction

- Calm and minimal
- Clean and geometric
- Organization mixed with calm control
- Brandable rather than clinical
- Full visual themes rather than simple accent-color swaps

### Themes

- Light themes
- Dark themes
- Default follows the operating-system preference
- Manual theme override
- Theme preference synchronizes across devices

### Sound and Haptics

- The app is silent by default except for operating-system notifications.
- Optional gentle creation and completion sounds are available.
- App sounds are off by default.
- Gentle completion haptics are enabled by default where available.
- Haptics have a separate toggle and respect operating-system accessibility settings.

### Motion

- Motion must be purposeful and restrained.
- Reduced-motion system settings must be respected.
- Completion feedback must not be visually overwhelming.

## 12. Accounts and Authentication

Supabase Auth provides for the controlled beta:

- Email verification-code sign-in

Google and GitHub sign-in are deferred until after the controlled beta. Their
PKCE callback implementation and deployment tooling may remain dormant in the
codebase, but the client must not discover, display, or start either provider
while social OAuth is disabled.

Requirements:

- Passwords are not required for the initial authentication experience.
- A user must authenticate before first use.
- After successful initial sign-in, the app remains usable offline.
- Authentication sessions must be stored using platform-appropriate secure storage.
- Users must be able to view and revoke trusted devices.

## 13. Offline and Realtime Synchronization

### Offline-First Behavior

- Reads and writes operate against a local data store.
- Core task, planning, Check-In, Brain Dump, search, and reminder features remain usable offline.
- Offline mutations are queued in an outbox.
- Queued mutations synchronize automatically after reconnection.
- Reconnection must be idempotent and safe to retry.

### Realtime Behavior

When online:

1. The initiating client updates optimistically.
2. The encrypted mutation is persisted to Supabase.
3. Supabase Realtime broadcasts a private change event.
4. Other active clients update their local stores.

The target is for ordinary online changes to become visible on other active clients within one second under normal network conditions. This is a product target, not a guaranteed delivery time.

### Conflict Resolution

For structured records:

- Changes to different fields merge automatically.
- When the same field changes concurrently, the latest valid field version wins.
- Previous values remain temporarily available for undo or recovery.
- Conflict handling should not interrupt the user during normal operation.

For Brain Dump:

- Character or bullet-level changes merge using a conflict-free model.
- Realtime messages are not the source of truth.
- Reconnecting clients must reconcile from durable encrypted state.

## 14. Privacy and Security

### End-to-End Encryption

All user-generated content must be encrypted on the client before synchronization, including:

- Task content
- Medication content
- Reminder content
- Templates
- Completion history
- Check-In content
- Mood data
- Brain Dump content

Supabase stores ciphertext and minimal operational metadata. The service must not receive the plaintext encryption key.

Minimal server-readable metadata may include:

- Account identifier
- Device identifiers
- Record identifiers
- Encrypted-record type
- Version or sequence data
- Synchronization timestamps
- Deletion state

The exact plaintext metadata set must be documented and minimized before implementation.

### Encryption Keys

- Each account has a content-encryption key hierarchy.
- Device keys are stored in platform secure credential storage.
- Web storage must not persist an unprotected plaintext content key.
- A new device may be approved by selecting its pending request on an existing
  trusted device; approval must complete without copying or typing a transfer
  code.
- A recovery key is generated during onboarding.
- The user must confirm that the recovery key was stored before setup completes.
- If every trusted device and the recovery key are lost, encrypted content cannot be recovered.

The cryptographic design must use audited, established libraries and undergo an independent security review before production launch. Custom cryptographic primitives are prohibited.

### Local App Lock

Users may optionally lock the app with:

- Face ID or Touch ID
- Android biometric authentication
- Device PIN fallback
- Future desktop platform authentication, such as Windows Hello

### Data Region

- Supabase services must use an EU region.
- Authentication metadata and encrypted user data remain in the selected EU region where supported.

### Analytics

- No product analytics
- No advertising identifiers
- No session recording
- No behavioral tracking
- No background crash telemetry

Crash reports are sent only after an explicit user action. Reports must be scrubbed of task, journal, mood, medication, Brain Dump, token, and encryption-key content.

### Data Export

Users must be able to create locally:

1. An encrypted full backup suitable for restoration.
2. A readable export:
   - Tasks and structured records as JSON
   - Check-In and Brain Dump content as Markdown

### Account Deletion

- Deletion begins with a clear confirmation.
- A one-hour cancellation window follows.
- The account is read-only during the cancellation window.
- A prominent Cancel Deletion action remains available.
- After one hour, cloud records, account metadata, device keys, and active sessions are permanently deleted.
- User-created local exports remain under the user's control.

## 15. Accessibility Requirements

The MVP must:

- Support screen readers and meaningful accessibility labels.
- Support dynamic text sizing without clipping core actions.
- Meet WCAG 2.2 AA contrast targets for web content.
- Not rely on color alone to communicate status or priority.
- Respect reduced-motion settings.
- Respect system sound and haptic preferences.
- Provide keyboard navigation for all primary web workflows.
- Provide visible focus indicators on web.
- Keep touch targets comfortably usable.
- Use plain, non-judgmental language.

Accessibility must be included in component and feature acceptance tests, not deferred to final polish.

## 16. Technical Architecture

### Repository

- pnpm workspace
- Turborepo monorepo
- TypeScript in strict mode

Proposed structure:

```text
apps/
  mobile/       Expo app for iOS and Android
  web/          Expo web app and PWA
  desktop/      Tauri app added after MVP

packages/
  domain/       Entities, recurrence, planning, and conflict rules
  database/     Local repositories, migrations, outbox, and sync
  crypto/       Encryption interfaces and platform adapters
  realtime/     Supabase synchronization and subscriptions
  ui/           Design tokens, themes, and shared components
  platform/     Notifications, widgets, haptics, and secure storage
  validation/   Shared runtime schemas
```

### Client Applications

- React Native
- Expo
- Expo Router
- React Native Web
- Custom shared design system using React Native primitives and design tokens
- Platform-specific adapters where native behavior is required

### Desktop

- Tauri 2
- Shared web interface
- Rust limited to the secure desktop shell and native integrations
- SQLite, notifications, autostart, system tray, secure storage, and signed updates

Desktop applications are not part of the MVP release.

### Backend

- Supabase Auth
- PostgreSQL
- Supabase Realtime private channels
- Row-level security
- EU deployment region

The database is the durable synchronization authority but stores encrypted user payloads.

### Local Persistence

- Mobile: SQLite
- Web/PWA: IndexedDB
- Future desktop: SQLite through Tauri

Each platform implements the same repository contract. The project must not depend on experimental web SQLite support for MVP persistence.

### Notifications

- Mobile: Expo notifications with local scheduling and push support
- Web/PWA: service worker, Web Push where supported, and local in-app reminders
- Future desktop: Tauri notification integration

Reminder scheduling must be implemented behind a shared platform interface.

### Updates

- iOS and Android update through their app stores.
- Web deploys centrally and activates updates safely.
- Future desktop clients use signed background updates and a gentle Restart to Update prompt.

## 17. Conceptual Data Model

The detailed schema will follow this document. Expected entities include:

- User
- Device
- TrustedDeviceKey
- RecoveryKeyEnvelope
- UserSettings
- ThemePreference
- NotificationDevicePreference
- Task
- TaskOccurrence
- RecurrenceRule
- Reminder
- SnoozePreset
- Subtask
- Completion
- MedicationConfirmation
- GraceDayUsage
- Template
- DailyPlan
- CheckIn
- MoodValue
- BrainDumpDocument
- BrainDumpUpdate
- SyncMutation
- RecordVersion
- DeletedRecordTombstone

Encrypted payloads and server-readable synchronization metadata must be separated explicitly in the physical schema.

## 18. Non-Functional Requirements

### Reliability

- Local changes must survive application restarts.
- Sync operations must be idempotent.
- Missed realtime messages must be recovered through durable synchronization.
- Reminder correctness must not depend solely on an active WebSocket.
- Database migrations must preserve existing encrypted content.

### Performance

- Home should render cached local data without waiting for the network.
- Quick Add should feel immediate.
- Ordinary local task interactions should complete within 100 ms on supported devices.
- Realtime changes should normally appear on connected secondary clients within one second.
- Search should remain responsive for a typical personal dataset.

### Security

- No secrets in client source code beyond publishable service identifiers.
- Row-level security is required for every user-scoped server table.
- Realtime channels are private and user-scoped.
- Sensitive logs are prohibited.
- Dependencies and cryptographic libraries must be kept current.
- Release artifacts must be signed where the platform supports signing.

### Compatibility

- Support current iOS and Android versions selected during release planning.
- Support current stable versions of Safari, Chrome, Edge, and Firefox according to a documented browser-support policy.
- Degraded browser capabilities must not result in silent reminder failure.

## 19. MVP Acceptance Criteria

The MVP is ready for controlled beta when:

1. A user can create an account with an email verification code.
2. Recovery-key confirmation and trusted-device enrollment work.
3. Tasks can be created, edited, scheduled, repeated, completed, and searched.
4. One-off, habit, and medication task behaviors are implemented.
5. Multiple reminders, snooze presets, and a primary reminder device work.
6. Subtasks and optional subtask reminders work.
7. Today, priority lanes, time lane, week calendar, and month calendar work.
8. Templates can be browsed, copied, created, edited, and deleted.
9. Focus mode can open from a task or reminder.
10. Check-In supports mood, feeling label, reflection, reminder, search, and trends.
11. Brain Dump supports continuous bullet entry, search, offline use, and safe multi-device editing.
12. Mobile widgets show the next reminder and today's tasks where supported.
13. The apps remain usable offline after initial sign-in.
14. Changes synchronize across active devices and recover after offline use.
15. User content is end-to-end encrypted and inaccessible to the backend in plaintext.
16. Light, dark, system-default, and manual theme behavior work.
17. The PWA is installable and retains supported offline functionality.
18. Data export and the one-hour account-deletion flow work.
19. Accessibility checks pass for critical workflows.
20. Security review findings rated critical or high are resolved.

## 20. Explicit Non-Goals for MVP

- Multi-user collaboration
- Family or household workspaces
- Task assignment
- Team project management
- Public template marketplace
- AI-based automatic prioritization
- Automatic conversion of Brain Dump bullets into tasks
- Clinical guidance or medication advice
- Advertising
- Behavioral analytics
- macOS, Windows, or Linux release

## 21. Open Decisions

Resolved recurrence, grace-day, and parent/subtask decisions are recorded in
`docs/DOMAIN_MODEL.md`. The controlled-beta implementation also resolves:

- Cryptography uses versioned AES-256-GCM envelopes from Expo Crypto with
  record-bound additional authenticated data.
- Brain Dump conflict-free editing uses encrypted Yjs updates.
- Recovery uses a checked, versioned `ORG1` code. Trusted-device transfer uses
  a short-lived X25519 exchange, HKDF-SHA-256 key derivation, and a
  target-bound AES-256-GCM envelope.
- Notification permission is requested only from the direct user action that
  saves an enabled reminder. Unsupported or denied web permission retains a
  visible active-tab fallback.
- Reminder behavior for disconnected or stale devices follows the policy in
  `docs/DOMAIN_MODEL.md`: no automatic fallback device, last confirmed local
  authorization while offline, and authoritative reconciliation on reconnect.
- The starter catalog contains medication, plant-care, small-reset, and weekly
  planning templates.
- The controlled beta launches in English only. Localization infrastructure
  and additional languages are post-MVP.
- The controlled-beta platform matrix in `docs/PLATFORM_SUPPORT.md` targets
  iOS/iPadOS 16.4+, Android 7+ (API 24; compile/target API 36), and the current
  stable browser releases in `docs/BROWSER_SUPPORT.md`. The required Today and
  Next Reminder widgets are supported on iOS/iPadOS and Android through
  platform-specific widget runtimes over the shared snapshot model.

The remaining product and launch decisions are:

- Final product name and trademark validation
- Monetization and subscription model
- Regulatory and legal review requirements

## 22. Recommended Next Documents

1. Database and encrypted-record schema
2. Screen map and critical user flows
3. MVP delivery plan and milestone backlog
