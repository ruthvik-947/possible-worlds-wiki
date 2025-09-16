import { WorldbuildingRecord, createEmptyWorldbuildingRecord, validateWorldbuildingRecord } from './WorldbuildingHistory';

export interface World {
  id: string;
  name: string;
  description?: string;
  createdAt: number;
  lastModified: number;
  worldbuilding: WorldbuildingRecord;
  metadata: {
    version: string;
    entryCount: number;
  };
}

export function createNewWorld(name?: string): World {
  return {
    id: generateWorldId(),
    name: name || 'Untitled World',
    description: '',
    createdAt: Date.now(),
    lastModified: Date.now(),
    worldbuilding: createEmptyWorldbuildingRecord(),
    metadata: {
      version: '1.0.0',
      entryCount: 0
    }
  };
}

export function generateWorldId(): string {
  return `world-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

export function calculateEntryCount(worldbuilding: WorldbuildingRecord): number {
  let count = 0;
  Object.values(worldbuilding).forEach(group => {
    Object.values(group).forEach(entries => {
      count += (entries as string[]).length;
    });
  });
  return count;
}

export function updateWorldMetadata(world: World): World {
  return {
    ...world,
    lastModified: Date.now(),
    metadata: {
      ...world.metadata,
      entryCount: calculateEntryCount(world.worldbuilding)
    }
  };
}

export function exportWorld(world: World, filename?: string): void {
  const dataStr = JSON.stringify(world, null, 2);
  const dataBlob = new Blob([dataStr], { type: 'application/json' });

  const link = document.createElement('a');
  link.href = URL.createObjectURL(dataBlob);

  const worldName = world.name.toLowerCase().replace(/\s+/g, '-');
  const date = new Date().toISOString().split('T')[0];
  link.download = filename || `world-${worldName}-${date}.json`;

  link.click();
  URL.revokeObjectURL(link.href);
}

export function validateWorld(data: any): data is World {
  if (!data || typeof data !== 'object') return false;

  const requiredFields = ['id', 'name', 'createdAt', 'lastModified', 'worldbuilding', 'metadata'];
  for (const field of requiredFields) {
    if (!(field in data)) return false;
  }

  if (typeof data.id !== 'string' ||
      typeof data.name !== 'string' ||
      typeof data.createdAt !== 'number' ||
      typeof data.lastModified !== 'number') {
    return false;
  }

  if (!validateWorldbuildingRecord(data.worldbuilding)) {
    return false;
  }

  if (!data.metadata ||
      typeof data.metadata.version !== 'string' ||
      typeof data.metadata.entryCount !== 'number') {
    return false;
  }

  return true;
}

export function importWorld(file: File): Promise<World> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);

        if (validateWorld(data)) {
          resolve(data as World);
        } else {
          reject(new Error('Invalid world format'));
        }
      } catch (error) {
        reject(new Error('Failed to parse JSON file'));
      }
    };

    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };

    reader.readAsText(file);
  });
}

export function getWorldStats(world: World) {
  const stats = {
    totalEntries: world.metadata.entryCount,
    categoryCounts: {
      mental: {} as Record<string, number>,
      material: {} as Record<string, number>,
      social: {} as Record<string, number>
    }
  };

  Object.entries(world.worldbuilding).forEach(([group, categories]) => {
    Object.entries(categories).forEach(([category, entries]) => {
      stats.categoryCounts[group as keyof typeof stats.categoryCounts][category] = (entries as string[]).length;
    });
  });

  return stats;
}