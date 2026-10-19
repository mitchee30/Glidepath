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
