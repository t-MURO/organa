# Production Dependency Audit

Audit performed on 2026-07-26 against the live package advisory registry.

## Audited Graph

- Organa source commit at audit time:
  `f0cc0dae1b0d37aa7e86880f9499264424daa0ad`
- `pnpm-lock.yaml` SHA-256:
  `4f8656a17adea96a53ec255b81b99660595f77eb33553aad27e138026f96a176`
- pnpm: `10.28.2`
- Node.js: `v25.4.0`
- Scope: production dependencies and production optional dependencies
- Audited dependencies: `610`
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
