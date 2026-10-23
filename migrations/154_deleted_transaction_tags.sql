-- Tags on a transaction moved to Recently deleted, so Restore brings them back. Apply after 153.
-- transaction_tag_links cascade when a transaction is deleted, and neither the Recently deleted snapshot nor
-- restore_deleted_item carried them, so a restored transaction came back untagged. The deleted_items row now keeps the
-- transaction's tag ids, and a restore links again the tags that still exist, for the owner only. Re-runnable.
BEGIN;
ALTER TABLE public.deleted_items ADD COLUMN IF NOT EXISTS tags jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(tags)='array');

-- Runs after archive_deleted_record (trigger names fire alphabetically), so the archive row already exists; the links
-- themselves go with the transaction's cascade.
CREATE OR REPLACE FUNCTION public.archive_transaction_tags() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF public.finance_restore_active() THEN RETURN OLD; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.transaction_tag_links WHERE record_id=OLD.id AND user_id=OLD.user_id) THEN RETURN OLD; END IF;
 UPDATE public.deleted_items SET tags=coalesce((SELECT jsonb_agg(tag_id ORDER BY tag_id) FROM public.transaction_tag_links WHERE record_id=OLD.id AND user_id=OLD.user_id),'[]'::jsonb)
 WHERE id=(SELECT id FROM public.deleted_items WHERE user_id=OLD.user_id AND source='finance_records' AND data->>'id'=OLD.id::text ORDER BY deleted_at DESC,id DESC LIMIT 1);
 RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS archive_transaction_tags ON public.finance_records;
CREATE TRIGGER archive_transaction_tags BEFORE DELETE ON public.finance_records FOR EACH ROW EXECUTE FUNCTION public.archive_transaction_tags();
REVOKE ALL ON FUNCTION public.archive_transaction_tags() FROM PUBLIC,anon,authenticated;

-- Restore links the tags again once the transaction is back, after its splits and before its scheduled occurrences.
-- A tag deleted meanwhile is left out; a tag id that is not the owner's is never linked.
DO $$ DECLARE definition text:=pg_get_functiondef('public.restore_deleted_item(uuid)'::regprocedure);
 anchor text:=$a$ IF item.source='finance_records' AND jsonb_array_length(item.occurrences)>0 THEN$a$;
BEGIN
 IF position('transaction_tag_links' IN definition)>0 THEN RETURN; END IF;
 IF (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 THEN RAISE EXCEPTION 'Unexpected definition of restore_deleted_item. Apply migrations in order.'; END IF;
 EXECUTE replace(definition,anchor,$b$ IF item.source='finance_records' AND jsonb_array_length(item.tags)>0 THEN
  INSERT INTO public.transaction_tag_links(record_id,tag_id,user_id)
  SELECT r.id,t.id,t.user_id FROM public.finance_records r
  JOIN public.transaction_tags t ON t.user_id=r.user_id AND t.id IN (SELECT value::uuid FROM jsonb_array_elements_text(item.tags))
  WHERE r.id=(item.data->>'id')::uuid AND r.user_id=public.active_owner()
  ON CONFLICT DO NOTHING;
 END IF;$b$||chr(10)||anchor);
END $$;

-- The capability version moves to 154, so the app can ask for this migration.
CREATE OR REPLACE FUNCTION public.finance_capabilities() RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT jsonb_build_object('schema_version',154,'record_revisions',true,'verified_restore',true)
$$;

NOTIFY pgrst,'reload schema';
COMMIT;
