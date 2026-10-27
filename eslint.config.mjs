import nx from '@nx/eslint-plugin';

// Cada comp:* puede importar de sí mismo, de kernel y de sus predecesores directos en PL-10.
// scope:shared se permite siempre: los proyectos shared no llevan etiqueta comp:*.
const comp = (origen, ...destinos) => ({
  sourceTag: `comp:${origen}`,
  onlyDependOnLibsWithTags: [...[origen, ...destinos].map((c) => `comp:${c}`), 'scope:shared'],
});

// Capas dentro de cada lib TR. Cada bloque repite sus restricciones completas: en flat config
// el último bloque que coincide reemplaza la regla, no la fusiona.
const capa = (nombre) => ({ group: [`**/${nombre}`, `**/${nombre}/**`], message: `Esta capa no puede importar ${nombre}.` });
const paquete = (group, message) => ({ group, message });
const SUPABASE = paquete(['@supabase/*'], 'Supabase solo en infrastructure/supabase.');
const NEST = paquete(['@nestjs/*'], 'El dominio no importa NestJS.');
const ORM = paquete(['typeorm', 'typeorm/*'], 'Esta capa no importa TypeORM.');
const restringir = (...patterns) => ({ 'no-restricted-imports': ['error', { patterns }] });

export default [
  ...nx.configs['flat/base'],
  ...nx.configs['flat/typescript'],
  { ignores: ['**/dist', '**/.nx', '**/coverage'] },
  {
    files: ['**/*.ts'],
    rules: {
      '@nx/enforce-module-boundaries': [
        'error',
        {
          enforceBuildableLibDependency: false,
          // El interceptor de errores del shell carga `shared/ui` con import() para no meter SweetAlert2
          // en el bundle inicial; el resto del shell la importa estáticamente desde rutas lazy.
          checkDynamicDependenciesExceptions: ['@vitrina/shared/ui'],
          allow: [],
          depConstraints: [
            // Alcance: la plataforma nunca usa productos; shared no usa nada fuera de shared.
            { sourceTag: 'scope:app', onlyDependOnLibsWithTags: ['scope:app', 'scope:psi', 'scope:nucleo', 'scope:plataforma', 'scope:shared'] },
            { sourceTag: 'scope:psi', onlyDependOnLibsWithTags: ['scope:psi', 'scope:nucleo', 'scope:plataforma', 'scope:shared'] },
            { sourceTag: 'scope:nucleo', onlyDependOnLibsWithTags: ['scope:nucleo', 'scope:plataforma', 'scope:shared'] },
            { sourceTag: 'scope:plataforma', onlyDependOnLibsWithTags: ['scope:plataforma', 'scope:shared'] },
            { sourceTag: 'scope:shared', onlyDependOnLibsWithTags: ['scope:shared'] },
            // Tipo: las apps componen; las features usan ui y data-access; el dominio no depende de nada externo.
            { sourceTag: 'type:app', onlyDependOnLibsWithTags: ['type:feature', 'type:backend', 'type:ui', 'type:data-access', 'type:util', 'type:domain'] },
            { sourceTag: 'type:feature', onlyDependOnLibsWithTags: ['type:feature', 'type:ui', 'type:data-access', 'type:util'] },
            { sourceTag: 'type:backend', onlyDependOnLibsWithTags: ['type:backend', 'type:domain', 'type:util'] },
            { sourceTag: 'type:ui', onlyDependOnLibsWithTags: ['type:ui', 'type:util'] },
            { sourceTag: 'type:data-access', onlyDependOnLibsWithTags: ['type:data-access', 'type:util'] },
            { sourceTag: 'type:domain', onlyDependOnLibsWithTags: ['type:domain'] },
            { sourceTag: 'type:util', onlyDependOnLibsWithTags: ['type:util'] },
            // Componente (PL-10, R0 y R1).
            comp('kernel'),
            comp('org', 'kernel'),
            comp('seg', 'kernel', 'org'),
            comp('evt', 'kernel'),
            comp('cfg', 'kernel', 'seg'),
            comp('seq', 'kernel', 'seg'),
            comp('cat', 'kernel', 'seg'),
            comp('aud', 'kernel', 'seg', 'evt'),
            comp('obs', 'kernel', 'evt'),
          ],
        },
      ],
    },
  },
  {
    files: ['libs/plataforma/*/src/**/*.ts'],
    rules: restringir(SUPABASE),
  },
  {
    files: ['libs/plataforma/*/src/application/**/*.ts'],
    rules: restringir(capa('infrastructure'), capa('interface'), ORM, SUPABASE),
  },
  {
    files: ['libs/plataforma/*/src/infrastructure/**/*.ts'],
    rules: restringir(capa('interface'), SUPABASE),
  },
  {
    files: ['libs/plataforma/*/src/infrastructure/supabase/**/*.ts'],
    rules: restringir(capa('interface')),
  },
  {
    files: ['libs/plataforma/*/src/domain/**/*.ts', 'libs/plataforma/kernel/src/**/*.ts'],
    rules: restringir(capa('application'), capa('infrastructure'), capa('interface'), NEST, ORM, SUPABASE),
  },
];
