export default {
  rootDir: '.',
  testMatch: ['<rootDir>/test/**/*.spec.ts'],
  extensionsToTreatAsEsm: ['.ts'],
  resolver: '<rootDir>/jest.resolver.cjs',
  moduleNameMapper: {
    '^@vitrina/plataforma/kernel$': '<rootDir>/../kernel/src/index.ts',
    '^@vitrina/plataforma/kernel-infra$': '<rootDir>/../kernel-infra/src/index.ts',
    '^@vitrina/plataforma/org$': '<rootDir>/../org/src/index.ts',
    '^@vitrina/plataforma/secretos$': '<rootDir>/../secretos/src/index.ts',
    '^@vitrina/plataforma/catalogos$': '<rootDir>/../catalogos/src/index.ts',
    '^@vitrina/plataforma/parametros$': '<rootDir>/../parametros/src/index.ts',
    '^@vitrina/plataforma/auditoria$': '<rootDir>/../auditoria/src/index.ts',
    '^@vitrina/plataforma/seguridad$': '<rootDir>/../seguridad/src/index.ts',
    '^@vitrina/plataforma/eventos$': '<rootDir>/../eventos/src/index.ts',
    '^@vitrina/shared/util$': '<rootDir>/../../shared/util/src/index.ts',
  },
  testTimeout: 30_000,
  // RNF-025: la cobertura exigida es la del dominio.
  collectCoverageFrom: ['<rootDir>/src/domain/**/*.ts'],
  coverageThreshold: { global: { lines: 70 } },
  transform: { '^.+\.ts$': ['ts-jest', { useESM: true, tsconfig: '<rootDir>/tsconfig.spec.json' }] },
};
