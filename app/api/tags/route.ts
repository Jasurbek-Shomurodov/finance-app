import { workspaceOwner } from '@/lib/household';
import { readOwnerRows } from '@/lib/server-records';
import { crossSite, parseAction, postgrestFailure, readJson, signInAgain } from '@/lib/api-route';
import { session, supa, sameOrigin } from '@/lib/supabase';
import { tagSchemas, type Tag, type TagLink } from '@/lib/tags';

const notSaved = 'Could not load tags. Check that the latest migrations are installed.';
const unavailable = () => Response.json({ error: notSaved }, { status: 503 });
/** The database's refusal keeps its status and words (a view-only member answers 403); only a missing function is a setup problem. */
const saved = (response: Response) => response.ok ? Response.json({ ok: true }) : postgrestFailure(response, notSaved, { codes: { '23505': 'A tag with this name already exists.', PGRST202: [notSaved, 503] } });

export async function GET() {
 try {
  const auth = await session(); if (!auth) return signInAgain();
  const [tags, links] = await Promise.all([readOwnerRows<Tag>('transaction_tags', auth.token, { select: 'id,name,color', order: 'created_at.asc,id.asc' }), readOwnerRows<TagLink>('transaction_tag_links', auth.token, { select: 'record_id,tag_id', order: 'record_id.asc,tag_id.asc' })]);
  return Response.json({ tags, links }, { headers: { 'Cache-Control': 'no-store' } });
 } catch { return unavailable(); }
}

export async function POST(req: Request) {
 if (!sameOrigin(req)) return crossSite();
 try {
  const auth = await session(); if (!auth) return signInAgain();
  const input = parseAction(await readJson(req), tagSchemas);
  if (!input) return Response.json({ error: 'Check the tag fields.' }, { status: 400 });
  if (input.action === 'delete') {
   return saved(await supa('/rest/v1/transaction_tags?id=eq.' + input.data.id, { method: 'DELETE' }, auth.token));
  }
  const tag = input.data;
  return saved(await supa('/rest/v1/transaction_tags?on_conflict=id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify({ id: tag.id, user_id: workspaceOwner(auth), name: tag.name, color: tag.color }) }, auth.token));
 } catch { return unavailable(); }
}
