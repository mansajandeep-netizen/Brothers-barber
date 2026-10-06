#!/usr/bin/env node
/**
 * Writes a consistent copy of the database (safe while the server is running).
 *
 *   npm run backup                 → backups/manhandler-YYYY-MM-DDTHH-MM.db
 *   npm run backup -- /path/dir    → custom folder
 */
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config, ROOT_DIR } from '../server/config.js';

const dir = path.resolve(process.argv[2] || path.join(ROOT_DIR, 'backups'));
fs.mkdirSync(dir, { recursive: true });
const stamp = new Date().toISOString().slice(0, 16).replace(/:/g, '-');
const out = path.join(dir, `manhandler-${stamp}.db`);

const db = new DatabaseSync(config.dbPath, { readOnly: true });
db.exec(`VACUUM INTO '${out.replace(/'/g, "''")}'`);
db.close();
console.log(`Backup written to ${out}`);
