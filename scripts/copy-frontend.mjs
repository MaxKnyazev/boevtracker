import { cpSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'frontend', 'dist');
const pub = join(root, 'api', 'public');

if (!existsSync(dist)) {
  console.error('frontend/dist not found. Run npm run build:frontend first.');
  process.exit(1);
}

const keep = new Set(['index.php', '.htaccess', '.user.ini', 'favicon.ico', 'robots.txt']);

for (const name of readdirSync(pub)) {
  if (keep.has(name)) continue;
  rmSync(join(pub, name), { recursive: true, force: true });
}

for (const name of readdirSync(dist)) {
  cpSync(join(dist, name), join(pub, name), { recursive: true });
}

console.log('Copied frontend/dist -> api/public');
