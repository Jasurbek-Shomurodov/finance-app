-- A record's category and currency can change while no money is linked to it. Apply after 157.
-- Every asset and debt gets a baseline history row when it is created, so "has history" locked all of them from the
-- first save. What really needs the lock is money tied to the record: cash payments and repayments reverse by the
-- record's category and currency, and an account's transactions need it to stay a cash account in that currency.
-- A plain balance has none of that, so a wrong category or currency can be corrected. The amount stays as entered:
-- this is a correction, not a conversion. Switching between a dated loan and money lent also carries the start date
-- along (a category without one clears it). Re-runnable; no rows change.
BEGIN;
CREATE OR REPLACE FUNCTION public.record_has_linked_money(p_record uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM public.finance_records WHERE account_id=p_record)
  OR EXISTS(SELECT 1 FROM public.account_activity WHERE account_id=p_record OR target_id=p_record)
  OR EXISTS(SELECT 1 FROM public.asset_movements WHERE source_id=p_record OR target_id=p_record)
  OR EXISTS(SELECT 1 FROM public.investment_account_links WHERE account_id=p_record)
  OR EXISTS(SELECT 1 FROM public.investment_account_links l JOIN public.investment_history h ON h.id=l.id WHERE h.record_id=p_record)
  OR EXISTS(SELECT 1 FROM public.investment_history WHERE record_id=p_record AND event_type IN ('income','expense','mortgage_payment'))
  OR EXISTS(SELECT 1 FROM public.savings_goals WHERE account_id=p_record)
$$;
REVOKE ALL ON FUNCTION public.record_has_linked_money(uuid) FROM PUBLIC,anon,authenticated;

DO $patch$
DECLARE
 old_rule text:=$a$AND EXISTS(SELECT 1 FROM public.investment_history WHERE record_id=OLD.id) THEN$a$;
 old_message text:=$a$RAISE EXCEPTION 'Tracked records must keep their category and currency.';$a$;
 definition text:=pg_get_functiondef('public.guard_investment_history_record()'::regprocedure);
BEGIN
 IF position('record_has_linked_money' IN definition)=0 THEN
  IF position(old_rule IN definition)=0 OR position(old_message IN definition)=0 THEN RAISE EXCEPTION 'Unexpected definition of guard_investment_history_record. Apply migrations in order.'; END IF;
  EXECUTE replace(replace(definition,old_rule,'AND public.record_has_linked_money(OLD.id) THEN'),old_message,$b$RAISE EXCEPTION 'Records with linked payments keep their category and currency.';$b$);
 END IF;
END $patch$;

CREATE OR REPLACE FUNCTION public.guard_opening_balance_date() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF public.finance_restore_active() THEN
  IF TG_LEVEL='STATEMENT' THEN RETURN NULL; ELSIF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
 END IF;
 IF NEW.opened_on IS NOT NULL AND (NEW.kind NOT IN ('Cash','Deposit','Treasury bill','Bond','Stock','Crypto','Precious metals','Equity compensation','Debt','Loan','Mortgage') OR NEW.opened_on>(now() AT TIME ZONE 'Asia/Tashkent')::date) THEN
  -- A category without an opening date lets go of the one the record kept.
  IF TG_OP='UPDATE' AND NEW.kind<>OLD.kind AND NEW.opened_on<=(now() AT TIME ZONE 'Asia/Tashkent')::date THEN NEW.opened_on:=NULL;
  ELSE RAISE EXCEPTION 'Check the opening balance date.'; END IF;
 END IF;
 IF NEW.kind IN ('Debt','Loan','Mortgage') AND NEW.opened_on IS NOT NULL AND NEW.date<NEW.opened_on THEN
  RAISE EXCEPTION 'Check the start and due dates.';
 END IF;
 IF TG_OP='UPDATE' AND NEW.kind=OLD.kind AND NEW.opened_on IS DISTINCT FROM OLD.opened_on THEN
  IF OLD.kind NOT IN ('Debt','Loan','Mortgage') THEN RAISE EXCEPTION 'The opening balance date cannot change after creation.'; END IF;
  IF NEW.opened_on IS NULL THEN RAISE EXCEPTION 'The start date cannot change after creation.'; END IF;
  IF EXISTS(SELECT 1 FROM public.mortgage_payments WHERE mortgage_id=NEW.id AND paid_on<NEW.opened_on)
   OR EXISTS(SELECT 1 FROM public.account_activity WHERE target_id=NEW.id AND occurred_on<NEW.opened_on)
   OR EXISTS(SELECT 1 FROM public.investment_history WHERE record_id=NEW.id AND event_type<>'baseline' AND occurred_on<NEW.opened_on) THEN
   RAISE EXCEPTION 'The start date cannot be after a recorded payment.';
  END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_opening_balance_date() FROM PUBLIC,anon,authenticated;

-- The capability version moves to 158, so the app can ask for this migration.
CREATE OR REPLACE FUNCTION public.finance_capabilities() RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT jsonb_build_object('schema_version',158,'record_revisions',true,'verified_restore',true)
$$;

NOTIFY pgrst,'reload schema';
COMMIT;
