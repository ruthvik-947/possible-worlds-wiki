# Clerk → Supabase RLS Integration Plan

**Date**: 2025-09-18
**Status**: ✅ COMPLETED
**Purpose**: Enable true Row Level Security (RLS) in Supabase using Clerk authentication

**Updated**: Used 2025 third-party auth integration instead of deprecated JWT templates

## Problem Statement

Currently, the application uses:
- **Clerk** for authentication (user IDs like `user_2abc123def`)
- **Supabase** for data storage with broken RLS policies (`using (true)`)
- **Application-level** security by filtering queries with `eq('user_id', userId)`

This creates a security gap where:
1. The RLS policy allows ALL users to access ALL worlds
2. Supabase's `auth.uid()` doesn't work with Clerk user IDs
3. We're relying solely on application code for security

## Solution: Custom JWT Integration

Configure Clerk to issue JWTs that Supabase can understand, enabling database-level RLS with Clerk user IDs.

## Implementation Steps

### Step 1: Configure Clerk JWT Template

In Clerk Dashboard:
1. Go to **JWT Templates**
2. Create a new template called `supabase`
3. Set the template to:

```json
{
  "userId": "{{user.id}}",
  "email": "{{user.primary_email_address}}",
  "iat": "{{time}}",
  "exp": "{{exp}}"
}
```

