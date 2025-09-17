BYOK + Quota Plan

1. Authentication

Use Clerk for login (Google/GitHub/email magic link, etc.).

When the user signs in, you get a unique stable userId from Clerk.

All traffic goes through your backend (no client calls directly to the LLM provider).

2. Request Flow

User signs in with Clerk → frontend stores Clerk session.

User makes a request → frontend calls your /proxy endpoint with Clerk auth token.

Backend verifies session with Clerk → extracts userId.

Decide which API key to use:

If user provides their own → use it (ephemeral).

Else → use your key, but check quota.

3. Quota Enforcement (Redis)

Redis key format:

quota:{userId}:{YYYY-MM-DD} → integer


On each request with your key:

GET quota:{userId}:{today}

If < 5: INCR and allow.

Else: reject with "Free quota exceeded. Please add your own API key."

4. Security

Never send your key to the client.

All LLM API calls go server → provider.

Clerk ensures only signed-in users can hit /proxy.

Add basic IP-based rate limiting (e.g. 10 req/min per IP) to deter abuse.

5. Implementation Stack

Frontend:

Clerk SDK for auth.

Call /proxy endpoint for all LLM requests.

Backend:

Express/Fastify (or whatever you prefer).

Clerk middleware for auth.

Redis for per-user daily counters.

Fetch to LLM provider using appropriate key.

⚡ Result:

Every user must sign in (Clerk).

They get 5 free requests/day with your key.

Beyond that, they’re prompted to add their own key (ephemeral, not stored).

Abuse is limited by login + Redis quota + optional IP throttling.