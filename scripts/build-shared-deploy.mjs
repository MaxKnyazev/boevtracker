import {
  cpSync,
  existsSync,
  mkdirSync,
  rmSync,
  readdirSync,
  statSync,
  writeFileSync,
  readFileSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const api = join(root, 'api');
const out = join(root, 'dist-deploy');
const frontendDist = join(root, 'frontend', 'dist');
const includeVendor = process.env.INCLUDE_VENDOR === '1';

function wipe(dir) {
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
}

function copyDir(src, dest, { skip = [] } = {}) {
  mkdirSync(dest, { recursive: true });
  for (const name of readdirSync(src)) {
    if (skip.includes(name)) continue;
    const from = join(src, name);
    const to = join(dest, name);
    const st = statSync(from);
    if (st.isDirectory()) copyDir(from, to, { skip });
    else cpSync(from, to);
  }
}

function copySpaInto(destDir) {
  mkdirSync(destDir, { recursive: true });
  for (const name of readdirSync(frontendDist)) {
    cpSync(join(frontendDist, name), join(destDir, name), { recursive: true });
  }
}

console.log('Building frontend...');
execSync('npm ci --prefix frontend', { cwd: root, stdio: 'inherit' });
execSync('npm run build --prefix frontend', { cwd: root, stdio: 'inherit' });

if (!existsSync(join(frontendDist, 'index.html'))) {
  throw new Error('frontend/dist/index.html missing after build');
}

if (includeVendor) {
  console.log('Installing PHP deps (no-dev) for vendor bundle...');
  execSync('composer install --no-dev --optimize-autoloader --no-interaction', {
    cwd: api,
    stdio: 'inherit',
  });
} else {
  console.log('Skipping vendor pack (use INCLUDE_VENDOR=1 for full vendor upload).');
}

console.log('Assembling dist-deploy...');
wipe(out);

const laravel = join(out, 'app_laravel');
const skip = [
  '.env',
  '.env.backup',
  'node_modules',
  'tests',
  '.phpunit.result.cache',
  'phpunit.xml',
];
if (!includeVendor) skip.push('vendor');

copyDir(api, laravel, { skip });

writeFileSync(
  join(laravel, '.htaccess'),
  readFileSync(join(root, 'deploy/shared/app_laravel.htaccess')),
);

// Fresh SPA → site root (not stale api/public from git)
copySpaInto(out);

// Keep hosting helpers from api/public if present
for (const name of ['.htaccess', '.user.ini']) {
  const from = join(api, 'public', name);
  if (existsSync(from)) cpSync(from, join(out, name));
}

cpSync(join(root, 'deploy/shared/index.php'), join(out, 'index.php'));

// Fresh SPA → Laravel public (keep index.php)
const laravelPublic = join(laravel, 'public');
mkdirSync(laravelPublic, { recursive: true });
copySpaInto(laravelPublic);

const uploads = join(laravel, 'storage/app/uploads');
mkdirSync(uploads, { recursive: true });
writeFileSync(join(uploads, '.gitignore'), "*\n!.gitignore\n");

console.log('Ready:', out);
console.log(
  includeVendor
    ? 'Package includes vendor/ (slow FTP).'
    : 'Package excludes vendor/ (fast FTP; keep vendor on server).',
);
