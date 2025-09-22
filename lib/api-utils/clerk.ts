import type { IncomingHttpHeaders } from 'http';
import { verifyToken } from '@clerk/express';
import { createClerkClient } from '@clerk/backend';

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

// New function using Clerk SDK - more robust for production
export async function getUserIdFromHeadersSDK(headers: IncomingHttpHeaders): Promise<string> {
  const clerkClient = createClerkClient({
    secretKey: secretKey!,
    publishableKey: process.env.CLERK_PUBLISHABLE_KEY
  });

  // Create a minimal request object for Clerk's authenticateRequest
  const mockRequest = new Request('https://example.com', {
    method: 'POST',
    headers: headers as Record<string, string>
  });

  try {
    const { isAuthenticated, toAuth } = await clerkClient.authenticateRequest(mockRequest);

    if (!isAuthenticated) {
      throw new Error('Request is not authenticated');
    }

    const { userId } = toAuth();

    if (!userId) {
      throw new Error('No user ID found in authenticated request');
    }

    return userId;
  } catch (error: any) {
    throw new Error(`Authentication failed: ${error.message}`);
  }
}
