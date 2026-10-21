-- Money lent may name a borrower group (Family, a friend with several loans), so several loans to the same group are
-- listed together with their total (Loans & debts). Each loan keeps its own name, the borrower. Apply after 151.
-- Only money lent carries a group; it is trimmed text of at most 120 characters, and a loan without one (null) stays a
-- row of its own. Re-runnable; no existing rows change.
BEGIN;
ALTER TABLE public.finance_records ADD COLUMN IF NOT EXISTS borrower_group text;
ALTER TABLE public.finance_records DROP CONSTRAINT IF EXISTS finance_records_borrower_group;
ALTER TABLE public.finance_records ADD CONSTRAINT finance_records_borrower_group
 CHECK (borrower_group IS NULL OR (kind='Money lent' AND borrower_group=btrim(borrower_group) AND length(borrower_group) BETWEEN 1 AND 120));

-- The record form may send the group.
DO $$ DECLARE definition text:=pg_get_functiondef('public.save_finance_record(jsonb,bigint)'::regprocedure); BEGIN
 IF position($q$'property_id','borrower_group',$q$ in definition)>0 THEN RETURN; END IF;
 IF (length(definition)-length(replace(definition,$q$'business_id','property_id',$q$,'')))/length($q$'business_id','property_id',$q$)<>1 THEN RAISE EXCEPTION 'Unexpected save_finance_record definition'; END IF;
 EXECUTE replace(definition,$q$'business_id','property_id',$q$,$q$'business_id','property_id','borrower_group',$q$);
END $$;

-- The capability version moves to 152, so the app can ask for this migration.
CREATE OR REPLACE FUNCTION public.finance_capabilities() RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT jsonb_build_object('schema_version',152,'record_revisions',true,'verified_restore',true)
$$;

NOTIFY pgrst,'reload schema';
COMMIT;
