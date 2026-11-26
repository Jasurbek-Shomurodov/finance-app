-- Co-owners of an asset (product map, "Ownership and valuations"). Apply after 172.
-- An asset valued by hand (Property, Business, Valuables, Vehicle, Retirement account) can name the people who own the
-- rest of it: `co_owners` is a JSON list of {id, name, percentage}, in the person's own order, up to 12 entries. The
-- person's own share stays `ownership_percentage`, the one figure every total, the history and the reports read; the
-- co-owners only describe the rest ("50% mine, 30% Aziz, 20% Dilshod"), so no total changes.
-- * Each entry has exactly those three keys: a unique id (a uuid, so a list can be reordered), a trimmed name of 1 to
--   60 characters and a share above 0 and below 100. The person's share and the co-owners' together are at most 100;
--   what is left is shown as not assigned.
-- * Any other kind keeps an empty list.
-- * The record form may save the list (`save_finance_record`). A retried save counts as the same save only when the
--   list is exactly the saved one, since a shorter list is "contained" in a longer one.
-- Existing rows get an empty list: nothing they show changes. No row is rewritten or deleted. Re-runnable.
BEGIN;

CREATE OR REPLACE FUNCTION public.co_owners_valid(p_co_owners jsonb,p_kind text,p_ownership numeric) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path=public AS $$
DECLARE o jsonb; total numeric:=0; ids text[]:='{}'; share numeric;
BEGIN
 IF p_co_owners IS NULL OR jsonb_typeof(p_co_owners)<>'array' THEN RETURN false; END IF;
 IF jsonb_array_length(p_co_owners)=0 THEN RETURN true; END IF;
 IF p_kind NOT IN ('Property','Business','Valuables','Vehicle','Retirement account') OR jsonb_array_length(p_co_owners)>12 THEN RETURN false; END IF;
 FOR o IN SELECT value FROM jsonb_array_elements(p_co_owners) LOOP
  IF jsonb_typeof(o)<>'object' THEN RETURN false; END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(o))<>3 OR NOT (o ?& ARRAY['id','name','percentage']) THEN RETURN false; END IF;
  IF jsonb_typeof(o->'id')<>'string' OR jsonb_typeof(o->'name')<>'string' OR jsonb_typeof(o->'percentage')<>'number' THEN RETURN false; END IF;
  IF (o->>'id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' OR (o->>'id')=ANY(ids) THEN RETURN false; END IF;
  IF length(o->>'name')<1 OR length(o->>'name')>60 OR (o->>'name')<>btrim(o->>'name') THEN RETURN false; END IF;
  share:=(o->>'percentage')::numeric;
  IF share<=0 OR share>=100 THEN RETURN false; END IF;
  ids:=ids||(o->>'id'); total:=total+share;
 END LOOP;
 RETURN coalesce(p_ownership,100)+total<=100;
END $$;
-- A pure check every role that writes a record runs (the constraint calls it), so it keeps the default grant.

ALTER TABLE public.finance_records ADD COLUMN IF NOT EXISTS co_owners jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.finance_records DROP CONSTRAINT IF EXISTS finance_records_co_owners_check;
ALTER TABLE public.finance_records ADD CONSTRAINT finance_records_co_owners_check CHECK (public.co_owners_valid(co_owners,kind,ownership_percentage));

-- The record form may save the list, and a retry with a different list is a new save.
DO $patch$
DECLARE definition text:=pg_get_functiondef('public.save_finance_record(jsonb,bigint)'::regprocedure);
 found integer; pair text[]; pairs text[][]:=ARRAY[
  ARRAY[$old$'unit_label','amount_basis',$old$,$new$'unit_label','amount_basis','co_owners',$new$],
  ARRAY[$old$IF to_jsonb(existing) @> p_record THEN$old$,$new$IF to_jsonb(existing) @> p_record AND (NOT p_record ? 'co_owners' OR existing.co_owners=p_record->'co_owners') THEN$new$]];
BEGIN
 FOREACH pair SLICE 1 IN ARRAY pairs LOOP
  IF position(pair[2] IN definition)>0 THEN CONTINUE; END IF;
  found:=(length(definition)-length(replace(definition,pair[1],'')))/length(pair[1]);
  IF found<>1 THEN RAISE EXCEPTION 'Unexpected function definition: save_finance_record (% matches)',found; END IF;
  definition:=replace(definition,pair[1],pair[2]);
 END LOOP;
 EXECUTE definition;
END $patch$;

-- The capability version moves to 173, so the app can ask for this migration.
CREATE OR REPLACE FUNCTION public.finance_capabilities() RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT jsonb_build_object('schema_version',173,'record_revisions',true,'verified_restore',true)
$$;

NOTIFY pgrst,'reload schema';
COMMIT;
