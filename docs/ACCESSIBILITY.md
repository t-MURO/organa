# Accessibility Contract

Status recorded on 2026-07-24.

Organa treats accessibility as an implementation contract for every feature,
not a final-release polish pass.

## Interaction Targets

- Every React Native `Pressable` is routed through
  `AccessiblePressable`.
- Native controls receive a 14-point hit expansion on every side unless a
  component deliberately supplies a larger custom hit area.
- Web buttons, links, checkboxes, radios, and switches have a minimum
  24-by-24 CSS-pixel target, matching the WCAG 2.2 AA target-size minimum.
- Coarse-pointer web devices receive an interaction area of at least 44 by 44
  CSS pixels without forcing compact visual controls to become oversized.
- A browser DOM measurement covers Today, Check-In, Brain Dump, Templates, and
  Account and reports no visible interactive target below 24 by 24 CSS pixels.

## Text Scaling

- React Native system text scaling remains enabled.
- The application does not set `allowFontScaling={false}`,
  `maxFontSizeMultiplier`, or `adjustsFontSizeToFit`.
- Core action labels are not constrained with `numberOfLines`.
- Mobile navigation labels wrap and the navigation container may grow rather
  than clipping enlarged text.

## Semantics And Perception

- Critical controls expose meaningful roles, labels, checked/selected/disabled
  state, and alert semantics.
- Status and priority use text or symbols as well as color.
- Light and dark theme tokens meet the documented WCAG AA contrast checks.
- Web focus indicators are always visible for keyboard focus.
- Web and native completion motion respect the system reduced-motion setting.
- Sounds remain optional and off by default; haptics remain separately
  configurable.
- Completion haptics use native iOS and Android system effects only. Web stays
  quiet, matching the controlled-beta capability matrix.
- Unavailable audio or haptic APIs do not interrupt task creation or
  completion.
- iOS widgets use native SwiftUI text semantics. Android Today and Next
  Reminder widgets provide whole-widget accessibility labels, scalable text,
  and explicit Home or Focus deep-link actions in light and dark modes.
- Read-side encrypted-sync failures use a route-wide accessibility alert with
  plain recovery copy. Compact layouts expose offline and pending sync status
  through a polite live region rather than color alone.
- Focus exposes every configured snooze preset as a labeled button. Scheduling
  success, fallback, and failure copy uses alert/live-region semantics rather
  than relying on a silent action.

## Automated Evidence

Run:

```sh
pnpm test
pnpm typecheck
pnpm build:web
pnpm build:native
```

`apps/mobile/src/accessibility/accessibility-contract.test.ts` prevents raw
application pressables, underspecified web target CSS, text-scaling opt-outs,
and single-line truncation from returning.
`apps/mobile/src/features/settings/completion-haptic.test.ts` verifies the
native-only platform boundary, the user preference, and non-disruptive
hardware/API failure behavior.

## Release-Device Gate

Before each controlled-beta release:

1. Complete critical workflows with VoiceOver on iOS.
2. Complete critical workflows with TalkBack on Android.
3. Repeat at the largest supported system text size without clipping or losing
   core actions.
4. Confirm visible and effective touch targets on the oldest supported iOS and
   Android devices.
5. Complete keyboard-only critical workflows in every supported release
   browser.
6. Re-run contrast and reduced-motion checks in light and dark themes.

These physical and release-browser checks remain mandatory because source,
DOM, and bundle evidence cannot prove assistive-technology behavior on a
signed device.