4. Copy the **JWT signing key** (we'll need this for Supabase)

### Step 2: Create Supabase Migration for Clerk Auth

Create a new migration file that:
1. Configures Supabase to accept Clerk JWTs
2. Creates helper functions to extract Clerk user ID
3. Updates RLS policies for all tables

```sql
-- File: supabase/migrations/20250118_clerk_jwt_integration.sql

-- Configure Supabase to verify Clerk JWTs
-- Note: The JWT secret must be set via environment variable or dashboard
-- as it contains sensitive data

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
    RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Grant execute permission to authenticated and anon roles
GRANT EXECUTE ON FUNCTION public.clerk_user_id() TO anon, authenticated;

-- Update RLS policy for worlds table
DROP POLICY IF EXISTS "Allow all operations" ON public.worlds;

CREATE POLICY "Users can view own worlds" ON public.worlds
  FOR SELECT USING (user_id = public.clerk_user_id());

CREATE POLICY "Users can insert own worlds" ON public.worlds
  FOR INSERT WITH CHECK (user_id = public.clerk_user_id());

CREATE POLICY "Users can update own worlds" ON public.worlds
  FOR UPDATE USING (user_id = public.clerk_user_id())
  WITH CHECK (user_id = public.clerk_user_id());

CREATE POLICY "Users can delete own worlds" ON public.worlds
  FOR DELETE USING (user_id = public.clerk_user_id());

-- Add RLS policies for user_api_keys table
ALTER TABLE public.user_api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own API keys" ON public.user_api_keys
  FOR SELECT USING (user_id = public.clerk_user_id());

CREATE POLICY "Users can manage own API keys" ON public.user_api_keys
  FOR ALL USING (user_id = public.clerk_user_id());
```

### Step 3: Update Frontend to Include JWT

The frontend needs to:
1. Get the Clerk JWT with the custom template
2. Pass it to Supabase in the Authorization header

```typescript
// File: lib/supabaseClient.ts
import { createClient } from '@supabase/supabase-js';
import { useAuth } from '@clerk/clerk-react';

export function useSupabaseClient() {
  const { getToken } = useAuth();

  const createAuthenticatedClient = async () => {
    const token = await getToken({ template: 'supabase' });

    return createClient(
      process.env.VITE_SUPABASE_URL!,
      process.env.VITE_SUPABASE_ANON_KEY!,
      {
        global: {
          headers: {
            Authorization: token ? `Bearer ${token}` : '',
          },
        },
      }
    );
  };

  return { createAuthenticatedClient };
}
```

### Step 4: Update Backend World Operations

The backend needs to:
1. Include the Clerk JWT when making Supabase calls
2. Remove manual `user_id` filtering (RLS will handle it)

```typescript
// File: api/utils/worlds.ts
// Updated to use Clerk JWT for authenticated Supabase access

import { createClient } from '@supabase/supabase-js';
import { getToken } from '@clerk/express';

export async function createAuthenticatedSupabaseClient(req: any) {
  const token = await getToken({ req, template: 'supabase' });

  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!,
    {
      global: {
        headers: {
          Authorization: token ? `Bearer ${token}` : '',
        },
      },
    }
  );
}

// Update all world operations to use authenticated client
export async function listWorlds(req: any, userId: string) {
  const supabase = await createAuthenticatedSupabaseClient(req);

  // RLS will automatically filter by user - no need for .eq('user_id', userId)
  const { data, error } = await supabase
    .from('worlds')
    .select('world_id, name, description, page_count, created_at, updated_at')
    .order('updated_at', { ascending: false });

  // ... rest of function
}
```

### Step 5: Environment Configuration

Add to `.env.local`:
```env
# Supabase configuration
SUPABASE_URL=your-supabase-url
SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Clerk JWT configuration
CLERK_JWT_KEY=your-clerk-jwt-verification-key
```

### Step 6: Configure Supabase to Verify Clerk JWTs

In Supabase Dashboard:
1. Go to **Settings** → **API**
2. Under **JWT Secret**, add the Clerk JWT verification key
3. Set the JWT issuer to match Clerk's issuer

Or via SQL:
```sql
-- This must be run with superuser privileges
ALTER DATABASE postgres SET "app.settings.jwt_secret" TO 'your-clerk-jwt-verification-key';
ALTER DATABASE postgres SET "app.settings.jwt_iss" TO 'https://your-clerk-domain';
```

## Testing Plan

### 1. Test RLS Policies
```sql
-- Set the JWT claims manually for testing
SET LOCAL request.jwt.claims TO '{"userId":"user_test123"}';

-- Try to select worlds - should only see user_test123's worlds
SELECT * FROM public.worlds;

-- Try to insert a world with different user_id - should fail
INSERT INTO public.worlds (user_id, world_id, name)
VALUES ('user_different', 'test-world', 'Test');
```

### 2. Test Frontend Integration
```typescript
// In a React component
const { getToken } = useAuth();

async function testSupabaseAccess() {
  const token = await getToken({ template: 'supabase' });
  console.log('Clerk JWT:', token);

  const supabase = createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` }}
  });

  const { data, error } = await supabase
    .from('worlds')
    .select('*');

  console.log('Worlds accessible:', data);
  console.log('Error:', error);
}
```

### 3. Test Cross-User Security
1. Sign in as User A
2. Create a world
3. Sign in as User B
4. Verify User B cannot see User A's world
5. Verify User B cannot modify User A's world

## Rollback Plan

If issues arise:
1. Disable RLS temporarily: `ALTER TABLE public.worlds DISABLE ROW LEVEL SECURITY;`
2. Revert to service role key in backend
3. Re-add manual `user_id` filtering in queries

## Benefits

1. **Defense in Depth**: Database-level security even if application code has bugs
2. **Simplified Queries**: No need to manually filter by `user_id`
3. **Audit Trail**: All access is authenticated and traceable
4. **Compliance**: Better security posture for regulatory requirements

## Monitoring

- Track RLS policy violations in Supabase logs
- Monitor JWT validation errors
- Set up alerts for unauthorized access attempts

## Timeline

- **Phase 1** (Immediate): Document and create migration files
- **Phase 2** (Day 1): Configure Clerk JWT template in dashboard
- **Phase 3** (Day 2): Deploy database migrations
- **Phase 4** (Day 3): Update and deploy frontend
- **Phase 5** (Day 4): Update and deploy backend
- **Phase 6** (Week 1): Monitor and adjust

## Success Criteria

- [ ] RLS policies enforce user isolation
- [ ] No user can access another user's data
- [ ] All existing functionality works with RLS enabled
- [ ] Performance impact is minimal (<10ms added latency)
- [ ] No increase in error rates

## Notes

- The `public.clerk_user_id()` function gracefully returns NULL if no JWT is present
- Service role key is still needed for admin operations and background jobs
- Consider implementing row-level logging for sensitive operations