#!/usr/bin/env node
/**
 * Create or reset a dashboard account.
 *
 *   npm run create-admin -- --email owner@example.com --name "Owner" [--role owner|staff] [--password ...]
 *
 * Without --password you'll be prompted (input hidden). Re-running for an
 * existing email resets that account's password.
 */
import { parseArgs } from 'node:util';
import readline from 'node:readline';
import { config } from '../server/config.js';
import { openDatabase } from '../server/db.js';
import { createStore } from '../server/repos/index.js';
import { MIN_PASSWORD_LENGTH } from '../server/lib/auth.js';

const { values } = parseArgs({
  options: {
    email: { type: 'string' },
    name: { type: 'string', default: 'Owner' },
    role: { type: 'string', default: 'owner' },
    password: { type: 'string' },
  },
});

function promptHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => {
      if (s.includes(question)) rl.output.write(s);
      else rl.output.write('*');
    };
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
  });
}

async function main() {
  const email = values.email?.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error('Please pass a valid --email address.');
    process.exit(1);
  }
  if (!['owner', 'staff'].includes(values.role)) {
    console.error('--role must be "owner" or "staff".');
    process.exit(1);
  }
  const password = values.password ?? (await promptHidden(`Password for ${email} (min ${MIN_PASSWORD_LENGTH} characters): `));
  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    console.error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
    process.exit(1);
  }

  const db = openDatabase(config.dbPath);
  const store = createStore(db);
  const existing = store.users.getForLogin(email);
  if (existing) {
    await store.users.setPassword(existing.id, password);
    store.sessions.destroyForUser(existing.id);
    console.log(`Password reset for ${email}.`);
  } else {
    await store.users.create({ email, name: values.name, password, role: values.role });
    console.log(`Created ${values.role} account for ${email}. Sign in at ${config.siteUrl}/admin`);
  }
  db.close();
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
