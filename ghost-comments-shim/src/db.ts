import mysql from 'mysql2/promise';
import Database from 'better-sqlite3';
import { Config } from './config';

export interface DbConnection {
  execute(query: string, params: any[]): Promise<void>;
  query(query: string, params?: any[]): Promise<any[]>;
  close(): Promise<void>;
}

class MySqlConnection implements DbConnection {
  private pool: mysql.Pool;

  constructor(connectionString: string) {
    this.pool = mysql.createPool(connectionString);
  }

  async execute(query: string, params: any[]): Promise<void> {
    await this.pool.execute(query, params);
  }

  async query(query: string, params: any[] = []): Promise<any[]> {
    const [rows] = await this.pool.execute(query, params);
    return rows as any[];
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

class SqliteConnection implements DbConnection {
  private db: Database.Database;

  constructor(path: string) {
    this.db = new Database(path);
  }

  async execute(query: string, params: any[]): Promise<void> {
    // SQLite uses ? for placeholders, which matches our usage
    this.db.prepare(query).run(params);
  }

  async query(query: string, params: any[] = []): Promise<any[]> {
    return this.db.prepare(query).all(...params);
  }

  async close(): Promise<void> {
    this.db.close();
  }
}

export function createDbConnection(config: Config): DbConnection {
  if (config.ghostDbType === 'mysql') {
    return new MySqlConnection(config.ghostDbConnection);
  } else {
    return new SqliteConnection(config.ghostDbConnection);
  }
}

/**
 * Insert a comment into the Ghost database
 */
export async function insertComment(
  db: DbConnection,
  params: {
    id: string;
    postId: string;
    memberId: string;
    parentId: string | null;
    html: string;
    createdAt: string;
  }
): Promise<void> {
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

  await db.execute(
    `INSERT INTO comments (id, post_id, member_id, parent_id, status, html, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'published', ?, ?, ?)`,
    [
      params.id,
      params.postId,
      params.memberId,
      params.parentId,
      params.html,
      params.createdAt,
      now,
    ]
  );
}
