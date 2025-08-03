# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

**Frontend Development:**
- `npm run dev` - Start Vite development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build locally
- `npm run lint` - Run ESLint

**Backend Development:**
- `npm run dev:api` - Start Express API server on localhost:3001 (development only)

## Architecture Overview

This is a **PossibleWorldWiki** application - an AI-powered interactive worldbuilding wiki generator. The architecture consists of:

### Frontend (Vite + React + TypeScript)
- **Main Interface**: `WikiInterface.tsx` - Central component managing wiki pages, navigation, and worldbuilding state
- **Page Rendering**: `WikiPage.tsx` - Displays individual wiki pages with clickable terms and expandable sections
- **Content Generation**: `WikiGenerator.ts` - Handles API calls to generate wiki content
- **Worldbuilding System**: `WorldbuildingHistory.ts` - Manages persistent worldbuilding context across three categories (mental, material, social)
- **API Configuration**: `lib/config.ts` - Environment-aware API endpoint configuration

### Backend (Vercel Serverless Functions)
- **API Routes** in `/api`:
  - `config.ts` - Returns server configuration (API key mode)
  - `generate.ts` - Main wiki page generation using OpenAI GPT-4o
  - `generate-section.ts` - Generates additional content sections
  - `store-key.ts` - Handles temporary user API key storage
- **Shared Logic**: `api/utils/shared.ts` - Common functions and worldbuilding categories

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

### UI System
- **Styling**: TailwindCSS with custom "Glass Minimalism" design system
- **Components**: Radix UI primitives with custom styling in `components/ui/`
- **Theme**: Dark/light mode toggle with localStorage persistence

The application generates coherent fictional worlds by maintaining context across page generations and using structured worldbuilding categories to guide AI content creation.