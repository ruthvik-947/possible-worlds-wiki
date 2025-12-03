# PossibleWorldWikis

An AI-powered interactive worldbuilding wiki generator. Create and explore coherent fictional worlds through interconnected wiki pages.

## Features

- **Seed-based world generation** - Start with any concept and generate an initial wiki page
- **Interconnected exploration** - Click highlighted terms to generate new linked pages
- **Persistent worldbuilding context** - The AI maintains consistency across pages using structured categories (mental, material, social)
- **Real-time streaming** - Content generates progressively as you explore

## Quick Start

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local
# Add your OPENAI_API_KEY to .env.local

# Start the development servers
npm run dev:api    # Backend on localhost:3001
npm run dev        # Frontend on localhost:5173
```

## Tech Stack

- **Frontend**: React, TypeScript, Vite, TailwindCSS, Radix UI
- **Backend**: Express (dev) / Vercel Functions (prod)
- **AI**: OpenAI GPT-4o via Vercel AI SDK
- **Auth**: Clerk
- **Database**: Supabase

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start frontend dev server |
| `npm run dev:api` | Start Express backend |
| `npm run dev:vercel` | Start Vercel dev server |
| `npm run build` | Build for production |

## License

MIT
