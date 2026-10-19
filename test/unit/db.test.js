import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../../server/db.js';

test('transactions commit, roll back, and nest with savepoints', () => {
  const db = openDb(':memory:');
  db.exec('CREATE TABLE t (v INTEGER)');
  const add = (v) => db.prepare('INSERT INTO t (v) VALUES (?)').run(v);
  const count = () => db.prepare('SELECT COUNT(*) AS n FROM t').get().n;

  db.transaction(() => { add(1); add(2); })();
  assert.equal(count(), 2);

  assert.throws(() => db.transaction(() => { add(3); throw new Error('boom'); })());
  assert.equal(count(), 2);

  // inner failure caught by the outer function: only the inner work is undone
  db.transaction(() => {
    add(4);
    try { db.transaction(() => { add(5); throw new Error('inner'); })(); } catch { /* handled */ }
    add(6);
  })();
  assert.deepEqual(db.prepare('SELECT v FROM t ORDER BY v').all().map((r) => r.v), [1, 2, 4, 6]);

  // inner failure that escapes undoes everything
  assert.throws(() => db.transaction(() => { add(7); db.transaction(() => { add(8); throw new Error('x'); })(); })());
  assert.equal(count(), 4);
  db.close();
});

test('a v0.1 database is migrated: waist moves to its own table, new columns appear', async () => {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const { DatabaseSync } = await import('node:sqlite');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'glidepath-db-'));
  const file = path.join(dir, 'old.db');
  const old = new DatabaseSync(file);
  old.exec(`
    CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, pass TEXT NOT NULL, is_demo INTEGER NOT NULL DEFAULT 0,
      lang TEXT NOT NULL DEFAULT 'zh', units TEXT NOT NULL DEFAULT 'metric', created_at INTEGER NOT NULL);
    CREATE TABLE weights (user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, date TEXT NOT NULL, kg REAL NOT NULL,
      waist_cm REAL, PRIMARY KEY (user_id, date));
    CREATE TABLE daily_logs (user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, date TEXT NOT NULL,
      steps INTEGER, sleep_hours REAL, PRIMARY KEY (user_id, date));
    INSERT INTO users (id, email, pass, created_at) VALUES (1, 'a@b.co', 'x', 0);
    INSERT INTO weights VALUES (1, '2026-10-01', 80, 90.5), (1, '2026-10-02', 79.8, NULL);
    INSERT INTO daily_logs VALUES (1, '2026-10-01', 8000, 7);
  `);
  old.close();

  for (let i = 0; i < 2; i++) { // running twice must be harmless
    const db = openDb(file);
    assert.deepEqual(db.prepare('SELECT date, cm FROM waists').all().map((r) => ({ ...r })), [{ date: '2026-10-01', cm: 90.5 }]);
    assert.ok(!db.prepare('PRAGMA table_info(weights)').all().some((c) => c.name === 'waist_cm'));
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM weights').get().n, 2);
    assert.equal(db.prepare('SELECT tracking FROM users').get().tracking, '{}');
    assert.deepEqual({ ...db.prepare('SELECT steps, sleep_quality, water_ml FROM daily_logs').get() }, { steps: 8000, sleep_quality: null, water_ml: null });
    db.close();
  }
  fs.rmSync(dir, { recursive: true, force: true });
});
