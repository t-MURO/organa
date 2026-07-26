# Managed Rendered-Client Evidence

Status recorded on 2026-07-26 against clean source commit
`3c53ee94199185d9c430d4851da1794426a03c32`.

## Scope

This drill used the production Expo web bundle against the managed EU test
project. Separate loopback origins represented independent browser clients.
Each client used Organa's production Supabase client, protected browser auth
storage, recovery flow, content-key vault, IndexedDB repositories, encrypted
outbox, private Realtime channel, and normal rendered UI.

A temporary local reverse proxy provided a deterministic network boundary for
disconnect/reconnect checks. A temporary seeder created a typical 2,000-task
dataset through a separately registered trusted device, Organa's task domain
constructor, field-bound AES-256-GCM envelopes, and
`apply_encrypted_mutation`. The production client then decrypted and rendered
those records. The seeder, proxy, browser tabs, local servers, credentials, and
private state were removed after the run. The exact synthetic account was
deleted and reconciled through the managed Auth API.

No password-auth option or acceptance bypass was added to shipped source.

## Task Sync And Recovery

- A task created on client B appeared on client A through rendered encrypted
  sync in 283 ms.
- An edit from client A appeared on client B in 281 ms.
- With the proxy disconnected, client A rendered a new task locally, displayed
  `1 encrypted change waiting`, and client B remained unchanged.
- After reconnect, the queued mutation reached client B and both clients
  returned to current encrypted sync.

## Large Account

- The managed backend held exactly 2,003 active encrypted task records: 2,000
  seeded records plus the three task records created by the interactive sync
  drills.
- A fresh trusted production client restored the account, decrypted the
  paginated dataset, rendered sampled records from the first, intermediate,
  and final record-ID pages, and reported the expected 459 active tasks on the
  selected day.
- Nine rendered exact-title search samples across the 2,000-task dataset took
  56, 87, 106, 72, 68, 194, 202, 74, and 74 ms. The median was 74 ms.
- After the proxy was disconnected, a signed-in production reload reopened and
  searched the 2,000-task local cache in 1,148 ms. Reconnect returned the
  visible encrypted-sync state to current.

## Brain Dump

- Concurrent bullet additions from two rendered clients converged to the same
  ordered pair on both clients.
- Seventy sequential edits to one bullet converged on the second client in
  10,085 ms. Managed compaction retained only six active delta rows, below the
  64-update threshold.
- A third rendered client then sent 64 additional edits while both receiving
  clients were active. Both receivers converged on the final edit in
  11,635 ms, and competing compaction attempts again left only six active
  delta rows.
- With only the third client disconnected, its next Brain Dump edit rendered
  locally and remained absent from both connected clients. After reconnect,
  both receivers converged on that edit and the disconnected client retained
  it while reporting current encrypted sync.

## Evidence Boundary

This closes the managed-test rendered large-account, task network-transition,
two-client editing, Brain Dump offline/reconnect, sustained-volume, and
concurrent-compaction drills. It does not replace:

- production custom-SMTP email-code acceptance
- deferred Google or GitHub provider acceptance after social OAuth is released
- permission-granted Web Push in the supported release-browser matrix
- physical iOS or Android validation
- the one-hour connected deletion drill
- production repetition
- independent security, legal, privacy, or store review
