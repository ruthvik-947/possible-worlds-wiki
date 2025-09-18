# Supabase Vault Setup for API Key Storage

This guide explains how to set up Supabase Vault for secure storage of user API keys.

## Prerequisites

1. A Supabase project (create one at https://supabase.com)
2. Access to the SQL Editor in your Supabase dashboard

## Setup Steps

### 1. Enable Required Extensions

In your Supabase SQL Editor, run:

```sql
-- Enable the vault extension (pgsodium is usually enabled by default)
CREATE EXTENSION IF NOT EXISTS pgsodium;
```

### 2. Run the Migration

Execute the migration script located at `supabase/migrations/20250118_create_vault_functions.sql` in your Supabase SQL Editor. This will:

- Create a metadata table for tracking API keys
- Set up secure functions for storing, retrieving, and removing API keys
- Configure automatic encryption using Supabase Vault

### 3. Get Your Service Role Key

1. Go to your Supabase project settings
2. Navigate to API settings
3. Copy the `service_role` key (NOT the `anon` key)
4. This key has elevated privileges needed for Vault operations

### 4. Configure Environment Variables

Add these to your `.env.local` file:

```env
# Supabase configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
```

**Important**: The service role key should NEVER be exposed to the client. Only use it in server-side code.

### 5. Deploy to Vercel

Add the same environment variables to your Vercel project:

```bash
vercel env add SUPABASE_URL
vercel env add SUPABASE_SERVICE_ROLE_KEY
```

## How It Works

1. **Storage**: When a user provides their OpenAI API key, it's stored in Supabase Vault with automatic encryption
2. **Encryption**: Supabase Vault uses pgsodium (libsodium for PostgreSQL) for encryption at rest
3. **TTL**: Keys automatically expire after 7 days for balance of security and convenience
4. **Fallback**: If Supabase is not configured, the system falls back to in-memory storage for development

## Security Features

- **Encryption at Rest**: All API keys are encrypted using industry-standard encryption
- **Row Level Security**: Only service role can access vault functions
- **Automatic Expiration**: Keys expire after 7 days
- **No Direct Access**: API keys are never stored in plain text
- **Audit Trail**: Metadata tracking for key creation and usage

## Testing

To verify the setup:

1. Store a test API key for a user
2. Check the `user_api_keys` table for metadata (the actual key won't be visible)
3. Retrieve the key using the vault function
4. Verify automatic expiration after TTL

## Monitoring

You can monitor API key usage by querying:

```sql
-- Check all stored API keys (metadata only)
SELECT user_id, created_at, expires_at, last_used_at
FROM user_api_keys
ORDER BY created_at DESC;

-- Check expired keys that need cleanup
SELECT user_id, expires_at
FROM user_api_keys
WHERE expires_at < NOW();
```

## Optional: Automatic Cleanup

For production, consider enabling pg_cron for automatic cleanup of expired keys:

```sql
CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.schedule(
  'cleanup-expired-api-keys',
  '0 */6 * * *', -- Every 6 hours
  $$
  SELECT vault_remove_api_key(user_id)
  FROM user_api_keys
  WHERE expires_at < NOW();
  $$
);
```

## Troubleshooting

### Issue: Functions not found
- Ensure the migration script ran successfully
- Check that you're using the service role key, not the anon key

### Issue: Permission denied
- Verify your service role key is correct
- Ensure the functions have SECURITY DEFINER attribute

### Issue: Keys not being stored
- Check Supabase logs for any errors
- Verify the vault extension is enabled
- Test with the SQL Editor directly

## Rollback

If you need to rollback to the old Redis/in-memory storage:

1. Simply remove the `SUPABASE_SERVICE_ROLE_KEY` environment variable
2. The system will automatically fall back to the legacy storage method
3. No code changes required due to the abstraction layer