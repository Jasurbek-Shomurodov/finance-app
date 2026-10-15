-- Record payment in the cash account's currency. Apply after 143.
-- A USD salary paid into a UZS cash account could only be typed in USD and was
-- converted at the official rate, so the sum that really arrived was lost. Record
-- payment and a later payment of the same due date now take an optional `currency`:
-- the schedule's own or the cash account's. A payment in the account's currency keeps
-- its own amount and currency and needs no rate (the account moves by that amount);
-- the planning read counts it in the schedule's currency, as migration 120 does for
-- every payment in another currency. Without `currency` nothing changes. No rows are
-- rewritten.
BEGIN;

-- Called only from the two functions below, inside their owner checks. Created once, so
-- running this again keeps what a later migration (146) made of it.
DO $do$ BEGIN
 IF to_regprocedure('public.scheduled_payment_currency(text,uuid,text)') IS NULL THEN
  CREATE FUNCTION public.scheduled_payment_currency(schedule_currency text,account uuid,asked text) RETURNS text
  LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public AS $$
  BEGIN
   IF asked IS NULL OR asked=schedule_currency THEN RETURN schedule_currency; END IF;
   IF asked=(SELECT currency FROM public.finance_records WHERE id=account AND kind='Cash') THEN RETURN asked; END IF;
   RAISE EXCEPTION 'Choose the schedule''s currency or the cash account''s.';
  END $$;
 END IF;
END $do$;
REVOKE ALL ON FUNCTION public.scheduled_payment_currency(text,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.scheduled_payment_currency(text,uuid,text) TO authenticated;

-- The payment takes the currency asked for, when it is the schedule's or the cash account's.
-- It is a line of its own ahead of an anchor, so the texts earlier patches look for when
-- they run again stay as they were.
CREATE OR REPLACE FUNCTION pg_temp.patch_payment_currency(fn regprocedure,anchor text,line text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE definition text:=pg_get_functiondef(fn);
BEGIN
 IF position(line in definition)>0 THEN RETURN; END IF;
 IF (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 THEN RAISE EXCEPTION 'Unexpected function definition: %',fn; END IF;
 EXECUTE replace(definition,anchor,line||E'\n'||anchor);
END $$;
SELECT pg_temp.patch_payment_currency('public.planning_action_with_actual_amount(text,jsonb)'::regprocedure,
 $a$   IF (p_data->>'paid_on')::date<r.date THEN RAISE EXCEPTION 'Check the payment date.'; END IF;$a$,
 $l$   r.currency:=public.scheduled_payment_currency(r.currency,aid,p_data->>'currency');$l$);
SELECT pg_temp.patch_payment_currency('public.record_occurrence_extra(jsonb)'::regprocedure,
 $a$ INSERT INTO public.finance_records(id,user_id,name,kind,currency,amount,date,frequency,notes,account_id,business_id,custom_category_id,account_exchange_rate,account_rate_date,account_currency,occurrence_record_id,occurrence_due_on)$a$,
 $l$ r.currency:=public.scheduled_payment_currency(r.currency,aid,p_data->>'currency');$l$);

-- The capability version moves to 144, so the app can ask for this migration.
CREATE OR REPLACE FUNCTION public.finance_capabilities() RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT jsonb_build_object('schema_version',144,'record_revisions',true,'verified_restore',true)
$$;

NOTIFY pgrst,'reload schema';
COMMIT;
