# Production Dependency Audit

Audit performed on 2026-07-26 against the live package advisory registry.

## Audited Graph

- Organa source commit at audit time:
  `662091c97df9d91088303f1a31ddffd737600ed1`
- `pnpm-lock.yaml` SHA-256:
  `5d64c88b12e623fa51bd39c202f9e592f20062e8e9d17702790301947b914dde`
- pnpm: `10.28.2`
- Node.js: `v25.4.0`
- Scope: production dependencies and production optional dependencies
- Audited dependencies: `609`
- Development dependencies included: `0`

## Result

`pnpm audit --prod --json` returned successfully with no actions, advisories,
or muted findings:

| Severity | Findings |
| --- | ---: |
| Critical | 0 |
| High | 0 |
| Moderate | 0 |
| Low | 0 |
| Info | 0 |

The human-readable high-severity release command also passed:

```sh
pnpm audit --prod --audit-level high
```

This closes the current known-advisory check for the recorded production
dependency graph. It does not replace source review, cryptographic review,
configuration review, penetration testing, or the independent security gate.
Rerun the audit for every release candidate and whenever any package manifest
or lockfile changes.
