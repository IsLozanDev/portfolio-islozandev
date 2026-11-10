export default {
  rootDir: '.',
  testMatch: ['<rootDir>/test/**/*.spec.ts'],
  extensionsToTreatAsEsm: ['.ts'],
  resolver: '<rootDir>/jest.resolver.cjs',
  testTimeout: 30_000,
  transform: { '^.+\.ts$': ['ts-jest', { useESM: true, tsconfig: '<rootDir>/tsconfig.spec.json' }] },
};
