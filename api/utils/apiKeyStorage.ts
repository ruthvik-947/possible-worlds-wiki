import Redis from 'ioredis';
import crypto from 'crypto';

const redisUrl = process.env.REDIS_URL;
const encryptionKey = process.env.API_KEY_ENCRYPTION_SECRET || 'default-encryption-key-change-in-production';

let redisClient: Redis | null = null;

const inMemoryKeys = new Map<string, { apiKey: string; timestamp: number }>();

function getRedisClient(): Redis | null {
  if (!redisUrl) {
    return null;
  }

  if (redisClient) {
    return redisClient;
  }

  redisClient = new Redis(redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 2,
  });

  return redisClient;
}

async function ensureRedisConnection(client: Redis) {
  if (client.status === 'ready' || client.status === 'connecting') {
    return;
  }

  await client.connect();
}

function apiKeyRedisKey(userId: string): string {
  return `apikey:${userId}`;
}

function encrypt(text: string): string {
  const algorithm = 'aes-256-gcm';
  const key = crypto.scryptSync(encryptionKey, 'salt', 32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(algorithm, key, iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
}

function decrypt(encryptedData: string): string {
  const algorithm = 'aes-256-gcm';
  const key = crypto.scryptSync(encryptionKey, 'salt', 32);

  const parts = encryptedData.split(':');
  const iv = Buffer.from(parts[0], 'hex');
  const authTag = Buffer.from(parts[1], 'hex');
  const encrypted = parts[2];

  const decipher = crypto.createDecipheriv(algorithm, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

export async function storeApiKey(userId: string, apiKey: string): Promise<void> {
  const redis = getRedisClient();

  if (redis) {
    try {
      await ensureRedisConnection(redis);
      const key = apiKeyRedisKey(userId);
      const encryptedKey = encrypt(apiKey);

      // Store with 3-day TTL (72 hours)
      await redis.set(key, encryptedKey, 'EX', 60 * 60 * 72);
      return;
    } catch (error) {
      console.error('Failed to store API key in Redis:', error);
      // Fall back to in-memory storage
    }
  }

  // Fallback to in-memory storage
  inMemoryKeys.set(userId, { apiKey, timestamp: Date.now() });
}

export async function getApiKey(userId: string): Promise<string | null> {
  const redis = getRedisClient();

  if (redis) {
    try {
      await ensureRedisConnection(redis);
      const key = apiKeyRedisKey(userId);
      const encryptedKey = await redis.get(key);

      if (encryptedKey) {
        return decrypt(encryptedKey);
      }
    } catch (error) {
      console.error('Failed to retrieve API key from Redis:', error);
      // Fall back to in-memory storage
    }
  }

  // Fallback to in-memory storage
  const stored = inMemoryKeys.get(userId);
  if (stored) {
    // Check if key is older than 3 days
    const now = Date.now();
    if (now - stored.timestamp > 72 * 60 * 60 * 1000) {
      inMemoryKeys.delete(userId);
      return null;
    }
    return stored.apiKey;
  }

  return null;
}

export async function removeApiKey(userId: string): Promise<void> {
  const redis = getRedisClient();

  if (redis) {
    try {
      await ensureRedisConnection(redis);
      const key = apiKeyRedisKey(userId);
      await redis.del(key);
    } catch (error) {
      console.error('Failed to remove API key from Redis:', error);
    }
  }

  // Also remove from in-memory storage
  inMemoryKeys.delete(userId);
}

export async function hasApiKey(userId: string): Promise<boolean> {
  const redis = getRedisClient();

  if (redis) {
    try {
      await ensureRedisConnection(redis);
      const key = apiKeyRedisKey(userId);
      const exists = await redis.exists(key);
      return exists === 1;
    } catch (error) {
      console.error('Failed to check API key existence in Redis:', error);
      // Fall back to in-memory check
    }
  }

  // Fallback to in-memory check
  const stored = inMemoryKeys.get(userId);
  if (stored) {
    const now = Date.now();
    if (now - stored.timestamp > 72 * 60 * 60 * 1000) {
      inMemoryKeys.delete(userId);
      return false;
    }
    return true;
  }

  return false;
}

// Clean up old in-memory keys every hour (fallback storage only)
setInterval(() => {
  const now = Date.now();
  for (const [userId, data] of inMemoryKeys.entries()) {
    if (now - data.timestamp > 72 * 60 * 60 * 1000) { // 3 days
      inMemoryKeys.delete(userId);
    }
  }
}, 60 * 60 * 1000); // Check every hour