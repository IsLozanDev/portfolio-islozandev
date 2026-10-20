// Empaqueta la salida de tsc (dist/tsc) en dist/main.js. Node no conoce los alias @vitrina/* de
// tsconfig.base.json: aquí se resuelven contra el dist/ de cada lib, que tsc -b ya compiló.
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
  entryPoints: ['apps/api/dist/tsc/main.js'],
  outfile: 'apps/api/dist/main.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  // node_modules queda fuera del bundle; los alias se aplican antes y apuntan a rutas relativas.
  packages: 'external',
  alias,
  // Sin esto esbuild renombra clases decoradas (AppModule2) y los logs y errores de Nest las muestran así.
  keepNames: true,
  sourcemap: true,
  logLevel: 'warning',
});
