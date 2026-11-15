-- Every transaction can be changed (the user's rule, 15 November 2026). Apply after 163.
-- A transaction written by a larger action (a mortgage payment, a transfer or trade fee, an account operation fee, a
-- tracker income or expense) was read-only apart from its custom category. Now:
-- * its category changes like any other transaction's: an expense takes any expense category, an income keeps its
--   built-in kind and takes a custom category; its business and owner may change too. Amount, date, currency and
--   account stay guarded, because balances were moved by them;
-- * a mortgage payment starts in the category of the mortgage's latest payment, so the choice is made once;
-- * edit_mortgage_payment changes a payment's amounts, date, account and notes in one transaction: the old payment is
--   undone exactly as a delete undoes it and the new one is recorded under the same id, so its category, business,
--   owner, tags and receipts stay. A failure (too little cash, too much principal) leaves everything as it was.
-- No existing row changes. Re-runnable.
BEGIN;

-- What may change on a linked transaction without touching a balance.
CREATE OR REPLACE FUNCTION public.linked_category_change(o public.finance_records,n public.finance_records) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path=public AS $$
 SELECT (o.mortgage_payment_id IS NOT NULL OR o.movement_id IS NOT NULL OR o.operation_id IS NOT NULL OR o.history_event_id IS NOT NULL)
  AND (n.kind=o.kind OR (o.kind IN ('Rent expense','Living expense','Charity','Other expense') AND n.kind IN ('Rent expense','Living expense','Charity','Other expense')))
  AND (n.business_id IS NOT DISTINCT FROM o.business_id OR o.history_event_id IS NULL)
  AND (to_jsonb(n)-ARRAY['kind','custom_category_id','name','business_id','member_id','shared'])=(to_jsonb(o)-ARRAY['kind','custom_category_id','name','business_id','member_id','shared'])
$$;
REVOKE ALL ON FUNCTION public.linked_category_change(public.finance_records,public.finance_records) FROM PUBLIC,anon;

DO $patch$
DECLARE
 fn regprocedure;
 anchor text:=$a$IF TG_OP='UPDATE' AND NEW.user_id=public.active_owner() AND (to_jsonb(NEW)-'custom_category_id')=(to_jsonb(OLD)-'custom_category_id') THEN RETURN NEW; END IF;$a$;
 pass text:=$b$ IF TG_OP='UPDATE' AND NEW.user_id=public.active_owner() AND public.linked_category_change(OLD,NEW) THEN RETURN NEW; END IF;$b$;
 kind_was text:=$a$AND NEW.kind='Other expense' AND NEW.currency=m.currency$a$;
 kind_is text:=$b$AND NEW.kind IN ('Rent expense','Living expense','Charity','Other expense') AND NEW.currency=m.currency$b$;
 definition text;
BEGIN
 FOREACH fn IN ARRAY ARRAY['public.guard_investment_history_record()'::regprocedure,'public.guard_mortgage_payment_record()'::regprocedure,
  'public.guard_movement_record()'::regprocedure,'public.guard_operation_record()'::regprocedure] LOOP
  definition:=pg_get_functiondef(fn);
  CONTINUE WHEN position('linked_category_change' IN definition)>0;
  IF (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 THEN RAISE EXCEPTION 'Unexpected definition of %. Apply migrations in order.',fn; END IF;
  definition:=replace(definition,anchor,anchor||chr(10)||pass);
  IF fn='public.guard_mortgage_payment_record()'::regprocedure THEN
   IF (length(definition)-length(replace(definition,kind_was,'')))/length(kind_was)<>1 THEN RAISE EXCEPTION 'Unexpected definition of %. Apply migrations in order.',fn; END IF;
   definition:=replace(definition,kind_was,kind_is);
  END IF;
  EXECUTE definition;
 END LOOP;
 -- An operation's fee is an expense of any category; interest received on money lent stays income.
 definition:=pg_get_functiondef('public.validate_operation_record()'::regprocedure);
 IF position($c$ELSE NEW.kind NOT IN$c$ IN definition)=0 THEN
  anchor:=$a$NEW.kind<>(CASE WHEN op.action='repayment' AND destination.kind='Money lent' THEN 'Other income' ELSE 'Other expense' END)$a$;
  IF (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 THEN RAISE EXCEPTION 'Unexpected definition of validate_operation_record. Apply migrations in order.'; END IF;
  EXECUTE replace(definition,anchor,$b$(CASE WHEN op.action='repayment' AND destination.kind='Money lent' THEN NEW.kind<>'Other income' ELSE NEW.kind NOT IN ('Rent expense','Living expense','Charity','Other expense') END)$b$);
 END IF;
END $patch$;

-- Changing category from Transactions reaches linked rows too. Rules (apply_transaction_rule) still leave them alone.
CREATE OR REPLACE FUNCTION public.recategorize_transactions(p_ids uuid[],p_kind text,p_category uuid) RETURNS uuid[]
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE owner uuid:=public.active_owner(); incoming boolean; changed uuid[];
BEGIN
 IF owner IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 IF p_kind IS NULL OR p_kind NOT IN ('Salary','Rent income','Business income','Other income','Rent expense','Living expense','Charity','Other expense') OR coalesce(array_length(p_ids,1),0)>500 THEN RAISE EXCEPTION 'Choose a category matching the transaction type.'; END IF;
 incoming:=p_kind IN ('Salary','Rent income','Business income','Other income');
 IF p_category IS NOT NULL AND (p_kind NOT IN ('Other income','Other expense') OR NOT EXISTS(SELECT 1 FROM public.transaction_categories WHERE id=p_category AND user_id=owner AND direction=CASE WHEN incoming THEN 'income' ELSE 'expense' END)) THEN RAISE EXCEPTION 'Choose a category matching the transaction type.'; END IF;
 WITH moved AS (
  UPDATE public.finance_records r SET kind=p_kind,custom_category_id=p_category,name=CASE WHEN lower(trim(r.name)) IN (lower(r.kind),lower(coalesce((SELECT trim(c.name) FROM public.transaction_categories c WHERE c.id=r.custom_category_id),''))) THEN coalesce((SELECT trim(c.name) FROM public.transaction_categories c WHERE c.id=p_category),p_kind) ELSE r.name END
  WHERE r.user_id=owner AND r.id=ANY(p_ids) AND r.frequency='Once'
   AND r.kind IN (SELECT unnest(CASE WHEN incoming THEN ARRAY['Salary','Rent income','Business income','Other income'] ELSE ARRAY['Rent expense','Living expense','Charity','Other expense'] END))
   AND (r.kind,r.custom_category_id) IS DISTINCT FROM (p_kind,p_category)
   -- A linked income keeps the kind its action gave it (rent from a property, interest from a deposit).
   AND ((r.movement_id IS NULL AND r.operation_id IS NULL AND r.mortgage_payment_id IS NULL AND r.history_event_id IS NULL) OR NOT incoming OR r.kind=p_kind)
   AND r.income_source_id IS NULL AND r.earning_source_id IS NULL
   AND (p_kind<>'Business income' OR r.business_id IS NOT NULL)
   AND NOT EXISTS(SELECT 1 FROM public.transaction_splits s WHERE s.record_id=r.id AND s.user_id=owner)
  RETURNING r.id)
 SELECT coalesce(array_agg(id),'{}') INTO changed FROM moved;
 RETURN changed;
END $$;

-- A new mortgage payment starts in the category of the mortgage's latest payment.
CREATE OR REPLACE FUNCTION public.inherit_mortgage_payment_category() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE latest public.finance_records;
BEGIN
 IF NEW.mortgage_payment_id IS NULL OR NEW.kind<>'Other expense' OR NEW.custom_category_id IS NOT NULL OR public.finance_restore_active() THEN RETURN NEW; END IF;
 SELECT r.* INTO latest FROM public.mortgage_payments mine
  JOIN public.mortgage_payments p ON p.mortgage_id=mine.mortgage_id AND p.user_id=mine.user_id AND p.id<>mine.id
  JOIN public.finance_records r ON r.mortgage_payment_id=p.id AND r.user_id=mine.user_id
  WHERE mine.id=NEW.mortgage_payment_id AND mine.user_id=NEW.user_id
  ORDER BY p.paid_on DESC,r.created_at DESC,r.id DESC LIMIT 1;
 IF latest.id IS NOT NULL AND latest.kind IN ('Rent expense','Living expense','Charity','Other expense') THEN
  NEW.kind:=latest.kind; NEW.custom_category_id:=latest.custom_category_id;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.inherit_mortgage_payment_category() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS a_inherit_mortgage_payment_category ON public.finance_records;
CREATE TRIGGER a_inherit_mortgage_payment_category BEFORE INSERT ON public.finance_records
 FOR EACH ROW EXECUTE FUNCTION public.inherit_mortgage_payment_category();

-- Changes a recorded mortgage payment. p_data: account_id, principal, interest, date, notes, and for a cash account in
-- another currency the dated rate the server worked out (rate, rate_date).
CREATE OR REPLACE FUNCTION public.edit_mortgage_payment(p_id uuid,p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE owner uuid:=public.active_owner(); t public.finance_records; pay public.mortgage_payments; op public.account_activity;
 h public.investment_history; r public.finance_records; a public.finance_records;
 aid uuid:=(p_data->>'account_id')::uuid; principal numeric:=(p_data->>'principal')::numeric; interest numeric:=(p_data->>'interest')::numeric;
 day date:=(p_data->>'date')::date; memo text:=coalesce(p_data->>'notes','');
 tags uuid[]; known uuid[]; stale uuid[]; touched uuid[];
BEGIN
 IF owner IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 IF NOT public.can_write_owner(owner) THEN RAISE EXCEPTION 'This shared workspace is view-only.' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(owner::text,0));
 SELECT * INTO t FROM public.finance_records WHERE id=p_id AND user_id=owner AND mortgage_payment_id IS NOT NULL FOR UPDATE;
 SELECT * INTO pay FROM public.mortgage_payments WHERE id=t.mortgage_payment_id AND user_id=owner;
 SELECT * INTO r FROM public.finance_records WHERE id=pay.mortgage_id AND user_id=owner AND kind='Mortgage';
 IF t.id IS NULL OR pay.id IS NULL OR r.id IS NULL THEN RAISE EXCEPTION 'Payment not found.'; END IF;
 SELECT * INTO a FROM public.finance_records WHERE id=aid AND user_id=owner AND kind='Cash';
 IF a.id IS NULL THEN RAISE EXCEPTION 'Choose one of your cash accounts.'; END IF;
 IF principal IS NULL OR interest IS NULL OR day IS NULL OR principal<0 OR interest<0 OR principal+interest<=0 OR principal+interest>1e15 THEN RAISE EXCEPTION 'Check the payment fields.'; END IF;
 SELECT * INTO op FROM public.account_activity WHERE id=pay.id AND user_id=owner AND action='mortgage';
 SELECT * INTO h FROM public.investment_history WHERE id=pay.id AND user_id=owner AND record_id=r.id AND event_type='mortgage_payment';
 tags:=ARRAY(SELECT tag_id FROM public.transaction_tag_links WHERE record_id=t.id AND user_id=owner);
 touched:=array_remove(ARRAY[r.id,op.account_id,(SELECT account_id FROM public.investment_account_links WHERE id=pay.id AND user_id=owner),a.id],NULL);
 known:=ARRAY(SELECT id FROM public.investment_history WHERE user_id=owner AND record_id=ANY(touched));
 -- The balance updates the old payment wrote for the mortgage and its cash account: they describe a payment that no longer exists.
 stale:=ARRAY(
  (SELECT id FROM public.investment_history WHERE user_id=owner AND record_id=r.id AND event_type='valuation' AND occurred_on=pay.paid_on
    AND balance IS NOT DISTINCT FROM h.balance AND created_at>=h.created_at ORDER BY created_at,id LIMIT 1)
  UNION ALL
  (SELECT id FROM public.investment_history WHERE user_id=owner AND record_id=op.account_id AND event_type='valuation' AND occurred_on=op.occurred_on
    AND balance IS NOT DISTINCT FROM op.after_balance AND created_at>=op.created_at ORDER BY created_at,id LIMIT 1));
 PERFORM public.delete_linked_transaction(p_id);
 -- An edit is not a deletion: nothing goes to Recently deleted.
 DELETE FROM public.deleted_items WHERE user_id=owner AND source='finance_records' AND data->>'id'=p_id::text AND linked_operation IS NOT NULL;
 DELETE FROM public.deleted_tracker_updates WHERE id=pay.id AND user_id=owner;
 DELETE FROM public.investment_history WHERE user_id=owner AND record_id=ANY(touched) AND event_type='valuation' AND (id=ANY(stale) OR NOT (id=ANY(known)));
 IF a.currency=r.currency THEN
  PERFORM public.planning_action('mortgage',jsonb_build_object('id',p_id,'account_id',aid,'target_id',r.id,'amount',principal,'received',0,'fee',interest,'date',day,'notes',memo));
 ELSE
  PERFORM public.record_investment_with_fx(p_id,r.id,'mortgage_payment',day,principal+interest,NULL,memo,aid,(p_data->>'rate')::numeric,(p_data->>'rate_date')::date,a.currency,r.currency,principal,interest);
 END IF;
 UPDATE public.finance_records SET kind=t.kind,custom_category_id=t.custom_category_id,business_id=t.business_id,member_id=t.member_id,shared=t.shared
  WHERE id=p_id AND user_id=owner AND (kind,custom_category_id,business_id,member_id,shared) IS DISTINCT FROM (t.kind,t.custom_category_id,t.business_id,t.member_id,t.shared);
 INSERT INTO public.transaction_tag_links(record_id,tag_id,user_id) SELECT p_id,tag,owner FROM unnest(tags) tag ON CONFLICT DO NOTHING;
 RETURN jsonb_build_object('ok',true);
END $$;
REVOKE ALL ON FUNCTION public.edit_mortgage_payment(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.edit_mortgage_payment(uuid,jsonb) TO authenticated;

-- The capability version moves to 164, so the app can ask for this migration.
CREATE OR REPLACE FUNCTION public.finance_capabilities() RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT jsonb_build_object('schema_version',164,'record_revisions',true,'verified_restore',true)
$$;

NOTIFY pgrst,'reload schema';
COMMIT;
