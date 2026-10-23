# Scheduled payments link by id

A payment belongs to a recurring income or bill only through ids, never through a
name, amount or date that happens to match (migration 119).

- A payment of a schedule carries the schedule's id (`occurrence_record_id`) and the
  due date it pays (`occurrence_due_on`). Entry points name the schedule: Record
  payment, later payments, the bot's "Which scheduled payment is this?" question and
  the record forms' "Scheduled payment" field (`ScheduledPaymentField`). Both offer
  `paymentSchedules` from `lib/planning.ts` and apply a choice with `chooseSchedule`.
  A business or rent income that names none takes the id of the one active schedule
  of its business or property; with none or several it stays unlinked.
- A payment may be in another currency than its schedule (migration 120). It keeps
  its own amount and currency; the planning read counts it in the schedule's
  currency at the official rate of the payment's day (`inScheduleCurrency`,
  `lib/schedule-currency.ts`). Recurring counts a payment only in its schedule's
  currency; one it cannot convert shows "Exchange rate unavailable." and is
  missing from the month's totals, never the raw figure in the wrong currency.
- The database alone picks and checks the due date (`name_scheduled_payment`): the
  open payment of the payment's own month, else last month's, else it adds to this
  month's recorded one. The first payment settles the due date
  (`payment_occurrences.transaction_id`); a schedule id never changes afterwards.
  A payment of a custom spending category takes that category's one active bill
  (migration 137), when it is saved and when an edit or a bulk recategorisation
  moves it into the category; a category's bill may not move into a category that
  already has one (`guard_category_bill_move`, migration 138).
- Record payment is offered before the due date too (a salary paid early, the user's
  rule of 24 October 2026). The payment is dated the day it was paid (`paid_on`,
  never after today, never before the schedule starts) and settles the due date of
  the row it was opened from; the database takes a due date ahead only with
  `paid_on` (migration 155). `tests/early-scheduled-payment-sql.mjs` covers this.
- Every screen totals a due date the same way: its first payment plus the other
  payments naming it, through `laterPayments` in `lib/planning.ts` (Recurring and
  the planning read). Cash flow joins a payment to its schedule's card by the same
  id. Do not add another matching rule; extend this one.
- The older income fields are inputs to this one link, never a second one (migration
  140): a receipt of a fixed income source (`earning_source_id`, `earning_due_on`)
  and a salary recorded against a salary plan (`income_source_id`, `income_due_on`)
  get `occurrence_record_id` and `occurrence_due_on` from `name_scheduled_payment`
  as they are saved, and only the occurrence rows say what is settled
  (`settledOccurrences`). A saved payment that named no schedule may name one when
  it is edited (the forms offer the field then); a named schedule and its due date
  never change afterwards. In the sample workspace `demoScheduleLink` does the same
  on save. `tests/income-payments-one-link-sql.mjs` covers this.
- A schedule keeps its start date once saved: the forms show it locked. An "Every
  month" schedule picks its day with `MonthDayField` (the start month's days; a
  shorter month falls on its last day). Changing the day moves the start date within
  its month, and `move_schedule_day` (migration 141) moves every recorded or skipped
  occurrence, and the payments naming it, to that day of its own month; the sample
  workspace does the same through `onScheduleDays`. The amount and the currency may
  change after payments (they count at the day's rate, migration 120); the kind and
  the cadence may not. `tests/schedule-day-sql.mjs` covers this.
