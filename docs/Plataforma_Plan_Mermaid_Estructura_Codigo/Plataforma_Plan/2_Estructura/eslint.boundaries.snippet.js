// eslint.config.mjs (extracto) — reglas de límites entre proyectos del monorepo Nx
// Cada project.json declara sus etiquetas, por ejemplo:
//   libs/psi/agenda/project.json        "tags": ["scope:psi", "type:backend"]
//   libs/psi/feature-agenda/project.json "tags": ["scope:psi", "type:feature"]
//   libs/plataforma/kernel/project.json  "tags": ["scope:plataforma", "type:domain"]
export default [
  {
    files: ['**/*.ts'],
    rules: {
      '@nx/enforce-module-boundaries': ['error', {
        enforceBuildableLibDependency: true,
        allow: [],
        depConstraints: [
          // Alcance: PsicoAgenda puede usar núcleo, plataforma y compartido; la plataforma NUNCA usa psi.
          { sourceTag: 'scope:psi',        onlyDependOnLibsWithTags: ['scope:psi', 'scope:nucleo', 'scope:plataforma', 'scope:shared'] },
          { sourceTag: 'scope:nucleo',     onlyDependOnLibsWithTags: ['scope:nucleo', 'scope:plataforma', 'scope:shared'] },
          { sourceTag: 'scope:plataforma', onlyDependOnLibsWithTags: ['scope:plataforma', 'scope:shared'] },
          { sourceTag: 'scope:shared',     onlyDependOnLibsWithTags: ['scope:shared'] },
          // Tipo: las apps componen; las features usan ui y data-access; el dominio no depende de nada externo.
          { sourceTag: 'type:app',         onlyDependOnLibsWithTags: ['type:feature', 'type:backend', 'type:ui', 'type:data-access', 'type:util', 'type:domain'] },
          { sourceTag: 'type:feature',     onlyDependOnLibsWithTags: ['type:feature', 'type:ui', 'type:data-access', 'type:util'] },
          { sourceTag: 'type:backend',     onlyDependOnLibsWithTags: ['type:backend', 'type:domain', 'type:util'] },
          { sourceTag: 'type:ui',          onlyDependOnLibsWithTags: ['type:ui', 'type:util'] },
          { sourceTag: 'type:data-access', onlyDependOnLibsWithTags: ['type:data-access', 'type:util'] },
          { sourceTag: 'type:domain',      onlyDependOnLibsWithTags: ['type:domain'] },
        ],
      }],
    },
  },
];
