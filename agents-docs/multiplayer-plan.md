# PossibleWorldWiki Multiplayer Feature - Technical Implementation Plan

## Executive Summary

This document outlines the technical plan for adding world metadata sharing to PossibleWorldWiki. Users will be able to publish their world's metadata (name, description, and worldbuilding attributes), discover worlds created by others via a feed, and load these world contexts to generate their own pages locally. **Pages remain private to each user** - only the world's foundational context is shared.

## Table of Contents

1. [Current State Analysis](#current-state-analysis)
2. [Multiplayer Requirements](#multiplayer-requirements)
3. [Proposed Architecture](#proposed-architecture)
4. [Database Design](#database-design)
5. [API Design](#api-design)
6. [Frontend Components](#frontend-components)
7. [Implementation Phases](#implementation-phases)
8. [Security & Privacy](#security--privacy)
9. [Performance Considerations](#performance-considerations)

## Current State Analysis

### Existing Architecture
- **Frontend**: React + TypeScript with Vite
- **Backend**: Vercel serverless functions with Express dev server
- **Storage**: Browser localStorage with LZ-String compression
- **Data Model**:
  - `World`: Contains worldbuilding attributes, metadata, name, description
  - `WorldbuildingRecord`: 3 categories (mental, material, social) with subcategories
  - `WikiPageData`: Individual wiki pages with content, links, categories
- **Key Features**:
  - Real-time streaming page generation
  - World import/export (JSON)
  - Local world management with save/load/delete

### Current Limitations
- Data stored only in browser (localStorage)
- No sharing capabilities beyond manual JSON export/import
- Single-user experience
- 4MB storage limit per browser
- No discovery mechanism for other worlds

## Multiplayer Requirements

### Core Features

#### 1. World Publishing
- Users can publish world metadata:
  - World name and description
  - Worldbuilding attributes (mental, material, social categories)
  - Creation timestamp
  - Anonymous author identifier

#### 2. World Discovery Feed
- Feed on welcome screen showing:
  - Recently published worlds
  - Search by name or description
  - Preview of worldbuilding attributes
  - Load count (how many times loaded)

#### 3. World Loading & Local Generation
- Load any published world's metadata
- Generate pages locally using the world context
- Pages remain in user's localStorage only
- Each user builds their own version of the world

## Proposed Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                         Frontend                             │
│  React + TypeScript + Vite + TailwindCSS                    │
│  ┌─────────────┐ ┌──────────────┐ ┌──────────────┐        │
│  │ World Feed  │ │ World Editor │ │ Multiplayer  │        │
│  │  Component  │ │   Component  │ │   Overlay    │        │
│  └─────────────┘ └──────────────┘ └──────────────┘        │
└────────────────────────┬────────────────────────────────────┘
                         │
                    HTTP/WebSocket
                         │
┌────────────────────────┴────────────────────────────────────┐
│                    API Layer (Vercel)                        │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐       │
│  │  REST API    │ │   Polling    │ │   OpenAI     │       │
│  │  Handlers    │ │   Endpoints  │ │  Integration │       │
│  └──────────────┘ └──────────────┘ └──────────────┘       │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────┴────────────────────────────────────┐
│                    Data Layer                                │
│  ┌──────────────────────────────────────────────┐          │
│  │           PostgreSQL (Supabase)               │          │
│  │  ┌────────┐ ┌──────────┐                    │          │
│  │  │ Worlds │ │ Sessions │                    │          │
│  │  └────────┘ └──────────┘                    │          │
│  └──────────────────────────────────────────────┘          │
│  ┌──────────────────────────────────────────────┐          │
│  │      In-Memory Cache (Node.js)               │          │
│  └──────────────────────────────────────────────┘          │
└──────────────────────────────────────────────────────────────┘
```

### Technology Stack

#### Backend Infrastructure
- **Database**: PostgreSQL via Supabase
  - Managed PostgreSQL for world metadata storage
  - Simple anonymous session tracking
  - Row-level security
  - Automatic backups

- **Caching**: Node.js in-memory cache
  - World metadata caching
  - Feed results caching
  - Rate limiting

- **Storage Model**:
  - World metadata in cloud database
  - Pages remain in browser localStorage
  - No page synchronization between users

#### API Architecture
- Extend existing shared handlers pattern
- RESTful endpoints for world metadata operations
- Simple feed endpoints
- Maintain backward compatibility with single-player mode
- Pages continue to use existing local generation

## Database Design

### PostgreSQL Schema (Simplified)

```sql
-- Sessions table (anonymous users only)
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address_hash VARCHAR(64), -- Hashed for privacy
  created_at TIMESTAMP DEFAULT NOW(),
  last_active TIMESTAMP DEFAULT NOW()
);

-- Worlds table (metadata only)
CREATE TABLE worlds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  worldbuilding JSONB NOT NULL, -- WorldbuildingRecord
  author_session_id UUID REFERENCES sessions(id),
  created_at TIMESTAMP DEFAULT NOW(),
  published_at TIMESTAMP DEFAULT NOW(),
  load_count INTEGER DEFAULT 0,
  featured BOOLEAN DEFAULT FALSE
);

-- Note: No pages table - pages remain in localStorage only

-- World loads table (tracking who loads worlds)
CREATE TABLE world_loads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id UUID REFERENCES worlds(id) ON DELETE CASCADE,
  session_id UUID REFERENCES sessions(id),
  loaded_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_worlds_visibility ON worlds(visibility) WHERE published_at IS NOT NULL;
CREATE INDEX idx_worlds_published ON worlds(published_at DESC);
CREATE INDEX idx_world_activity_recent ON world_activity(created_at DESC);
CREATE INDEX idx_pages_world ON pages(world_id);
CREATE INDEX idx_collaborators_world ON world_collaborators(world_id);
```

### Cache Structure (In-Memory)

```javascript
// Simple in-memory cache
const cache = {
  // World metadata cache
  worlds: new Map(),  // worldId -> { data, expiry }

  // Recent worlds feed
  recentFeed: { data: [], expiry: null },

  // Rate limiting
  rateLimits: new Map(),  // sessionId -> { count, resetTime }
};
```

## API Design

### REST Endpoints

#### World Management

```typescript
// Publish world metadata
POST /api/worlds/publish
Body: {
  name: string,
  description: string,
  worldbuilding: WorldbuildingRecord
}
Response: {
  worldId: string,
  publishedAt: string
}

// Get world metadata
GET /api/worlds/:worldId
Response: {
  id: string,
  name: string,
  description: string,
  worldbuilding: WorldbuildingRecord,
  loadCount: number,
  createdAt: string
}

// Load world (increment counter)
POST /api/worlds/:worldId/load
Response: {
  success: boolean
}

// Get world feed
GET /api/worlds/feed
Query: {
  type: 'recent' | 'popular',
  limit?: number,
  offset?: number,
  search?: string
}
Response: {
  worlds: WorldMetadata[],
  hasMore: boolean,
  total: number
}

// Search worlds
GET /api/worlds/search
Query: {
  q: string,
  limit?: number
}
Response: {
  worlds: WorldMetadata[]
}
```

#### Page Management

```typescript
// Note: Pages are NOT stored server-side
// Pages continue to use existing local generation endpoints:
// - POST /api/generate (for initial page)
// - POST /api/generate-section (for expanding sections)
// The worldbuilding context is passed from localStorage
```

#### Session Management

```typescript
// Create anonymous session
POST /api/sessions
Response: {
  sessionId: string,
  expiresAt: string
}

// Get session info
GET /api/sessions/:sessionId
Response: {
  sessionId: string,
  worldsPublished: number
}
```

### Feed Refresh

```typescript
// Simple feed refresh - no polling needed
// Users manually refresh or app refreshes on navigation
GET /api/worlds/feed
// Returns latest worlds, no real-time updates
```

## Frontend Components

### New Components

#### 1. WorldFeed Component
```typescript
interface WorldFeedProps {
  type: 'recent' | 'popular';
  onWorldLoad: (worldMetadata: WorldMetadata) => void;
}

// Features:
- List of published worlds
- Manual refresh button
- Preview cards showing name, description, worldbuilding summary
- Search functionality
- Load count display
```

#### 2. PublishWorldDialog Component
```typescript
interface PublishWorldDialogProps {
  world: World;
  onPublish: () => void;
}

// Features:
- Confirm world name/description
- Preview worldbuilding attributes
- Publish button
- Success confirmation
```

#### 3. WorldDiscovery Component
```typescript
interface WorldDiscoveryProps {
  onLoadWorld: (worldMetadata: WorldMetadata) => void;
}

// Features:
- Search worlds by name/description
- Sort by date/popularity
- Preview worldbuilding attributes
- Load world button
```

### Modified Components

#### WikiInterface.tsx Updates
```typescript
// Add world sharing state
const [loadedFromCloud, setLoadedFromCloud] = useState(false);
const [publishedWorldId, setPublishedWorldId] = useState<string | null>(null);
const [sessionId, setSessionId] = useState<string>('');

// Add world sharing methods
const publishWorldMetadata = async () => {
  // Publish only world metadata (name, description, worldbuilding)
  // Pages remain in localStorage
};

const loadWorldMetadata = async (worldId: string) => {
  // Load world metadata from server
  // Continue generating pages locally
};
```

#### WorldManager.tsx Updates
```typescript
// Add publish option
interface WorldManagerProps {
  // ... existing props
  onPublishWorld?: () => Promise<void>;
  isPublished?: boolean;
}

// Add publish button for world metadata
// Show published status
// Note: Pages are never synced, only world metadata
```

## Implementation Phases

### Phase 1: Backend Infrastructure (Week 1)
- [ ] Set up Supabase project
- [ ] Create simplified database schema (worlds + sessions only)
- [ ] Set up in-memory cache
- [ ] Create anonymous session management
- [ ] Implement world metadata CRUD operations
- [ ] Add API endpoints with shared handlers

### Phase 2: World Publishing (Week 1-2)
- [ ] Create publish metadata endpoint
- [ ] Add world feed endpoint
- [ ] Implement world search API
- [ ] Create PublishWorldDialog component
- [ ] Add publish flow to WorldManager
- [ ] Test metadata publishing

### Phase 3: World Discovery (Week 2)
- [ ] Create WorldFeed component
- [ ] Add search functionality
- [ ] Create world preview cards
- [ ] Integrate with welcome screen
- [ ] Add load tracking

### Phase 4: Integration & Polish (Week 3)
- [ ] Connect world loading to page generation
- [ ] Ensure localStorage continues for pages
- [ ] Add load tracking statistics
- [ ] Performance optimization
- [ ] User experience improvements
- [ ] Testing and bug fixes

## Security & Privacy

### Authentication Strategy
1. **Anonymous Only**
   - Session-based identification
   - No personal data collected
   - IP addresses hashed for privacy
   - Automatic session creation

### Data Protection
1. **API Security**
   - Rate limiting per session
   - Input validation and sanitization
   - SQL injection prevention
   - XSS protection

2. **Data Minimization**
   - Only world metadata stored server-side
   - Pages remain in user's browser
   - No personal information required
   - Minimal session tracking

3. **Privacy Considerations**
   - IP addresses hashed, never stored raw
   - No user tracking or analytics
   - Clear data usage policy
   - Right to deletion

### Content Moderation
1. **Simple Moderation**
   - OpenAI moderation API for published worlds
   - Rate limiting to prevent spam
   - Report inappropriate content option

## Performance Considerations

### Optimization Strategies

1. **Database**
   - Indexed queries
   - Pagination for large datasets
   - Materialized views for stats
   - Connection pooling

2. **Caching**
   - In-memory cache for hot data
   - CDN for static assets
   - Browser caching headers
   - Incremental Static Regeneration

3. **Polling Optimization**
   - Smart polling intervals
   - Batch requests
   - Client-side deduplication
   - Conditional requests (If-Modified-Since)

### Scalability Targets
- Support 10,000+ concurrent users
- Handle 1,000+ worlds
- Sub-second page loads
- 99.9% uptime

### Scaling Considerations
- Minimal data storage (metadata only, no pages)
- Free tiers may support hundreds of worlds
- Simple caching reduces database queries
- Much lower costs than full multiplayer


## Conclusion

This plan adds world metadata sharing to PossibleWorldWiki while maintaining the privacy of user-generated pages. Users can publish and discover world contexts (name, description, worldbuilding attributes) and then generate their own unique pages locally. This simplified approach:

- **Reduces complexity**: No real-time sync, no version control, no page sharing
- **Preserves privacy**: Pages remain local to each user
- **Lowers costs**: Only metadata stored server-side
- **Maintains compatibility**: Existing localStorage system unchanged
- **Enables creativity**: Users can explore others' world concepts while building their own unique versions

The implementation is straightforward, focusing on sharing the creative foundation (world context) while letting each user build their own interpretation through locally-generated pages.

### Next Steps
1. Review and approve plan
2. Set up development environment
3. Begin Phase 1 implementation
4. Create detailed API documentation
5. Set up monitoring and analytics

---

*Document Version: 1.0*
*Last Updated: 2025-09-16*
*Author: Claude (Anthropic)*