import Redis from 'ioredis';

// Configuration for different operation types
export interface RateLimitConfig {
  windowMs: number;  // Time window in milliseconds
  maxRequests: number;  // Max requests per window
  keyPrefix?: string;  // Optional prefix for Redis keys
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: number;  // Unix timestamp when window resets
  totalHits: number;  // Current hit count
}

// Default rate limit configurations
export const rateLimitConfigs = {
  // Wiki generation: 50 requests per minute
  wikiGeneration: {
    windowMs: 60 * 1000,
    maxRequests: 50,
    keyPrefix: 'rl:wiki'
  },

  // Image generation: 10 requests per minute (more expensive)
  imageGeneration: {
    windowMs: 60 * 1000,
    maxRequests: 10,
    keyPrefix: 'rl:image'
  },

  // World operations: 100 requests per minute
  worldOperations: {
    windowMs: 60 * 1000,
    maxRequests: 100,
    keyPrefix: 'rl:world'
  },

  // API key operations: 20 requests per minute
  apiKeyOperations: {
    windowMs: 60 * 1000,
    maxRequests: 20,
    keyPrefix: 'rl:apikey'
  },

  // Global fallback: 200 requests per minute
  global: {
    windowMs: 60 * 1000,
    maxRequests: 200,
    keyPrefix: 'rl:global'
  }
} as const;

// Redis client (reuse existing connection logic)
const redisUrl = process.env.REDIS_URL || process.env.KV_REST_API_URL;
let redisClient: Redis | null = null;

// In-memory fallback for development
const inMemoryStore = new Map<string, { count: number; resetTime: number }>();

function getRedisClient(): Redis | null {
  if (!redisUrl) {
    return null;
  }

  if (redisClient) {
    return redisClient;
  }

  try {
    // Handle both Redis URL and Vercel KV URL formats
    if (redisUrl.includes('kv.vercel-storage.com')) {
      // Vercel KV format - use URL as-is
      redisClient = new Redis(redisUrl, {
        lazyConnect: true,
        maxRetriesPerRequest: 2,
        family: 6, // Use IPv6 for Vercel KV
      });
    } else {
      // Standard Redis URL
      redisClient = new Redis(redisUrl, {
        lazyConnect: true,
        maxRetriesPerRequest: 2,
      });
    }

    return redisClient;
  } catch (error) {
    console.error('Failed to connect to Redis for rate limiting:', error);
    return null;
  }
}

async function ensureRedisConnection(client: Redis) {
  if (client.status === 'ready' || client.status === 'connecting') {
    return;
  }

  await client.connect();
}

/**
 * Check rate limit for a specific identifier and operation type
 */
export async function checkRateLimit(
  identifier: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  const now = Date.now();
  const windowStart = now - config.windowMs;
  const resetTime = now + config.windowMs;
  const key = `${config.keyPrefix || 'rl'}:${identifier}`;

  const redis = getRedisClient();

  if (!redis) {
    // Fallback to in-memory storage
    return handleInMemoryRateLimit(key, config, now, resetTime);
  }

  try {
    await ensureRedisConnection(redis);

    // Use Redis sorted set to track requests in sliding window
    const pipeline = redis.pipeline();

    // Remove old entries outside the window
    pipeline.zremrangebyscore(key, 0, windowStart);

    // Add current request with timestamp as score
    pipeline.zadd(key, now, `${now}-${Math.random()}`);

    // Count current requests in window
    pipeline.zcard(key);

    // Set expiration to clean up old keys
    pipeline.expire(key, Math.ceil(config.windowMs / 1000) + 10);

    const results = await pipeline.exec();

    if (!results || results.some(([err]) => err)) {
      console.error('Redis rate limit pipeline failed:', results);
      return handleInMemoryRateLimit(key, config, now, resetTime);
    }

    const totalHits = results[2][1] as number; // zcard result
    const allowed = totalHits <= config.maxRequests;
    const remaining = Math.max(0, config.maxRequests - totalHits);

    return {
      allowed,
      remaining,
      resetTime,
      totalHits
    };

  } catch (error) {
    console.error('Redis rate limit error:', error);
    // Fallback to in-memory
    return handleInMemoryRateLimit(key, config, now, resetTime);
  }
}

/**
 * In-memory fallback for development or when Redis is unavailable
 */
function handleInMemoryRateLimit(
  key: string,
  config: RateLimitConfig,
  now: number,
  resetTime: number
): RateLimitResult {
  const stored = inMemoryStore.get(key);

  // Reset if window has passed
  if (!stored || stored.resetTime <= now) {
    const newEntry = { count: 1, resetTime };
    inMemoryStore.set(key, newEntry);

    return {
      allowed: true,
      remaining: config.maxRequests - 1,
      resetTime,
      totalHits: 1
    };
  }

  // Increment counter
  stored.count++;
  const allowed = stored.count <= config.maxRequests;
  const remaining = Math.max(0, config.maxRequests - stored.count);

  return {
    allowed,
    remaining,
    resetTime: stored.resetTime,
    totalHits: stored.count
  };
}

/**
 * Convenience function for common rate limit checks
 */
export async function checkUserRateLimit(
  userId: string,
  operationType: keyof typeof rateLimitConfigs
): Promise<RateLimitResult> {
  const config = rateLimitConfigs[operationType];
  return checkRateLimit(userId, config);
}

/**
 * Convenience function for IP-based rate limiting
 */
export async function checkIPRateLimit(
  clientIP: string,
  operationType: keyof typeof rateLimitConfigs
): Promise<RateLimitResult> {
  const config = {
    ...rateLimitConfigs[operationType],
    keyPrefix: `${rateLimitConfigs[operationType].keyPrefix}:ip`
  };
  return checkRateLimit(clientIP, config);
}

/**
 * Combined rate limiting - checks both user and IP limits
 */
export async function checkCombinedRateLimit(
  userId: string,
  clientIP: string,
  operationType: keyof typeof rateLimitConfigs
): Promise<{
  userLimit: RateLimitResult;
  ipLimit: RateLimitResult;
  allowed: boolean;
}> {
  const [userLimit, ipLimit] = await Promise.all([
    checkUserRateLimit(userId, operationType),
    checkIPRateLimit(clientIP, operationType)
  ]);

  return {
    userLimit,
    ipLimit,
    allowed: userLimit.allowed && ipLimit.allowed
  };
}

// Clean up old in-memory entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of inMemoryStore.entries()) {
    if (value.resetTime <= now) {
      inMemoryStore.delete(key);
    }
  }
}, 60 * 1000); // Clean up every minute