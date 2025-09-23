# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

**Frontend Development:**
- `npm run dev` - Start Vite development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build locally
- `npm run lint` - Run ESLint
- `npm run typecheck` - Run TypeScript type checking

**Backend Development:**

The backend now runs through a single Express application that serves both
local development and the Vercel deployment. Locally the server listens on
`localhost:3001`, while production requests are forwarded to the same handler
via the `/api/*` rewrite defined in `vercel.json`.

**Option 1: Express Development Server (Recommended for Development)**
```bash
npm run dev:api          # Start Express server on localhost:3001
npm run dev              # Start frontend (will connect to localhost:3001)
```

**Option 2: Vercel Development Server (For Production Testing)**
```bash
# First time setup:
npx vercel login         # Authenticate with Vercel
npx vercel link          # Link project (optional)

# Development:
npm run dev:vercel       # Start Vercel dev server on localhost:3000
```

Then in your `.env.local` file, set:
```
VITE_API_URL="http://localhost:3000"
```

And restart the frontend:
```bash
npm run dev              # Start frontend (will connect to localhost:3000)
```

**Testing:**
- `npm run test:api-parity` - Test API consistency between Express and Vercel

**⚠️ IMPORTANT: API Consistency**
Always run `npm run test:api-parity` before deploying to ensure development and production environments behave identically.

## Architecture Overview

This is a **PossibleWorldWikis** application - an AI-powered interactive worldbuilding wiki generator. The architecture consists of:

### Frontend (Vite + React + TypeScript)
- **Main Interface**: `WikiInterface.tsx` - Central component managing wiki pages, navigation, and worldbuilding state
- **Page Rendering**: `WikiPage.tsx` - Displays individual wiki pages with clickable terms and expandable sections
- **Content Generation**: `WikiGenerator.ts` - Handles API calls to generate wiki content
- **Worldbuilding System**: `WorldbuildingHistory.ts` - Manages persistent worldbuilding context across three categories (mental, material, social)
- **API Configuration**: `lib/config.ts` - Environment-aware API endpoint configuration

### Backend (Unified Architecture)
- **API Routes** served from `api/index.ts`:
  - Handles all `/api/*` endpoints (config, usage, key storage, world routes,
    wiki generation, and image creation) through a single Express app
- **Deployment**: `vercel.json` rewrites `/api/(.*)` to the Express handler so
  only one Serverless Function is deployed (avoiding the 12-function Hobby
  limit)
- **Shared Logic**:
  - `lib/api-utils/shared-handlers.ts` - Common streaming logic used by both Express and Vercel
  - `lib/api-utils/shared.ts` - Common functions and worldbuilding categories
  - `lib/api-utils/sentry.ts` - Centralized Sentry error tracking for backend operations

**🎯 Architecture Principle: Single Source of Truth**
All API endpoints use shared handlers from `lib/api-utils/shared-handlers.ts` to ensure identical behavior between development (Express) and production (Vercel) environments.

### Key Data Flow
1. **Seed Creation**: User enters initial concept → generates first wiki page
2. **Term Expansion**: Clicking highlighted terms → generates new interconnected pages
3. **Worldbuilding Context**: Each page updates a persistent worldbuilding record that informs future generations
4. **Session Management**: Supports both server-side API keys and user-provided keys with temporary session storage

### Environment Configuration
- **Development**: Frontend calls `localhost:3001`, backend runs via Express (`npm run dev:api`)
- **Production**: Frontend uses relative API paths, backend deployed as Vercel serverless functions
- **Environment Variables**:
  - `VITE_API_URL` - Frontend API base URL (auto-configured)
  - `OPENAI_API_KEY` - Server-side OpenAI key
  - `ENABLE_USER_API_KEYS` - Toggle for user-provided API key mode
  - `VITE_SENTRY_DSN` - Sentry DSN for frontend error tracking
  - `SENTRY_DSN` - Sentry DSN for backend error tracking

### Error Monitoring (Sentry)
- **Frontend**: Errors captured automatically in `main.tsx`
- **Express Backend**: Errors captured in `api/index.ts` with operation tags
- **Shared Utilities**: `lib/api-utils/sentry.ts` centralizes configuration for
  any helper modules that need server-side logging
- **Configuration**: Uses `sendDefaultPii: false` to not collect IP addresses and user context
- All errors tagged with operation context for better debugging

### UI System
- **Styling**: TailwindCSS with custom "Glass Minimalism" design system
- **Components**: Radix UI primitives with custom styling in `components/ui/`
- **Theme**: Dark/light mode toggle with localStorage persistence

The application generates coherent fictional worlds by maintaining context across page generations and using structured worldbuilding categories to guide AI content creation.

## API Development Guidelines

### Preventing Dual Implementation Issues

**✅ DO:**
1. Always implement new endpoints in `lib/api-utils/shared-handlers.ts` first
2. Call shared handlers from both Express (`api/index.ts`) and Vercel functions
3. Run `npm run test:api-parity` before committing API changes
4. Use `npm run dev:vercel` for development when testing production parity
5. Keep streaming logic, error handling, and business logic in shared handlers
6. **Place all API utilities in `lib/api-utils/`** (not in `api/` directory)
7. **Always log errors to Sentry** with appropriate operation tags for debugging

**❌ DON'T:**
1. Copy-paste code between Express and Vercel functions
2. Implement features directly in `api/index.ts` without shared handlers
3. Add different logic paths between development and production
4. Skip API parity testing before deployment

### Adding New API Endpoints

When adding a new API endpoint:

1. **Create shared handler** in `lib/api-utils/shared-handlers.ts`:
   ```typescript
   export async function handleNewFeature(
     param1: string,
     clientIP?: string,
     writeData?: (data: string) => void,
     endResponse?: () => void
   ) {
     // Implementation here
   }
   ```

2. **Add Express route** in `api/index.ts`:
   ```typescript
   app.post('/api/new-feature', async (req, res) => {
     // Set streaming headers
     try {
       await handleNewFeature(
         req.body.param1,
         'localhost',
         (data) => res.write(data),
         () => res.end()
       );
     } catch (error) {
       // Error handling
     }
   });
   ```

3. **Verify deployment**: Ensure the route is handled inside `api/index.ts`. No
   additional files are needed because Vercel rewrites all `/api/*` requests to
   this Express app.

4. **Test parity**: Run `npm run test:api-parity` to ensure consistency