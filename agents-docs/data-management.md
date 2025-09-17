# Data Management Overview

This document summarizes how the application stores, syncs, and exposes world data across the client and server.

## World Model Snapshot

Every world is represented with the `World` interface (see `components/WorldModel.ts`). A snapshot contains:

- core identity (`id`, `name`, optional `description`)
- timestamps (`createdAt`, `lastModified`)
- computed metadata (schema version plus `entryCount` derived from worldbuilding history)
- full worldbuilding record keyed by category
- all generated pages as a dictionary (`pages: Record<string, WikiPageData>`) including sections and any generated `imageUrl`
- UI state (`currentPageId`, `pageHistory`) so reloading reconstructs navigation context

This entire structure is the payload used for persistence and export.

## Client State & Auto-Save

`components/WikiInterface.tsx` keeps the authoritative client state in React. Notable behaviors:

- Generated pages are stored in a `Map<string, WikiPageData>` and mirrored into the current `World` snapshot.
- Page images update the corresponding page entry and are included in subsequent saves.
- Editing, creating, or importing pages updates `latestWorldRef` and a serialized copy used to detect changes.

Auto-save provides reliable server sync without manual interaction:

1. Any change to the world schedules a save with a 3-second debounce (`autoSaveTimeoutRef`).
2. If the world has zero pages, auto-save is idle.
3. When triggered, `performAutoSave`:
   - cancels pending timers
   - requests a fresh Clerk token
   - updates metadata (recomputes `entryCount`, bumps `lastModified`)
   - pushes the snapshot to the server via `saveWorldToServer`
4. Success records a `saved` status with timestamp; errors set an `error` status so the UI can alert and retry on the next change.

Because manual saving was removed, all persistence flows through this throttle to avoid hammering the API while still covering quick successive edits.

## Server Persistence

`api/index.ts` exposes Clerk-protected routes backed by SQLite (`api/utils/worlds.ts`):

- `GET /api/worlds` returns summaries (id, name, counts, timestamps) for the signed-in user.
- `GET /api/worlds/:worldId` fetches the full payload.
- `POST /api/worlds` upserts the provided snapshot (one row per user/world).
- `DELETE /api/worlds/:worldId` permanently removes a world.

Each row stores the entire JSON payload plus metadata columns for quick listing. Access is scoped with `(user_id, world_id)` as the primary key, so worlds are never shared across accounts.

## World Manager UI

`components/WorldManager.tsx` consumes `autoSaveInfo` to surface status in both welcome and inline toolbars.

- Status strings include "Saving…", "Saved Xs ago", or error messaging when auto-save fails.
- The manager refreshes server lists after a successful save and displays toasts if the server reports an error.
- Users can still export world attributes (without individual pages) and import JSON snapshots.
- Starting a new world prompts if the current world has pages; load/delete actions all require confirmation dialogs.

## Import & Export

- Import accepts validated JSON that matches the `World` schema and replaces the current snapshot, updating auto-save state.
- Export uses `exportWorld` to download the current world metadata for archival or manual transfer.

## Error Handling & Resilience

- Auto-save retries only when a new change occurs; repeated errors still surface through toast notifications.
- Loading a world resets pending saves and updates the `autoSaveInfo` timestamp so the UI reflects the latest state.
- All endpoints rely on Clerk middleware; a missing or invalid token short-circuits the save attempt before touching the database.

In summary, the app now maintains a single source of truth for worlds: client state feeds throttled auto-saves into a server-side SQLite store, and the World Manager orchestrates user interactions around those snapshots.
