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

console.log('Building frontend...');
execSync('npm ci --prefix frontend', { cwd: root, stdio: 'inherit' });
execSync('npm run build --prefix frontend', { cwd: root, stdio: 'inherit' });

console.log('Installing PHP deps (no-dev)...');
execSync('composer install --no-dev --optimize-autoloader --no-interaction', {
  cwd: api,
  stdio: 'inherit',
});

console.log('Assembling dist-deploy...');
wipe(out);

const laravel = join(out, 'app_laravel');
copyDir(api, laravel, {
  skip: [
    '.env',
    '.env.backup',
    'node_modules',
    'tests',
    '.phpunit.result.cache',
    'phpunit.xml',
  ],
});

writeFileSync(
  join(laravel, '.htaccess'),
  readFileSync(join(root, 'deploy/shared/app_laravel.htaccess')),
);

const publicSrc = join(api, 'public');
for (const name of readdirSync(publicSrc)) {
  if (name === 'index.php') continue;
  const from = join(publicSrc, name);
  const to = join(out, name);
  const st = statSync(from);
  if (st.isDirectory()) copyDir(from, to);
  else cpSync(from, to);
}

cpSync(join(root, 'deploy/shared/index.php'), join(out, 'index.php'));

const spaHtml = join(publicSrc, 'index.html');
const spaAssets = join(publicSrc, 'assets');
if (existsSync(spaHtml)) {
  cpSync(spaHtml, join(laravel, 'public', 'index.html'));
}
if (existsSync(spaAssets)) {
  copyDir(spaAssets, join(laravel, 'public', 'assets'));
}

const uploads = join(laravel, 'storage/app/uploads');
mkdirSync(uploads, { recursive: true });
writeFileSync(join(uploads, '.gitignore'), "*\n!.gitignore\n");

console.log('Ready:', out);
console.log('Upload this folder contents to the site root (www/boevsoft.ru/).');
