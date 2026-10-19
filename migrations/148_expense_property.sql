-- Linked property on expenses. Apply after 147.
-- An expense or a recurring bill may name the property it was paid for (repairs, property
-- tax, a service charge), as it may name a business. Only expenses link, only to a Property
-- of the same workspace, checked as the link is set. A payment of a bill takes the bill's
-- property unless it names its own.
-- The link has no foreign key on purpose: deleting a property leaves its expenses as they
-- were, and restoring it from Recently deleted links them again. A link to a property that
-- no longer exists is read as no property, and a restored expense whose property is gone
-- saves without one. Re-runnable; no existing rows change.
BEGIN;
ALTER TABLE public.finance_records ADD COLUMN IF NOT EXISTS property_id uuid;
ALTER TABLE public.finance_records DROP CONSTRAINT IF EXISTS finance_records_property_expense;
ALTER TABLE public.finance_records ADD CONSTRAINT finance_records_property_expense
 CHECK (property_id IS NULL OR kind IN ('Rent expense','Living expense','Charity','Other expense'));
CREATE INDEX IF NOT EXISTS finance_records_property_id ON public.finance_records(user_id,property_id) WHERE property_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.link_finance_property() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE target text;
BEGIN
 -- A verified restore brings records back exactly as they were saved.
 IF public.finance_restore_active() THEN RETURN NEW; END IF;
 -- A new payment of a bill pays for the bill's property; a saved one keeps what it was given.
 IF TG_OP='INSERT' AND NEW.property_id IS NULL AND NEW.occurrence_record_id IS NOT NULL
  AND NEW.kind IN ('Rent expense','Living expense','Charity','Other expense')
  AND NOT EXISTS(SELECT 1 FROM public.finance_records WHERE id=NEW.id) THEN
  SELECT property_id INTO NEW.property_id FROM public.finance_records WHERE id=NEW.occurrence_record_id AND user_id=NEW.user_id;
 END IF;
 -- Only a link being set is checked. An edit saves through INSERT … ON CONFLICT, so the stored row tells an unchanged link.
 IF NEW.property_id IS NOT NULL AND (CASE WHEN TG_OP='UPDATE' THEN NEW.property_id IS DISTINCT FROM OLD.property_id
  ELSE NOT EXISTS(SELECT 1 FROM public.finance_records WHERE id=NEW.id AND user_id=NEW.user_id AND property_id=NEW.property_id) END) THEN
  SELECT kind INTO target FROM public.finance_records WHERE id=NEW.property_id AND user_id=NEW.user_id FOR SHARE;
  IF target IS NULL THEN NEW.property_id:=NULL;
  ELSIF target<>'Property' THEN RAISE EXCEPTION 'Choose one of your properties.';
  END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.link_finance_property() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS finance_property_link ON public.finance_records;
CREATE TRIGGER finance_property_link BEFORE INSERT OR UPDATE OF property_id,occurrence_record_id ON public.finance_records
 FOR EACH ROW EXECUTE FUNCTION public.link_finance_property();

-- The record form may send the property.
DO $$ DECLARE definition text:=pg_get_functiondef('public.save_finance_record(jsonb,bigint)'::regprocedure); BEGIN
 IF position($q$'business_id','property_id',$q$ in definition)>0 THEN RETURN; END IF;
 IF (length(definition)-length(replace(definition,$q$'notes','business_id',$q$,'')))/length($q$'notes','business_id',$q$)<>1 THEN RAISE EXCEPTION 'Unexpected save_finance_record definition'; END IF;
 EXECUTE replace(definition,$q$'notes','business_id',$q$,$q$'notes','business_id','property_id',$q$);
END $$;

-- The capability version moves to 148, so the app can ask for this migration.
CREATE OR REPLACE FUNCTION public.finance_capabilities() RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT jsonb_build_object('schema_version',148,'record_revisions',true,'verified_restore',true)
$$;

NOTIFY pgrst,'reload schema';
COMMIT;
