export default {
  rootDir: '.',
  testMatch: ['<rootDir>/test/**/*.spec.ts'],
  extensionsToTreatAsEsm: ['.ts'],
  resolver: '<rootDir>/jest.resolver.cjs',
  moduleNameMapper: { '^@vitrina/plataforma/kernel$': '<rootDir>/../kernel/src/index.ts' },
  // beforeAll crea una base y aplica db/: con lint, build y tests en paralelo pasa de los 5 s por defecto.
  testTimeout: 30_000,
  transform: { '^.+\.ts$': ['ts-jest', { useESM: true, tsconfig: '<rootDir>/tsconfig.spec.json' }] },
};
