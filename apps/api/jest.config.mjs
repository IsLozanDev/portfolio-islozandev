export default {
  rootDir: '.',
  testMatch: ['<rootDir>/test/**/*.spec.ts'],
  extensionsToTreatAsEsm: ['.ts'],
  resolver: '<rootDir>/jest.resolver.cjs',
  moduleNameMapper: {
    '^@vitrina/plataforma/kernel$': '<rootDir>/../../libs/plataforma/kernel/src/index.ts',
    '^@vitrina/plataforma/kernel-infra$': '<rootDir>/../../libs/plataforma/kernel-infra/src/index.ts',
    '^@vitrina/plataforma/org$': '<rootDir>/../../libs/plataforma/org/src/index.ts',
    '^@vitrina/shared/util$': '<rootDir>/../../libs/shared/util/src/index.ts',
  },
  transform: { '^.+\.ts$': ['ts-jest', { useESM: true, tsconfig: '<rootDir>/tsconfig.spec.json' }] },
};
