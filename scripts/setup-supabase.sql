-- Run once in Supabase → SQL Editor → New query → Run
-- Creates the shared queue store used by the Vercel deployment.

CREATE TABLE IF NOT EXISTS public.app_store (
  id text PRIMARY KEY,
  payload jsonb NOT NULL,
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.app_store ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS. These policies let the publishable/anon key work too.
DROP POLICY IF EXISTS "app_store_select" ON public.app_store;
DROP POLICY IF EXISTS "app_store_insert" ON public.app_store;
DROP POLICY IF EXISTS "app_store_update" ON public.app_store;

CREATE POLICY "app_store_select" ON public.app_store
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "app_store_insert" ON public.app_store
  FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE POLICY "app_store_update" ON public.app_store
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
