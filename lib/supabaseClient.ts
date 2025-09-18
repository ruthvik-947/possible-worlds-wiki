import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { useAuth } from '@clerk/clerk-react';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

// Default client for unauthenticated requests
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * React hook to create an authenticated Supabase client using Clerk JWT
 * This client automatically includes the Clerk JWT in the Authorization header
 * enabling Row Level Security policies to work correctly
 */
export function useSupabaseClient() {
  const { getToken, isSignedIn } = useAuth();

  const createAuthenticatedClient = async (): Promise<SupabaseClient> => {
    if (!isSignedIn) {
      // Return default client for unauthenticated users
      return supabase;
    }

    try {
      // Get the Clerk JWT with our custom 'supabase' template
      // This template includes the userId in the claims
      const token = await getToken({ template: 'supabase' });

      if (!token) {
        console.warn('No Clerk token available, falling back to unauthenticated client');
        return supabase;
      }

      // Create Supabase client with Clerk JWT in Authorization header
      return createClient(supabaseUrl, supabaseAnonKey, {
        global: {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      });
    } catch (error) {
      console.error('Failed to get Clerk token for Supabase:', error);
      // Fall back to unauthenticated client
      return supabase;
    }
  };

  return { createAuthenticatedClient, isSignedIn };
}

/**
 * Helper function to get an authenticated Supabase client outside of React components
 * @param getToken - The getToken function from useAuth() hook
 */
export async function getAuthenticatedSupabaseClient(
  getToken: (params?: { template?: string }) => Promise<string | null>
): Promise<SupabaseClient> {
  try {
    const token = await getToken({ template: 'supabase' });

    if (!token) {
      return supabase;
    }

    return createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    });
  } catch (error) {
    console.error('Failed to create authenticated Supabase client:', error);
    return supabase;
  }
}

/**
 * Test function to verify RLS is working correctly
 * Only use this for debugging/testing purposes
 */
export async function testRLSIntegration(userId: string): Promise<void> {
  console.log('Testing RLS integration for user:', userId);

  try {
    const { getToken } = useAuth();
    const client = await getAuthenticatedSupabaseClient(getToken);

    // Test the RLS function directly
    const { data: testResults, error: testError } = await client
      .rpc('test_clerk_rls', { test_user_id: userId });

    if (testError) {
      console.error('RLS test failed:', testError);
      return;
    }

    console.log('RLS Test Results:', testResults);

    // Test querying worlds (should only return user's worlds)
    const { data: worlds, error: worldsError } = await client
      .from('worlds')
      .select('user_id, world_id, name')
      .limit(5);

    if (worldsError) {
      console.error('Failed to query worlds:', worldsError);
    } else {
      console.log('Accessible worlds:', worlds);

      // Verify all returned worlds belong to the current user
      const unauthorizedWorlds = worlds?.filter(w => w.user_id !== userId) || [];
      if (unauthorizedWorlds.length > 0) {
        console.error('🚨 RLS FAILURE: Found worlds belonging to other users!', unauthorizedWorlds);
      } else {
        console.log('✅ RLS working correctly: All worlds belong to current user');
      }
    }

  } catch (error) {
    console.error('RLS integration test failed:', error);
  }
}

export type { SupabaseClient };