import LZString from 'lz-string';
import { WikiPageData } from '../components/WikiGenerator';
import { World, createNewWorld } from '../components/WorldModel';

// Current schema version for migration compatibility
const SCHEMA_VERSION = 1;

export interface WikiState {
  schemaVersion: number;
  pages: [string, WikiPageData][];
  currentPageId: string | null;
  pageHistory: string[];
  currentWorld: World;
  lastModified: number;
  pageImages?: [string, string][]; // Optional for backward compatibility
}

export interface SavedWorld {
  id: string;
  name: string;
  lastModified: number;
  pageCount: number;
  preview: string; // First page title or summary
}

// Storage keys
const CURRENT_WORLD_KEY = 'pww_current_world';
const SAVED_WORLDS_KEY = 'pww_saved_worlds';
const AUTO_SAVE_KEY = 'pww_auto_save';

// Storage size limits (conservative estimates)
const MAX_STORAGE_SIZE = 4 * 1024 * 1024; // 4MB
const MAX_WORLDS = 20;

class WorldPersistence {
  private compressionEnabled = true;

  // Check if localStorage is available and working
  private isStorageAvailable(): boolean {
    try {
      const test = '__storage_test__';
      localStorage.setItem(test, test);
      localStorage.removeItem(test);
      return true;
    } catch {
      return false;
    }
  }

  // Estimate storage usage
  private getStorageUsage(): number {
    if (!this.isStorageAvailable()) return 0;

    let total = 0;
    for (let key in localStorage) {
      if (key.startsWith('pww_')) {
        total += localStorage.getItem(key)?.length || 0;
      }
    }
    return total;
  }

  // Serialize state with compression
  private serialize(state: WikiState): string {
    const json = JSON.stringify(state);
    return this.compressionEnabled ? LZString.compress(json) || json : json;
  }

  // Deserialize state with decompression
  private deserialize(data: string): WikiState | null {
    try {
      let json: string;

      // Try decompression first
      if (this.compressionEnabled) {
        const decompressed = LZString.decompress(data);
        json = decompressed || data; // Fallback to raw data
      } else {
        json = data;
      }

      const parsed = JSON.parse(json);

      // Validate schema version and migrate if needed
      return this.migrateState(parsed);
    } catch (error) {
      console.error('Failed to deserialize state:', error);
      return null;
    }
  }

  // Handle schema migrations
  private migrateState(state: any): WikiState | null {
    try {
      // If no schema version, assume version 1
      if (!state.schemaVersion) {
        state.schemaVersion = 1;
      }

      // Validate required fields
      if (!state.pages || !Array.isArray(state.pages)) {
        return null;
      }

      // Ensure all required fields exist
      return {
        schemaVersion: state.schemaVersion,
        pages: state.pages,
        currentPageId: state.currentPageId || null,
        pageHistory: state.pageHistory || [],
        currentWorld: state.currentWorld || createNewWorld(),
        lastModified: state.lastModified || Date.now(),
        pageImages: state.pageImages || undefined
      };
    } catch (error) {
      console.error('State migration failed:', error);
      return null;
    }
  }

  // Save current world state
  saveCurrentWorld(
    pages: Map<string, WikiPageData>,
    currentPageId: string | null,
    pageHistory: string[],
    currentWorld: World,
    pageImages?: Map<string, string>
  ): boolean {
    if (!this.isStorageAvailable()) {
      console.warn('localStorage not available');
      return false;
    }

    try {
      const state: WikiState = {
        schemaVersion: SCHEMA_VERSION,
        pages: Array.from(pages.entries()),
        currentPageId,
        pageHistory,
        currentWorld,
        lastModified: Date.now(),
        pageImages: pageImages ? Array.from(pageImages.entries()) : undefined
      };

      const serialized = this.serialize(state);

      // Check if this would exceed storage limits
      if (serialized.length > MAX_STORAGE_SIZE / 2) {
        console.warn('World too large for localStorage');
        return false;
      }

      localStorage.setItem(CURRENT_WORLD_KEY, serialized);
      localStorage.setItem(AUTO_SAVE_KEY, Date.now().toString());

      return true;
    } catch (error) {
      console.error('Failed to save world:', error);

      // If storage is full, try cleanup and retry once
      if (error instanceof Error && error.name === 'QuotaExceededError') {
        this.cleanupOldWorlds();
        try {
          const state: WikiState = {
            schemaVersion: SCHEMA_VERSION,
            pages: Array.from(pages.entries()),
            currentPageId,
            pageHistory,
            currentWorld,
            lastModified: Date.now(),
            pageImages: pageImages ? Array.from(pageImages.entries()) : undefined
          };
          localStorage.setItem(CURRENT_WORLD_KEY, this.serialize(state));
          return true;
        } catch {
          return false;
        }
      }

      return false;
    }
  }

  // Load current world state
  loadCurrentWorld(): WikiState | null {
    if (!this.isStorageAvailable()) return null;

    try {
      const saved = localStorage.getItem(CURRENT_WORLD_KEY);
      if (!saved) return null;

      const state = this.deserialize(saved);
      if (!state) return null;

      // Validate that the state has valid data
      if (state.pages.length === 0) return null;

      return state;
    } catch (error) {
      console.error('Failed to load current world:', error);
      return null;
    }
  }

