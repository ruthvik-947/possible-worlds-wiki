import type { IncomingHttpHeaders } from 'http';
import { verifyToken } from '@clerk/express';

const secretKey = process.env.CLERK_SECRET_KEY;

if (!secretKey) {
  throw new Error('Missing CLERK_SECRET_KEY environment variable for Clerk authentication');
}

function extractBearerToken(headers: IncomingHttpHeaders): string {
  const authorizationHeader = headers['authorization'] ?? headers['Authorization'];
  if (!authorizationHeader || Array.isArray(authorizationHeader)) {
    throw new Error('Authorization header missing');
  }

  const [scheme, token] = authorizationHeader.split(' ');
  if (scheme !== 'Bearer' || !token) {
    throw new Error('Invalid authorization header');
  }

  return token;
}

export async function getUserIdFromHeaders(headers: IncomingHttpHeaders): Promise<string> {
  const token = extractBearerToken(headers);
  const payload = await verifyToken(token, { secretKey });

  if (!payload.sub) {
    throw new Error('Invalid token payload');
  }

  return payload.sub;
}
