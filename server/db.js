// Uses Node's built-in SQLite (node:sqlite, Node 22.13+), so there is no native
// module to compile on install. Node 22 prints an "experimental" warning once at start.
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  pass TEXT NOT NULL,
  is_demo INTEGER NOT NULL DEFAULT 0,
  lang TEXT NOT NULL DEFAULT 'zh',
  units TEXT NOT NULL DEFAULT 'metric',
  tracking TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS profiles (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  data TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS plans (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  data TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS food_entries (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  meal TEXT NOT NULL,
  name TEXT NOT NULL,
  food_id TEXT,
  grams REAL NOT NULL,
  cooking TEXT NOT NULL DEFAULT 'plain',
  per100 TEXT,
  plain INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL,
  kcal INTEGER NOT NULL,
  kcal_low INTEGER NOT NULL,
  kcal_high INTEGER NOT NULL,
  protein REAL NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS food_user_date ON food_entries(user_id, date);
CREATE TABLE IF NOT EXISTS weights (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  kg REAL NOT NULL,
  PRIMARY KEY (user_id, date)
);
CREATE TABLE IF NOT EXISTS waists (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  cm REAL NOT NULL,
  PRIMARY KEY (user_id, date)
);
CREATE TABLE IF NOT EXISTS periods (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  start_date TEXT NOT NULL,
  end_date TEXT,
  PRIMARY KEY (user_id, start_date)
);
CREATE TABLE IF NOT EXISTS daily_logs (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  steps INTEGER,
  sleep_hours REAL,
  sleep_quality INTEGER,
  water_ml INTEGER,
  PRIMARY KEY (user_id, date)
);
CREATE TABLE IF NOT EXISTS workouts (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  day_key TEXT,
  sets TEXT NOT NULL,
  changes TEXT NOT NULL,
  state_before TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (user_id, date)
);
CREATE TABLE IF NOT EXISTS exercise_state (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slot TEXT NOT NULL,
  data TEXT NOT NULL,
  PRIMARY KEY (user_id, slot)
);
CREATE TABLE IF NOT EXISTS ai_usage (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);
`;

/**
 * db.transaction(fn) returns a function that runs fn inside a transaction.
 * Nested calls use savepoints, so a helper that opens its own transaction can be
 * called from inside another one.
 */
function addTransactions(db) {
  let depth = 0;
  db.transaction = (fn) => (...args) => {
    const sp = `sp${depth}`;
    db.exec(depth ? `SAVEPOINT ${sp}` : 'BEGIN');
    depth++;
    try {
      const result = fn(...args);
      depth--;
      db.exec(depth ? `RELEASE ${sp}` : 'COMMIT');
      return result;
    } catch (e) {
      depth--;
      db.exec(depth ? `ROLLBACK TO ${sp}; RELEASE ${sp}` : 'ROLLBACK');
      throw e;
    }
  };
  return db;
}

const columns = (db, table) => db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);

/** Brings databases created by earlier versions up to the current schema. Safe to run every start. */
function migrate(db) {
  if (!columns(db, 'users').includes('tracking')) db.exec("ALTER TABLE users ADD COLUMN tracking TEXT NOT NULL DEFAULT '{}'");
  const daily = columns(db, 'daily_logs');
  if (!daily.includes('sleep_quality')) db.exec('ALTER TABLE daily_logs ADD COLUMN sleep_quality INTEGER');
  if (!daily.includes('water_ml')) db.exec('ALTER TABLE daily_logs ADD COLUMN water_ml INTEGER');
  // v0.1 kept an optional waist next to each weigh-in; waist now has its own table
  if (columns(db, 'weights').includes('waist_cm')) {
    db.exec(`BEGIN;
      INSERT OR IGNORE INTO waists (user_id, date, cm) SELECT user_id, date, waist_cm FROM weights WHERE waist_cm IS NOT NULL;
      ALTER TABLE weights DROP COLUMN waist_cm;
      COMMIT;`);
  }
}

export function openDb(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const db = new DatabaseSync(file);
  if (file !== ':memory:') db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 3000');
  db.exec(SCHEMA);
  migrate(db);
  return addTransactions(db);
}
