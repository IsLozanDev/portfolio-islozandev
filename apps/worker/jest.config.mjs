export default {
  rootDir: '.',
  testMatch: ['<rootDir>/test/**/*.spec.ts'],
  extensionsToTreatAsEsm: ['.ts'],
  resolver: '<rootDir>/jest.resolver.cjs',
  moduleNameMapper: {
    '^@vitrina/plataforma/kernel$': '<rootDir>/../../libs/plataforma/kernel/src/index.ts',
    '^@vitrina/plataforma/kernel-infra$': '<rootDir>/../../libs/plataforma/kernel-infra/src/index.ts',
    '^@vitrina/plataforma/org$': '<rootDir>/../../libs/plataforma/org/src/index.ts',
    '^@vitrina/plataforma/parametros$': '<rootDir>/../../libs/plataforma/parametros/src/index.ts',
    '^@vitrina/plataforma/seguridad$': '<rootDir>/../../libs/plataforma/seguridad/src/index.ts',
    '^@vitrina/plataforma/eventos$': '<rootDir>/../../libs/plataforma/eventos/src/index.ts',
    '^@vitrina/shared/util$': '<rootDir>/../../libs/shared/util/src/index.ts',
  },
  // Las pruebas de integración crean una base y aplican db/ en beforeAll: pasan de los 5 s por defecto.
  testTimeout: 30_000,
  transform: { '^.+\.ts$': ['ts-jest', { useESM: true, tsconfig: '<rootDir>/tsconfig.spec.json' }] },
};
