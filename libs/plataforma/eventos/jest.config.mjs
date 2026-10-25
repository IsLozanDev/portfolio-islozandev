export default {
  rootDir: '.',
  testMatch: ['<rootDir>/test/**/*.spec.ts'],
  extensionsToTreatAsEsm: ['.ts'],
  resolver: '<rootDir>/jest.resolver.cjs',
  moduleNameMapper: {
    '^@vitrina/plataforma/kernel$': '<rootDir>/../kernel/src/index.ts',
    '^@vitrina/plataforma/kernel-infra$': '<rootDir>/../kernel-infra/src/index.ts',
  },
  testTimeout: 30_000,
  // RNF-025: la cobertura exigida es la del dominio.
  collectCoverageFrom: ['<rootDir>/src/domain/**/*.ts'],
  coverageThreshold: { global: { lines: 70 } },
  transform: { '^.+\.ts$': ['ts-jest', { useESM: true, tsconfig: '<rootDir>/tsconfig.spec.json' }] },
};