  // Save a named world (overwrites if name exists)
  saveNamedWorld(name: string, pages: Map<string, WikiPageData>, currentWorld: World, pageImages?: Map<string, string>): boolean {
    if (!this.isStorageAvailable() || !name.trim()) return false;

    try {
      const trimmedName = name.trim();
      const savedWorlds = this.getSavedWorlds();

      // Check if a world with this name already exists
      const existingWorld = savedWorlds.find(world => world.name === trimmedName);

      let worldId: string;
      if (existingWorld) {
        // Reuse existing world ID to overwrite
        worldId = existingWorld.id;
      } else {
        // Create new world ID
        worldId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      }

      const state: WikiState = {
        schemaVersion: SCHEMA_VERSION,
        pages: Array.from(pages.entries()),
        currentPageId: pages.size > 0 ? Array.from(pages.keys())[0] : null,
        pageHistory: [],
        currentWorld: { ...currentWorld, name: trimmedName },
        lastModified: Date.now(),
        pageImages: pageImages ? Array.from(pageImages.entries()) : undefined
      };

      // Save the world data
      localStorage.setItem(`pww_world_${worldId}`, this.serialize(state));

      // Update saved worlds index
      const updatedWorld: SavedWorld = {
        id: worldId,
        name: trimmedName,
        lastModified: Date.now(),
        pageCount: pages.size,
        preview: pages.size > 0 ? Array.from(pages.values())[0].title : 'Empty world'
      };

      if (existingWorld) {
        // Update existing world entry
        const index = savedWorlds.findIndex(world => world.id === worldId);
        savedWorlds[index] = updatedWorld;
      } else {
        // Add new world entry
        savedWorlds.push(updatedWorld);
      }

      // Keep only the most recent worlds
      savedWorlds.sort((a, b) => b.lastModified - a.lastModified);
      if (savedWorlds.length > MAX_WORLDS) {
        const removed = savedWorlds.splice(MAX_WORLDS);
        // Clean up removed worlds
        removed.forEach(world => {
          localStorage.removeItem(`pww_world_${world.id}`);
        });
      }

      localStorage.setItem(SAVED_WORLDS_KEY, JSON.stringify(savedWorlds));
      return true;
    } catch (error) {
      console.error('Failed to save named world:', error);
      return false;
    }
  }

  // Load a named world
  loadNamedWorld(worldId: string): WikiState | null {
    if (!this.isStorageAvailable()) return null;

    try {
      const saved = localStorage.getItem(`pww_world_${worldId}`);
      if (!saved) return null;

      return this.deserialize(saved);
    } catch (error) {
      console.error('Failed to load named world:', error);
      return null;
    }
  }

  // Get list of saved worlds
  getSavedWorlds(): SavedWorld[] {
    if (!this.isStorageAvailable()) return [];

    try {
      const saved = localStorage.getItem(SAVED_WORLDS_KEY);
      if (!saved) return [];

      const worlds = JSON.parse(saved);
      return Array.isArray(worlds) ? worlds : [];
    } catch (error) {
      console.error('Failed to load saved worlds list:', error);
      return [];
    }
  }

  // Delete a saved world
  deleteWorld(worldId: string): boolean {
    if (!this.isStorageAvailable()) return false;

    try {
      localStorage.removeItem(`pww_world_${worldId}`);

      const savedWorlds = this.getSavedWorlds();
      const filtered = savedWorlds.filter(world => world.id !== worldId);
      localStorage.setItem(SAVED_WORLDS_KEY, JSON.stringify(filtered));

      return true;
    } catch (error) {
      console.error('Failed to delete world:', error);
      return false;
    }
  }

  // Clean up old worlds and data
  cleanupOldWorlds(): void {
    if (!this.isStorageAvailable()) return;

    try {
      const savedWorlds = this.getSavedWorlds();

      // Sort by last modified and keep only recent ones
      savedWorlds.sort((a, b) => b.lastModified - a.lastModified);
      const toKeep = savedWorlds.slice(0, MAX_WORLDS);
      const toRemove = savedWorlds.slice(MAX_WORLDS);

      // Remove old world data
      toRemove.forEach(world => {
        localStorage.removeItem(`pww_world_${world.id}`);
      });

      // Update the index
      localStorage.setItem(SAVED_WORLDS_KEY, JSON.stringify(toKeep));

      // Also clean up any orphaned world data
      for (let key in localStorage) {
        if (key.startsWith('pww_world_') && !toKeep.some(world => key === `pww_world_${world.id}`)) {
          localStorage.removeItem(key);
        }
      }
    } catch (error) {
      console.error('Cleanup failed:', error);
    }
  }

  // Get storage statistics
  getStorageStats(): {
    used: number;
    available: number;
    worldCount: number;
    hasAutoSave: boolean;
  } {
    const used = this.getStorageUsage();
    const worldCount = this.getSavedWorlds().length;
    const hasAutoSave = !!localStorage.getItem(CURRENT_WORLD_KEY);

    return {
      used,
      available: MAX_STORAGE_SIZE - used,
      worldCount,
      hasAutoSave
    };
  }

  // Clear all data
  clearAll(): void {
    if (!this.isStorageAvailable()) return;

    const keys = Object.keys(localStorage).filter(key => key.startsWith('pww_'));
    keys.forEach(key => localStorage.removeItem(key));
  }
}

// Export singleton instance
export const worldPersistence = new WorldPersistence();