-- Shared Worlds Feature
-- This migration adds support for sharing worlds via unique URLs
-- Users can view shared worlds without authentication, but need to sign in to copy and edit

-- Create the shared_worlds table for storing shared world snapshots
CREATE TABLE IF NOT EXISTS public.shared_worlds (
  share_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id TEXT NOT NULL, -- Original world ID from the owner
  user_id TEXT NOT NULL, -- Clerk user ID of the world owner
  share_url_slug VARCHAR(20) UNIQUE NOT NULL, -- Short, unique URL identifier
  world_snapshot JSONB NOT NULL, -- Complete world data at time of sharing
  world_name TEXT NOT NULL, -- Denormalized for easier querying
  world_description TEXT, -- Denormalized for easier querying
  page_count INTEGER DEFAULT 0, -- Number of pages in the world
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(), -- When the share was last updated
  views_count INTEGER DEFAULT 0,
  copies_count INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true, -- Owner can disable sharing
  expires_at TIMESTAMPTZ -- Optional expiration date for shares
);

-- Create a table to track world copies (for analytics and preventing duplicate copies)
CREATE TABLE IF NOT EXISTS public.world_copies (
  copy_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  share_id UUID REFERENCES public.shared_worlds(share_id) ON DELETE CASCADE,
  copied_by_user_id TEXT NOT NULL, -- User who copied the world
  new_world_id TEXT NOT NULL, -- The ID of the copied world in the user's account
  copied_at TIMESTAMPTZ DEFAULT NOW(),

  -- Prevent a user from copying the same shared world multiple times
  UNIQUE(share_id, copied_by_user_id)
);

