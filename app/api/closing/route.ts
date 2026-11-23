// Closing and reopening accounts and holdings, closing, reopening and deleting investment accounts, and the question
// the delete confirmation asks first: what still points at this record (migration 168). Every call runs with the
// signed-in person's token, so row security and the household's view-only guard decide who may.
import { z } from 'zod';
import { isoDate, uuid } from '@/lib/api-validation';
import { blockersFrom } from '@/lib/account-deletion';
import { crossSite, parseAction, postgrestFailure, readJson, signInAgain } from '@/lib/api-route';
import { databaseUpdateMessage } from '@/lib/database-capabilities';
import { session, sameOrigin, supa } from '@/lib/supabase';

const schemas = {
 close: z.object({ id: uuid, closed_on: isoDate }),
 reopen: z.object({ id: uuid }),
 close_account: z.object({ id: uuid, closed_on: isoDate, move_to: uuid.nullable(), close_holdings: z.boolean() }),
 reopen_account: z.object({ id: uuid }),
 delete_account: z.object({ id: uuid }),
};
/** The database function behind each action, with its arguments. */
function call(input: NonNullable<ReturnType<typeof parseAction<typeof schemas>>>): [string, Record<string, unknown>] {
 if (input.action === 'close') return ['close_finance_record', { p_id: input.data.id, p_closed_on: input.data.closed_on }];
 if (input.action === 'reopen') return ['reopen_finance_record', { p_id: input.data.id }];
 if (input.action === 'close_account') return ['close_holding_account', { p_id: input.data.id, p_closed_on: input.data.closed_on, p_move_to: input.data.close_holdings ? null : input.data.move_to, p_close_holdings: input.data.close_holdings }];
 if (input.action === 'reopen_account') return ['reopen_holding_account', { p_id: input.data.id }];
 return ['delete_holding_account', { p_id: input.data.id }];
}
const missing = { codes: { PGRST202: [databaseUpdateMessage, 503] as const } };

/** What still points at an account or holding: the delete confirmation offers Delete only when this is empty. */
export async function GET(req: Request) {
 try {
  const auth = await session();
  if (!auth) return signInAgain();
  const id = uuid.safeParse(new URL(req.url).searchParams.get('id'));
  if (!id.success) return Response.json({ error: 'Check the record fields.' }, { status: 400 });
  const response = await supa('/rest/v1/rpc/record_delete_blockers', { method: 'POST', body: JSON.stringify({ p_id: id.data }) }, auth.token);
  if (!response.ok) return postgrestFailure(response, 'Could not check this record. Please try again.', missing);
  const named = await response.json() as unknown;
  return Response.json({ blockers: blockersFrom(Array.isArray(named) ? named.join(',') : '') }, { headers: { 'Cache-Control': 'no-store' } });
 } catch { return Response.json({ error: 'Connection unavailable. Please try again.' }, { status: 503 }); }
}

export async function POST(req: Request) {
 if (!sameOrigin(req)) return crossSite();
 try {
  const auth = await session();
  if (!auth) return signInAgain();
  const input = parseAction(await readJson(req), schemas);
  if (!input) return Response.json({ error: 'Check the account fields.' }, { status: 400 });
  const [name, args] = call(input);
  const response = await supa('/rest/v1/rpc/' + name, { method: 'POST', body: JSON.stringify(args) }, auth.token);
  // The database says why in words meant for people: a balance left, a goal saved in the account, a closed account.
  if (!response.ok) return postgrestFailure(response, 'Could not save changes.', missing);
  return Response.json({ ok: true });
 } catch { return Response.json({ error: 'Connection unavailable. Please try again.' }, { status: 503 }); }
}
