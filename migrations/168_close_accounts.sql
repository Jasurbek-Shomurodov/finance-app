-- Closing and deleting accounts (product map, "Closing and deleting accounts"). Apply after 167.
-- Close retires an account or holding that has history: `closed_on` keeps every day before it and counts nothing from
-- it. Delete is for mistakes and means "this never existed" on every surface: the record's own balance history goes
-- to Recently deleted with it, the daily snapshots give its value back, and Restore returns all of it.
-- Existing rows are not changed: the new columns are empty (`closed_on`, `parts`) or an empty list
-- (`snapshot_changes`), no record is closed and no snapshot is rewritten. Re-runnable.
BEGIN;

ALTER TABLE public.finance_records ADD COLUMN IF NOT EXISTS closed_on date;
ALTER TABLE public.holding_accounts ADD COLUMN IF NOT EXISTS closed_on date;
-- What a deleted record took out of each daily snapshot, so Restore puts back exactly that. Empty by default and
-- allowed to be missing, so a backup made before this migration still restores its Recently deleted items.
ALTER TABLE public.deleted_items ADD COLUMN IF NOT EXISTS snapshot_changes jsonb DEFAULT '[]'::jsonb;
-- Each record's own value inside a day's totals, in US dollars. Snapshots from before this migration have none.
ALTER TABLE public.portfolio_snapshots ADD COLUMN IF NOT EXISTS parts jsonb;
ALTER TABLE public.portfolio_snapshots DROP CONSTRAINT IF EXISTS portfolio_snapshots_parts_check;
ALTER TABLE public.portfolio_snapshots ADD CONSTRAINT portfolio_snapshots_parts_check CHECK (parts IS NULL OR jsonb_typeof(parts)='object');

-- A closed record is worth nothing and stays that way until it is reopened; an open holding never sits in a closed
-- investment account. Every path is held to it: the close functions below, a direct update, a restored transaction.
CREATE OR REPLACE FUNCTION public.guard_closed_record() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE empty boolean; today date:=(now() AT TIME ZONE 'Asia/Tashkent')::date;
BEGIN
 -- A verified restore brings records back exactly as they were saved.
 IF public.finance_restore_active() THEN RETURN NEW; END IF;
 IF NEW.closed_on IS NULL THEN
  IF NEW.holding_account_id IS NOT NULL
   AND (TG_OP='INSERT' OR NEW.holding_account_id IS DISTINCT FROM OLD.holding_account_id OR OLD.closed_on IS NOT NULL)
   AND EXISTS(SELECT 1 FROM public.holding_accounts h WHERE h.id=NEW.holding_account_id AND h.user_id=NEW.user_id AND h.closed_on IS NOT NULL) THEN
   RAISE EXCEPTION 'This investment account is closed. Reopen it first.';
  END IF;
  RETURN NEW;
 END IF;
 IF NEW.kind NOT IN ('Cash','Stock','Crypto','Deposit','Treasury bill','Bond','Property','Business','Valuables','Vehicle','Retirement account','Precious metals','Equity compensation','Money lent','Mortgage','Loan','Debt') THEN
  RAISE EXCEPTION 'Only accounts and holdings can be closed.';
 END IF;
 IF NEW.closed_on>today OR (NEW.opened_on IS NOT NULL AND NEW.closed_on<NEW.opened_on) THEN RAISE EXCEPTION 'Check the closing date.'; END IF;
 empty:=CASE
  WHEN NEW.kind IN ('Stock','Crypto','Precious metals','Equity compensation') THEN NEW.quantity=0 OR NEW.amount=0
  WHEN NEW.unit_label IS NOT NULL AND NEW.kind IN ('Property','Business','Valuables','Vehicle','Retirement account') THEN NEW.quantity=0 OR NEW.amount=0
  ELSE NEW.amount=0 END;
 IF NOT empty THEN
  IF TG_OP='UPDATE' AND OLD.closed_on IS NOT NULL THEN RAISE EXCEPTION 'This account is closed. Reopen it before changing its balance.'; END IF;
  RAISE EXCEPTION 'Bring the balance to zero before closing.';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_closed_record() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS guard_closed_record ON public.finance_records;
