-- Each transaction is saved with the official exchange rates of its own day. Apply after 149.
-- An income or expense paid once keeps, in `day_rates`, the rates of its date (units of each currency per US dollar,
-- from exchange_rate_days), so it always counts in another currency at the rate of the day it was made. The rates
-- are copied as the row is saved, whatever saves it (the app, the Telegram bot, an import, a recorded payment): on
-- insert, and again when the date changes. The app keeps the day in exchange_rate_days before it saves; a day not
-- kept yet saves without rates, which the app then reads from exchange_rate_days, and an edit stores them. A verified
-- restore brings rows back exactly as they were saved. Re-runnable; existing rows are not changed.
BEGIN;
ALTER TABLE public.finance_records ADD COLUMN IF NOT EXISTS day_rates jsonb;
ALTER TABLE public.finance_records DROP CONSTRAINT IF EXISTS finance_records_day_rates;
ALTER TABLE public.finance_records ADD CONSTRAINT finance_records_day_rates
 CHECK(day_rates IS NULL OR (jsonb_typeof(day_rates)='object' AND coalesce((day_rates->>'USD')::numeric,0)=1));

CREATE OR REPLACE FUNCTION public.keep_transaction_day_rates() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF public.finance_restore_active() THEN RETURN NEW; END IF;
 -- Only income and spending that happened once carry a day; schedules and holdings convert at today's rates.
 IF NEW.kind NOT IN ('Salary','Rent income','Business income','Other income','Rent expense','Living expense','Charity','Other expense')
  OR NEW.frequency<>'Once' OR NEW.date IS NULL THEN NEW.day_rates:=NULL; RETURN NEW; END IF;
 -- An edit on the same day keeps the rates it was saved with; nobody can write other rates into it.
 IF TG_OP='UPDATE' AND NEW.date IS NOT DISTINCT FROM OLD.date AND OLD.day_rates IS NOT NULL THEN NEW.day_rates:=OLD.day_rates; RETURN NEW; END IF;
 NEW.day_rates:=(SELECT rates FROM public.exchange_rate_days WHERE day=NEW.date);
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.keep_transaction_day_rates() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS keep_transaction_day_rates ON public.finance_records;
CREATE TRIGGER keep_transaction_day_rates BEFORE INSERT OR UPDATE ON public.finance_records FOR EACH ROW EXECUTE FUNCTION public.keep_transaction_day_rates();

-- The capability version moves to 150, so the app can ask for this migration.
CREATE OR REPLACE FUNCTION public.finance_capabilities() RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT jsonb_build_object('schema_version',150,'record_revisions',true,'verified_restore',true)
$$;

NOTIFY pgrst,'reload schema';
COMMIT;
