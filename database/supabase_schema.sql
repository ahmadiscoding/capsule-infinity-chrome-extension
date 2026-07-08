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

-- Note: Row Level Security is disabled so all users (including fallback local profile accounts) can synchronize.
-- Data security is handled via application-level query filtering.
ALTER TABLE public.capsules DISABLE ROW LEVEL SECURITY;