CREATE TRIGGER guard_closed_record BEFORE INSERT OR UPDATE ON public.finance_records FOR EACH ROW EXECUTE FUNCTION public.guard_closed_record();

CREATE OR REPLACE FUNCTION public.guard_closed_holding_account() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF public.finance_restore_active() OR NEW.closed_on IS NULL THEN RETURN NEW; END IF;
 IF NEW.closed_on>(now() AT TIME ZONE 'Asia/Tashkent')::date THEN RAISE EXCEPTION 'Check the closing date.'; END IF;
 IF EXISTS(SELECT 1 FROM public.finance_records r WHERE r.holding_account_id=NEW.id AND r.user_id=NEW.user_id AND r.closed_on IS NULL) THEN
  RAISE EXCEPTION 'Close or move the holdings in this account first.';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_closed_holding_account() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS guard_closed_holding_account ON public.holding_accounts;
CREATE TRIGGER guard_closed_holding_account BEFORE INSERT OR UPDATE ON public.holding_accounts FOR EACH ROW EXECUTE FUNCTION public.guard_closed_holding_account();

-- Close and reopen run as the caller, so row security and the view-only guard decide who may.
CREATE OR REPLACE FUNCTION public.close_finance_record(p_id uuid,p_closed_on date) RETURNS void
LANGUAGE plpgsql SET search_path=public AS $$
DECLARE owner uuid:=public.active_owner(); r public.finance_records; day date:=coalesce(p_closed_on,(now() AT TIME ZONE 'Asia/Tashkent')::date);
BEGIN
 IF owner IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 SELECT * INTO r FROM public.finance_records WHERE id=p_id AND user_id=owner FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Record not found.'; END IF;
 IF r.closed_on IS NOT NULL THEN RETURN; END IF;
 IF EXISTS(SELECT 1 FROM public.savings_goals g WHERE g.account_id=p_id AND g.user_id=owner AND NOT g.archived) THEN
  RAISE EXCEPTION 'Move or archive the goals saved in this account before closing it.';
 END IF;
 -- What a business or property is expected to pay ends with it: its income schedule is stopped by its owner first, and
 -- its own monthly estimate is cleared below, so no forecast counts income from something that is gone.
 IF EXISTS(SELECT 1 FROM public.finance_records t WHERE t.income_source_id=p_id AND t.user_id=owner AND t.frequency<>'Once'
  AND NOT t.archived AND NOT t.source_paused AND (t.end_date IS NULL OR t.end_date>day)) THEN
  RAISE EXCEPTION 'Stop or archive its recurring income before closing it.';
 END IF;
 IF EXISTS(SELECT 1 FROM public.finance_records t WHERE t.account_id=p_id AND t.user_id=owner AND t.date>day)
  OR EXISTS(SELECT 1 FROM public.account_activity a WHERE (a.account_id=p_id OR a.target_id=p_id) AND a.user_id=owner AND a.occurred_on>day)
  OR EXISTS(SELECT 1 FROM public.asset_movements m WHERE (m.source_id=p_id OR m.target_id=p_id) AND m.user_id=owner AND m.occurred_on>day)
  OR EXISTS(SELECT 1 FROM public.investment_history h WHERE h.record_id=p_id AND h.user_id=owner AND h.event_type NOT IN ('baseline','valuation') AND h.occurred_on>day) THEN
  RAISE EXCEPTION 'This account has activity after that day. Choose a later closing day.';
 END IF;
 UPDATE public.finance_records SET closed_on=day,estimated_monthly_income=0 WHERE id=p_id AND user_id=owner;
END $$;

CREATE OR REPLACE FUNCTION public.reopen_finance_record(p_id uuid) RETURNS void
LANGUAGE plpgsql SET search_path=public AS $$
DECLARE owner uuid:=public.active_owner();
BEGIN
 IF owner IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 UPDATE public.finance_records SET closed_on=NULL WHERE id=p_id AND user_id=owner AND closed_on IS NOT NULL;
