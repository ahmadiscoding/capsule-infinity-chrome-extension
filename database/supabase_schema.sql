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

-- Enable Postgres Row Level Security (RLS)
ALTER TABLE public.capsules ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to perform all actions on their own capsules
CREATE POLICY "Users can manage their own capsules" 
ON public.capsules 
FOR ALL 
TO authenticated 
USING (auth.uid()::text = user_id) 
WITH CHECK (auth.uid()::text = user_id);
