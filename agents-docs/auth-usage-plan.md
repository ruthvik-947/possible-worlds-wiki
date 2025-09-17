# Clerk Auth + Usage Limits Rollout Plan

## Objectives
- Replace IP-based free tier enforcement with Clerk-authenticated, per-user quotas while keeping "bring your own key" support.
- Require sign-in before a user can hit proxy endpoints, continuing to protect the server-side API key.
- Provide clear upgrade paths for local development, testing, and production deployment.

## Phase 0 – Align on requirements
1. Free tier locked to 5 requests per signed-in user each UTC day; BYOK users keep unlimited access.
2. Upstash Redis (serverless, generous free tier, simple Vercel integration) and fall back to a local Docker Redis for development
3. No migration cleanup required—plan can assume a fresh launch with the new auth/quota stack.

## Phase 1 – Clerk project setup
1. Create a Clerk application (or choose the existing one) and enable the sign-in methods you want (Google, GitHub, email, etc.).
2. In the Clerk dashboard copy the Publishable Key and Secret Key.
3. Update environment configuration:
   - `.env.local`: add `VITE_CLERK_PUBLISHABLE_KEY=pk_test_xxx` (placeholder).
   - Server env (local + Vercel): add `CLERK_SECRET_KEY=sk_test_xxx`.
   - Keep `.env*` files ignored from git.
4. Add a short README note in `agents-docs/clerk-setup-docs.md` linking back to the Clerk quickstart for future reference.

## Phase 2 – Frontend Clerk integration
1. Install dependencies: `npm install @clerk/clerk-react@latest`.
2. Wrap the root React tree in the provider:
   - Update `main.tsx` to import `ClerkProvider` and render `<ClerkProvider publishableKey={PUBLISHABLE_KEY} afterSignOutUrl="/">` around `<App />`.
   - Guard for missing `VITE_CLERK_PUBLISHABLE_KEY` to surface configuration mistakes early.
3. Add auth UI scaffolding:
   - In the top-level layout (likely `App.tsx` or a new navbar component) render `<SignedOut><SignInButton /></SignedOut>` and `<SignedIn><UserButton /></SignedIn>`.
   - Optionally add `<SignUpButton />` if account creation is open.
4. Gate wiki functionality:
   - Wrap `WikiInterface` (and similar heavy components) in `<SignedIn>` so anonymous users only see a welcome/CTA screen to sign in.
   - Display feature-locked messaging within `<SignedOut>` including why login is required.
5. Ensure existing state initialization that reads from `localStorage` runs only after sign-in to avoid leaking cross-user data when multiple people share a browser profile.

## Phase 3 – Authenticated request flow from the client
1. Use Clerk's hooks to attach auth tokens to API calls:
   - In `components/WikiGenerator.ts` (and other fetch helpers) import `useAuth` or pass a token down from a caller that can call `getToken({ template: 'wiki-proxy' })`.
   - When issuing `fetch`, include `Authorization: Bearer ${token}`. Continue sending `sessionId` temporarily until backend migration is complete.
2. Handle token refresh and loading states—disable generate buttons until `isLoaded` is true and a signed-in session exists.
3. Update any other network calls (`UsageIndicator`, `WorldManager` if it calls APIs) to include the same bearer token.
4. Remove reliance on `localStorage` for server-issued `sessionId` once backend switches to per-user storage.

## Phase 4 – Backend Clerk enforcement
1. Install server dependencies inside `api/`: `npm install @clerk/clerk-sdk-node@latest` (and `npm install` to refresh lockfiles).
2. Create a Clerk helper (e.g. `api/clerk.ts`) exporting `ClerkExpressWithAuth` / `requireAuth` middleware configured with the secret key.
3. In `api/index.ts`:
   - Import the middleware and apply it to the routes that proxy LLM requests (`/api/generate*`, `/api/store-key`, `/api/usage`).
   - Reject requests without valid `Authorization` headers with 401 before hitting business logic.
4. Propagate the authenticated user:
   - Update handler signatures (`handleGenerate`, `handleGenerateSection`, `handleImageGeneration`) to accept `userId` from `req.auth.userId`.
   - Pass the userId through to any helper needing quota/key lookups.
5. Remove or demote the hard-coded `'localhost'` client IP fallback once per-user quotas land; keep IP around only for secondary rate limiting.

## Phase 5 – Quota service keyed by userId
1. Add a quota module (e.g. `api/utils/quota.ts`) that exposes `getUsageForUser`, `incrementUsageForUser`, `hasExceededUserLimit`.
   - Backed by Redis hash keys such as `quota:{userId}:{YYYY-MM-DD}`; remember to expire keys after 2 days to avoid buildup.
   - Provide a dev fallback to the current in-memory Map if `REDIS_URL` is unset.
2. Update environment config with `REDIS_URL` (and optional `REDIS_TOKEN` when using Upstash HTTP API).
3. Replace all IP-based references in `api/utils/shared.ts` and `api/usage.ts` with the new user-based helpers.
4. Modify error payloads to continue returning `usageCount`, `dailyLimit`, and `requiresApiKey` so the UI behaves the same.
5. Keep the old `dailyUsage` Map around temporarily behind a feature flag until the new service is proven, then remove it.

## Phase 6 – Rework BYOK storage around Clerk identities
1. Replace the existing `activeApiKeys` Map so it is keyed by Clerk `userId` instead of a random session identifier.
2. Require auth on `/api/store-key` and use `req.auth.userId` as the storage key; return a lightweight acknowledgment instead of a new `sessionId`.
3. Add an endpoint to clear a saved key (`DELETE /api/store-key`) for users who want to revoke BYOK quickly.
4. Update frontend `ApiKeyDialog` to:
   - Fetch whether a user already uploaded a key.
   - Stop storing `sessionId` in component state once backend no longer issues it.
5. Ensure BYOK keys are kept in memory only or optionally move to encrypted storage if persistent retention becomes necessary (call out in future work).

## Phase 7 – Usage indicator & config refresh
1. Update `/api/config` to simply echo feature flags; remove `enableUserApiKeys` if it becomes redundant post-Clerk.
2. Refactor `api/usage.ts` to look up usage by `userId` (and return `unlimited: true` when a BYOK key exists for that user).
3. Adjust `components/UsageIndicator.tsx` to call the updated endpoint and display per-user counts after sign-in.
4. Verify that error-toasts and CTA copy still make sense now that login is required before hitting limits.

## Phase 8 – Testing & rollout
1. Automated tests:
   - Add unit tests for the quota helper (mock Redis) covering reset at UTC midnight and BYOK bypass.
   - Add integration tests hitting the Express app with valid/invalid Clerk tokens.
2. Manual QA checklist:
   - Sign in and confirm generate/section/image flows succeed until quota is exhausted, then receive the expected error.
   - Provide a BYOK key and verify quota enforcement is skipped.
   - Sign out and ensure protected content disappears and API calls fail with 401.
3. Observability:
   - Log when quota denials happen (`userId`, remaining).
   - Consider metrics for total signed-in users vs BYOK adoption.
4. Deployment:
   - Configure Clerk keys and Redis variables in Vercel project settings before deploying.
   - Roll out behind a feature flag (e.g. `ENABLE_CLERK_AUTH`) so you can revert to IP-based limits if issues appear.
5. Documentation:
   - Update `agents-docs/usage-limits-plan.md` with a link to this plan once implemented.
   - Refresh any onboarding docs that mention IP-based rate limiting or `sessionId` handling.