END $$;

-- An investment account closes with its holdings: they move to another account (or to none), or close with it.
CREATE OR REPLACE FUNCTION public.close_holding_account(p_id uuid,p_closed_on date,p_move_to uuid,p_close_holdings boolean) RETURNS void
LANGUAGE plpgsql SET search_path=public AS $$
DECLARE owner uuid:=public.active_owner(); a public.holding_accounts; day date:=coalesce(p_closed_on,(now() AT TIME ZONE 'Asia/Tashkent')::date);
BEGIN
 IF owner IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 SELECT * INTO a FROM public.holding_accounts WHERE id=p_id AND user_id=owner FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Account or holding not found.'; END IF;
 IF a.closed_on IS NOT NULL THEN RETURN; END IF;
 IF EXISTS(SELECT 1 FROM public.savings_goals g WHERE g.user_id=owner AND NOT g.archived AND (g.holding_account_id=p_id OR g.investment_targets @> jsonb_build_array(jsonb_build_object('holding_account_id',p_id)))) THEN
  RAISE EXCEPTION 'Update the investment goals before removing or changing this account.';
 END IF;
 IF coalesce(p_close_holdings,false) THEN
  UPDATE public.finance_records SET closed_on=day WHERE holding_account_id=p_id AND user_id=owner AND closed_on IS NULL;
 ELSE
  IF p_move_to=p_id THEN RAISE EXCEPTION 'Choose one of your matching stock or crypto accounts.'; END IF;
  UPDATE public.finance_records SET holding_account_id=p_move_to WHERE holding_account_id=p_id AND user_id=owner AND closed_on IS NULL;
 END IF;
 UPDATE public.holding_accounts SET closed_on=day WHERE id=p_id AND user_id=owner;
END $$;

-- Reopening brings back the holdings that closed with the account on the same day.
CREATE OR REPLACE FUNCTION public.reopen_holding_account(p_id uuid) RETURNS void
LANGUAGE plpgsql SET search_path=public AS $$
DECLARE owner uuid:=public.active_owner(); a public.holding_accounts;
BEGIN
 IF owner IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 SELECT * INTO a FROM public.holding_accounts WHERE id=p_id AND user_id=owner FOR UPDATE;
 IF NOT FOUND OR a.closed_on IS NULL THEN RETURN; END IF;
 UPDATE public.holding_accounts SET closed_on=NULL WHERE id=p_id AND user_id=owner;
 UPDATE public.finance_records SET closed_on=NULL WHERE holding_account_id=p_id AND user_id=owner AND closed_on=a.closed_on;
END $$;

-- An investment account with nothing in it can be deleted. One that still names holdings (open, closed or in
-- Recently deleted on their way back) is closed instead.
GRANT DELETE ON public.holding_accounts TO authenticated;
CREATE OR REPLACE FUNCTION public.delete_holding_account(p_id uuid) RETURNS void
LANGUAGE plpgsql SET search_path=public AS $$
DECLARE owner uuid:=public.active_owner();
BEGIN
 IF owner IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 IF EXISTS(SELECT 1 FROM public.finance_records r WHERE r.holding_account_id=p_id AND r.user_id=owner) THEN
  RAISE EXCEPTION 'This account still has holdings. Move or delete them first, or close the account instead.';
 END IF;
 IF EXISTS(SELECT 1 FROM public.savings_goals g WHERE g.user_id=owner AND (g.holding_account_id=p_id OR g.investment_targets @> jsonb_build_array(jsonb_build_object('holding_account_id',p_id)))) THEN
  RAISE EXCEPTION 'Update the investment goals before removing or changing this account.';
 END IF;
 DELETE FROM public.holding_accounts WHERE id=p_id AND user_id=owner;
 IF NOT FOUND THEN RAISE EXCEPTION 'Account or holding not found.'; END IF;
END $$;

