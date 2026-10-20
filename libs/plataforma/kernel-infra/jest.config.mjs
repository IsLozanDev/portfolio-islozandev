export default {
  rootDir: '.',
  testMatch: ['<rootDir>/test/**/*.spec.ts'],
  extensionsToTreatAsEsm: ['.ts'],
  resolver: '<rootDir>/jest.resolver.cjs',
  moduleNameMapper: { '^@vitrina/plataforma/kernel$': '<rootDir>/../kernel/src/index.ts' },
  transform: { '^.+\.ts$': ['ts-jest', { useESM: true, tsconfig: '<rootDir>/tsconfig.spec.json' }] },
};
