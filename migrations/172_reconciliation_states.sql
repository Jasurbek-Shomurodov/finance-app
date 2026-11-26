-- Statement reconciliation, second step (docs/feature-opportunities-2026-09.md, priority 1).
--
-- Migration 066 kept a reconciled statement valid only while a fingerprint of the
-- whole account (its balance and revision included) stayed the same, so any later
-- payment, even one long after the statement's closing date, made every earlier
-- statement read as broken. A reconciled statement now stays matched while every
-- entry it cleared still reads as it did: it still exists on this account, with the
-- same amount, dated no later than the statement's closing date. An entry added
-- later, or dated after the statement, leaves it matched; editing, deleting or
-- moving a reconciled entry reopens it and names the entry.
--
-- Each entry of an account has one of three states, derived from the saved
-- statements rather than stored on the transaction: reconciled (cleared in a
-- reconciled statement), cleared (ticked in a draft) or pending (neither).
--
-- statement_review returns what the review dialog needs in one read: the period
-- (by default the day after the last reconciled statement, through today), the
-- entries to tick, the last reconciled statement before the period (whose closing
-- balance opens the next one) and the app balance just before and at the end of the
-- period, so the dialog can explain why the app balance differs from the bank's.
BEGIN;

-- Reconciled entries of an account's reconciled statements that no longer read as they
-- did when reconciled. One pass over the account's entries serves every statement.
CREATE OR REPLACE FUNCTION public.account_reconciliation_changes(p_account uuid)
RETURNS TABLE(statement_id uuid,key text,name text,was_date date,was_amount numeric,now_date date,now_amount numeric)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 WITH kept AS (
  SELECT r.id AS statement_id,r.end_date,e->>'key' AS key,e->>'name' AS name,(e->>'date')::date AS date,(e->>'amount')::numeric AS amount
  FROM public.account_reconciliations r CROSS JOIN LATERAL jsonb_array_elements(r.ledger) e
  WHERE r.user_id=public.active_owner() AND r.account_id=p_account AND r.status='reconciled' AND e->>'key'=ANY(r.cleared)
 ), current_legs AS (
  SELECT l.key,l.name,l.date,l.amount FROM public.account_statement_legs(p_account,'-infinity'::date,'infinity'::date) l
  WHERE EXISTS(SELECT 1 FROM kept k WHERE k.key=l.key)
 )
 SELECT k.statement_id,k.key,coalesce(c.name,k.name),k.date,k.amount,c.date,c.amount
 FROM kept k LEFT JOIN current_legs c ON c.key=k.key
 WHERE c.key IS NULL OR c.amount<>k.amount OR c.date>k.end_date
 ORDER BY k.statement_id,k.date,k.key
$$;
REVOKE ALL ON FUNCTION public.account_reconciliation_changes(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.account_reconciliation_changes(uuid) TO authenticated;

-- Each cash account's latest reconciled statement and whether it still matches.
CREATE OR REPLACE FUNCTION public.reconciliation_status() RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('account_id',a.id,'name',a.name,'end_date',r.end_date,
  'valid',coalesce(r.id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.account_reconciliation_changes(a.id) c WHERE c.statement_id=r.id),false)) ORDER BY a.id),'[]')
 FROM public.finance_records a LEFT JOIN LATERAL(SELECT * FROM public.account_reconciliations r WHERE r.user_id=public.active_owner() AND r.account_id=a.id AND r.status='reconciled' ORDER BY r.end_date DESC,r.id LIMIT 1) r ON true
 WHERE a.user_id=public.active_owner() AND a.kind='Cash';
$$;
REVOKE ALL ON FUNCTION public.reconciliation_status() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.reconciliation_status() TO authenticated;

-- The review dialog's read. A missing start or end chooses the next period.
CREATE OR REPLACE FUNCTION public.statement_review(p_account uuid,p_start date,p_end date) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public AS $$
DECLARE owner uuid:=public.active_owner(); today date:=(now() AT TIME ZONE 'Asia/Tashkent')::date; account public.finance_records;
 prior public.account_reconciliations; first_day date; last_day date; state jsonb; from_start numeric; after_end numeric; changes jsonb;
BEGIN
 IF owner IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 SELECT * INTO account FROM public.finance_records WHERE id=p_account AND user_id=owner AND kind='Cash';
 IF NOT FOUND THEN RAISE EXCEPTION 'Choose one of your cash accounts.'; END IF;
 last_day:=coalesce(p_end,today);
 first_day:=coalesce(p_start,(SELECT max(r.end_date)+1 FROM public.account_reconciliations r WHERE r.user_id=owner AND r.account_id=p_account AND r.status='reconciled' AND r.end_date<last_day),date_trunc('month',last_day)::date);
 -- Validates the dates and the account, and gives the entries and the save fingerprint.
 state:=public.account_statement(p_account,first_day,last_day);
 SELECT * INTO prior FROM public.account_reconciliations r WHERE r.user_id=owner AND r.account_id=p_account AND r.status='reconciled' AND r.end_date<first_day ORDER BY r.end_date DESC,r.id LIMIT 1;
 SELECT coalesce(sum(l.amount),0) INTO from_start FROM public.account_statement_legs(p_account,first_day,'infinity'::date) l;
 SELECT coalesce(sum(l.amount),0) INTO after_end FROM public.account_statement_legs(p_account,last_day+1,'infinity'::date) l;
 SELECT coalesce(jsonb_object_agg(c.statement_id,c.items),'{}') INTO changes FROM (
  SELECT x.statement_id,jsonb_agg(jsonb_build_object('key',x.key,'name',x.name,'was_date',x.was_date,'was_amount',x.was_amount,'now_date',x.now_date,'now_amount',x.now_amount) ORDER BY x.was_date,x.key) AS items
  FROM public.account_reconciliation_changes(p_account) x GROUP BY x.statement_id) c;
 RETURN state||jsonb_build_object('from',first_day,'to',last_day,
  -- What the app's balance was, worked back from today's balance through the recorded entries.
  'balance_before',account.amount-from_start,'balance_at_end',account.amount-after_end,
  'previous',CASE WHEN prior.id IS NULL THEN NULL ELSE jsonb_build_object('id',prior.id,'end_date',prior.end_date,'closing_balance',prior.closing_balance) END,
  'changes',changes);
END $$;
REVOKE ALL ON FUNCTION public.statement_review(uuid,date,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.statement_review(uuid,date,date) TO authenticated;

-- The capability version moves to 172, so the app can ask for this migration.
CREATE OR REPLACE FUNCTION public.finance_capabilities() RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT jsonb_build_object('schema_version',172,'record_revisions',true,'verified_restore',true)
$$;

NOTIFY pgrst,'reload schema';
COMMIT;
