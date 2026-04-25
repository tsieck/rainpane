import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const electronApp = join(root, 'node_modules/electron/dist/Electron.app');

if (process.platform === 'darwin' && existsSync(electronApp)) {
  execFileSync('xattr', ['-cr', electronApp], { stdio: 'inherit' });
}
