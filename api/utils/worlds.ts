import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase environment variables:');
  console.error('SUPABASE_URL:', supabaseUrl);
  console.error('SUPABASE_ANON_KEY:', supabaseKey ? '[REDACTED]' : 'undefined');
  throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY are required');
}

const supabase = createClient(supabaseUrl, supabaseKey);

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

export async function listWorlds(userId: string): Promise<WorldSummary[]> {
  const { data, error } = await supabase
    .from('worlds')
    .select('world_id, name, description, page_count, created_at, updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });

  if (error) {
    throw error;
  }

  return (data || []).map(mapSummary);
}

export async function saveWorld(userId: string, worldData: any): Promise<WorldSummary> {
  if (!worldData || typeof worldData !== 'object') {
    throw new Error('Invalid world payload');
  }

  const worldId = worldData.id;
  if (!worldId || typeof worldId !== 'string') {
    throw new Error('World payload must include an id');
  }

  const now = Date.now();
  const payloadString = JSON.stringify(worldData);
  const pageCount = worldData.pages ? Object.keys(worldData.pages).length : 0;
  const description = typeof worldData.description === 'string' ? worldData.description : null;
  const name = typeof worldData.name === 'string' ? worldData.name : 'Untitled World';

  const { error } = await supabase
    .from('worlds')
    .upsert({
      user_id: userId,
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

  return getWorldSummary(userId, worldId);
}

async function getWorldSummary(userId: string, worldId: string): Promise<WorldSummary> {
  const { data, error } = await supabase
    .from('worlds')
    .select('world_id, name, description, page_count, created_at, updated_at')
    .eq('user_id', userId)
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

export async function getWorld(userId: string, worldId: string): Promise<WorldRecord | null> {
  const { data, error } = await supabase
    .from('worlds')
    .select('world_id, name, description, page_count, created_at, updated_at, payload')
    .eq('user_id', userId)
    .eq('world_id', worldId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      // No rows found
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

export async function deleteWorld(userId: string, worldId: string): Promise<boolean> {
  const { error, count } = await supabase
    .from('worlds')
    .delete({ count: 'exact' })
    .eq('user_id', userId)
    .eq('world_id', worldId);

  if (error) {
    throw error;
  }

  return (count || 0) > 0;
}
