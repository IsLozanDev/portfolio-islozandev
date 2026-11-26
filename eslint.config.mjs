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
const XML_Y_FIRMA = paquete(['xml-crypto', '@xmldom/xmldom', 'node-forge'], 'El dominio no arma XML ni firma: eso va en infrastructure.');
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
            comp('idn', 'kernel', 'seg'),
            // PL-10 dibuja IDN después de PER; PER lo consume para el prellenado (spec 31). ARC valida la
            // evidencia de los consentimientos y AUD los audita (spec 37); ninguno depende de PER.
            comp('per', 'kernel', 'seg', 'org', 'cat', 'idn', 'arc', 'aud'),
            // R2: archivos audita las descargas sensibles y publica por outbox (spec 33).
            comp('arc', 'kernel', 'seg', 'aud', 'evt'),
            // R2: la bóveda audita sus escrituras (spec 41).
            comp('sec', 'kernel', 'aud'),
            // R2: notificaciones publica por outbox y consume en el worker (EVT), lee persona y consentimiento (PER),
            // hashea el destino (OBS), marca el webhook @Publico (SEG) y toma la zona de Lima (ORG) (spec 42).
            // Audita la personalización y la restauración de plantillas (AUD) (spec 43).
            comp('not', 'kernel', 'seg', 'org', 'evt', 'per', 'obs', 'aud'),
            // R2: el emisor electrónico lee la empresa, guarda sus secretos en la bóveda, valida el proveedor en
            // catálogos, lee el parámetro de aviso, audita y autoriza (spec 49); consume su prueba en beta en el
            // worker (EVT, spec 50). Numera boletas y facturas con SEQ en la transacción de la emisión (spec 51).
            // Guarda el XML firmado y el CDR en ARC desde el worker (spec 52).
            comp('fe', 'kernel', 'org', 'sec', 'cat', 'cfg', 'aud', 'seg', 'evt', 'seq', 'arc'),
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
    rules: restringir(capa('application'), capa('infrastructure'), capa('interface'), NEST, ORM, SUPABASE, XML_Y_FIRMA),
  },
];
