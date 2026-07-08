-- ============================================
-- Capsule Infinity - Database Schema Configuration
-- ============================================

-- 1. Create capsules table with UUID primary key
CREATE TABLE IF NOT EXISTS public.capsules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    content TEXT NOT NULL, -- Holds serialized JSON containing platform, tags, and chat body
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Enable Row Level Security (RLS)
ALTER TABLE public.capsules ENABLE ROW LEVEL SECURITY;

-- 3. Create RLS Policies
-- Users can only insert their own capsules
CREATE POLICY "Users can insert their own capsules" 
ON public.capsules 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- Users can only view their own capsules
CREATE POLICY "Users can view their own capsules" 
ON public.capsules 
FOR SELECT 
USING (auth.uid() = user_id);

-- Users can only update their own capsules
CREATE POLICY "Users can update their own capsules" 
ON public.capsules 
FOR UPDATE 
USING (auth.uid() = user_id);

-- Users can only delete their own capsules
CREATE POLICY "Users can delete their own capsules" 
ON public.capsules 
FOR DELETE 
USING (auth.uid() = user_id);
