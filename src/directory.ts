import { DurableObject } from 'cloudflare:workers';
import { Env, RoomInfo } from './types';

// 전체 수강반(방) 목록과 멤버십을 들고 있는 단일 DO (idFromName('main')).
// GL Chat의 servers / server_members 테이블 역할.
export class Directory extends DurableObject<Env> {
  private sql: SqlStorage;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS rooms (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        invite_code TEXT UNIQUE NOT NULL,
        owner_id TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS members (
        room_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        joined_at INTEGER NOT NULL,
        PRIMARY KEY (room_id, user_id)
      );
      CREATE INDEX IF NOT EXISTS idx_members_user ON members(user_id);
    `);
  }

  private randomCode(len: number): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 0/O, 1/I 제외
    const bytes = crypto.getRandomValues(new Uint8Array(len));
    return Array.from(bytes, b => chars[b % chars.length]).join('');
  }

  listRooms(userId: string): RoomInfo[] {
    return this.sql.exec<Record<string, SqlStorageValue>>(
      `SELECT r.* FROM rooms r JOIN members m ON m.room_id = r.id
       WHERE m.user_id = ? ORDER BY m.joined_at ASC`, userId,
    ).toArray() as unknown as RoomInfo[];
  }

  getRoom(roomId: string): RoomInfo | null {
    const rows = this.sql.exec('SELECT * FROM rooms WHERE id = ?', roomId).toArray();
    return (rows[0] as unknown as RoomInfo) ?? null;
  }

  isMember(userId: string, roomId: string): boolean {
    return this.sql.exec('SELECT 1 FROM members WHERE room_id = ? AND user_id = ?', roomId, userId).toArray().length > 0;
  }

  createRoom(userId: string, name: string): RoomInfo | { error: string } {
    const count = this.sql.exec('SELECT COUNT(*) AS c FROM rooms WHERE owner_id = ?', userId).one().c as number;
    if (count >= 20) return { error: '수강반은 20개까지 만들 수 있습니다.' };

    const now = Date.now();
    let id = '', code = '';
    for (let i = 0; i < 10; i++) {
      id = this.randomCode(10);
      code = this.randomCode(6);
      const clash = this.sql.exec('SELECT 1 FROM rooms WHERE id = ? OR invite_code = ?', id, code).toArray();
      if (clash.length === 0) break;
    }
    this.sql.exec('INSERT INTO rooms (id, name, invite_code, owner_id, created_at) VALUES (?, ?, ?, ?, ?)', id, name, code, userId, now);
    this.sql.exec('INSERT INTO members (room_id, user_id, joined_at) VALUES (?, ?, ?)', id, userId, now);
    return this.getRoom(id)!;
  }

  joinRoom(userId: string, code: string): RoomInfo | null {
    const rows = this.sql.exec('SELECT * FROM rooms WHERE invite_code = ?', code.toUpperCase()).toArray();
    const room = rows[0] as unknown as RoomInfo | undefined;
    if (!room) return null;
    this.sql.exec('INSERT OR IGNORE INTO members (room_id, user_id, joined_at) VALUES (?, ?, ?)', room.id, userId, Date.now());
    return room;
  }

  leaveRoom(userId: string, roomId: string): void {
    this.sql.exec('DELETE FROM members WHERE room_id = ? AND user_id = ?', roomId, userId);
  }
}
