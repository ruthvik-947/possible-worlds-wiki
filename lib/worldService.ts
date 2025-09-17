import { config } from './config';
import type { World } from '../components/WorldModel';
import type { WikiPageData } from '../components/WikiGenerator';
import { createEmptyWorldbuildingRecord } from '../components/WorldbuildingHistory';

export interface RemoteWorldSummary {
  worldId: string;
  name: string;
  description?: string | null;
  pageCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface RemoteWorldRecord extends RemoteWorldSummary {
  world: World;
}

function ensureWorldShape(world: any): World {
  if (!world || typeof world !== 'object') {
    throw new Error('Invalid world payload from server');
  }

  const pages: Record<string, WikiPageData> =
    world.pages && typeof world.pages === 'object' ? world.pages : {};

  return {
    id: world.id,
    name: world.name ?? 'Untitled World',
    description: typeof world.description === 'string' ? world.description : '',
    createdAt: typeof world.createdAt === 'number' ? world.createdAt : Date.now(),
    lastModified: typeof world.lastModified === 'number' ? world.lastModified : Date.now(),
    worldbuilding: world.worldbuilding ?? createEmptyWorldbuildingRecord(),
    metadata: world.metadata ?? { version: '1.0.0', entryCount: 0 },
    pages,
    currentPageId: world.currentPageId ?? null,
    pageHistory: Array.isArray(world.pageHistory) ? world.pageHistory : []
  };
}

export async function fetchWorldSummaries(authToken: string): Promise<RemoteWorldSummary[]> {
  const response = await fetch(config.endpoints.worlds, {
    headers: {
      Authorization: `Bearer ${authToken}`
    }
  });

  if (!response.ok) {
    throw new Error('Failed to fetch worlds');
  }

  return response.json();
}

export async function fetchWorldById(authToken: string, worldId: string): Promise<RemoteWorldRecord> {
  const response = await fetch(`${config.endpoints.worlds}/${worldId}`, {
    headers: {
      Authorization: `Bearer ${authToken}`
    }
  });

  if (response.status === 404) {
    throw new Error('World not found');
  }

  if (!response.ok) {
    throw new Error('Failed to fetch world');
  }

  const data = await response.json();
  return {
    worldId: data.worldId,
    name: data.name,
    description: data.description,
    pageCount: data.pageCount,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
    world: ensureWorldShape(data.payload)
  };
}

export async function saveWorldToServer(authToken: string, world: World): Promise<RemoteWorldSummary> {
  const response = await fetch(config.endpoints.worlds, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`
    },
    body: JSON.stringify({ world })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to save world');
  }

  return response.json();
}

export async function deleteWorldFromServer(authToken: string, worldId: string): Promise<void> {
  const response = await fetch(`${config.endpoints.worlds}/${worldId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${authToken}`
    }
  });

  if (response.status === 404) {
    throw new Error('World not found');
  }

  if (!response.ok) {
    throw new Error('Failed to delete world');
  }
}
