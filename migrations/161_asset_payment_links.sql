-- Rent and costs name their property, however they were recorded. A Tracker income or expense of a Property named no
-- property, and rent recorded through Record payment named only its schedule, so the property's card and its Tracker
-- each missed what the other counted. `record_investment_event` (which the cash and exchange-rate forms both call) now
-- names the property on rent (`income_source_id`) and on an expense (`property_id`), Record payment and later payments
-- copy the schedule's `income_source_id` onto rent, and existing rows of those three kinds are linked.
-- A receipt of an income source keeps none: its save clears the field, and the read follows its schedule. Rows in
-- Recently deleted stay as they are, since the property they would name may be gone. No amount, name or revision
-- changes. Re-runnable. Apply after 160.
BEGIN;
CREATE OR REPLACE FUNCTION pg_temp.patch_asset_links(fn regprocedure,old_text text,new_text text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE definition text:=pg_get_functiondef(fn); found integer;
BEGIN
 found:=(length(definition)-length(replace(definition,old_text,'')))/length(old_text);
 -- Re-running is a no-op once the text was already patched.
 IF found=0 AND position(new_text IN definition)>0 THEN RETURN; END IF;
 IF found<>1 THEN RAISE EXCEPTION 'Unexpected function definition: % (% matches)',fn,found; END IF;
 EXECUTE replace(definition,old_text,new_text);
END $$;

SELECT pg_temp.patch_asset_links('public.record_investment_event(uuid,uuid,text,date,numeric,numeric,text)'::regprocedure,
 $old$frequency,notes,business_id,history_event_id)$old$,$new$frequency,notes,business_id,history_event_id,income_source_id,property_id)$new$);
SELECT pg_temp.patch_asset_links('public.record_investment_event(uuid,uuid,text,date,numeric,numeric,text)'::regprocedure,
 $old$CASE WHEN r.kind='Business' THEN r.id ELSE NULL END,p_id);$old$,$new$CASE WHEN r.kind='Business' THEN r.id ELSE NULL END,p_id,CASE WHEN r.kind='Property' AND p_type='income' THEN r.id END,CASE WHEN r.kind='Property' AND p_type='expense' THEN r.id END);$new$);

SELECT pg_temp.patch_asset_links('public.planning_action_with_actual_amount(text,jsonb)'::regprocedure,
 $old$account_currency,occurrence_record_id,occurrence_due_on)$old$,$new$account_currency,occurrence_record_id,occurrence_due_on,income_source_id)$new$);
SELECT pg_temp.patch_asset_links('public.planning_action_with_actual_amount(text,jsonb)'::regprocedure,
 $old$p_data->>'account_currency',bid,day);$old$,$new$p_data->>'account_currency',bid,day,CASE WHEN r.kind='Rent income' THEN r.income_source_id END);$new$);
SELECT pg_temp.patch_asset_links('public.record_occurrence_extra(jsonb)'::regprocedure,
 $old$account_currency,occurrence_record_id,occurrence_due_on)$old$,$new$account_currency,occurrence_record_id,occurrence_due_on,income_source_id)$new$);
SELECT pg_temp.patch_asset_links('public.record_occurrence_extra(jsonb)'::regprocedure,
 $old$p_data->>'account_currency',bid,day);$old$,$new$p_data->>'account_currency',bid,day,CASE WHEN r.kind='Rent income' THEN r.income_source_id END);$new$);

-- Existing rows: triggers stay off so a link is all that changes (no revision, audit row or renamed payment).
ALTER TABLE public.finance_records DISABLE TRIGGER USER;
UPDATE public.finance_records r SET income_source_id=h.record_id
 FROM public.investment_history h JOIN public.finance_records p ON p.id=h.record_id AND p.user_id=h.user_id
 WHERE h.id=r.history_event_id AND h.user_id=r.user_id AND h.event_type='income' AND p.kind='Property' AND r.kind='Rent income' AND r.income_source_id IS NULL;
UPDATE public.finance_records r SET property_id=h.record_id
 FROM public.investment_history h JOIN public.finance_records p ON p.id=h.record_id AND p.user_id=h.user_id
 WHERE h.id=r.history_event_id AND h.user_id=r.user_id AND h.event_type='expense' AND p.kind='Property' AND r.kind='Other expense' AND r.property_id IS NULL;
UPDATE public.finance_records r SET income_source_id=s.income_source_id
 FROM public.finance_records s
 WHERE s.id=r.occurrence_record_id AND s.user_id=r.user_id AND s.kind='Rent income' AND s.frequency<>'Once' AND s.income_source_id IS NOT NULL
  AND r.kind='Rent income' AND r.frequency='Once' AND r.income_source_id IS NULL AND r.earning_source_id IS NULL AND r.history_event_id IS NULL;
ALTER TABLE public.finance_records ENABLE TRIGGER USER;

-- The capability version moves to 161, so the app can ask for this migration.
CREATE OR REPLACE FUNCTION public.finance_capabilities() RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT jsonb_build_object('schema_version',161,'record_revisions',true,'verified_restore',true)
$$;

NOTIFY pgrst,'reload schema';
COMMIT;
