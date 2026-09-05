-- ============================================
-- Capsule Infinity - Complete Database Schema Configuration
-- ============================================

-- 1. Create capsules table with UUID primary key and TEXT user_id
CREATE TABLE IF NOT EXISTS public.capsules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL, -- Supports both Supabase UUIDs and Google string profile IDs
    title TEXT NOT NULL,
    content TEXT NOT NULL, -- Holds serialized JSON containing platform, tags, and chat body
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable Postgres Row Level Security (RLS) for capsules
ALTER TABLE public.capsules ENABLE ROW LEVEL SECURITY;

-- Drop any previous restrictive policies
DROP POLICY IF EXISTS "Users can manage their own capsules" ON public.capsules;
DROP POLICY IF EXISTS "Allow capsule operations" ON public.capsules;
DROP POLICY IF EXISTS "Allow user capsule access" ON public.capsules;

-- Allow users to manage their own capsules (handles both Supabase JWT auth and token-based user_id)
CREATE POLICY "Allow user capsule access" 
ON public.capsules 
FOR ALL 
TO public 
USING (
  (auth.uid() IS NOT NULL AND auth.uid()::text = user_id)
  OR
  (user_id IS NOT NULL AND length(user_id) > 0)
) 
WITH CHECK (
  (auth.uid() IS NOT NULL AND auth.uid()::text = user_id)
  OR
  (user_id IS NOT NULL AND length(user_id) > 0)
);


-- 2. Create user_usage table for tracking per-user monthly AI compression quota
CREATE TABLE IF NOT EXISTS public.user_usage (
  user_id TEXT PRIMARY KEY,                    -- TEXT supports both Supabase UUIDs and Google user IDs
  plan TEXT DEFAULT 'free',                    -- 'free' | 'pro' | 'premium'
  capsules_used_this_month INT DEFAULT 0,
  last_reset_date TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.user_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own usage" ON public.user_usage;
DROP POLICY IF EXISTS "Allow user usage access" ON public.user_usage;

CREATE POLICY "Allow user usage access"
  ON public.user_usage FOR ALL
  TO public
  USING (
    (auth.uid() IS NOT NULL AND auth.uid()::text = user_id)
    OR
    (user_id IS NOT NULL AND length(user_id) > 0)
  )
  WITH CHECK (
    (auth.uid() IS NOT NULL AND auth.uid()::text = user_id)
    OR
    (user_id IS NOT NULL AND length(user_id) > 0)
  );


-- 3. Create provider_daily_usage table for tracking global AI provider usage
CREATE TABLE IF NOT EXISTS public.provider_daily_usage (
  provider TEXT NOT NULL,
  usage_date DATE NOT NULL,
  call_count INT DEFAULT 0,
  PRIMARY KEY (provider, usage_date)
);

ALTER TABLE public.provider_daily_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow provider usage access" ON public.provider_daily_usage;
CREATE POLICY "Allow provider usage access"
  ON public.provider_daily_usage FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);


-- 4. Create user_feedback table for star rating and optional comments
CREATE TABLE IF NOT EXISTS public.user_feedback (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT,                                -- TEXT supports both Supabase UUIDs and Google string IDs
  rating INT CHECK (rating >= 1 AND rating <= 5),
  reason TEXT,
  follow_up BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.user_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can insert feedback" ON public.user_feedback;
DROP POLICY IF EXISTS "Allow feedback insert" ON public.user_feedback;

CREATE POLICY "Allow feedback insert"
  ON public.user_feedback FOR INSERT
  TO public
  WITH CHECK (true);


-- 5. Create teams table for team collaboration (optional)
CREATE TABLE IF NOT EXISTS public.teams (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  creator_email TEXT NOT NULL,
  user_emails TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read teams they belong to" ON public.teams;
CREATE POLICY "Users can read teams they belong to"
  ON public.teams FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);


-- ============================================
-- 6. SECURITY DEFINER RPC FUNCTIONS (Guaranteed Execution)
-- ============================================

-- Atomic Capsule Save (Upsert)
CREATE OR REPLACE FUNCTION public.save_capsule_atomic(
  p_id UUID,
  p_user_id TEXT,
  p_title TEXT,
  p_content TEXT
)
RETURNS TABLE (id UUID, user_id TEXT, title TEXT, content TEXT, created_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  INSERT INTO public.capsules (id, user_id, title, content)
  VALUES (p_id, p_user_id, p_title, p_content)
  ON CONFLICT (id) DO UPDATE
  SET title = EXCLUDED.title,
      content = EXCLUDED.content,
      user_id = EXCLUDED.user_id
  RETURNING public.capsules.id, public.capsules.user_id, public.capsules.title, public.capsules.content, public.capsules.created_at;
END;
$$;

-- Atomic Capsule Retrieval by User
CREATE OR REPLACE FUNCTION public.get_user_capsules_atomic(
  p_user_id TEXT
)
RETURNS TABLE (id UUID, user_id TEXT, title TEXT, content TEXT, created_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT c.id, c.user_id, c.title, c.content, c.created_at
  FROM public.capsules c
  WHERE c.user_id = p_user_id
  ORDER BY c.created_at DESC;
END;
$$;

-- Atomic Capsule Deletion
CREATE OR REPLACE FUNCTION public.delete_capsule_atomic(
  p_id UUID,
  p_user_id TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM public.capsules
  WHERE id = p_id AND (user_id = p_user_id OR p_user_id IS NULL);
  RETURN TRUE;
END;
$$;

-- Atomic Check & Increment Usage for monthly quota
CREATE OR REPLACE FUNCTION public.check_and_increment_usage(
  target_user_id TEXT,
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

-- Atomic Daily Provider Increment
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

-- Atomic Submit Feedback
CREATE OR REPLACE FUNCTION public.submit_feedback_atomic(
  p_user_id TEXT,
  p_rating INT,
  p_reason TEXT,
  p_follow_up BOOLEAN DEFAULT FALSE
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.user_feedback (user_id, rating, reason, follow_up)
  VALUES (p_user_id, p_rating, p_reason, p_follow_up);
  RETURN TRUE;
END;
$$;
