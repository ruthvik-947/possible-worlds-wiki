import { createClient } from '@supabase/supabase-js';
import * as Sentry from '@sentry/node';
import dotenv from 'dotenv';

// Load environment variables from .env.local
dotenv.config({ path: '.env.local' });

// Initialize Supabase client with service role key for vault access
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// In-memory fallback for development
const inMemoryKeys = new Map<string, { apiKey: string; timestamp: number }>();

// Helper to get Supabase client
function getSupabaseClient() {
  if (!supabaseUrl || !supabaseServiceKey) {
    console.log('Supabase Vault not configured, using in-memory storage');
    return null;
  }

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

/**
 * Store an API key in Supabase Vault
 * Falls back to in-memory storage if Vault is not configured
 */
export async function storeApiKey(userId: string, apiKey: string): Promise<void> {
  const supabase = getSupabaseClient();

  if (!supabase) {
    // Fallback to in-memory storage for development
    inMemoryKeys.set(userId, { apiKey, timestamp: Date.now() });
    return;
  }

  try {
    // Store the API key in vault with automatic encryption
    // Using vault.create_secret function via RPC
    const { error } = await supabase.rpc('vault_store_api_key', {
      p_user_id: userId,
      p_api_key: apiKey,
      p_ttl_hours: 168 // 7 days TTL (more user-friendly)
    });

    if (error) {
      console.error('Failed to store API key in Vault:', error);
      Sentry.captureException(error, { tags: { operation: 'store_api_key_vault' } });
      // Fall back to in-memory storage
      inMemoryKeys.set(userId, { apiKey, timestamp: Date.now() });
    }
  } catch (error) {
    console.error('Failed to store API key in Vault:', error);
      Sentry.captureException(error, { tags: { operation: 'store_api_key_vault' } });
    // Fall back to in-memory storage
    inMemoryKeys.set(userId, { apiKey, timestamp: Date.now() });
  }
}

/**
 * Retrieve an API key from Supabase Vault
 * Falls back to in-memory storage if Vault is not configured
 */
export async function getApiKey(userId: string): Promise<string | null> {
  const supabase = getSupabaseClient();

  if (!supabase) {
    // Fallback to in-memory storage for development
    const stored = inMemoryKeys.get(userId);
    if (stored) {
      // Check if key is older than 7 days
      const now = Date.now();
      if (now - stored.timestamp > 168 * 60 * 60 * 1000) {
        inMemoryKeys.delete(userId);
        return null;
      }
      return stored.apiKey;
    }
    return null;
  }

  try {
    // Retrieve the API key from vault with automatic decryption
    const { data, error } = await supabase.rpc('vault_get_api_key', {
      p_user_id: userId
    });

    if (error) {
      console.error('Failed to retrieve API key from Vault:', error);
      Sentry.captureException(error, { tags: { operation: 'get_api_key_vault' } });
      // Fall back to in-memory storage
      const stored = inMemoryKeys.get(userId);
      if (stored) {
        const now = Date.now();
        if (now - stored.timestamp > 168 * 60 * 60 * 1000) {
          inMemoryKeys.delete(userId);
          return null;
        }
        return stored.apiKey;
      }
      return null;
    }

    return data;
  } catch (error) {
    console.error('Failed to retrieve API key from Vault:', error);
      Sentry.captureException(error, { tags: { operation: 'get_api_key_vault' } });
    // Fall back to in-memory storage
    const stored = inMemoryKeys.get(userId);
    if (stored) {
      const now = Date.now();
      if (now - stored.timestamp > 168 * 60 * 60 * 1000) {
        inMemoryKeys.delete(userId);
        return null;
      }
      return stored.apiKey;
    }
    return null;
  }
}

/**
 * Remove an API key from Supabase Vault
 * Also removes from in-memory storage
 */
export async function removeApiKey(userId: string): Promise<void> {
  const supabase = getSupabaseClient();

  // Always remove from in-memory storage
  inMemoryKeys.delete(userId);

  if (!supabase) {
    return;
  }

  try {
    // Remove the API key from vault
    const { error } = await supabase.rpc('vault_remove_api_key', {
      p_user_id: userId
    });

    if (error) {
      console.error('Failed to remove API key from Vault:', error);
      Sentry.captureException(error, { tags: { operation: 'remove_api_key_vault' } });
    }
  } catch (error) {
    console.error('Failed to remove API key from Vault:', error);
      Sentry.captureException(error, { tags: { operation: 'remove_api_key_vault' } });
  }
}

/**
 * Check if a user has an API key stored
 */
export async function hasApiKey(userId: string): Promise<boolean> {
  const supabase = getSupabaseClient();

  if (!supabase) {
    // Fallback to in-memory storage for development
    const stored = inMemoryKeys.get(userId);
    if (stored) {
      const now = Date.now();
      if (now - stored.timestamp > 168 * 60 * 60 * 1000) {
        inMemoryKeys.delete(userId);
        return false;
      }
      return true;
    }
    return false;
  }

  try {
    // Check if API key exists in vault
    const { data, error } = await supabase.rpc('vault_has_api_key', {
      p_user_id: userId
    });

    if (error) {
      console.error('Failed to check API key in Vault:', error);
      Sentry.captureException(error, { tags: { operation: 'check_api_key_vault' } });
      // Fall back to in-memory storage
      const stored = inMemoryKeys.get(userId);
      if (stored) {
        const now = Date.now();
        if (now - stored.timestamp > 168 * 60 * 60 * 1000) {
          inMemoryKeys.delete(userId);
          return false;
        }
        return true;
      }
      return false;
    }

    return data || false;
  } catch (error) {
    console.error('Failed to check API key in Vault:', error);
      Sentry.captureException(error, { tags: { operation: 'check_api_key_vault' } });
    // Fall back to in-memory storage
    const stored = inMemoryKeys.get(userId);
    if (stored) {
      const now = Date.now();
      if (now - stored.timestamp > 168 * 60 * 60 * 1000) {
        inMemoryKeys.delete(userId);
        return false;
      }
      return true;
    }
    return false;
  }
}

// Clean up old in-memory keys every hour (fallback storage only)
setInterval(() => {
  const now = Date.now();
  for (const [userId, data] of inMemoryKeys.entries()) {
    if (now - data.timestamp > 168 * 60 * 60 * 1000) { // 7 days
      inMemoryKeys.delete(userId);
    }
  }
}, 60 * 60 * 1000); // Check every hour