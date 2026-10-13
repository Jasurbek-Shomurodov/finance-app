-- A scheduled payment is never dated before its schedule starts. Apply after 142.
-- Record payment pays the due date of the row it was opened from, whatever payment date
-- is typed. A schedule set up today and paid with last month's date settled this month's
-- due date with a payment from a month the schedule never had. Record payment and a later
-- payment of the same due date now refuse a payment date before the schedule's start
-- date; the dialog's date picker stops there too. No rows are rewritten.
BEGIN;

-- Exact guarded patches keep restore guards and earlier in-place patches.
CREATE OR REPLACE FUNCTION pg_temp.patch_payment_start(fn regprocedure,old_text text,new_text text,expected integer) RETURNS void LANGUAGE plpgsql AS $$
DECLARE definition text:=pg_get_functiondef(fn); found integer;
BEGIN
 -- Re-running is a no-op once every expected match was already patched. The new
 -- text may contain the old, so it is counted first.
 IF (length(definition)-length(replace(definition,new_text,'')))/length(new_text)=expected THEN RETURN; END IF;
 found:=(length(definition)-length(replace(definition,old_text,'')))/length(old_text);
 IF found<>expected THEN RAISE EXCEPTION 'Unexpected function definition: % (% of % matches)',fn,found,expected; END IF;
 EXECUTE replace(definition,old_text,new_text);
END $$;

-- Record payment: not before the schedule starts. It goes ahead of 110's check, so 110 still finds its own text.
-- Some databases carry 110's check twice in a row from an earlier double run; one copy is kept.
DO $$
DECLARE fn regprocedure:='public.planning_action_with_actual_amount(text,jsonb)'::regprocedure; definition text:=pg_get_functiondef(fn);
 ahead text:=$q$   IF (p_data->>'paid_on')::date>(now() AT TIME ZONE 'Asia/Tashkent')::date THEN RAISE EXCEPTION 'Check the payment date.'; END IF;$q$;
 before text:=$q$   IF (p_data->>'paid_on')::date<r.date THEN RAISE EXCEPTION 'Check the payment date.'; END IF;$q$;
BEGIN
 IF position(before in definition)>0 THEN RETURN; END IF;
 definition:=replace(definition,ahead||E'\n'||ahead,ahead);
 IF (length(definition)-length(replace(definition,ahead,'')))/length(ahead)<>1 THEN RAISE EXCEPTION 'Unexpected function definition: %',fn; END IF;
 EXECUTE replace(definition,ahead,before||E'\n'||ahead);
END $$;

-- A later payment of a recorded due date: the same.
SELECT pg_temp.patch_payment_start('public.record_occurrence_extra(jsonb)'::regprocedure,
 $old$IF NOT FOUND THEN RAISE EXCEPTION 'Record not found.'; END IF;$old$,
 $new$IF NOT FOUND THEN RAISE EXCEPTION 'Record not found.'; END IF;
 IF paid<r.date THEN RAISE EXCEPTION 'Check the payment date.'; END IF;$new$,1);

-- The capability version moves to 143, so the app can ask for this migration.
CREATE OR REPLACE FUNCTION public.finance_capabilities() RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT jsonb_build_object('schema_version',143,'record_revisions',true,'verified_restore',true)
$$;

NOTIFY pgrst,'reload schema';
COMMIT;
