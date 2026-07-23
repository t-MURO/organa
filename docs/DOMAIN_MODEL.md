# Organa Domain Model

Status recorded on 2026-07-23.

This document resolves the MVP domain decisions left open in
`REQUIREMENTS.md`. The executable rules live in `packages/domain`; this
document names those rules and explains the user-facing policy.

## Core Terms

- **Task:** One actionable item with optional planning, due, reminder, subtask,
  recurrence, and task-type settings.
- **Occurrence:** One historical instance of a recurring task. Occurrences are
  stored as individual task records rather than rewriting one record.
- **Series:** The ordered occurrence history connected by `seriesId`,
  `previousOccurrenceId`, and `occurrenceNumber`.
- **Planned date:** The local calendar day on which the user intends to see the
  task in daily planning.
- **Due date:** An optional local calendar deadline represented by `dueDate`.
- **Due time:** An optional exact deadline represented by `dueAt`; it exists
  only when the user supplies both a due date and a due time.
- **Grace days:** A pressure-free calendar cushion before an active recurring
  occurrence is described as overdue.
- **Reminder:** A local before-due, at-due, or after-due alert anchored to an
  exact due time.

## Task Invariants

- A task can exist without planning or due dates.
- A date-only deadline does not invent an end-of-day time and cannot schedule
  an exact-time reminder.
- Title is required after trimming.
- Completion changes only through the task checkbox.
- Completion and medication dose confirmation are separate transitions.
- A completed task keeps its original configuration and subtask states as
  history.
- Reopening removes completion and dose-confirmation timestamps.
- Undated, today, future, grace-window, overdue, and completed tasks all remain
  addressable through the task inbox and search.

## Recurrence Grammar

The controlled-beta grammar supports:

- Daily recurrence every positive whole-number interval of days
- Weekly recurrence every positive whole-number interval of weeks
- Optional multiple weekdays for a weekly recurrence
- Monthly recurrence every positive whole-number interval of months

Rules:

- Invalid, zero, negative, or fractional intervals are rejected at the domain
  boundary.
- Weekly weekdays use `0` for Sunday through `6` for Saturday. Duplicates are
  removed and invalid values are rejected.
- A weekly rule without selected weekdays repeats on the occurrence's weekday.
- With multiple weekdays, later selected days in the active week occur first.
  After the final selected day, Organa skips `interval - 1` whole weeks before
  returning to the first selected day.
- Monthly rules preserve their original day as an anchor. A task anchored to
  the 29th, 30th, or 31st clamps to a shorter month's final day and returns to
  the anchor when a later month supports it.
- A generated occurrence shifts its due time by the same number of local
  calendar days as its planned date, preserving the intended local clock time
  through daylight-saving changes.
- A generated occurrence shifts a date-only deadline by the same number of
  local calendar days without adding an exact time.
- Recurrence has no end date in the MVP. Removing recurrence from an active
  occurrence stops future generation.

## Completion And Missed Dates

- Completing a recurring occurrence creates at most one next active
  occurrence.
- The completed record is retained unchanged as history.
- If the completed occurrence is behind today's local date, unmaterialized
  schedule dates through today are skipped. The next occurrence is the first
  valid recurrence after today.
- Skipped dates do not create failure records, streak penalties, or a backlog
  of tasks. This is intentional pressure-free behavior.
- Reopening a completed occurrence removes its directly generated active child
  when that child is still present, avoiding duplicate active occurrences.

## Grace Days

- Grace days apply to recurring routines and medication tasks, not one-off
  tasks.
- Each occurrence receives its task's configured allowance of zero to three
  local calendar days.
- Grace is automatic; users do not spend tokens or acknowledge failure.
- For an exact due time, the overdue threshold moves by the configured number
  of local calendar days while retaining the clock time.
- A date-only deadline remains active for its full local due date and all
  configured grace dates.
- Without a due date, a planned occurrence becomes overdue only after its
  planned date and all configured grace dates have passed.
- Grace changes classification only. It does not rewrite the planned date,
  delay reminders, alter completion history, or shift the recurrence anchor.
- Usage and remaining allowance are derived from the current date, so they
  reset naturally when the next occurrence is created and do not require a
  separate mutable counter.

## Parent And Subtask Completion

- Completing a subtask never completes its parent automatically.
- Completing a parent is allowed while subtasks remain incomplete.
- Incomplete and completed subtask states remain visible on the completed
  occurrence as history.
- A recurring task's next occurrence resets every subtask to incomplete.
- Reopening a parent preserves the subtask states recorded on that occurrence.
- Completing or reopening a subtask immediately reconciles scheduled local
  alerts so a finished step cannot leave a stale reminder.

## Medication Tasks

- Medication is a specialized task kind using the same recurrence, reminder,
  grace, subtask, and completion rules.
- Dose confirmation is optional and available only after normal task
  completion.
- Dose confirmation is an organizational record, not clinical guidance or a
  medical-device claim.

## Conflict And History Policy

- Each occurrence is a separate encrypted task record.
- Completion never overwrites an earlier occurrence with the next date.
- Field-level synchronization merges unrelated changes and resolves the same
  field by the repository's deterministic version rule.
- Realtime signals are hints; durable reconciliation remains authoritative.
