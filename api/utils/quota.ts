import Redis from 'ioredis';
import { getCurrentDateString, getFreeLimit } from './shared.js';

export interface UsageRecord {
  count: number;
  lastResetDate: string;
}

const redisUrl = process.env.REDIS_URL;
let redisClient: Redis | null = null;

const inMemoryUsage = new Map<string, UsageRecord>();

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

function quotaKey(userId: string, date: string): string {
  return `quota:${userId}:${date}`;
}

async function ensureRedisConnection(client: Redis) {
  if (client.status === 'ready' || client.status === 'connecting') {
    return;
  }

  await client.connect();
}

export async function getUsageForUser(userId: string): Promise<UsageRecord> {
  const today = getCurrentDateString();
  const redis = getRedisClient();

  if (redis) {
    await ensureRedisConnection(redis);
    const key = quotaKey(userId, today);
    const rawCount = await redis.get(key);
    const count = rawCount ? parseInt(rawCount, 10) : 0;
    return { count, lastResetDate: today };
  }

  const usage = inMemoryUsage.get(userId);
  if (!usage || usage.lastResetDate !== today) {
    const fresh: UsageRecord = { count: 0, lastResetDate: today };
    inMemoryUsage.set(userId, fresh);
    return fresh;
  }

  return usage;
}

export async function incrementUsageForUser(userId: string): Promise<UsageRecord> {
  const today = getCurrentDateString();
  const redis = getRedisClient();

  if (redis) {
    await ensureRedisConnection(redis);
    const key = quotaKey(userId, today);
    const newCount = await redis.incr(key);
    // expire after 48 hours to allow for clock drift
    if (newCount === 1) {
      await redis.expire(key, 60 * 60 * 48);
    }

    return { count: newCount, lastResetDate: today };
  }

  const current = await getUsageForUser(userId);
  const updated: UsageRecord = {
    count: current.count + 1,
    lastResetDate: current.lastResetDate,
  };
  inMemoryUsage.set(userId, updated);
  return updated;
}

export async function hasExceededUserLimit(userId: string): Promise<boolean> {
  if (process.env.BYPASS_USAGE_LIMITS === 'true') {
    return false;
  }

  const usage = await getUsageForUser(userId);
  return usage.count >= getFreeLimit();
}

export async function resetUserUsage(userId: string): Promise<void> {
  const redis = getRedisClient();
  const today = getCurrentDateString();

  if (redis) {
    await ensureRedisConnection(redis);
    const key = quotaKey(userId, today);
    await redis.del(key);
    return;
  }

  inMemoryUsage.delete(userId);
}
