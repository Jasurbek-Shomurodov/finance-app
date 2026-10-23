-- A scheduled payment may be recorded before its due date. Apply after 154.
-- A salary due on the 1st that arrived a week early could not be recorded: Record
-- payment refused any due date ahead of today. It now settles a due date that lies
-- ahead when it names the day the money moved (`paid_on`), which still may not lie
-- ahead or before the schedule starts. Every other action keeps its own check. No rows
-- are rewritten.
BEGIN;

-- Exact guarded patch: re-running finds the new text and does nothing.
DO $$
DECLARE fn regprocedure:='public.planning_action_with_actual_amount(text,jsonb)'::regprocedure; definition text:=pg_get_functiondef(fn);
 old_text text:=$q$ IF day IS NULL OR day>(now() AT TIME ZONE 'Asia/Tashkent')::date OR length(memo)>2000 THEN RAISE EXCEPTION 'Check the payment date.'; END IF;$q$;
 new_text text:=$q$ IF day IS NULL OR (day>(now() AT TIME ZONE 'Asia/Tashkent')::date AND (p_action<>'occurrence' OR p_data->>'paid_on' IS NULL)) OR length(memo)>2000 THEN RAISE EXCEPTION 'Check the payment date.'; END IF;$q$;
BEGIN
 IF position(new_text in definition)>0 THEN RETURN; END IF;
 IF (length(definition)-length(replace(definition,old_text,'')))/length(old_text)<>1 THEN RAISE EXCEPTION 'Unexpected function definition: %',fn; END IF;
 EXECUTE replace(definition,old_text,new_text);
END $$;

-- The capability version moves to 155, so the app can ask for this migration.
CREATE OR REPLACE FUNCTION public.finance_capabilities() RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT jsonb_build_object('schema_version',155,'record_revisions',true,'verified_restore',true)
$$;

NOTIFY pgrst,'reload schema';
COMMIT;