-- Create a table to track share views (for analytics)
CREATE TABLE IF NOT EXISTS public.share_views (
  view_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  share_id UUID REFERENCES public.shared_worlds(share_id) ON DELETE CASCADE,
  viewer_ip_hash VARCHAR(64), -- Hashed IP for privacy-preserving analytics
  viewer_user_id TEXT, -- Clerk user ID if viewer is authenticated
  viewed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Function to generate a unique share URL slug
CREATE OR REPLACE FUNCTION generate_share_slug()
RETURNS VARCHAR(20) AS $$
DECLARE
  chars TEXT := 'abcdefghijklmnopqrstuvwxyz0123456789';
  result VARCHAR(20) := '';
  i INTEGER;
  attempts INTEGER := 0;
BEGIN
  LOOP
    result := '';
    -- Generate a random 10-character slug
    FOR i IN 1..10 LOOP
      result := result || substr(chars, floor(random() * length(chars) + 1)::INTEGER, 1);
    END LOOP;

    -- Check if this slug already exists
    IF NOT EXISTS (SELECT 1 FROM public.shared_worlds WHERE share_url_slug = result) THEN
      RETURN result;
    END IF;

    attempts := attempts + 1;
    -- Prevent infinite loop (extremely unlikely)
    IF attempts > 100 THEN
      RAISE EXCEPTION 'Could not generate unique share slug after 100 attempts';
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Function to increment view count
CREATE OR REPLACE FUNCTION increment_share_views(
  p_share_id UUID,
  p_viewer_ip_hash VARCHAR(64) DEFAULT NULL,
  p_viewer_user_id TEXT DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
  -- Record the view
  INSERT INTO public.share_views (share_id, viewer_ip_hash, viewer_user_id)
  VALUES (p_share_id, p_viewer_ip_hash, p_viewer_user_id);

  -- Update the view counter
  UPDATE public.shared_worlds
  SET views_count = views_count + 1
  WHERE share_id = p_share_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to record a world copy
CREATE OR REPLACE FUNCTION record_world_copy(
  p_share_id UUID,
  p_copied_by_user_id TEXT,
  p_new_world_id TEXT
)
RETURNS VOID AS $$
BEGIN
  -- Record the copy
  INSERT INTO public.world_copies (share_id, copied_by_user_id, new_world_id)
  VALUES (p_share_id, p_copied_by_user_id, p_new_world_id)
  ON CONFLICT (share_id, copied_by_user_id) DO UPDATE
  SET new_world_id = EXCLUDED.new_world_id,
      copied_at = NOW();

  -- Update the copy counter
  UPDATE public.shared_worlds
  SET copies_count = copies_count + 1
  WHERE share_id = p_share_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to clean up expired shares
CREATE OR REPLACE FUNCTION cleanup_expired_shares()
RETURNS VOID AS $$
BEGIN
  UPDATE public.shared_worlds
  SET is_active = false
  WHERE expires_at IS NOT NULL
    AND expires_at < NOW()
    AND is_active = true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RLS Policies for shared_worlds table
ALTER TABLE public.shared_worlds ENABLE ROW LEVEL SECURITY;

-- Anyone can view active shared worlds (for public access)
CREATE POLICY "Anyone can view active shared worlds" ON public.shared_worlds
  FOR SELECT USING (is_active = true AND (expires_at IS NULL OR expires_at > NOW()));

-- Users can manage their own shared worlds
CREATE POLICY "Users can insert own shared worlds" ON public.shared_worlds
  FOR INSERT WITH CHECK (user_id = public.clerk_user_id());

CREATE POLICY "Users can update own shared worlds" ON public.shared_worlds
  FOR UPDATE USING (user_id = public.clerk_user_id())
  WITH CHECK (user_id = public.clerk_user_id());

CREATE POLICY "Users can delete own shared worlds" ON public.shared_worlds
  FOR DELETE USING (user_id = public.clerk_user_id());

-- RLS Policies for world_copies table
ALTER TABLE public.world_copies ENABLE ROW LEVEL SECURITY;

-- Users can view their own copies
CREATE POLICY "Users can view own world copies" ON public.world_copies
  FOR SELECT USING (copied_by_user_id = public.clerk_user_id());

-- Users can insert their own copies
CREATE POLICY "Users can insert own world copies" ON public.world_copies
  FOR INSERT WITH CHECK (copied_by_user_id = public.clerk_user_id());

-- RLS Policies for share_views table (admin only for now)
ALTER TABLE public.share_views ENABLE ROW LEVEL SECURITY;

-- Only service role can access views for now (analytics)
-- No public policies

-- Create indexes for better query performance

-- Indexes for shared_worlds table
CREATE INDEX IF NOT EXISTS idx_shared_worlds_user_id ON public.shared_worlds (user_id);
CREATE INDEX IF NOT EXISTS idx_shared_worlds_slug ON public.shared_worlds (share_url_slug);
CREATE INDEX IF NOT EXISTS idx_shared_worlds_created_at ON public.shared_worlds (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shared_worlds_active ON public.shared_worlds (is_active, expires_at);
CREATE INDEX IF NOT EXISTS idx_shared_worlds_world_name_search
  ON public.shared_worlds USING gin(to_tsvector('english', world_name));
CREATE INDEX IF NOT EXISTS idx_shared_worlds_description_search
  ON public.shared_worlds USING gin(to_tsvector('english', COALESCE(world_description, '')));

-- Indexes for world_copies table
CREATE INDEX IF NOT EXISTS idx_world_copies_share_id ON public.world_copies (share_id);
CREATE INDEX IF NOT EXISTS idx_world_copies_user_id ON public.world_copies (copied_by_user_id);
CREATE INDEX IF NOT EXISTS idx_world_copies_copied_at ON public.world_copies (copied_at DESC);

-- Indexes for share_views table
CREATE INDEX IF NOT EXISTS idx_share_views_share_id ON public.share_views (share_id);
CREATE INDEX IF NOT EXISTS idx_share_views_viewed_at ON public.share_views (viewed_at DESC);

-- Grant necessary permissions to functions
GRANT EXECUTE ON FUNCTION generate_share_slug() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION increment_share_views(UUID, VARCHAR(64), TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION record_world_copy(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION cleanup_expired_shares() TO anon, authenticated;

-- Add comments for documentation
COMMENT ON TABLE public.shared_worlds IS 'Stores shared world snapshots with unique URLs for public access';
COMMENT ON TABLE public.world_copies IS 'Tracks when users copy shared worlds to their accounts';
COMMENT ON TABLE public.share_views IS 'Analytics table for tracking share views';
COMMENT ON FUNCTION generate_share_slug() IS 'Generates a unique, short URL slug for world sharing';
COMMENT ON FUNCTION increment_share_views(UUID, VARCHAR(64), TEXT) IS 'Records a view of a shared world and increments counter';
COMMENT ON FUNCTION record_world_copy(UUID, TEXT, TEXT) IS 'Records when a user copies a shared world';
COMMENT ON FUNCTION cleanup_expired_shares() IS 'Deactivates expired world shares';