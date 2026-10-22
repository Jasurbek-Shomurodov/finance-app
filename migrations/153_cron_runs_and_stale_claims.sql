-- Scheduled Telegram reports a cut-off run left behind, and a record of every scheduled run. Apply after 152.
-- A delivery claim is written before a report is sent. When Vercel stopped a run at its time limit, the claim stayed and
-- skipped the owner for the whole period, so neither the picture nor the text arrived. A claim now says whether its
-- report was delivered, and one still undelivered five minutes after it was taken (a run lasts at most one) is taken
-- over by the next run through claim_telegram_delivery. Claims from before yesterday count as delivered; today's and
-- yesterday's may be sent again by a retry.
-- cron_runs keeps each scheduled job's start, end, outcome and answer, because a Hobby project keeps Vercel's logs for
-- about an hour; a run still 'running' long after it started was cut off. Server-only. Re-runnable.
BEGIN;
ALTER TABLE public.telegram_deliveries ADD COLUMN IF NOT EXISTS delivered boolean NOT NULL DEFAULT false;
UPDATE public.telegram_deliveries SET delivered=true WHERE NOT delivered AND period<current_date-1;

CREATE OR REPLACE FUNCTION public.claim_telegram_delivery(p_user uuid,p_kind text,p_period date) RETURNS boolean
LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path=public AS $$
 WITH claim AS (
  INSERT INTO public.telegram_deliveries AS d (user_id,kind,period) VALUES (p_user,p_kind,p_period)
  ON CONFLICT (user_id,kind,period) DO UPDATE SET sent_at=now()
   WHERE NOT d.delivered AND d.sent_at<now()-interval '5 minutes'
  RETURNING 1
 )
 SELECT EXISTS (SELECT 1 FROM claim)
$$;
REVOKE ALL ON FUNCTION public.claim_telegram_delivery(uuid,text,date) FROM PUBLIC,anon,authenticated;

CREATE TABLE IF NOT EXISTS public.cron_runs (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 job text NOT NULL CHECK (job ~ '^[a-z][a-z-]{0,39}$'),
 started_at timestamptz NOT NULL DEFAULT now(),
 finished_at timestamptz,
 status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','ok','failed')),
 result jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (pg_column_size(result)<=8192)
);
CREATE INDEX IF NOT EXISTS cron_runs_job_started ON public.cron_runs (job,started_at DESC);
ALTER TABLE public.cron_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cron_runs FROM PUBLIC,anon,authenticated;

DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
 GRANT UPDATE (delivered,sent_at) ON public.telegram_deliveries TO service_role;
 GRANT EXECUTE ON FUNCTION public.claim_telegram_delivery(uuid,text,date) TO service_role;
 GRANT SELECT,INSERT,UPDATE,DELETE ON public.cron_runs TO service_role;
END IF; END $$;

-- The capability version moves to 153, so the app can ask for this migration.
CREATE OR REPLACE FUNCTION public.finance_capabilities() RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT jsonb_build_object('schema_version',153,'record_revisions',true,'verified_restore',true)
$$;

NOTIFY pgrst,'reload schema';
COMMIT;
