// Empaqueta la salida de tsc (dist/tsc) en dist/main.js, como apps/api: los alias @vitrina/* se resuelven contra el dist/ de cada lib.
// Se empaqueta el JS de tsc y no el TS: esbuild no emite emitDecoratorMetadata, que NestJS usa.
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';

const { compilerOptions } = JSON.parse(await readFile('tsconfig.base.json', 'utf8'));
const alias = Object.fromEntries(
  Object.entries(compilerOptions.paths)
    .filter(([nombre]) => nombre.startsWith('@vitrina/'))
    .map(([nombre, [ruta]]) => [nombre, ruta.replace(/\/src\/index\.ts$/, '/dist/index.js')]),
);

await build({
  entryPoints: { main: 'apps/worker/dist/tsc/main.js' },
  outdir: 'apps/worker/dist',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  packages: 'external',
  alias,
  keepNames: true,
  sourcemap: true,
  logLevel: 'warning',
});
