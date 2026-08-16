-- ============================================
-- Capsule Infinity - Database Schema Configuration
-- ============================================

-- 1. Create capsules table with UUID primary key and TEXT user_id
CREATE TABLE IF NOT EXISTS public.capsules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL, -- Supports both Supabase UUIDs and fallback string profile IDs
    title TEXT NOT NULL,
    content TEXT NOT NULL, -- Holds serialized JSON containing platform, tags, and chat body
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable Postgres Row Level Security (RLS) for capsules
ALTER TABLE public.capsules ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to perform all actions on their own capsules
CREATE POLICY "Users can manage their own capsules" 
ON public.capsules 
FOR ALL 
TO authenticated 
USING (auth.uid()::text = user_id) 
WITH CHECK (auth.uid()::text = user_id);


-- 2. Create user_usage table for tracking per-user monthly AI compression quota
CREATE TABLE IF NOT EXISTS public.user_usage (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  plan TEXT DEFAULT 'free',                    -- 'free' | 'pro' | 'premium'
  capsules_used_this_month INT DEFAULT 0,
  last_reset_date TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.user_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own usage"
  ON public.user_usage FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);


-- 3. Create provider_daily_usage table for tracking global AI provider usage
CREATE TABLE IF NOT EXISTS public.provider_daily_usage (
  provider TEXT NOT NULL,
  usage_date DATE NOT NULL,
  call_count INT DEFAULT 0,
  PRIMARY KEY (provider, usage_date)
);

ALTER TABLE public.provider_daily_usage ENABLE ROW LEVEL SECURITY;


-- 4. Atomic check-and-increment function for monthly user quota
CREATE OR REPLACE FUNCTION public.check_and_increment_usage(
  target_user_id UUID,
  max_limit INT
)
RETURNS TABLE (allowed BOOLEAN, current_usage INT, user_plan TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_plan TEXT;
  v_used INT;
  v_reset TIMESTAMPTZ;
BEGIN
  INSERT INTO public.user_usage (user_id, plan, capsules_used_this_month, last_reset_date)
  VALUES (target_user_id, 'free', 0, NOW())
  ON CONFLICT (user_id) DO NOTHING;

  SELECT plan, capsules_used_this_month, last_reset_date
  INTO v_plan, v_used, v_reset
  FROM public.user_usage
  WHERE user_id = target_user_id
  FOR UPDATE;

  IF date_trunc('month', v_reset) < date_trunc('month', NOW()) THEN
    v_used := 0;
    v_reset := NOW();
  END IF;

  IF v_used >= max_limit THEN
    RETURN QUERY SELECT FALSE, v_used, v_plan;
    RETURN;
  END IF;

  UPDATE public.user_usage
  SET capsules_used_this_month = v_used + 1,
      last_reset_date = v_reset
  WHERE user_id = target_user_id;

  RETURN QUERY SELECT TRUE, v_used + 1, v_plan;
END;
$$;


-- 5. Atomic check-and-increment function for global daily provider caps
CREATE OR REPLACE FUNCTION public.increment_provider_daily(
  p_provider TEXT,
  p_date DATE
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INT;
BEGIN
  INSERT INTO public.provider_daily_usage (provider, usage_date, call_count)
  VALUES (p_provider, p_date, 1)
  ON CONFLICT (provider, usage_date)
  DO UPDATE SET call_count = provider_daily_usage.call_count + 1
  RETURNING call_count INTO v_count;
  RETURN v_count;
END;
$$;


-- 6. Create user_feedback table for star rating and optional comments
CREATE TABLE IF NOT EXISTS public.user_feedback (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  rating INT CHECK (rating >= 1 AND rating <= 5),
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.user_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can insert feedback"
  ON public.user_feedback FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);


-- 7. Create teams table for team collaboration (optional)
CREATE TABLE IF NOT EXISTS public.teams (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  creator_email TEXT NOT NULL,
  user_emails TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read teams they belong to"
  ON public.teams FOR SELECT
  TO authenticated
  USING (auth.jwt() ->> 'email' = ANY(user_emails) OR creator_email = auth.jwt() ->> 'email');

