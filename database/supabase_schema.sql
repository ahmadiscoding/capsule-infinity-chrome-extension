-- ============================================
-- Capsule Infinity - Production Database Schema (Enterprise Standard)
-- Unified Auth, Native UUIDs, Automatic Foreign Keys & RLS
-- ============================================

-- 1. Data Migration: Map existing g_email rows back to their native auth.users UUIDs
DO $$
BEGIN
  -- If capsules.user_id is text, update rows that match user emails before converting column to UUID
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'capsules' AND column_name = 'user_id' AND data_type = 'text'
  ) THEN
    -- Match by exact email or g_ formatted email
    UPDATE public.capsules c
    SET user_id = u.id::text
    FROM auth.users u
    WHERE (
      c.user_id = u.email 
      OR c.user_id = 'g_' || replace(replace(u.email, '@', '_'), '.', '_')
      OR c.user_id = u.id::text
    );
  END IF;
END $$;


-- 2. Capsules Table with strict UUID and Foreign Key to auth.users
CREATE TABLE IF NOT EXISTS public.capsules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Ensure user_id column is UUID type and references auth.users
DO $$
BEGIN
  -- Drop existing policies first to allow type alteration
  DROP POLICY IF EXISTS "Users can manage their own capsules" ON public.capsules;
  DROP POLICY IF EXISTS "Allow capsule operations" ON public.capsules;
  DROP POLICY IF EXISTS "Allow user capsule access" ON public.capsules;

  -- Convert column to UUID if it was text
  ALTER TABLE public.capsules ALTER COLUMN user_id TYPE UUID USING user_id::uuid;
  
  -- Add foreign key constraint if missing
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'capsules_user_id_fkey') THEN
    ALTER TABLE public.capsules 
    ADD CONSTRAINT capsules_user_id_fkey 
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Enable Row Level Security (RLS) on capsules
ALTER TABLE public.capsules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own capsules" 
ON public.capsules 
FOR ALL 
TO authenticated 
USING (auth.uid() = user_id) 
WITH CHECK (auth.uid() = user_id);


-- 3. User Usage Table (Monthly AI Compression Quota)
CREATE TABLE IF NOT EXISTS public.user_usage (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  plan TEXT DEFAULT 'free',
  capsules_used_this_month INT DEFAULT 0,
  last_reset_date TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Migrate existing user_usage rows and alter column to UUID
DO $$
BEGIN
  DROP POLICY IF EXISTS "Users can access own usage" ON public.user_usage;
  DROP POLICY IF EXISTS "Users can read own usage" ON public.user_usage;
  DROP POLICY IF EXISTS "Allow user usage access" ON public.user_usage;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'user_usage' AND column_name = 'user_id' AND data_type = 'text'
  ) THEN
    UPDATE public.user_usage u
    SET user_id = a.id::text
    FROM auth.users a
    WHERE (
      u.user_id = a.email 
      OR u.user_id = 'g_' || replace(replace(a.email, '@', '_'), '.', '_')
      OR u.user_id = a.id::text
    );

    ALTER TABLE public.user_usage ALTER COLUMN user_id TYPE UUID USING user_id::uuid;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'user_usage_user_id_fkey') THEN
      ALTER TABLE public.user_usage 
      ADD CONSTRAINT user_usage_user_id_fkey 
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

ALTER TABLE public.user_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own usage"
  ON public.user_usage FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);


-- 4. User Feedback Table
CREATE TABLE IF NOT EXISTS public.user_feedback (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  rating INT CHECK (rating >= 1 AND rating <= 5),
  reason TEXT,
  follow_up BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

DO $$
BEGIN
  DROP POLICY IF EXISTS "Authenticated users can insert feedback" ON public.user_feedback;
  DROP POLICY IF EXISTS "Allow feedback insert" ON public.user_feedback;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'user_feedback' AND column_name = 'user_id' AND data_type = 'text'
  ) THEN
    ALTER TABLE public.user_feedback ALTER COLUMN user_id TYPE UUID USING user_id::uuid;
  END IF;
END $$;

ALTER TABLE public.user_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can insert feedback"
  ON public.user_feedback FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);


-- 5. Global Provider Daily Tracking
CREATE TABLE IF NOT EXISTS public.provider_daily_usage (
  provider TEXT NOT NULL,
  usage_date DATE NOT NULL,
  call_count INT DEFAULT 0,
  PRIMARY KEY (provider, usage_date)
);

ALTER TABLE public.provider_daily_usage ENABLE ROW LEVEL SECURITY;


-- ============================================
-- 6. Stored Procedures (Atomic RPC Functions)
-- ============================================

-- Drop old overloaded signatures
DROP FUNCTION IF EXISTS public.check_and_increment_usage(uuid, integer);
DROP FUNCTION IF EXISTS public.check_and_increment_usage(text, integer);

-- Atomic Monthly User Usage Check & Increment
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
