# User ID Alignment: Clerk Auth → Supabase Storage

## Overview
This document confirms that user IDs from Clerk authentication are properly aligned across all data storage systems (API keys in Vault, worlds in Supabase, usage quotas).

## User ID Flow

### 1. Authentication (Clerk)

**User ID Source**: Clerk JWT token `sub` claim
```typescript
// api/utils/clerk.ts
export async function getUserIdFromHeaders(headers: IncomingHttpHeaders): Promise<string> {
  const token = extractBearerToken(headers);
  const payload = await verifyToken(token, { secretKey });

  if (!payload.sub) {
    throw new Error('Invalid token payload');
  }

  return payload.sub; // This is the Clerk user ID (e.g., "user_2abc123def...")
}
```

### 2. Express Middleware
```typescript
// api/index.ts
app.use(clerkMiddleware());

// Each route gets userId from Clerk auth
app.post('/api/store-key', requireAuth(), async (req: any, res: any) => {
  const userId = req.auth?.userId; // Clerk user ID from middleware
  await storeApiKey(userId, apiKey);
});
```

### 3. Vercel Functions
```typescript
// api/store-key.ts (Vercel function)
export default async function handler(req: VercelRequest, res: VercelResponse) {
  let userId: string;
  userId = await getUserIdFromHeaders(req.headers); // Same Clerk user ID
  await storeApiKey(userId, apiKey);
}
```

## Data Storage Alignment

### API Keys (Supabase Vault)
```sql
-- Vault stores keys with Clerk user ID as part of the secret name
INSERT INTO vault.secrets (name, secret)
VALUES ('openai_api_key_' || p_user_id, p_api_key);
-- Example: 'openai_api_key_user_2abc123def...'

-- Metadata table also uses Clerk user ID
CREATE TABLE user_api_keys (
  user_id TEXT PRIMARY KEY,  -- Clerk user ID
  created_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ
);
```

### Worlds (Supabase)
```typescript
// api/utils/worlds.ts
export async function listWorlds(userId: string): Promise<WorldSummary[]> {
  const { data, error } = await supabase
    .from('worlds')
    .select('...')
    .eq('user_id', userId)  // Same Clerk user ID
    .order('updated_at', { ascending: false });
}

export async function saveWorld(userId: string, world: any): Promise<WorldSummary> {
  // Upserts with composite key (user_id, world_id)
  // user_id is the Clerk user ID
}
```

### Usage Quotas (Redis/In-Memory)
```typescript
// api/utils/quota.ts
function quotaKey(userId: string, date: string): string {
  return `quota:${userId}:${date}`; // Uses Clerk user ID
}
```

## Data Model Summary

### Supabase Tables

#### `worlds` table (existing)
- **Primary Key**: `(user_id, world_id)`
- `user_id`: Clerk user ID
- `world_id`: Generated UUID for the world
- `payload`: Full world JSON data
- Other metadata columns

#### `user_api_keys` table (new with Vault)
- **Primary Key**: `user_id`
- `user_id`: Clerk user ID
- `created_at`: When key was stored
- `expires_at`: TTL expiration (72 hours)
- `last_used_at`: Last API call using this key

#### `vault.secrets` table (Supabase managed)
- Stores encrypted API keys
- `name`: `'openai_api_key_' + clerk_user_id`
- `secret`: Encrypted API key (handled by Vault)

## Security Guarantees

1. **User Isolation**: Each user can only access their own data
   - Worlds filtered by `user_id = currentUser`
   - API keys namespaced by user ID in Vault
   - Quotas tracked per user

2. **Consistent Identity**: The same Clerk user ID is used everywhere:
   - API key storage/retrieval
   - World CRUD operations
   - Usage quota tracking
   - Audit logging

3. **No Cross-Contamination**:
   - User A cannot access User B's API keys
   - User A cannot see or modify User B's worlds
   - Each user's quota is independent

## Example User Flow

1. User signs in via Clerk → Gets user ID `user_2abc123def`
2. User provides OpenAI API key → Stored as `openai_api_key_user_2abc123def` in Vault
3. User creates world → Saved with `user_id = 'user_2abc123def'`
4. User generates content → Uses their stored API key from Vault
5. Usage tracked → Redis key `quota:user_2abc123def:2025-01-18`

## Testing Verification

To verify alignment in production:

```sql
-- Check API keys for a user
SELECT user_id, created_at, expires_at
FROM user_api_keys
WHERE user_id = 'user_2abc123def';

-- Check worlds for same user
SELECT user_id, world_id, name
FROM worlds
WHERE user_id = 'user_2abc123def';

-- Both should show the same Clerk user ID
```

## Conclusion

✅ **Confirmed**: The system properly uses Clerk user IDs consistently across:
- API key storage in Supabase Vault
- World storage in Supabase
- Usage quota tracking
- All API endpoints

The user ID from Clerk authentication (`req.auth.userId` or `payload.sub`) is the single source of truth for all user-scoped operations.