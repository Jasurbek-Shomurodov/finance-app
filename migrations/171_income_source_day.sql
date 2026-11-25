-- An income source with recorded payments can move to another day of the month. Apply after 170.
-- save_income_source (migration 043) refused any change of a source's start date or end date once a payment was
-- recorded, so a fixed monthly source could not change the day it is paid on. It now follows the schedules on
-- Recurring (migration 141):
-- * A monthly source may move to another day of its start month. Its schedule's date moves with it, and
--   move_schedule_day moves every recorded or skipped occurrence, and the receipts that name it (occurrence_due_on and
--   now earning_due_on), to that day of its own month.
-- * The end date may change; protect_settled_schedule still refuses one before a paid due date.
-- The type, currency, pattern, cadence and link stay as they are, and so does any other change of the start date.
BEGIN;

CREATE OR REPLACE FUNCTION public.save_income_source(p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE owner uuid:=public.active_owner(); item uuid:=(p_data->>'id')::uuid; old public.income_sources; saved public.income_sources; linked public.finance_records; schedule uuid; has_payments boolean; previous_write text; written int;
BEGIN
 IF owner IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(owner::text,0));
 SELECT * INTO old FROM public.income_sources WHERE id=item FOR UPDATE;
 IF FOUND AND old.user_id<>owner THEN RAISE EXCEPTION 'Income source not found.'; END IF;
 saved:=jsonb_populate_record(NULL::public.income_sources,p_data||jsonb_build_object('user_id',owner,'archived',coalesce((p_data->>'archived')::boolean,false)));
 IF saved.name IS NULL OR saved.kind IS NULL OR saved.currency IS NULL OR saved.mode IS NULL THEN RAISE EXCEPTION 'Check the income source fields.'; END IF;
 IF saved.kind IN ('Rent income','Business income') THEN
  SELECT * INTO linked FROM public.finance_records WHERE user_id=owner AND id=saved.linked_record_id AND kind=CASE WHEN saved.kind='Rent income' THEN 'Property' ELSE 'Business' END FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Choose a matching income source.'; END IF;
 ELSIF saved.linked_record_id IS NOT NULL THEN RAISE EXCEPTION 'Choose a matching income source.'; END IF;
 SELECT EXISTS(SELECT 1 FROM public.finance_records WHERE user_id=owner AND (earning_source_id=item OR income_source_id=old.schedule_id)) OR EXISTS(SELECT 1 FROM public.payment_occurrences WHERE user_id=owner AND record_id=old.schedule_id) INTO has_payments;
 IF old.id IS NOT NULL AND has_payments AND ((saved.kind,saved.currency,saved.mode,saved.frequency,saved.recurrence_days,saved.linked_record_id) IS DISTINCT FROM (old.kind,old.currency,old.mode,old.frequency,old.recurrence_days,old.linked_record_id)
  -- The start date stays, except that a monthly source may move to another day of its start month (move_schedule_day).
  OR (saved.start_date IS DISTINCT FROM old.start_date AND NOT (old.frequency='Monthly' AND saved.start_date IS NOT NULL AND old.start_date IS NOT NULL AND date_trunc('month',saved.start_date)=date_trunc('month',old.start_date)))) THEN
  RAISE EXCEPTION 'Keep the type, currency and schedule compatible with recorded payments.';
 END IF;
 -- The source's dates are written before its schedule, so the receipts move_schedule_day moves are checked against them.
 IF old.id IS NOT NULL AND (saved.start_date,saved.end_date) IS DISTINCT FROM (old.start_date,old.end_date) THEN
  UPDATE public.income_sources SET start_date=saved.start_date,end_date=saved.end_date WHERE id=item AND user_id=owner;
 END IF;
 previous_write:=coalesce(current_setting('finance.income_source_write',true),'0');
 PERFORM set_config('finance.income_source_write','1',true);
 schedule:=old.schedule_id;
 IF saved.mode='fixed' THEN
  schedule:=coalesce(schedule,item);
  -- A new schedule takes the source's id, which may not already name a record (anyone's).
  IF old.schedule_id IS NULL AND EXISTS(SELECT 1 FROM public.finance_records WHERE id=schedule) THEN RAISE EXCEPTION 'Check the income source fields.'; END IF;
  INSERT INTO public.finance_records(id,user_id,name,kind,currency,amount,date,frequency,recurrence_days,end_date,business_id,income_source_id,source_paused)
  VALUES(schedule,owner,saved.name,saved.kind,saved.currency,saved.amount,saved.start_date,saved.frequency,saved.recurrence_days,saved.end_date,CASE WHEN saved.kind='Business income' THEN saved.linked_record_id ELSE NULL END,CASE WHEN saved.kind='Rent income' THEN saved.linked_record_id ELSE NULL END,saved.archived)
  ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,kind=EXCLUDED.kind,currency=EXCLUDED.currency,amount=EXCLUDED.amount,date=EXCLUDED.date,frequency=EXCLUDED.frequency,recurrence_days=EXCLUDED.recurrence_days,end_date=EXCLUDED.end_date,business_id=EXCLUDED.business_id,income_source_id=EXCLUDED.income_source_id,source_paused=EXCLUDED.source_paused
   WHERE finance_records.user_id=owner AND finance_records.id=old.schedule_id;
  GET DIAGNOSTICS written=ROW_COUNT;
  IF written=0 THEN RAISE EXCEPTION 'Check the income source fields.'; END IF;
 ELSIF schedule IS NOT NULL THEN
  UPDATE public.finance_records SET source_paused=true WHERE id=schedule AND user_id=owner;
 END IF;
 saved.schedule_id:=schedule;
 INSERT INTO public.income_sources SELECT saved.* ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,kind=EXCLUDED.kind,currency=EXCLUDED.currency,mode=EXCLUDED.mode,archived=EXCLUDED.archived,amount=EXCLUDED.amount,frequency=EXCLUDED.frequency,recurrence_days=EXCLUDED.recurrence_days,start_date=EXCLUDED.start_date,end_date=EXCLUDED.end_date,linked_record_id=EXCLUDED.linked_record_id,schedule_id=EXCLUDED.schedule_id,approx_monthly=EXCLUDED.approx_monthly;
 PERFORM set_config('finance.income_source_write',previous_write,true);
 RETURN to_jsonb(saved)-'user_id';