-- What still points at an account or holding, by the name the app shows for it. An empty answer means Delete will
-- go through; the confirmation asks this before it offers Delete, and the archive trigger asks it again.
CREATE OR REPLACE FUNCTION public.record_delete_blockers(p_id uuid) RETURNS text[]
LANGUAGE sql STABLE SET search_path=public AS $$
 SELECT array_remove(ARRAY[
  CASE WHEN EXISTS(SELECT 1 FROM public.finance_records t WHERE t.account_id=p_id OR t.business_id=p_id)
   OR EXISTS(SELECT 1 FROM public.finance_records t JOIN public.investment_history h ON h.id=t.history_event_id WHERE h.record_id=p_id) THEN 'transactions' END,
  -- An asset's expected income is a schedule of its own (a rent or interest plan), with the receipts recorded for it.
  CASE WHEN EXISTS(SELECT 1 FROM public.finance_records t WHERE t.income_source_id=p_id)
   OR EXISTS(SELECT 1 FROM public.income_sources s WHERE s.linked_record_id=p_id) THEN 'schedules' END,
  CASE WHEN EXISTS(SELECT 1 FROM public.asset_movements m WHERE m.source_id=p_id OR m.target_id=p_id)
   OR EXISTS(SELECT 1 FROM public.account_activity a WHERE a.account_id=p_id OR a.target_id=p_id) THEN 'transfers' END,
  CASE WHEN EXISTS(SELECT 1 FROM public.investment_account_links l WHERE l.account_id=p_id)
   OR EXISTS(SELECT 1 FROM public.investment_account_links l JOIN public.investment_history h ON h.id=l.id WHERE h.record_id=p_id)
   OR EXISTS(SELECT 1 FROM public.mortgage_payments p WHERE p.mortgage_id=p_id)
   OR EXISTS(SELECT 1 FROM public.payment_occurrences o WHERE o.record_id=p_id) THEN 'payments' END,
  CASE WHEN EXISTS(SELECT 1 FROM public.savings_goals g WHERE g.account_id=p_id) THEN 'goals' END,
  CASE WHEN EXISTS(SELECT 1 FROM public.corporate_events e WHERE e.record_id=p_id OR e.target_id=p_id) THEN 'events' END,
  CASE WHEN EXISTS(SELECT 1 FROM public.account_reconciliations c WHERE c.account_id=p_id) THEN 'statements' END
 ],NULL)
$$;

