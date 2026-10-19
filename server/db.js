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
  waist_cm REAL,
  PRIMARY KEY (user_id, date)
);
CREATE TABLE IF NOT EXISTS daily_logs (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  steps INTEGER,
  sleep_hours REAL,
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

export function openDb(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const db = new DatabaseSync(file);
  if (file !== ':memory:') db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 3000');
  db.exec(SCHEMA);
  return addTransactions(db);
}
