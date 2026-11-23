-- Ownership and counted assets (product map, "Ownership and valuations"). Apply after 165.
-- * `ownership_percentage` now counts for every asset whose value is entered by hand (Property, Business, Valuables,
--   Vehicle, Retirement account), not only a Business: the history trigger and `record_investment_event` write the
--   share an asset was valued at, and `delete_tracker_update` restores it. A share is more than 0 and at most 100.
-- * A valued asset can be counted in units: `unit_label` (up to 40 characters, "sheep") marks it, `quantity` is how
--   many and `amount` is then the value of ONE unit, so the whole asset is amount x quantity. Without a unit name the
--   record reads exactly as before, whatever its quantity column holds.
-- * `investment_history` gains `quantity` and `unit_value`. When both are set the balance is their product. The
--   trigger writes them for a counted asset, and `record_investment_event` takes them, and a new ownership share, in
--   a ten-argument form beside the date it always took: "2025: 1,000 x 80; 2026: 1,300 x 85" are two dated updates.
-- Existing rows keep their value: a record that is not a Business always counted at 100%, so any other share stored
-- on one is reset to 100 (triggers off: no history row, revision or audit entry). The stricter share check is added
-- NOT VALID, so a business saved at 0% stays as it is until it is next edited. No row is deleted. Re-runnable.
BEGIN;

ALTER TABLE public.finance_records ADD COLUMN IF NOT EXISTS unit_label text;
ALTER TABLE public.finance_records DROP CONSTRAINT IF EXISTS finance_records_unit_label_check;
ALTER TABLE public.finance_records ADD CONSTRAINT finance_records_unit_label_check CHECK (unit_label IS NULL
 OR (kind IN ('Property','Business','Valuables','Vehicle','Retirement account') AND length(unit_label)<=40 AND length(btrim(unit_label))>=1));

ALTER TABLE public.finance_records DISABLE TRIGGER USER;
UPDATE public.finance_records SET ownership_percentage=100 WHERE kind<>'Business' AND ownership_percentage<>100;
ALTER TABLE public.finance_records ENABLE TRIGGER USER;
ALTER TABLE public.finance_records DROP CONSTRAINT IF EXISTS finance_records_ownership_percentage_check;
ALTER TABLE public.finance_records ADD CONSTRAINT finance_records_ownership_percentage_check CHECK (ownership_percentage>0 AND ownership_percentage<=100) NOT VALID;

ALTER TABLE public.investment_history ADD COLUMN IF NOT EXISTS quantity numeric;
ALTER TABLE public.investment_history ADD COLUMN IF NOT EXISTS unit_value numeric;
ALTER TABLE public.investment_history DROP CONSTRAINT IF EXISTS investment_history_counted_check;
ALTER TABLE public.investment_history ADD CONSTRAINT investment_history_counted_check CHECK ((quantity IS NULL AND unit_value IS NULL)
 OR (quantity IS NOT NULL AND unit_value IS NOT NULL AND quantity>=0 AND quantity<=1e12 AND unit_value>=0 AND unit_value<=1e15 AND balance IS NOT NULL AND balance=quantity*unit_value));

CREATE OR REPLACE FUNCTION public.capture_investment_balance() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE valued boolean; counted boolean;
BEGIN
 IF public.finance_restore_active() THEN
  IF TG_LEVEL='STATEMENT' THEN RETURN NULL; ELSIF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
 END IF;
 IF NEW.kind NOT IN ('Cash','Stock','Crypto','Deposit','Treasury bill','Bond','Property','Business','Valuables','Vehicle','Retirement account','Precious metals','Equity compensation','Money lent','Mortgage','Loan','Debt') THEN RETURN NEW; END IF;
 IF current_setting('finance.history_write',true)='1' THEN RETURN NEW; END IF;
 valued:=NEW.kind IN ('Property','Business','Valuables','Vehicle','Retirement account');
 counted:=valued AND NEW.unit_label IS NOT NULL;
 IF TG_OP='UPDATE' AND NEW.amount=OLD.amount AND NEW.quantity=OLD.quantity AND NEW.ownership_percentage=OLD.ownership_percentage
  AND (NEW.unit_label IS NULL)=(OLD.unit_label IS NULL) THEN RETURN NEW; END IF;
 INSERT INTO public.investment_history(user_id,record_id,event_type,occurred_on,balance,ownership_percentage,quantity,unit_value,notes)
 VALUES(NEW.user_id,NEW.id,CASE WHEN TG_OP='INSERT' THEN 'baseline' ELSE 'valuation' END,
 CASE WHEN TG_OP='INSERT' THEN coalesce(NEW.opened_on,(now() AT TIME ZONE 'Asia/Tashkent')::date) ELSE (now() AT TIME ZONE 'Asia/Tashkent')::date END,
 NEW.amount*CASE WHEN counted OR NEW.kind IN ('Stock','Crypto','Precious metals','Equity compensation') THEN NEW.quantity ELSE 1 END,
 CASE WHEN valued THEN NEW.ownership_percentage ELSE 100 END,
 CASE WHEN counted THEN NEW.quantity END,CASE WHEN counted THEN NEW.amount END,'');
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.capture_investment_balance() FROM PUBLIC,anon,authenticated;