-- Takes a record out of the daily snapshots, as if it had never been counted, and answers what it took from each
-- day. A day that kept its parts gives back exactly the record's part. An older day gives back the balance the
-- record had recorded by then, at its owned share, at that day's own rates.
CREATE OR REPLACE FUNCTION public.remove_from_portfolio_snapshots(p_owner uuid,p_record uuid,p_kind text,p_currency text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s record; v numeric; rate numeric; exact boolean; owed boolean:=p_kind IN ('Mortgage','Loan','Debt'); changes jsonb:='[]'::jsonb;
BEGIN
 FOR s IN SELECT occurred_on,assets,debt,rates,parts FROM public.portfolio_snapshots WHERE user_id=p_owner ORDER BY occurred_on FOR UPDATE LOOP
  exact:=s.parts IS NOT NULL;
  IF exact THEN
   v:=CASE WHEN jsonb_typeof(s.parts->(p_record::text))='number' THEN (s.parts->>(p_record::text))::numeric END;
  ELSE
   rate:=CASE WHEN p_currency='USD' THEN 1 WHEN jsonb_typeof(s.rates->p_currency)='number' THEN (s.rates->>p_currency)::numeric END;
   v:=(SELECT h.balance*h.ownership_percentage/100 FROM public.investment_history h
    WHERE h.record_id=p_record AND h.balance IS NOT NULL AND h.occurred_on<=s.occurred_on
    ORDER BY h.occurred_on DESC,h.created_at DESC,h.id DESC LIMIT 1);
   v:=CASE WHEN rate>0 THEN v/rate END;
  END IF;
  v:=least(coalesce(v,0),CASE WHEN owed THEN s.debt ELSE s.assets END);
  CONTINUE WHEN v<=0;
  UPDATE public.portfolio_snapshots SET assets=assets-CASE WHEN owed THEN 0 ELSE v END,debt=debt-CASE WHEN owed THEN v ELSE 0 END,
   parts=CASE WHEN exact THEN parts-(p_record::text) ELSE parts END
  WHERE user_id=p_owner AND occurred_on=s.occurred_on;
  changes:=changes||jsonb_build_object('d',s.occurred_on,'v',v,'x',exact);
 END LOOP;
 RETURN changes;
END $$;
REVOKE ALL ON FUNCTION public.remove_from_portfolio_snapshots(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;

-- Restore gives each day back what the delete took. The days the record spent in Recently deleted carry the value
-- it left with, when it still had one on its last day.
CREATE OR REPLACE FUNCTION public.restore_snapshot_changes(p_owner uuid,p_record uuid,p_kind text,p_changes jsonb,p_deleted date) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c record; last_day date; last_value numeric; owed boolean:=p_kind IN ('Mortgage','Loan','Debt');
BEGIN
 IF p_changes IS NULL OR jsonb_typeof(p_changes)<>'array' THEN RETURN; END IF;
 FOR c IN SELECT (x->>'d')::date AS d,(x->>'v')::numeric AS v,coalesce((x->>'x')::boolean,false) AS x FROM jsonb_array_elements(p_changes) x ORDER BY 1 LOOP
  UPDATE public.portfolio_snapshots SET assets=assets+CASE WHEN owed THEN 0 ELSE c.v END,debt=debt+CASE WHEN owed THEN c.v ELSE 0 END,
   parts=CASE WHEN c.x AND parts IS NOT NULL THEN parts||jsonb_build_object(p_record::text,c.v) ELSE parts END
  WHERE user_id=p_owner AND occurred_on=c.d;
  last_day:=c.d; last_value:=c.v;
 END LOOP;
 IF last_day IS NULL OR EXISTS(SELECT 1 FROM public.portfolio_snapshots WHERE user_id=p_owner AND occurred_on>last_day AND occurred_on<p_deleted) THEN RETURN; END IF;
 UPDATE public.portfolio_snapshots SET assets=assets+CASE WHEN owed THEN 0 ELSE last_value END,debt=debt+CASE WHEN owed THEN last_value ELSE 0 END,
  parts=CASE WHEN parts IS NOT NULL THEN parts||jsonb_build_object(p_record::text,last_value) ELSE parts END
 WHERE user_id=p_owner AND occurred_on>last_day;
END $$;
REVOKE ALL ON FUNCTION public.restore_snapshot_changes(uuid,uuid,text,jsonb,date) FROM PUBLIC,anon,authenticated;

-- Deleting an account or holding: refused, by name, while something else still points at it; otherwise its whole
-- balance history (the automatic snapshots of its balance and its own updates) is archived and removed with it.
-- Transactions and schedules keep their rule: they have no history of their own.
CREATE OR REPLACE FUNCTION public.archive_deleted_item() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE snapshots jsonb:='[]'::jsonb; changes jsonb:='[]'::jsonb; blockers text[]; held boolean:=false;
BEGIN
 IF public.finance_restore_active() THEN
  IF TG_LEVEL='STATEMENT' THEN RETURN NULL; ELSIF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
 END IF;
 IF OLD.user_id=public.active_owner() AND EXISTS(SELECT 1 FROM auth.users WHERE id=OLD.user_id) THEN
  IF TG_TABLE_NAME='finance_records' THEN
   held:=OLD.kind IN ('Cash','Stock','Crypto','Deposit','Treasury bill','Bond','Property','Business','Valuables','Vehicle','Retirement account','Precious metals','Equity compensation','Money lent','Mortgage','Loan','Debt');
   IF held THEN
    blockers:=public.record_delete_blockers(OLD.id);
    IF cardinality(blockers)>0 THEN
     RAISE EXCEPTION 'This record still has linked items. Delete or move them first, or close it instead.' USING DETAIL=array_to_string(blockers,',');
    END IF;
    changes:=public.remove_from_portfolio_snapshots(OLD.user_id,OLD.id,OLD.kind,OLD.currency);
   ELSIF EXISTS(SELECT 1 FROM public.investment_history WHERE record_id=OLD.id AND event_type<>'baseline') THEN
    RAISE EXCEPTION 'This record has saved tracker updates or transactions and cannot be deleted.';
   END IF;
   SELECT coalesce(jsonb_agg(to_jsonb(h) ORDER BY h.created_at,h.id),'[]'::jsonb) INTO snapshots
    FROM public.investment_history h WHERE record_id=OLD.id AND user_id=public.active_owner();
   DELETE FROM public.investment_history WHERE record_id=OLD.id AND user_id=public.active_owner() AND (held OR event_type='baseline');
  END IF;
  INSERT INTO public.deleted_items(user_id,source,data,history,snapshot_changes) VALUES(OLD.user_id,TG_TABLE_NAME,to_jsonb(OLD),snapshots,changes);
 END IF;
 RETURN OLD;
END $$;
REVOKE ALL ON FUNCTION public.archive_deleted_item() FROM PUBLIC,anon,authenticated;

-- Restore: a holding whose investment account was deleted or closed meanwhile comes back outside it, and the daily
-- snapshots get back what the delete took. A closed record returns closed (its snapshot carries `closed_on`).
DO $patch$
DECLARE definition text:=pg_get_functiondef('public.restore_deleted_item(uuid)'::regprocedure); found integer;
 linked_old text:=$old$ IF item.linked_operation IS NOT NULL THEN PERFORM public.restore_linked_transaction(item.id); RETURN; END IF;$old$;
 linked_new text:=$new$ IF item.source='finance_records' AND item.data->>'holding_account_id' IS NOT NULL
  AND NOT EXISTS(SELECT 1 FROM public.holding_accounts h WHERE h.id=(item.data->>'holding_account_id')::uuid AND h.user_id=public.active_owner()
   AND (h.closed_on IS NULL OR item.data->>'closed_on' IS NOT NULL)) THEN
  UPDATE public.deleted_items SET data=data||jsonb_build_object('holding_account_id',NULL) WHERE id=item.id;
 END IF;
 IF item.linked_operation IS NOT NULL THEN PERFORM public.restore_linked_transaction(item.id); RETURN; END IF;$new$;
 splits_old text:=$old$ IF item.source='finance_records' AND jsonb_array_length(item.splits)>0 THEN PERFORM public.save_transaction_splits((item.data->>'id')::uuid,item.splits); END IF;$old$;
 splits_new text:=$new$ IF item.source='finance_records' AND jsonb_array_length(item.splits)>0 THEN PERFORM public.save_transaction_splits((item.data->>'id')::uuid,item.splits); END IF;
 IF item.source='finance_records' AND jsonb_array_length(item.snapshot_changes)>0 THEN
  PERFORM public.restore_snapshot_changes(public.active_owner(),(item.data->>'id')::uuid,item.data->>'kind',item.snapshot_changes,(item.deleted_at AT TIME ZONE 'Asia/Tashkent')::date);
 END IF;$new$;
BEGIN
 IF position('restore_snapshot_changes' IN definition)>0 THEN RETURN; END IF;
 found:=(length(definition)-length(replace(definition,linked_old,'')))/length(linked_old);
 IF found<>1 THEN RAISE EXCEPTION 'Unexpected definition of restore_deleted_item (% matches). Apply migrations in order.',found; END IF;
 definition:=replace(definition,linked_old,linked_new);
 found:=(length(definition)-length(replace(definition,splits_old,'')))/length(splits_old);
 IF found<>1 THEN RAISE EXCEPTION 'Unexpected definition of restore_deleted_item (% matches). Apply migrations in order.',found; END IF;
 EXECUTE replace(definition,splits_old,splits_new);
END $patch$;

-- A day's snapshot keeps each record's part of it, so a record deleted later leaves that day exactly.
CREATE OR REPLACE FUNCTION public.capture_portfolio_snapshot(p_assets numeric,p_debt numeric,p_rates jsonb,p_parts jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE result public.portfolio_snapshots;
BEGIN
 IF public.active_owner() IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 IF jsonb_typeof(p_rates) IS DISTINCT FROM 'object' OR (p_rates->'USD') IS DISTINCT FROM '1'::jsonb THEN RAISE EXCEPTION 'Invalid exchange rates'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_each(p_rates) r WHERE r.key !~ '^[A-Z]{3}$' OR CASE WHEN jsonb_typeof(r.value)='number' THEN (r.value::text)::numeric<=0 OR (r.value::text)::numeric>=1e30 ELSE true END) THEN RAISE EXCEPTION 'Invalid exchange rates'; END IF;
 IF p_parts IS NOT NULL AND (jsonb_typeof(p_parts)<>'object' OR EXISTS(SELECT 1 FROM jsonb_each(p_parts) r
  WHERE r.key !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' OR CASE WHEN jsonb_typeof(r.value)='number' THEN (r.value::text)::numeric<0 OR (r.value::text)::numeric>=1e30 ELSE true END)) THEN
  RAISE EXCEPTION 'Invalid snapshot.';
 END IF;
 INSERT INTO public.portfolio_snapshots(user_id,occurred_on,assets,debt,rates,parts)
 VALUES(public.active_owner(),(now() AT TIME ZONE 'Asia/Tashkent')::date,p_assets,p_debt,p_rates,p_parts)
 ON CONFLICT(user_id,occurred_on) DO UPDATE SET assets=excluded.assets,debt=excluded.debt,rates=excluded.rates,parts=excluded.parts,updated_at=now()
 RETURNING * INTO result;
 RETURN to_jsonb(result)-'user_id'-'parts';
END $$;
-- The three-argument form stays for a browser tab opened before this update; a day saved through it keeps no parts.
CREATE OR REPLACE FUNCTION public.capture_portfolio_snapshot(p_assets numeric,p_debt numeric,p_rates jsonb) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 SELECT public.capture_portfolio_snapshot(p_assets,p_debt,p_rates,NULL::jsonb)
$$;
REVOKE ALL ON FUNCTION public.capture_portfolio_snapshot(numeric,numeric,jsonb,jsonb),public.capture_portfolio_snapshot(numeric,numeric,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.capture_portfolio_snapshot(numeric,numeric,jsonb,jsonb),public.capture_portfolio_snapshot(numeric,numeric,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.capture_owner_portfolio_snapshot(p_owner uuid,p_day date,p_totals jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF p_owner IS NULL OR p_day IS NULL THEN RAISE EXCEPTION 'Invalid snapshot.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_owner::text,0));
 INSERT INTO public.portfolio_snapshots(user_id,occurred_on,assets,debt,rates,parts,updated_at)
 VALUES(p_owner,p_day,(p_totals->>'assets')::numeric,(p_totals->>'debt')::numeric,p_totals->'rates',CASE WHEN jsonb_typeof(p_totals->'parts')='object' THEN p_totals->'parts' END,now())
 ON CONFLICT(user_id,occurred_on) DO UPDATE SET assets=excluded.assets,debt=excluded.debt,rates=excluded.rates,parts=excluded.parts,updated_at=excluded.updated_at;
END $$;

REVOKE ALL ON FUNCTION public.close_finance_record(uuid,date),public.reopen_finance_record(uuid),public.close_holding_account(uuid,date,uuid,boolean),public.reopen_holding_account(uuid),public.delete_holding_account(uuid),public.record_delete_blockers(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.close_finance_record(uuid,date),public.reopen_finance_record(uuid),public.close_holding_account(uuid,date,uuid,boolean),public.reopen_holding_account(uuid),public.delete_holding_account(uuid),public.record_delete_blockers(uuid) TO authenticated;

-- The capability version moves to 168, so the app can ask for this migration.
CREATE OR REPLACE FUNCTION public.finance_capabilities() RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT jsonb_build_object('schema_version',168,'record_revisions',true,'verified_restore',true)
$$;

NOTIFY pgrst,'reload schema';
COMMIT;
