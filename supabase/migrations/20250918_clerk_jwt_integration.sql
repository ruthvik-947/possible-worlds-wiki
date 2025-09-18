-- Clerk JWT Integration for Row Level Security
-- This migration enables Supabase to authenticate using Clerk JWTs
-- and sets up proper RLS policies for user data isolation

-- Create a function to extract Clerk user ID from JWT
-- Note: Using public schema since auth schema is protected in Supabase
CREATE OR REPLACE FUNCTION public.clerk_user_id()
RETURNS TEXT AS $$
BEGIN
  -- Extract userId from the JWT claims
  -- The JWT is automatically parsed by Supabase when Authorization header is present
  RETURN current_setting('request.jwt.claims', true)::json->>'userId';
EXCEPTION
  WHEN OTHERS THEN
    -- Return NULL if JWT parsing fails or no JWT is present
    RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Grant execute permission to authenticated and anon roles
GRANT EXECUTE ON FUNCTION public.clerk_user_id() TO anon, authenticated;

-- Update RLS policies for worlds table
-- First, drop the existing broken policy that allows all access
DROP POLICY IF EXISTS "Allow all operations" ON public.worlds;

-- Create specific policies for each operation
CREATE POLICY "Users can view own worlds" ON public.worlds
  FOR SELECT USING (user_id = public.clerk_user_id());

CREATE POLICY "Users can insert own worlds" ON public.worlds
  FOR INSERT WITH CHECK (user_id = public.clerk_user_id());

CREATE POLICY "Users can update own worlds" ON public.worlds
  FOR UPDATE USING (user_id = public.clerk_user_id())
  WITH CHECK (user_id = public.clerk_user_id());

CREATE POLICY "Users can delete own worlds" ON public.worlds
  FOR DELETE USING (user_id = public.clerk_user_id());

-- Enable RLS on user_api_keys table and create policies
ALTER TABLE public.user_api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own API keys" ON public.user_api_keys
  FOR SELECT USING (user_id = public.clerk_user_id());

CREATE POLICY "Users can insert own API keys" ON public.user_api_keys
  FOR INSERT WITH CHECK (user_id = public.clerk_user_id());

CREATE POLICY "Users can update own API keys" ON public.user_api_keys
  FOR UPDATE USING (user_id = public.clerk_user_id())
  WITH CHECK (user_id = public.clerk_user_id());

CREATE POLICY "Users can delete own API keys" ON public.user_api_keys
  FOR DELETE USING (user_id = public.clerk_user_id());

-- Create a function for testing RLS policies
CREATE OR REPLACE FUNCTION test_clerk_rls(test_user_id TEXT)
RETURNS TABLE(
  test_name TEXT,
  result BOOLEAN,
  message TEXT
) AS $$
BEGIN
  -- Set JWT claims for testing
  PERFORM set_config('request.jwt.claims', json_build_object('userId', test_user_id)::text, true);

  -- Test 1: Check if clerk_user_id() returns the test user ID
  RETURN QUERY SELECT
    'clerk_user_id_function'::TEXT,
    public.clerk_user_id() = test_user_id,
    format('Expected: %s, Got: %s', test_user_id, public.clerk_user_id());

  -- Test 2: Try to select from worlds (should work with proper user_id)
  BEGIN
    PERFORM * FROM public.worlds WHERE user_id = test_user_id LIMIT 1;
    RETURN QUERY SELECT
      'worlds_select_permission'::TEXT,
      true,
      'Successfully queried worlds table'::TEXT;
  EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT
      'worlds_select_permission'::TEXT,
      false,
      format('Error querying worlds: %s', SQLERRM);
  END;

  -- Test 3: Try to select from user_api_keys (should work with proper user_id)
  BEGIN
    PERFORM * FROM public.user_api_keys WHERE user_id = test_user_id LIMIT 1;
    RETURN QUERY SELECT
      'api_keys_select_permission'::TEXT,
      true,
      'Successfully queried user_api_keys table'::TEXT;
  EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT
      'api_keys_select_permission'::TEXT,
      false,
      format('Error querying user_api_keys: %s', SQLERRM);
  END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission on test function
GRANT EXECUTE ON FUNCTION test_clerk_rls(TEXT) TO anon, authenticated;

-- Create a function to temporarily disable RLS for emergency access
CREATE OR REPLACE FUNCTION admin_disable_rls_emergency()
RETURNS VOID AS $$
BEGIN
  -- This function should only be used in emergencies
  -- It requires superuser privileges
  ALTER TABLE public.worlds DISABLE ROW LEVEL SECURITY;
  ALTER TABLE public.user_api_keys DISABLE ROW LEVEL SECURITY;

  -- Log the emergency action
  INSERT INTO public.admin_logs (action, timestamp, details)
  VALUES ('EMERGENCY_RLS_DISABLED', NOW(), 'RLS disabled for emergency access');
EXCEPTION WHEN OTHERS THEN
  -- If admin_logs table doesn't exist, just continue
  NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Only allow service role to execute emergency function
REVOKE EXECUTE ON FUNCTION admin_disable_rls_emergency() FROM PUBLIC;
-- Note: Service role permissions will be granted separately if needed

-- Add comments for documentation
COMMENT ON FUNCTION public.clerk_user_id() IS 'Extracts Clerk user ID from JWT claims for RLS policies';
COMMENT ON FUNCTION test_clerk_rls(TEXT) IS 'Tests RLS policies with a given Clerk user ID';
COMMENT ON FUNCTION admin_disable_rls_emergency() IS 'Emergency function to disable RLS - use only in emergencies';

-- Verify RLS is enabled on both tables
DO $$
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE relname = 'worlds') THEN
    RAISE EXCEPTION 'RLS is not enabled on worlds table';
  END IF;

  IF NOT (SELECT relrowsecurity FROM pg_class WHERE relname = 'user_api_keys') THEN
    RAISE EXCEPTION 'RLS is not enabled on user_api_keys table';
  END IF;

  RAISE NOTICE 'RLS is properly enabled on all tables';
END $$;