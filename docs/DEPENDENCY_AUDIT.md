# Production Dependency Audit

Audit performed on 2026-07-27 against the live package advisory registry.

## Audited Graph

- Organa source commit at audit time:
  `092f72218f177b3c877495406a5d4064025d0171`
- `pnpm-lock.yaml` SHA-256:
  `833c9c5b31b798ff56e84276faf12359b0c7a229595011b06518bc1203eb6cf9`
- pnpm: `10.28.2`
- Node.js: `v25.4.0`
- Scope: production dependencies and production optional dependencies
- Audited dependencies: `608`
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
