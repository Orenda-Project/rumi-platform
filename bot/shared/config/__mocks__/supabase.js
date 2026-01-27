/**
 * Mock Supabase Client for Testing
 *
 * Chainable mock that replicates Supabase query patterns
 * Example: supabase.from('users').select('*').eq('id', userId).single()
 *
 * @module __mocks__/supabase
 */

// Store for mock data (can be set per test)
let mockData = {
  users: [],
  coaching_sessions: [],
  lesson_plan_requests: [],
  reading_assessments: [],
  video_requests: [],
  conversations: []
};

// Store for mock errors (can be set per test)
let mockError = null;

/**
 * Create a chainable query builder mock
 * @param {string} table - Table name
 * @returns {Object} Chainable mock object
 */
function createQueryBuilder(table) {
  let filters = [];
  let selectColumns = '*';
  let limitCount = null;
  let orderColumn = null;
  let orderDirection = 'asc';
  let isSingle = false;
  let insertData = null;
  let updateData = null;
  let upsertData = null;

  const builder = {
    // SELECT
    select: jest.fn().mockImplementation((columns = '*') => {
      selectColumns = columns;
      return builder;
    }),

    // WHERE clauses
    eq: jest.fn().mockImplementation((column, value) => {
      filters.push({ type: 'eq', column, value });
      return builder;
    }),

    neq: jest.fn().mockImplementation((column, value) => {
      filters.push({ type: 'neq', column, value });
      return builder;
    }),

    gt: jest.fn().mockImplementation((column, value) => {
      filters.push({ type: 'gt', column, value });
      return builder;
    }),

    gte: jest.fn().mockImplementation((column, value) => {
      filters.push({ type: 'gte', column, value });
      return builder;
    }),

    lt: jest.fn().mockImplementation((column, value) => {
      filters.push({ type: 'lt', column, value });
      return builder;
    }),

    lte: jest.fn().mockImplementation((column, value) => {
      filters.push({ type: 'lte', column, value });
      return builder;
    }),

    like: jest.fn().mockImplementation((column, pattern) => {
      filters.push({ type: 'like', column, pattern });
      return builder;
    }),

    ilike: jest.fn().mockImplementation((column, pattern) => {
      filters.push({ type: 'ilike', column, pattern });
      return builder;
    }),

    in: jest.fn().mockImplementation((column, values) => {
      filters.push({ type: 'in', column, values });
      return builder;
    }),

    is: jest.fn().mockImplementation((column, value) => {
      filters.push({ type: 'is', column, value });
      return builder;
    }),

    // ORDER BY
    order: jest.fn().mockImplementation((column, { ascending = true } = {}) => {
      orderColumn = column;
      orderDirection = ascending ? 'asc' : 'desc';
      return builder;
    }),

    // LIMIT
    limit: jest.fn().mockImplementation((count) => {
      limitCount = count;
      return builder;
    }),

    // Single row
    single: jest.fn().mockImplementation(() => {
      isSingle = true;
      return builder;
    }),

    // Maybe single (doesn't error if no row)
    maybeSingle: jest.fn().mockImplementation(() => {
      isSingle = true;
      return builder;
    }),

    // INSERT
    insert: jest.fn().mockImplementation((data) => {
      insertData = data;
      return builder;
    }),

    // UPDATE
    update: jest.fn().mockImplementation((data) => {
      updateData = data;
      return builder;
    }),

    // UPSERT
    upsert: jest.fn().mockImplementation((data) => {
      upsertData = data;
      return builder;
    }),

    // DELETE
    delete: jest.fn().mockImplementation(() => {
      return builder;
    }),

    // Execute query (returns Promise-like)
    then: jest.fn().mockImplementation((resolve, reject) => {
      if (mockError) {
        return reject ? reject(mockError) : Promise.reject(mockError);
      }

      let result = mockData[table] || [];

      // Apply filters
      filters.forEach(filter => {
        if (filter.type === 'eq') {
          result = result.filter(row => row[filter.column] === filter.value);
        }
        // Add more filter implementations as needed
      });

      // Apply limit
      if (limitCount) {
        result = result.slice(0, limitCount);
      }

      // Single row
      if (isSingle) {
        result = result[0] || null;
      }

      // Handle insert/update/upsert
      if (insertData) {
        result = Array.isArray(insertData) ? insertData : [insertData];
      }
      if (updateData || upsertData) {
        result = updateData || upsertData;
      }

      const response = { data: result, error: null };
      return resolve ? resolve(response) : Promise.resolve(response);
    }),

    // For async/await compatibility
    catch: jest.fn().mockImplementation((reject) => {
      if (mockError) {
        return reject(mockError);
      }
      return Promise.resolve({ data: null, error: null });
    })
  };

  // Make it thenable
  builder[Symbol.toStringTag] = 'Promise';

  return builder;
}

// Main supabase mock object
const supabase = {
  from: jest.fn().mockImplementation((table) => createQueryBuilder(table)),

  // RPC calls
  rpc: jest.fn().mockResolvedValue({ data: null, error: null }),

  // Storage
  storage: {
    from: jest.fn().mockReturnValue({
      upload: jest.fn().mockResolvedValue({ data: { path: 'mock/path' }, error: null }),
      download: jest.fn().mockResolvedValue({ data: Buffer.from('mock'), error: null }),
      getPublicUrl: jest.fn().mockReturnValue({ data: { publicUrl: 'https://mock-url.com' } }),
      remove: jest.fn().mockResolvedValue({ data: null, error: null }),
      list: jest.fn().mockResolvedValue({ data: [], error: null })
    })
  },

  // Auth (usually not used with service role key)
  auth: {
    getUser: jest.fn().mockResolvedValue({ data: { user: null }, error: null }),
    signOut: jest.fn().mockResolvedValue({ error: null })
  },

  // Test helpers - set mock data
  __setMockData: (table, data) => {
    mockData[table] = data;
  },

  // Test helpers - set mock error
  __setMockError: (error) => {
    mockError = error;
  },

  // Test helpers - reset all
  __resetMocks: () => {
    mockData = {
      users: [],
      coaching_sessions: [],
      lesson_plan_requests: [],
      reading_assessments: [],
      video_requests: [],
      conversations: []
    };
    mockError = null;
    supabase.from.mockClear();
    supabase.rpc.mockClear();
  }
};

module.exports = supabase;
