// Runs a SQL file against the Supabase project through the Management API.
// Usage: node scripts/run-sql.mjs <file.sql>
import { readFileSync } from 'node:fs';

process.loadEnvFile('.env');
const { SUPABASE_ACCESS_TOKEN, SUPABASE_PROJECT_REF } = process.env;
const file = process.argv[2];
if (!file) throw new Error('Usage: node scripts/run-sql.mjs <file.sql>');

const res = await fetch(`https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/database/query`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: readFileSync(file, 'utf8') }),
});
const body = await res.text();
console.log(`HTTP ${res.status}`);
console.log(body);
if (!res.ok) process.exit(1);
