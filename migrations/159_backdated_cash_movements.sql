-- Money lent, loans and debts paid through a cash account can carry a date before the account's latest balance.
-- Any change to the account writes a snapshot dated today, so one payment from it refused every earlier lending date
-- ("Enter transactions on or after the latest cash balance date."), though expenses and business payments were
-- accepted with the same date. A back-dated lending movement now works like them: it keeps its own date, carries no
-- balance of its own, and the account's new balance is the snapshot written today. A later snapshot is never left
-- showing money that has already moved. Re-runnable; no rows change. Apply after 158.
BEGIN;
DO $patch$
DECLARE
 fn regprocedure;
 definition text;
 old_rule text:=$a$
  IF p_date<last_day THEN RAISE EXCEPTION 'Enter transactions on or after the latest cash balance date.'; END IF;$a$;
 old_write text:=$a$IF lending THEN PERFORM set_config('finance.history_write','1',true); END IF;$a$;
 new_write text:=$a$IF lending AND p_date>=coalesce(last_day,p_date) THEN PERFORM set_config('finance.history_write','1',true); END IF;$a$;
 old_balance text:=$a$p_date,abs(delta),a.amount+delta,p_notes);$a$;
 new_balance text:=$a$p_date,abs(delta),CASE WHEN p_date>=coalesce(last_day,p_date) THEN a.amount+delta END,p_notes);$a$;
BEGIN
 FOREACH fn IN ARRAY ARRAY['public.record_investment_with_account(uuid,uuid,text,date,numeric,numeric,text,uuid)'::regprocedure,
  'public.record_investment_with_fx(uuid,uuid,text,date,numeric,numeric,text,uuid,numeric,date,text,text,numeric,numeric)'::regprocedure] LOOP
  definition:=pg_get_functiondef(fn);
  CONTINUE WHEN position(new_balance IN definition)>0;
  IF position(old_rule IN definition)=0 OR position(old_write IN definition)=0 OR position(old_balance IN definition)=0 THEN RAISE EXCEPTION 'Unexpected definition of %. Apply migrations in order.',fn; END IF;
  EXECUTE replace(replace(replace(definition,old_rule,''),old_write,new_write),old_balance,new_balance);
 END LOOP;
END $patch$;

-- The capability version moves to 159, so the app can ask for this migration.
CREATE OR REPLACE FUNCTION public.finance_capabilities() RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT jsonb_build_object('schema_version',159,'record_revisions',true,'verified_restore',true)
$$;

NOTIFY pgrst,'reload schema';
COMMIT;
