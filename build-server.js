import * as esbuild from 'esbuild';

await esbuild.build({
  entryPoints: ['src/server/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  outfile: 'dist/server/index.js',
  format: 'esm',
  external: ['pg', 'pg-native'],
  banner: {
    js: `
import { createRequire as _createRequire } from 'module';
import { fileURLToPath as _fileURLToPath } from 'url';
import _path from 'path';
const require = _createRequire(import.meta.url);
const __filename = _fileURLToPath(import.meta.url);
const __dirname = _path.dirname(__filename);
`
  }
});

console.log('Server build complete');
