const nextJest = require('next/jest');

const createJestConfig = nextJest({ dir: './' });

/** @type {import('jest').Config} */
const config = {
  testEnvironment: 'jsdom',
  // `setupFilesAfterSetup` is not a Jest option — the key is setupFilesAfterEnv.
  // Jest warned about it on every run ("probably a typing mistake") and quietly
  // never loaded jest.setup.js.
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    '^@/lib/(.*)$': '<rootDir>/lib/$1',
    '^@/components/(.*)$': '<rootDir>/components/$1',
    '^@/app/(.*)$': '<rootDir>/app/$1',
  },
  // The *.sanity.test.ts and scripts/*.test.mjs files are standalone tsx
  // harnesses, not Jest suites — each ends in process.exit(), which kills the
  // Jest worker outright ("a jest worker process crashed"). They are run by
  // `npm run test:sanity`. Without these patterns `npm test` fails on every
  // invocation, so nobody runs any of it.
  testPathIgnorePatterns: [
    '<rootDir>/node_modules/', '<rootDir>/.next/', '<rootDir>/ios/', '<rootDir>/android/',
    '\\.sanity\\.test\\.tsx?$', '<rootDir>/scripts/.*\\.test\\.mjs$',
  ],
  collectCoverageFrom: [
    'app/**/*.{ts,tsx}',
    'components/**/*.{ts,tsx}',
    'lib/**/*.{ts,tsx}',
    '!**/*.d.ts',
    '!**/node_modules/**',
  ],
};

module.exports = createJestConfig(config);
