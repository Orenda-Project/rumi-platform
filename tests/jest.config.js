/** @type {import('jest').Config} */
module.exports = {
  rootDir: '..',
  testMatch: [
    '<rootDir>/tests/**/*.test.js',
    '<rootDir>/tests/**/*.test.ts',
  ],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/build/',
  ],
  // Force module resolution to root node_modules so Jest mocks work
  // even when bot/node_modules exists (dual-install scenario)
  moduleNameMapper: {
    '^openai$': '<rootDir>/node_modules/openai',
    '^ioredis$': '<rootDir>/node_modules/ioredis',
    // axios + form-data live in bot/node_modules (not root), and the root test
    // job runs before bot deps install — so source that requires them can't
    // resolve. Map to lightweight stubs (same pattern as pino/canvas above) so
    // the real whatsapp.service can load in the root suite.
    '^axios$': '<rootDir>/tests/__mocks__/axios.js',
    '^form-data$': '<rootDir>/tests/__mocks__/form-data.js',
    // bot-only optional/native packages — use lightweight mocks for OSS test suite
    '^@aws-sdk/client-s3$': '<rootDir>/tests/__mocks__/aws-sdk-client-s3.js',
    '^@aws-sdk/s3-request-presigner$': '<rootDir>/tests/__mocks__/aws-sdk-s3-request-presigner.js',
    '^pino$': '<rootDir>/tests/__mocks__/pino.js',
    '^canvas$': '<rootDir>/tests/__mocks__/canvas.js',
    '^dotenv$': '<rootDir>/tests/__mocks__/dotenv.js',
    // ffmpeg + its bundled binaries: bot-only deps that audio.service.js
    // configures at import time, so anything reaching the audio/transcription
    // services needs them mapped for the root-suite-first CI pass.
    '^fluent-ffmpeg$': '<rootDir>/tests/__mocks__/fluent-ffmpeg.js',
    '^@ffmpeg-installer/ffmpeg$': '<rootDir>/tests/__mocks__/ffmpeg-installer.js',
    '^@ffprobe-installer/ffprobe$': '<rootDir>/tests/__mocks__/ffmpeg-installer.js',
  },
  setupFiles: ['<rootDir>/tests/setup.js'],
  testEnvironment: 'node',
  testEnvironmentOptions: {
    customExportConditions: ['node', 'node-addons'],
    // Disable Web Storage APIs to avoid Node.js 25 SecurityError
    experimentalVmModules: false,
  },
  // Disable localStorage/sessionStorage to avoid Node.js 25 SecurityError
  globals: {
    localStorage: undefined,
    sessionStorage: undefined,
  },
  verbose: true,
  collectCoverageFrom: [
    'bot/shared/**/*.js',
    'dashboard/services/**/*.js',
    '!**/node_modules/**',
    '!**/vendor/**',
  ],
  coverageDirectory: '<rootDir>/coverage',
  testTimeout: 30000,
};