END $$;

CREATE OR REPLACE FUNCTION public.move_schedule_day()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE day integer:=extract(day FROM NEW.date)::integer; previous_restore text; source uuid;
BEGIN
 IF public.finance_restore_active() OR coalesce(current_setting('finance.restore_transaction',true),'0')='1' THEN RETURN NULL; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.user_id::text,0));
 UPDATE public.payment_occurrences o SET due_on=public.schedule_day_in(day,o.due_on)
  WHERE o.user_id=NEW.user_id AND o.record_id=NEW.id AND o.due_on<>public.schedule_day_in(day,o.due_on);
 -- A payment keeps its schedule (name_scheduled_payment); only its due date follows, as a restore writes it.
 previous_restore:=coalesce(current_setting('finance.restore_transaction',true),'0');
 PERFORM set_config('finance.restore_transaction','1',true);
 SELECT id INTO source FROM public.income_sources WHERE user_id=NEW.user_id AND schedule_id=NEW.id;
 -- One statement per payment: a salary is checked against its plan's new day with both of its due dates moved.
 UPDATE public.finance_records r SET
   occurrence_due_on=CASE WHEN r.occurrence_record_id=NEW.id THEN public.schedule_day_in(day,r.occurrence_due_on) ELSE r.occurrence_due_on END,
   earning_due_on=CASE WHEN source IS NOT NULL AND r.earning_source_id=source AND r.earning_due_on IS NOT NULL THEN public.schedule_day_in(day,r.earning_due_on) ELSE r.earning_due_on END,
   income_due_on=CASE WHEN r.kind='Salary' AND r.income_source_id=NEW.id AND r.income_due_on IS NOT NULL THEN public.schedule_day_in(day,r.income_due_on) ELSE r.income_due_on END
  WHERE r.user_id=NEW.user_id AND (
   (r.occurrence_record_id=NEW.id AND r.occurrence_due_on<>public.schedule_day_in(day,r.occurrence_due_on))
   OR (source IS NOT NULL AND r.earning_source_id=source AND r.earning_due_on IS NOT NULL AND r.earning_due_on<>public.schedule_day_in(day,r.earning_due_on))
   OR (r.kind='Salary' AND r.income_source_id=NEW.id AND r.income_due_on IS NOT NULL AND r.income_due_on<>public.schedule_day_in(day,r.income_due_on)));
 PERFORM set_config('finance.restore_transaction',previous_restore,true);
 RETURN NULL;
END $$;

REVOKE ALL ON FUNCTION public.save_income_source(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_income_source(jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.move_schedule_day() FROM PUBLIC,anon,authenticated;

-- The capability version moves to 171, so the app can ask for this migration.
CREATE OR REPLACE FUNCTION public.finance_capabilities() RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT jsonb_build_object('schema_version',171,'record_revisions',true,'verified_restore',true)
$$;

NOTIFY pgrst,'reload schema';
COMMIT;
