-- The owner's share moves their cash, and a closed holding stays out of the totals (the 28 November 2026 audit).
-- Apply after 173.
-- * A one-time income or expense entered for the whole of a part-owned business (`amount_basis` 'whole', migration
--   167) counts at the owner's share in every total; the cash account it names now moves by that share too, never by
--   the business's full figure. `own_amount` is the one rule (lib/finance.ts `ownAmount`): the amount at
--   `business_share` percent for a whole-business figure with a share above 0, the amount itself otherwise.
--   `apply_account_cashflow` and the statement legs (`account_statement_legs`) read it. No row used 'whole' with an
--   account when this was written, so no balance is rewritten.
-- * A stock, coin, metal or vested shares can be closed only with no units left. A price of 0 with units left no
--   longer counts as empty: a live quote would value those units again while the holding sits under Closed.
-- Functions keep their signatures and are patched by text, so re-applying an older migration and then this one
-- leaves them as they are. Re-runnable.
BEGIN;

CREATE OR REPLACE FUNCTION public.own_amount(p_amount numeric,p_basis text,p_share numeric) RETURNS numeric
LANGUAGE sql IMMUTABLE SET search_path=public AS $$
 SELECT CASE WHEN p_basis='whole' AND p_share IS NOT NULL AND p_share>0 AND p_share<>100 THEN p_amount*p_share/100 ELSE p_amount END
$$;

DO $patch$
DECLARE target text; definition text; found integer; pair text[]; patches jsonb:=jsonb_build_object(
 'public.apply_account_cashflow()',jsonb_build_array(
  jsonb_build_array($old$THEN OLD.amount ELSE -OLD.amount END$old$,$new$THEN public.own_amount(OLD.amount,OLD.amount_basis,OLD.business_share) ELSE -public.own_amount(OLD.amount,OLD.amount_basis,OLD.business_share) END$new$),
  jsonb_build_array($old$THEN NEW.amount ELSE -NEW.amount END$old$,$new$THEN public.own_amount(NEW.amount,NEW.amount_basis,NEW.business_share) ELSE -public.own_amount(NEW.amount,NEW.amount_basis,NEW.business_share) END$new$)),
 'public.account_statement_legs(uuid,date,date)',jsonb_build_array(
  jsonb_build_array($old$THEN r.amount ELSE -r.amount END/coalesce(r.account_exchange_rate,1)$old$,$new$THEN public.own_amount(r.amount,r.amount_basis,r.business_share) ELSE -public.own_amount(r.amount,r.amount_basis,r.business_share) END/coalesce(r.account_exchange_rate,1)$new$)),
 'public.guard_closed_record()',jsonb_build_array(
  jsonb_build_array($old$WHEN NEW.kind IN ('Stock','Crypto','Precious metals','Equity compensation') THEN NEW.quantity=0 OR NEW.amount=0$old$,$new$WHEN NEW.kind IN ('Stock','Crypto','Precious metals','Equity compensation') THEN (NEW.quantity=0)$new$)));
 item jsonb;
BEGIN
 FOR target IN SELECT jsonb_object_keys(patches) LOOP
  definition:=pg_get_functiondef(target::regprocedure);
  FOR item IN SELECT value FROM jsonb_array_elements(patches->target) LOOP
   pair:=ARRAY[item->>0,item->>1];
   IF position(pair[2] IN definition)>0 THEN CONTINUE; END IF;
   found:=(length(definition)-length(replace(definition,pair[1],'')))/length(pair[1]);
   IF found<>1 THEN RAISE EXCEPTION 'Unexpected function definition: % (% matches)',target,found; END IF;
   definition:=replace(definition,pair[1],pair[2]);
  END LOOP;
  EXECUTE definition;
 END LOOP;
END $patch$;

-- The capability version moves to 174, so the app can ask for this migration.
CREATE OR REPLACE FUNCTION public.finance_capabilities() RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT jsonb_build_object('schema_version',174,'record_revisions',true,'verified_restore',true)
$$;

NOTIFY pgrst,'reload schema';
COMMIT;
