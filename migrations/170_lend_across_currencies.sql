-- Money lent from a cash account in another currency. Apply after 169.
-- A loan of 1,300,000 UZS handed over from a USD wallet: the loan keeps its own currency and amount, and the wallet
-- loses that amount at the dated rate the app shows (record units per account unit), as a cross-currency tracker
-- update does (`record_investment_with_fx`). One transaction; a retry after a lost response moves no more cash. The
-- two-argument `lend_from_account` (migration 121) stays for an account in the loan's own currency. No rows change.
BEGIN;

CREATE OR REPLACE FUNCTION public.lend_from_account(p_record jsonb,p_account uuid,p_rate numeric,p_rate_date date,p_account_currency text,p_record_currency text) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE loan uuid; lent numeric; lent_on date;
BEGIN
 IF jsonb_typeof(p_record)<>'object' OR p_record->>'kind' IS DISTINCT FROM 'Money lent' OR p_account IS NULL
 OR p_record->>'currency' IS DISTINCT FROM p_record_currency THEN RAISE EXCEPTION 'Check the record fields.'; END IF;
 loan:=(p_record->>'id')::uuid; lent:=(p_record->>'amount')::numeric; lent_on:=(p_record->>'lent_date')::date;
 IF loan IS NULL OR lent IS NULL OR lent<=0 OR lent_on IS NULL THEN RAISE EXCEPTION 'Check the record fields.'; END IF;
 -- The cash movement takes the loan's id, so a retry finds it and changes nothing.
 IF EXISTS(SELECT 1 FROM public.investment_account_links WHERE id=loan) THEN
  IF NOT EXISTS(SELECT 1 FROM public.investment_account_links WHERE id=loan AND account_id=p_account AND exchange_rate=p_rate AND amount=-lent/p_rate) THEN RAISE EXCEPTION 'This update was already saved with different details.'; END IF;
  RETURN (SELECT jsonb_build_array(to_jsonb(r)) FROM public.finance_records r WHERE r.id=loan);
 END IF;
 PERFORM public.save_finance_record(p_record||jsonb_build_object('amount',0),NULL);
 -- This checks the account, the rate and its date, and the balance, and rolls the loan back with it.
 PERFORM public.record_investment_with_fx(loan,loan,'contribution',lent_on,lent,NULL,'',p_account,p_rate,p_rate_date,p_account_currency,p_record_currency);
 RETURN (SELECT jsonb_build_array(to_jsonb(r)) FROM public.finance_records r WHERE r.id=loan);
END $$;
REVOKE ALL ON FUNCTION public.lend_from_account(jsonb,uuid,numeric,date,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.lend_from_account(jsonb,uuid,numeric,date,text,text) TO authenticated;

-- The capability version moves to 170, so the app can ask for this migration.
CREATE OR REPLACE FUNCTION public.finance_capabilities() RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT jsonb_build_object('schema_version',170,'record_revisions',true,'verified_restore',true)
$$;

NOTIFY pgrst,'reload schema';
COMMIT;
