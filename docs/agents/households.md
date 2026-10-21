# Households and shared workspaces

An owner can share their workspace with up to five people (migration 100,
`lib/household.ts`, Settings › Household sharing). Access is decided in the
database, never by the app.

- The open workspace travels as the `hf_workspace` cookie; `supa()` sends it as
  the `x-workspace-owner` header and `public.active_owner()` honours it only for
  a household member. Routes use `workspaceOwner(auth)` for owner ids, never
  `auth.user.id`, and mark personal calls (backups, account deletion) with
  `personalRequest()`.
- Shared tables are listed in `public.shared_workspace_tables()`. Their
  policies, `user_id` defaults and functions use `public.active_owner()`, and a
  row trigger plus restrictive policies refuse writes from viewers. A new table
  with `user_id` must be classified there (or as personal) and a new function on
  shared tables must use `active_owner()`, not `auth.uid()`;
  `tests/households-sql.mjs` fails otherwise.
- Personal tables (preferences, Telegram, backups, app activity) keep
  `auth.uid()`. The Telegram bot always writes to the person's own workspace.
- Every account and transaction has an owner (migration 102): the whole
  household (`shared`) or one person (`member_id`); a shared record's `member_id`
  is who added it. Read it with `ownerOf` / `holdingOwner` from
  `lib/household.ts`, never from the columns directly. A new record takes its
  account's owner in the database; `set_account_owner` moves an account and the
  records that followed it, `set_record_owner` sets transactions. Everything
  from before owners, and anything of someone who left, is shared.
- Owners are filtered with `OwnerFilter` and shown with `OwnerAvatar`
  (Accounts, Transactions, Reports). Budget, goals, recurring and investments
  always show the whole household.
- Show sharing UI only when `sharedWorkspace()` is true. The sample workspace
  has a sample household of two (`demoHousehold`) so owners can be tried; it has
  no invites, and its owner changes run through the local copies
  (`assignOwner`, `moveAccountToOwner`).
