import path from 'path';
import fs from 'fs';
import sqlite3 from 'sqlite3';

const sqlite = sqlite3.verbose();

const DB_PATH = process.env.WORLDS_DB_PATH || path.join(process.cwd(), 'data', 'worlds.db');

const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new sqlite.Database(DB_PATH);

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS worlds (
      user_id TEXT NOT NULL,
      world_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      payload TEXT NOT NULL,
      page_count INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, world_id)
    )
  `);
});

export interface WorldSummary {
  worldId: string;
  name: string;
  description?: string | null;
  pageCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface WorldRecord extends WorldSummary {
  payload: any;
}

const mapSummary = (row: any): WorldSummary => ({
  worldId: row.world_id,
  name: row.name,
  description: row.description ?? null,
  pageCount: Number(row.page_count) || 0,
  createdAt: Number(row.created_at),
  updatedAt: Number(row.updated_at)
});

export function listWorlds(userId: string): Promise<WorldSummary[]> {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT world_id, name, description, page_count, created_at, updated_at
       FROM worlds
       WHERE user_id = ?
       ORDER BY updated_at DESC`,
      [userId],
      (err, rows: any[]) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(rows.map(mapSummary));
      }
    );
  });
}

export async function saveWorld(userId: string, worldData: any): Promise<WorldSummary> {
  if (!worldData || typeof worldData !== 'object') {
    throw new Error('Invalid world payload');
  }

  const worldId = worldData.id;
  if (!worldId || typeof worldId !== 'string') {
    throw new Error('World payload must include an id');
  }

  const now = Date.now();
  const payloadString = JSON.stringify(worldData);
  const pageCount = worldData.pages ? Object.keys(worldData.pages).length : 0;
  const description = typeof worldData.description === 'string' ? worldData.description : null;
  const name = typeof worldData.name === 'string' ? worldData.name : 'Untitled World';

  const insertSql = `
    INSERT INTO worlds (user_id, world_id, name, description, payload, page_count, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, world_id) DO UPDATE SET
      name = excluded.name,
      description = excluded.description,
      payload = excluded.payload,
      page_count = excluded.page_count,
      updated_at = excluded.updated_at
  `;

  await new Promise<void>((resolve, reject) => {
    db.run(
      insertSql,
      [userId, worldId, name, description, payloadString, pageCount, now, now],
      (err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      }
    );
  });

  return getWorldSummary(userId, worldId);
}

function getWorldSummary(userId: string, worldId: string): Promise<WorldSummary> {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT world_id, name, description, page_count, created_at, updated_at
       FROM worlds
       WHERE user_id = ? AND world_id = ?`,
      [userId, worldId],
      (err, row: any) => {
        if (err) {
          reject(err);
          return;
        }
        if (!row) {
          reject(new Error('World not found after save'));
          return;
        }
        resolve(mapSummary(row));
      }
    );
  });
}

export function getWorld(userId: string, worldId: string): Promise<WorldRecord | null> {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT world_id, name, description, page_count, created_at, updated_at, payload
       FROM worlds
       WHERE user_id = ? AND world_id = ?`,
      [userId, worldId],
      (err, row: any) => {
        if (err) {
          reject(err);
          return;
        }
        if (!row) {
          resolve(null);
          return;
        }

        let payload: any = null;
        try {
          payload = JSON.parse(row.payload);
        } catch (parseError) {
          console.error('Failed to parse world payload:', parseError);
        }

        resolve({
          ...mapSummary(row),
          payload
        });
      }
    );
  });
}

export function deleteWorld(userId: string, worldId: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    db.run(
      `DELETE FROM worlds WHERE user_id = ? AND world_id = ?`,
      [userId, worldId],
      function (err) {
        if (err) {
          reject(err);
          return;
        }
        resolve(this.changes > 0);
      }
    );
  });
}
