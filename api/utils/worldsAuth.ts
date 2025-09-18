import { createClient } from '@supabase/supabase-js';
import { IncomingHttpHeaders } from 'http';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase environment variables:');
  console.error('SUPABASE_URL:', supabaseUrl);
  console.error('SUPABASE_SERVICE_ROLE_KEY:', supabaseServiceKey ? '[REDACTED]' : 'undefined');
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
}

// Service role client for admin operations
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

export interface WorldSummary {
  worldId: string;
  name: string;
  description?: string | null;
  pageCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface WorldRecord extends WorldSummary {
  payload: any;
}

const mapSummary = (row: any): WorldSummary => ({
  worldId: row.world_id,
  name: row.name,
  description: row.description ?? null,
  pageCount: Number(row.page_count) || 0,
  createdAt: Number(row.created_at),
  updatedAt: Number(row.updated_at)
});

/**
 * Extract Clerk JWT token from request headers
 */
function extractClerkToken(headers: IncomingHttpHeaders): string | null {
  const authHeader = headers.authorization || headers.Authorization;
  if (!authHeader || Array.isArray(authHeader)) {
    return null;
  }

  const [scheme, token] = authHeader.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return null;
  }

  return token;
}

/**
 * Create an authenticated Supabase client using Clerk JWT (2025 method)
 */
function createAuthenticatedClient(headers: IncomingHttpHeaders) {
  const token = extractClerkToken(headers);

  if (!token) {
    throw new Error('No authentication token provided');
  }

  // Use the 2025 third-party auth integration method
  return createClient(supabaseUrl, process.env.SUPABASE_ANON_KEY!, {
    accessToken: async () => token,
  });
}

/**
 * List worlds for the authenticated user (via RLS)
 * No need to filter by userId - RLS handles this automatically
 */
export async function listWorldsAuth(headers: IncomingHttpHeaders): Promise<WorldSummary[]> {
  const supabase = createAuthenticatedClient(headers);

  const { data, error } = await supabase
    .from('worlds')
    .select('world_id, name, description, page_count, created_at, updated_at')
    .order('updated_at', { ascending: false });

  if (error) {
    throw error;
  }

  return (data || []).map(mapSummary);
}

/**
 * Save world for the authenticated user (via RLS)
 * RLS ensures the user can only insert/update their own worlds
 */
export async function saveWorldAuth(headers: IncomingHttpHeaders, userId: string, worldData: any): Promise<WorldSummary> {
  if (!worldData || typeof worldData !== 'object') {
    throw new Error('Invalid world payload');
  }

  const worldId = worldData.id;
  if (!worldId || typeof worldId !== 'string') {
    throw new Error('World payload must include an id');
  }

  const supabase = createAuthenticatedClient(headers);

  const now = Date.now();
  const payloadString = JSON.stringify(worldData);
  const pageCount = worldData.pages ? Object.keys(worldData.pages).length : 0;
  const description = typeof worldData.description === 'string' ? worldData.description : null;
  const name = typeof worldData.name === 'string' ? worldData.name : 'Untitled World';

  // RLS will ensure user_id matches the authenticated user
  const { error } = await supabase
    .from('worlds')
    .upsert({
      user_id: userId, // This must match the authenticated user or RLS will reject
      world_id: worldId,
      name,
      description,
      payload: payloadString,
      page_count: pageCount,
      created_at: now,
      updated_at: now
    });

  if (error) {
    throw error;
  }

  return getWorldSummaryAuth(headers, worldId);
}

/**
 * Get world summary for the authenticated user
 */
async function getWorldSummaryAuth(headers: IncomingHttpHeaders, worldId: string): Promise<WorldSummary> {
  const supabase = createAuthenticatedClient(headers);

  const { data, error } = await supabase
    .from('worlds')
    .select('world_id, name, description, page_count, created_at, updated_at')
    .eq('world_id', worldId)
    .single();

  if (error) {
    throw error;
  }
  if (!data) {
    throw new Error('World not found after save');
  }

  return mapSummary(data);
}

/**
 * Get world by ID for the authenticated user (via RLS)
 */
export async function getWorldAuth(headers: IncomingHttpHeaders, worldId: string): Promise<WorldRecord | null> {
  const supabase = createAuthenticatedClient(headers);

  const { data, error } = await supabase
    .from('worlds')
    .select('world_id, name, description, page_count, created_at, updated_at, payload')
    .eq('world_id', worldId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      // No rows found - either doesn't exist or user doesn't have access
      return null;
    }
    throw error;
  }
  if (!data) {
    return null;
  }

  let payload: any = null;
  try {
    payload = JSON.parse(data.payload);
  } catch (parseError) {
    console.error('Failed to parse world payload:', parseError);
  }

  return {
    ...mapSummary(data),
    payload
  };
}

/**
 * Delete world for the authenticated user (via RLS)
 */
export async function deleteWorldAuth(headers: IncomingHttpHeaders, worldId: string): Promise<boolean> {
  const supabase = createAuthenticatedClient(headers);

  const { error, count } = await supabase
    .from('worlds')
    .delete({ count: 'exact' })
    .eq('world_id', worldId);

  if (error) {
    throw error;
  }

  return (count || 0) > 0;
}

/**
 * Test RLS integration for debugging
 * This function uses the service role to test the RLS function
 */
export async function testRLSIntegration(userId: string): Promise<any> {
  const { data, error } = await supabaseAdmin
    .rpc('test_clerk_rls', { test_user_id: userId });

  if (error) {
    throw error;
  }

  return data;
}

// Note: worlds.ts has been removed - using worldsAuth.ts exclusively now