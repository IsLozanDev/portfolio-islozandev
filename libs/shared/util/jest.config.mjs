export default {
  rootDir: '.',
  testMatch: ['<rootDir>/test/**/*.spec.ts'],
  extensionsToTreatAsEsm: ['.ts'],
  resolver: '<rootDir>/jest.resolver.cjs',
  collectCoverageFrom: ['<rootDir>/src/**/*.ts'],
  transform: { '^.+\.ts$': ['ts-jest', { useESM: true, tsconfig: '<rootDir>/tsconfig.spec.json' }] },
};
