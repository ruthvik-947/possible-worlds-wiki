-- Enable the pgsodium and vault extensions if not already enabled
CREATE EXTENSION IF NOT EXISTS pgsodium;

-- Create a table to track user API keys metadata (not the actual keys)
CREATE TABLE IF NOT EXISTS user_api_keys (
  user_id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ
);

-- Function to store an API key in the vault
CREATE OR REPLACE FUNCTION vault_store_api_key(
  p_user_id TEXT,
  p_api_key TEXT,
  p_ttl_hours INTEGER DEFAULT 168
)
RETURNS VOID AS $$
DECLARE
  v_secret_id UUID;
  v_expires_at TIMESTAMPTZ;
BEGIN
  -- Calculate expiration time
  v_expires_at := NOW() + (p_ttl_hours || ' hours')::INTERVAL;

  -- First, check if a secret already exists for this user and delete it
  SELECT id INTO v_secret_id
  FROM vault.secrets
  WHERE name = 'openai_api_key_' || p_user_id
  LIMIT 1;

  IF v_secret_id IS NOT NULL THEN
    -- Delete the existing secret using proper vault API
    DELETE FROM vault.secrets WHERE id = v_secret_id;
  END IF;

  -- Create a new secret in the vault using proper vault API
  PERFORM vault.create_secret(
    p_api_key,
    'openai_api_key_' || p_user_id,
    'OpenAI API key for user ' || p_user_id || ', expires at ' || v_expires_at
  );

  -- Update or insert metadata
  INSERT INTO user_api_keys (user_id, expires_at)
  VALUES (p_user_id, v_expires_at)
  ON CONFLICT (user_id) DO UPDATE
  SET expires_at = EXCLUDED.expires_at,
      created_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to retrieve an API key from the vault
CREATE OR REPLACE FUNCTION vault_get_api_key(p_user_id TEXT)
RETURNS TEXT AS $$
DECLARE
  v_api_key TEXT;
  v_expires_at TIMESTAMPTZ;
BEGIN
  -- Check if the key has expired
  SELECT expires_at INTO v_expires_at
  FROM user_api_keys
  WHERE user_id = p_user_id;

  IF v_expires_at IS NULL OR v_expires_at < NOW() THEN
    -- Key doesn't exist or has expired
    -- Clean up expired key
    PERFORM vault_remove_api_key(p_user_id);
    RETURN NULL;
  END IF;

  -- Retrieve the secret from vault
  SELECT decrypted_secret INTO v_api_key
  FROM vault.decrypted_secrets
  WHERE name = 'openai_api_key_' || p_user_id
  LIMIT 1;

  -- Update last used timestamp
  IF v_api_key IS NOT NULL THEN
    UPDATE user_api_keys
    SET last_used_at = NOW()
    WHERE user_id = p_user_id;
  END IF;

  RETURN v_api_key;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to remove an API key from the vault
CREATE OR REPLACE FUNCTION vault_remove_api_key(p_user_id TEXT)
RETURNS VOID AS $$
DECLARE
  v_secret_id UUID;
BEGIN
  -- Find and delete the secret
  SELECT id INTO v_secret_id
  FROM vault.secrets
  WHERE name = 'openai_api_key_' || p_user_id
  LIMIT 1;

  IF v_secret_id IS NOT NULL THEN
    DELETE FROM vault.secrets WHERE id = v_secret_id;
  END IF;

  -- Delete metadata
  DELETE FROM user_api_keys WHERE user_id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if a user has an API key
CREATE OR REPLACE FUNCTION vault_has_api_key(p_user_id TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  v_exists BOOLEAN;
  v_expires_at TIMESTAMPTZ;
BEGIN
  -- Check if key exists and hasn't expired
  SELECT expires_at INTO v_expires_at
  FROM user_api_keys
  WHERE user_id = p_user_id;

  IF v_expires_at IS NULL OR v_expires_at < NOW() THEN
    -- Key doesn't exist or has expired
    IF v_expires_at < NOW() THEN
      -- Clean up expired key
      PERFORM vault_remove_api_key(p_user_id);
    END IF;
    RETURN FALSE;
  END IF;

  -- Verify the secret actually exists in vault
  SELECT EXISTS(
    SELECT 1
    FROM vault.secrets
    WHERE name = 'openai_api_key_' || p_user_id
  ) INTO v_exists;

  RETURN v_exists;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a scheduled job to clean up expired keys (requires pg_cron extension)
-- This is optional but recommended for production
-- CREATE EXTENSION IF NOT EXISTS pg_cron;
-- SELECT cron.schedule(
--   'cleanup-expired-api-keys',
--   '0 */6 * * *', -- Every 6 hours
--   $$
--   DELETE FROM vault.secrets
--   WHERE name LIKE 'openai_api_key_%'
--   AND id IN (
--     SELECT s.id
--     FROM vault.secrets s
--     JOIN user_api_keys k ON s.name = 'openai_api_key_' || k.user_id
--     WHERE k.expires_at < NOW()
--   );
--
--   DELETE FROM user_api_keys WHERE expires_at < NOW();
--   $$
-- );

-- Grant necessary permissions (adjust according to your needs)
-- These functions should only be callable via service role
REVOKE ALL ON FUNCTION vault_store_api_key FROM PUBLIC;
REVOKE ALL ON FUNCTION vault_get_api_key FROM PUBLIC;
REVOKE ALL ON FUNCTION vault_remove_api_key FROM PUBLIC;
REVOKE ALL ON FUNCTION vault_has_api_key FROM PUBLIC;

-- The service role will have access by default due to SECURITY DEFINER