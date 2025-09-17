import { WorldbuildingRecord, createEmptyWorldbuildingRecord, validateWorldbuildingRecord } from './WorldbuildingHistory';
import { WikiPageData } from './WikiGenerator';

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
  pages: Record<string, WikiPageData>;
  currentPageId: string | null;
  pageHistory: string[];
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
    },
    pages: {},
    currentPageId: null,
    pageHistory: []
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
  const errors = validateWorldWithErrors(data);
  return errors.length === 0;
}

export function validateWorldWithErrors(data: any): string[] {
  const errors: string[] = [];

  if (!data || typeof data !== 'object') {
    errors.push('File must contain a valid JSON object');
    return errors;
  }

  // Check required top-level fields
  const requiredFields = ['id', 'name', 'createdAt', 'lastModified', 'worldbuilding', 'metadata', 'pages', 'currentPageId', 'pageHistory'];
  for (const field of requiredFields) {
    if (!(field in data)) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  // Check field types
  if ('id' in data && typeof data.id !== 'string') {
    errors.push('Field "id" must be a string');
  }
  if ('name' in data && typeof data.name !== 'string') {
    errors.push('Field "name" must be a string');
  }
  if ('createdAt' in data && typeof data.createdAt !== 'number') {
    errors.push('Field "createdAt" must be a number (timestamp)');
  }
  if ('lastModified' in data && typeof data.lastModified !== 'number') {
    errors.push('Field "lastModified" must be a number (timestamp)');
  }

  // Validate worldbuilding structure
  if ('worldbuilding' in data) {
    if (!validateWorldbuildingRecord(data.worldbuilding)) {
      errors.push('Invalid worldbuilding structure - must contain "mental", "material", and "social" categories with proper arrays');
    }
  }

  // Validate metadata
  if ('metadata' in data) {
    if (!data.metadata || typeof data.metadata !== 'object') {
      errors.push('Field "metadata" must be an object');
    } else {
      if (typeof data.metadata.version !== 'string') {
        errors.push('Metadata field "version" must be a string');
      }
      if (typeof data.metadata.entryCount !== 'number') {
        errors.push('Metadata field "entryCount" must be a number');
      }
    }
  }

  if ('pages' in data) {
    if (!data.pages || typeof data.pages !== 'object') {
      errors.push('Field "pages" must be an object with page entries');
    } else {
      for (const [pageId, pageData] of Object.entries<any>(data.pages)) {
        if (typeof pageId !== 'string') {
          errors.push('Each page key must be a string id');
          break;
        }
        if (!pageData || typeof pageData !== 'object') {
          errors.push(`Page "${pageId}" must be an object`);
          continue;
        }
        const requiredPageFields = ['id', 'title', 'content', 'categories', 'clickableTerms', 'relatedConcepts', 'basicFacts'];
        for (const field of requiredPageFields) {
          if (!(field in pageData)) {
            errors.push(`Page "${pageId}" missing required field: ${field}`);
          }
        }
      }
    }
  }

  if ('currentPageId' in data && data.currentPageId !== null && typeof data.currentPageId !== 'string') {
    errors.push('Field "currentPageId" must be a string or null');
  }

  if ('pageHistory' in data && !Array.isArray(data.pageHistory)) {
    errors.push('Field "pageHistory" must be an array');
  }

  return errors;
}

export function importWorld(file: File): Promise<World> {
  return new Promise((resolve, reject) => {
    // Validate file type
    if (!file.name.toLowerCase().endsWith('.json')) {
      reject(new Error('File must be a JSON file (.json extension)'));
      return;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      reject(new Error('File too large. Maximum size is 10MB.'));
      return;
    }

    const reader = new FileReader();

    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);

        const validationErrors = validateWorldWithErrors(data);
        if (validationErrors.length === 0) {
          resolve(data as World);
        } else {
          const errorMessage = 'Invalid world file structure:\n' + validationErrors.map(err => `• ${err}`).join('\n');
          reject(new Error(errorMessage));
        }
      } catch (error) {
        reject(new Error('Invalid JSON file. Please check that the file contains valid JSON data.'));
      }
    };

    reader.onerror = () => {
      reject(new Error('Failed to read the selected file. Please try again.'));
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
