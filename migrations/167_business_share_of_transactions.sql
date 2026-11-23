-- Profit and loss by share (product map, "Ownership and valuations"). Apply after 166.
-- A transaction linked to a business the person owns part of can be entered two ways: as their own share of the
-- money (`amount_basis` 'mine', the default and what every existing row is), or as the figure of the whole business
-- ('whole'), which is then reported at amount x business_share / 100.
-- `business_share` is the business's ownership on the day the transaction was linked to it. It is kept afterwards, so
-- changing the ownership later does not rewrite past months; linking the transaction to another business takes that
-- business's share. A transaction without a business has no share and is always 'mine'.
-- Existing rows get the default 'mine' and no share: nothing they report changes. No row is rewritten. Re-runnable.
BEGIN;

ALTER TABLE public.finance_records ADD COLUMN IF NOT EXISTS business_share numeric;
ALTER TABLE public.finance_records ADD COLUMN IF NOT EXISTS amount_basis text NOT NULL DEFAULT 'mine';
ALTER TABLE public.finance_records DROP CONSTRAINT IF EXISTS finance_records_business_share_check;
ALTER TABLE public.finance_records ADD CONSTRAINT finance_records_business_share_check CHECK (business_share IS NULL OR (business_share>0 AND business_share<=100));
ALTER TABLE public.finance_records DROP CONSTRAINT IF EXISTS finance_records_amount_basis_check;
ALTER TABLE public.finance_records ADD CONSTRAINT finance_records_amount_basis_check CHECK (amount_basis IN ('whole','mine'));

CREATE OR REPLACE FUNCTION public.set_business_share() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 -- A verified restore brings records back exactly as they were saved.
 IF public.finance_restore_active() THEN RETURN NEW; END IF;
 IF NEW.business_id IS NULL OR NEW.kind NOT IN ('Salary','Rent income','Business income','Other income','Rent expense','Living expense','Charity','Other expense') THEN
  NEW.business_share:=NULL; NEW.amount_basis:='mine';
 ELSIF NEW.business_share IS NULL OR (TG_OP='UPDATE' AND NEW.business_id IS DISTINCT FROM OLD.business_id) THEN
  -- The share is read once, when the link is made. Only the owner's own business answers (same `user_id`).
  NEW.business_share:=(SELECT nullif(b.ownership_percentage,0) FROM public.finance_records b WHERE b.id=NEW.business_id AND b.user_id=NEW.user_id AND b.kind='Business');
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.set_business_share() FROM PUBLIC,anon,authenticated;
-- Triggers fire by name: this one runs after the guards that compare a linked transaction with what it was, so the
-- share it keeps is never read as an edit, and after the check that the business is the owner's own.
DROP TRIGGER IF EXISTS x_business_share ON public.finance_records;
CREATE TRIGGER x_business_share BEFORE INSERT OR UPDATE ON public.finance_records FOR EACH ROW EXECUTE FUNCTION public.set_business_share();

-- The income and expense forms may save how the amount was entered. The share itself is never taken from the form.
DO $patch$
DECLARE definition text:=pg_get_functiondef('public.save_finance_record(jsonb,bigint)'::regprocedure);
 old_text text:=$old$'ownership_percentage','unit_label',$old$; new_text text:=$new$'ownership_percentage','unit_label','amount_basis',$new$; found integer;
BEGIN
 IF position(new_text IN definition)>0 THEN RETURN; END IF;
 found:=(length(definition)-length(replace(definition,old_text,'')))/length(old_text);
 IF found<>1 THEN RAISE EXCEPTION 'Unexpected function definition: save_finance_record (% matches)',found; END IF;
 EXECUTE replace(definition,old_text,new_text);
END $patch$;

-- The capability version moves to 167, so the app can ask for this migration.
CREATE OR REPLACE FUNCTION public.finance_capabilities() RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT jsonb_build_object('schema_version',167,'record_revisions',true,'verified_restore',true)
$$;

NOTIFY pgrst,'reload schema';
COMMIT;
