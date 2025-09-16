# API Architecture Solution

## The Problem We Solved

The application had **dual API implementations** that got out of sync:

1. **Express Server** (`api/index.ts`) - Development only, served at `localhost:3001`
2. **Vercel Functions** (`api/generate.ts`, `api/generate-section.ts`) - Production

When we updated the Vercel functions to use `streamText` for real-time streaming, the Express server still used the old `generateObject` implementation. This created confusion where:

- ✅ **Production**: Real-time streaming worked
- ❌ **Development**: Still used old non-streaming approach

## Root Cause

**Different code paths in development vs production:**

```javascript
// lib/config.ts - Routes to different servers
const API_BASE_URL = import.meta.env.VITE_API_URL ||
  (import.meta.env.DEV ? 'http://localhost:3001' : '');  // <- Different paths!
```

**Development:** `http://localhost:3001/api/generate` (Express server)
**Production:** `/api/generate` (Vercel functions)

## The Solution

### What We Implemented

1. **Updated Express Server**: Modified `api/index.ts` to use the same `streamText` approach
2. **Added Real-time Streaming**: Character-by-character streaming with immediate updates
3. **Consistent Implementation**: Both servers now use identical streaming logic
4. **Enhanced Debugging**: Added comprehensive logging to track streaming progress

### Key Changes Made

**Before (Non-streaming):**
```javascript
const result = await generateObject({
  model: model,
  schema: z.object({...}),  // Wait for complete JSON
  prompt: "..."
});
res.json(result.object);  // Return all at once
```

**After (Real-time Streaming):**
```javascript
const result = await streamText({
  model: model,
  prompt: "..." // Natural language with section markers
});

for await (const textDelta of result.textStream) {
  accumulatedText += textDelta;
  // Send update immediately on every text chunk
  res.write('data: ' + JSON.stringify(partialData) + '\n\n');
}
```

## Prevention Strategy

### Best Practices to Avoid This Issue

1. **Single Source of Truth**:
   - Create shared handlers (`api/shared-handlers.ts`) that both Express and Vercel can use
   - Extract common logic into reusable functions

2. **Consistent Development Environment**:
   - Consider using Vercel CLI for development: `vercel dev`
   - This runs actual Vercel functions locally instead of Express

3. **Automated Testing**:
   - Add integration tests that verify both development and production endpoints
   - Test streaming behavior specifically

4. **Documentation Updates**:
   - Keep CLAUDE.md synchronized with actual architecture
   - Document which server is used in each environment

### Recommended Architecture Changes

**Option 1: Shared Handlers (Implemented)**
```
api/
├── shared-handlers.ts     # Common streaming logic
├── generate.ts           # Vercel function (calls shared handler)
├── generate-section.ts   # Vercel function (calls shared handler)
└── index.ts             # Express server (calls shared handler)
```

**Option 2: Vercel Dev Only (Future consideration)**
```bash
# Replace npm run dev:api with:
vercel dev

# Update lib/config.ts to always use localhost:3000
const API_BASE_URL = import.meta.env.DEV ? 'http://localhost:3000' : '';
```

**Option 3: Development Proxy (Alternative)**
```javascript
// vite.config.ts
export default defineConfig({
  server: {
    proxy: {
      '/api': 'http://localhost:3001'  // Explicit proxy to Express
    }
  }
});
```

## Current Status

✅ **Fixed**: Both development and production now use real-time streaming
✅ **Working**: Character-by-character text generation like ChatGPT
✅ **Consistent**: Express server matches Vercel function behavior

## Lessons Learned

1. **Environment Parity**: Development and production should use identical code paths
2. **Streaming Complexity**: `streamObject` doesn't actually stream for complex schemas
3. **Natural Language > JSON**: Using section markers instead of JSON enables true streaming
4. **Immediate Updates**: Send data on every `textDelta` for maximum responsiveness

The streaming implementation now provides a much more engaging user experience where content appears in real-time as the AI generates it!