-- `record_investment_event` keeps its seven arguments, so the account and exchange-rate forms that call it are
-- untouched. A count, a value per unit and a share reach it from the ten-argument form below, which hands them over
-- for the length of its own call (transaction-local settings, the way `finance.history_write` already travels).
CREATE OR REPLACE FUNCTION public.record_investment_event(p_id uuid,p_record_id uuid,p_type text,p_date date,p_amount numeric,p_balance numeric,p_notes text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.finance_records; existing public.investment_history; last_date date; lending boolean; next_balance numeric;
 valued boolean; counted boolean; full_balance numeric:=p_balance;
 p_quantity numeric:=nullif(current_setting('finance.valuation_quantity',true),'')::numeric;
 p_unit_value numeric:=nullif(current_setting('finance.valuation_unit_value',true),'')::numeric;
 p_ownership numeric:=nullif(current_setting('finance.valuation_ownership',true),'')::numeric;
BEGIN
 IF public.active_owner() IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 IF (p_quantity IS NULL)<>(p_unit_value IS NULL) OR ((p_quantity IS NOT NULL OR p_ownership IS NOT NULL) AND p_type IS DISTINCT FROM 'valuation')
 OR p_quantity<0 OR p_quantity>1e12 OR p_unit_value<0 OR p_unit_value>1e15 OR p_ownership<=0 OR p_ownership>100 THEN RAISE EXCEPTION 'Check the tracker fields.'; END IF;
 -- A counted valuation is its two numbers; a total sent with them must be their product.
 IF p_quantity IS NOT NULL THEN
  full_balance:=p_quantity*p_unit_value;
  IF p_balance IS NOT NULL AND p_balance<>full_balance THEN RAISE EXCEPTION 'Check the tracker fields.'; END IF;
 END IF;
 IF p_id IS NULL OR p_record_id IS NULL OR p_type IS NULL OR p_date IS NULL OR p_amount IS NULL OR p_notes IS NULL
 OR p_type NOT IN ('valuation','contribution','withdrawal','income','expense') OR p_amount<0 OR p_amount>1e15
 OR p_date>(now() AT TIME ZONE 'Asia/Tashkent')::date OR length(p_notes)>2000
 OR (full_balance IS NOT NULL AND (full_balance<0 OR full_balance>1e15))
 OR (p_type='valuation' AND full_balance IS NULL)
 OR (p_type IN ('income','expense') AND full_balance IS NOT NULL) OR (p_type<>'valuation' AND p_amount<=0)
 OR (p_type='valuation' AND p_amount<>0) THEN RAISE EXCEPTION 'Check the tracker fields.'; END IF;
 SELECT * INTO r FROM public.finance_records WHERE id=p_record_id AND user_id=public.active_owner() FOR UPDATE;
 IF NOT FOUND OR r.kind NOT IN ('Cash','Stock','Crypto','Deposit','Treasury bill','Bond','Property','Business','Valuables','Vehicle','Retirement account','Precious metals','Equity compensation','Money lent','Mortgage','Loan','Debt') THEN RAISE EXCEPTION 'Investment not found.'; END IF;
 lending:=r.kind IN ('Debt','Loan','Money lent','Mortgage');
 valued:=r.kind IN ('Property','Business','Valuables','Vehicle','Retirement account');
 counted:=valued AND r.unit_label IS NOT NULL;
 IF (p_quantity IS NOT NULL AND NOT counted) OR (p_ownership IS NOT NULL AND NOT valued) THEN RAISE EXCEPTION 'Check the tracker fields.'; END IF;
 SELECT * INTO existing FROM public.investment_history WHERE id=p_id;
 IF FOUND THEN
  IF existing.user_id<>public.active_owner() OR existing.record_id<>p_record_id OR existing.event_type<>p_type OR existing.occurred_on<>p_date OR existing.amount<>p_amount
   OR (NOT (lending AND p_type IN ('contribution','withdrawal') AND full_balance IS NULL) AND existing.balance IS DISTINCT FROM full_balance)
   OR existing.quantity IS DISTINCT FROM p_quantity OR existing.unit_value IS DISTINCT FROM p_unit_value
   OR (p_ownership IS NOT NULL AND existing.ownership_percentage<>p_ownership) OR existing.notes<>p_notes THEN RAISE EXCEPTION 'This update was already saved with different details.'; END IF;
  RETURN jsonb_build_object('ok',true);
 END IF;
 -- Validate against the record under the same lock that protects its balance.
 IF (lending AND p_type NOT IN ('contribution','withdrawal')) OR (r.kind='Cash' AND p_type<>'valuation') THEN
  RAISE EXCEPTION 'This update type is not available for this record.';
 END IF;
 IF r.kind='Mortgage' AND p_type='withdrawal' THEN RAISE EXCEPTION 'Use Record payment for mortgage payments.'; END IF;
 SELECT max(occurred_on) INTO last_date FROM public.investment_history WHERE record_id=r.id AND balance IS NOT NULL;
 next_balance:=full_balance;
 IF lending THEN
  IF full_balance IS NOT NULL THEN RAISE EXCEPTION 'Enter debt additions and repayments without a balance override.'; END IF;
  IF p_date<last_date THEN RAISE EXCEPTION 'Enter updates on or after the latest balance date.'; END IF;
  next_balance:=r.amount+CASE WHEN p_type='contribution' THEN p_amount ELSE -p_amount END;
  IF next_balance<0 THEN RAISE EXCEPTION 'Repayment cannot exceed the outstanding balance.'; END IF;
  IF next_balance>1e15 THEN RAISE EXCEPTION 'Check the tracker fields.'; END IF;
 ELSIF p_type IN ('contribution','withdrawal') AND p_balance IS NULL AND r.kind NOT IN ('Business','Property','Valuables','Vehicle','Retirement account') THEN
  RAISE EXCEPTION 'Check the tracker fields.';
 END IF;
 INSERT INTO public.investment_history(id,user_id,record_id,event_type,occurred_on,amount,balance,ownership_percentage,quantity,unit_value,notes)
 VALUES(p_id,public.active_owner(),r.id,p_type,p_date,p_amount,next_balance,CASE WHEN valued THEN coalesce(p_ownership,r.ownership_percentage) ELSE 100 END,p_quantity,p_unit_value,p_notes);
 -- Only the newest dated value becomes the record's own: an older one is history and replaces nothing.
 IF next_balance IS NOT NULL AND (last_date IS NULL OR p_date>=last_date) THEN
  IF (r.kind IN ('Stock','Crypto','Precious metals','Equity compensation') OR (counted AND p_quantity IS NULL)) AND r.quantity=0 THEN RAISE EXCEPTION 'Set a quantity before recording a valuation.'; END IF;
  PERFORM set_config('finance.history_write','1',true);
  UPDATE public.finance_records SET
   amount=CASE WHEN p_quantity IS NOT NULL THEN p_unit_value ELSE next_balance/CASE WHEN counted OR r.kind IN ('Stock','Crypto','Precious metals','Equity compensation') THEN r.quantity ELSE 1 END END,
   quantity=coalesce(p_quantity,quantity),
   ownership_percentage=CASE WHEN valued THEN coalesce(p_ownership,ownership_percentage) ELSE ownership_percentage END
  WHERE id=r.id;
  PERFORM set_config('finance.history_write','0',true);
 END IF;
 IF p_type IN ('income','expense') THEN
  INSERT INTO public.finance_records(id,user_id,name,kind,currency,amount,date,frequency,notes,business_id,history_event_id,income_source_id,property_id)
  VALUES(p_id,public.active_owner(),r.name,CASE WHEN p_type='expense' THEN 'Other expense' WHEN r.kind='Property' THEN 'Rent income' ELSE 'Other income' END,r.currency,p_amount,p_date,'Once',p_notes,CASE WHEN r.kind='Business' THEN r.id ELSE NULL END,p_id,CASE WHEN r.kind='Property' AND p_type='income' THEN r.id END,CASE WHEN r.kind='Property' AND p_type='expense' THEN r.id END);
 END IF;
 RETURN jsonb_build_object('ok',true);
END $$;
REVOKE ALL ON FUNCTION public.record_investment_event(uuid,uuid,text,date,numeric,numeric,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_investment_event(uuid,uuid,text,date,numeric,numeric,text) TO authenticated;

-- A value update with a count and a value per unit, a new ownership share, or both. Every rule is the function's above.
CREATE OR REPLACE FUNCTION public.record_investment_event(p_id uuid,p_record_id uuid,p_type text,p_date date,p_amount numeric,p_balance numeric,p_notes text,
 p_quantity numeric,p_unit_value numeric,p_ownership numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb;
BEGIN
 PERFORM set_config('finance.valuation_quantity',coalesce(p_quantity::text,''),true),set_config('finance.valuation_unit_value',coalesce(p_unit_value::text,''),true),set_config('finance.valuation_ownership',coalesce(p_ownership::text,''),true);
 result:=public.record_investment_event(p_id,p_record_id,p_type,p_date,p_amount,p_balance,p_notes);
 PERFORM set_config('finance.valuation_quantity','',true),set_config('finance.valuation_unit_value','',true),set_config('finance.valuation_ownership','',true);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.record_investment_event(uuid,uuid,text,date,numeric,numeric,text,numeric,numeric,numeric) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_investment_event(uuid,uuid,text,date,numeric,numeric,text,numeric,numeric,numeric) TO authenticated;

CREATE OR REPLACE FUNCTION pg_temp.patch_counted_assets(fn regprocedure,old_text text,new_text text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE definition text:=pg_get_functiondef(fn); found integer;
BEGIN
 found:=(length(definition)-length(replace(definition,old_text,'')))/length(old_text);
 -- Re-running is a no-op once the text was already patched.
 IF position(new_text IN definition)>0 THEN RETURN; END IF;
 IF found<>1 THEN RAISE EXCEPTION 'Unexpected function definition: % (% matches)',fn,found; END IF;
 EXECUTE replace(definition,old_text,new_text);
END $$;

-- Deleting the newest value update brings back the value before it: for a counted asset its two numbers, and for
-- every valued kind the share it was valued at (a share of 0 from before this migration is not restored).
SELECT pg_temp.patch_counted_assets('public.delete_tracker_update(uuid,uuid)'::regprocedure,
 $old$SET amount=prior.balance,ownership_percentage=CASE WHEN kind='Business' THEN prior.ownership_percentage ELSE ownership_percentage END WHERE$old$,
 $new$SET amount=CASE WHEN prior.quantity IS NOT NULL THEN prior.unit_value WHEN unit_label IS NOT NULL AND quantity>0 THEN prior.balance/quantity ELSE prior.balance END,quantity=coalesce(prior.quantity,quantity),ownership_percentage=CASE WHEN kind IN ('Property','Business','Valuables','Vehicle','Retirement account') AND prior.ownership_percentage>0 THEN prior.ownership_percentage ELSE ownership_percentage END WHERE$new$);

-- The record form may save a unit name.
SELECT pg_temp.patch_counted_assets('public.save_finance_record(jsonb,bigint)'::regprocedure,
 $old$'ownership_percentage',$old$,$new$'ownership_percentage','unit_label',$new$);

-- The compact summary every total reads: a counted asset keeps its quantity and unit name (each valued asset is its own row).
SELECT pg_temp.patch_counted_assets('public.finance_records_page(integer,text,text,boolean)'::regprocedure,
 $old$THEN sum(r.quantity) ELSE 1 END AS quantity,$old$,$new$THEN sum(r.quantity) WHEN min(r.unit_label) IS NOT NULL THEN sum(r.quantity) ELSE 1 END AS quantity, min(r.unit_label) AS unit_label,$new$);
SELECT pg_temp.patch_counted_assets('public.finance_records_page(integer,text,text,boolean)'::regprocedure,
 $old$f.ownership_percentage,f.amount,f.quantity,f.cost,$old$,$new$f.ownership_percentage,f.unit_label,f.amount,f.quantity,f.cost,$new$);

-- The capability version moves to 166, so the app can ask for this migration.
CREATE OR REPLACE FUNCTION public.finance_capabilities() RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT jsonb_build_object('schema_version',166,'record_revisions',true,'verified_restore',true)
$$;

NOTIFY pgrst,'reload schema';
COMMIT;
