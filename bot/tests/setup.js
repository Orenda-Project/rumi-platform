/**
 * Jest Test Setup File
 *
 * Configures the test environment before tests run
 * Sets up global mocks and test utilities
 *
 * @module tests/setup
 */

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.WHATSAPP_TOKEN = 'mock_whatsapp_token';
process.env.PHONE_NUMBER_ID = 'mock_phone_number_id';
process.env.OPENAI_API_KEY = 'mock_openai_key';
process.env.SUPABASE_URL = 'https://mock.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock_supabase_key';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.SONIOX_API_KEY = 'mock_soniox_key';
process.env.ELEVENLABS_API_KEY = 'mock_elevenlabs_key';
process.env.UPLIFT_API_KEY = 'mock_uplift_key';

// Increase test timeout for async operations
jest.setTimeout(30000);

// Global beforeEach to reset mocks
beforeEach(() => {
  // Clear all mocks before each test
  jest.clearAllMocks();
});

// Global afterEach for cleanup
afterEach(() => {
  // Clean up any lingering promises
  jest.useRealTimers();
});

// Console output suppression for cleaner test output
// Uncomment to suppress console during tests
// global.console = {
//   ...console,
//   log: jest.fn(),
//   debug: jest.fn(),
//   info: jest.fn(),
//   warn: jest.fn(),
//   // Keep error for debugging
//   error: console.error,
// };

// Custom matchers for common assertions
expect.extend({
  /**
   * Check if a mock was called with a specific phone number
   */
  toHaveBeenCalledWithPhoneNumber(received, phoneNumber) {
    const calls = received.mock.calls;
    const found = calls.some(call =>
      call.some(arg =>
        typeof arg === 'string' && arg.includes(phoneNumber)
      )
    );

    return {
      pass: found,
      message: () =>
        found
          ? `Expected mock not to have been called with phone number ${phoneNumber}`
          : `Expected mock to have been called with phone number ${phoneNumber}`
    };
  },

  /**
   * Check if response contains error message in expected language
   */
  toContainBilingualError(received, { en, ur }) {
    const hasEnglish = received.includes(en);
    const hasUrdu = received.includes(ur);

    return {
      pass: hasEnglish || hasUrdu,
      message: () =>
        `Expected response to contain bilingual error. English: "${en}", Urdu: "${ur}". Received: "${received}"`
    };
  }
});

// Mock file system for tests that interact with files
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  existsSync: jest.fn().mockReturnValue(true),
  mkdirSync: jest.fn(),
  writeFileSync: jest.fn(),
  readFileSync: jest.fn().mockReturnValue('mock file content'),
  unlinkSync: jest.fn(),
  createWriteStream: jest.fn().mockReturnValue({
    write: jest.fn(),
    end: jest.fn(),
    on: jest.fn()
  }),
  createReadStream: jest.fn().mockReturnValue({
    pipe: jest.fn().mockReturnThis(),
    on: jest.fn()
  })
}));

// Mock path for consistent behavior
jest.mock('path', () => ({
  ...jest.requireActual('path'),
  join: jest.fn().mockImplementation((...args) => args.join('/'))
}));

// Utility to wait for all pending promises
global.flushPromises = () => new Promise(resolve => setImmediate(resolve));

// Utility to create a delay
global.delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
