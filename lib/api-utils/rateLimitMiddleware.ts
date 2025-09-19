import type { Request, Response, NextFunction } from 'express';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { checkCombinedRateLimit, rateLimitConfigs } from './rateLimit.js';

export interface RateLimitOptions {
  operationType: keyof typeof rateLimitConfigs;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  getUserId?: (req: any) => string | undefined;
  getClientIP?: (req: any) => string;
}

/**
 * Express middleware for rate limiting
 */
export function createRateLimitMiddleware(options: RateLimitOptions) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = options.getUserId?.(req) || (req as any).auth?.userId;
      const clientIP = options.getClientIP?.(req) || req.ip || req.connection.remoteAddress || 'unknown';

      if (!userId) {
        // If no user ID, only check IP-based rate limiting
        const config = rateLimitConfigs[options.operationType];
        const { checkIPRateLimit } = await import('./rateLimit.js');
        const result = await checkIPRateLimit(clientIP, options.operationType);

        setRateLimitHeaders(res, result, config.maxRequests);

        if (!result.allowed) {
          return res.status(429).json({
            error: 'Too Many Requests',
            message: `Rate limit exceeded. Try again in ${Math.ceil((result.resetTime - Date.now()) / 1000)} seconds.`,
            retryAfter: Math.ceil((result.resetTime - Date.now()) / 1000)
          });
        }

        return next();
      }

      // Check both user and IP limits
      const rateLimitResult = await checkCombinedRateLimit(userId, clientIP, options.operationType);
      const config = rateLimitConfigs[options.operationType];

      // Set headers based on the most restrictive limit
      const mostRestrictive = rateLimitResult.userLimit.remaining < rateLimitResult.ipLimit.remaining
        ? rateLimitResult.userLimit
        : rateLimitResult.ipLimit;

      setRateLimitHeaders(res, mostRestrictive, config.maxRequests);

      if (!rateLimitResult.allowed) {
        const failedLimit = !rateLimitResult.userLimit.allowed ? 'user' : 'IP';
        const relevantResult = failedLimit === 'user' ? rateLimitResult.userLimit : rateLimitResult.ipLimit;

        return res.status(429).json({
          error: 'Too Many Requests',
          message: `Rate limit exceeded for ${failedLimit}. Try again in ${Math.ceil((relevantResult.resetTime - Date.now()) / 1000)} seconds.`,
          retryAfter: Math.ceil((relevantResult.resetTime - Date.now()) / 1000),
          limitType: failedLimit
        });
      }

      next();
    } catch (error) {
      console.error('Rate limiting error:', error);
      // On error, allow the request but log the issue
      next();
    }
  };
}

/**
 * Vercel function wrapper for rate limiting
 */
export function withRateLimit<T extends VercelRequest, U extends VercelResponse>(
  options: RateLimitOptions,
  handler: (req: T, res: U) => Promise<void> | void
) {
  return async (req: T, res: U) => {
    try {
      // Extract user ID (you'll need to implement getUserIdFromHeaders)
      let userId: string | undefined;
      try {
        const { getUserIdFromHeaders } = await import('./clerk.js');
        userId = await getUserIdFromHeaders(req.headers);
      } catch {
        // User not authenticated, that's ok for some endpoints
      }

      const clientIP = req.headers['x-forwarded-for'] as string ||
                      req.headers['x-real-ip'] as string ||
                      'unknown';

      if (!userId) {
        // If no user ID, only check IP-based rate limiting
        const config = rateLimitConfigs[options.operationType];
        const { checkIPRateLimit } = await import('./rateLimit.js');
        const result = await checkIPRateLimit(clientIP, options.operationType);

        setRateLimitHeaders(res, result, config.maxRequests);

        if (!result.allowed) {
          return res.status(429).json({
            error: 'Too Many Requests',
            message: `Rate limit exceeded. Try again in ${Math.ceil((result.resetTime - Date.now()) / 1000)} seconds.`,
            retryAfter: Math.ceil((result.resetTime - Date.now()) / 1000)
          });
        }

        return handler(req, res);
      }

      // Check both user and IP limits
      const rateLimitResult = await checkCombinedRateLimit(userId, clientIP, options.operationType);
      const config = rateLimitConfigs[options.operationType];

      // Set headers based on the most restrictive limit
      const mostRestrictive = rateLimitResult.userLimit.remaining < rateLimitResult.ipLimit.remaining
        ? rateLimitResult.userLimit
        : rateLimitResult.ipLimit;

      setRateLimitHeaders(res, mostRestrictive, config.maxRequests);

      if (!rateLimitResult.allowed) {
        const failedLimit = !rateLimitResult.userLimit.allowed ? 'user' : 'IP';
        const relevantResult = failedLimit === 'user' ? rateLimitResult.userLimit : rateLimitResult.ipLimit;

        return res.status(429).json({
          error: 'Too Many Requests',
          message: `Rate limit exceeded for ${failedLimit}. Try again in ${Math.ceil((relevantResult.resetTime - Date.now()) / 1000)} seconds.`,
          retryAfter: Math.ceil((relevantResult.resetTime - Date.now()) / 1000),
          limitType: failedLimit
        });
      }

      return handler(req, res);
    } catch (error) {
      console.error('Rate limiting error:', error);
      // On error, allow the request but log the issue
      return handler(req, res);
    }
  };
}

/**
 * Set standard rate limit headers
 */
function setRateLimitHeaders(res: Response | VercelResponse, result: any, maxRequests: number) {
  res.setHeader('X-RateLimit-Limit', maxRequests);
  res.setHeader('X-RateLimit-Remaining', result.remaining);
  res.setHeader('X-RateLimit-Reset', Math.ceil(result.resetTime / 1000));

  if (!result.allowed) {
    res.setHeader('Retry-After', Math.ceil((result.resetTime - Date.now()) / 1000));
  }
}