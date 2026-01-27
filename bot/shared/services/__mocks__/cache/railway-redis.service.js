/**
 * Mock Redis Service for Testing
 *
 * In-memory mock that replicates Redis operations
 * Supports common Redis commands used in the application
 *
 * @module __mocks__/cache/railway-redis.service
 */

// In-memory store
let store = new Map();
let expirations = new Map();

const mockRedis = {
  // String operations
  get: jest.fn().mockImplementation(async (key) => {
    const value = store.get(key);
    return value !== undefined ? value : null;
  }),

  set: jest.fn().mockImplementation(async (key, value, ...args) => {
    store.set(key, value);
    // Handle EX option
    const exIndex = args.indexOf('EX');
    if (exIndex !== -1 && args[exIndex + 1]) {
      const ttl = parseInt(args[exIndex + 1], 10);
      expirations.set(key, Date.now() + (ttl * 1000));
    }
    return 'OK';
  }),

  setex: jest.fn().mockImplementation(async (key, seconds, value) => {
    store.set(key, value);
    expirations.set(key, Date.now() + (seconds * 1000));
    return 'OK';
  }),

  del: jest.fn().mockImplementation(async (...keys) => {
    let count = 0;
    keys.forEach(key => {
      if (store.has(key)) {
        store.delete(key);
        expirations.delete(key);
        count++;
      }
    });
    return count;
  }),

  exists: jest.fn().mockImplementation(async (...keys) => {
    return keys.filter(key => store.has(key)).length;
  }),

  expire: jest.fn().mockImplementation(async (key, seconds) => {
    if (store.has(key)) {
      expirations.set(key, Date.now() + (seconds * 1000));
      return 1;
    }
    return 0;
  }),

  ttl: jest.fn().mockImplementation(async (key) => {
    if (!store.has(key)) return -2;
    const exp = expirations.get(key);
    if (!exp) return -1;
    return Math.max(0, Math.floor((exp - Date.now()) / 1000));
  }),

  // Hash operations
  hget: jest.fn().mockImplementation(async (key, field) => {
    const hash = store.get(key);
    if (hash && typeof hash === 'object') {
      return hash[field] !== undefined ? hash[field] : null;
    }
    return null;
  }),

  hset: jest.fn().mockImplementation(async (key, ...args) => {
    let hash = store.get(key);
    if (!hash || typeof hash !== 'object') {
      hash = {};
    }
    // Handle both hset(key, field, value) and hset(key, {field: value})
    if (typeof args[0] === 'object') {
      Object.assign(hash, args[0]);
    } else {
      for (let i = 0; i < args.length; i += 2) {
        hash[args[i]] = args[i + 1];
      }
    }
    store.set(key, hash);
    return 1;
  }),

  hgetall: jest.fn().mockImplementation(async (key) => {
    const hash = store.get(key);
    return (hash && typeof hash === 'object') ? { ...hash } : null;
  }),

  hdel: jest.fn().mockImplementation(async (key, ...fields) => {
    const hash = store.get(key);
    if (hash && typeof hash === 'object') {
      let count = 0;
      fields.forEach(field => {
        if (field in hash) {
          delete hash[field];
          count++;
        }
      });
      store.set(key, hash);
      return count;
    }
    return 0;
  }),

  // List operations
  lpush: jest.fn().mockImplementation(async (key, ...values) => {
    let list = store.get(key);
    if (!Array.isArray(list)) {
      list = [];
    }
    list.unshift(...values.reverse());
    store.set(key, list);
    return list.length;
  }),

  rpush: jest.fn().mockImplementation(async (key, ...values) => {
    let list = store.get(key);
    if (!Array.isArray(list)) {
      list = [];
    }
    list.push(...values);
    store.set(key, list);
    return list.length;
  }),

  lrange: jest.fn().mockImplementation(async (key, start, stop) => {
    const list = store.get(key);
    if (!Array.isArray(list)) return [];
    const end = stop === -1 ? undefined : stop + 1;
    return list.slice(start, end);
  }),

  llen: jest.fn().mockImplementation(async (key) => {
    const list = store.get(key);
    return Array.isArray(list) ? list.length : 0;
  }),

  // Set operations
  sadd: jest.fn().mockImplementation(async (key, ...members) => {
    let set = store.get(key);
    if (!(set instanceof Set)) {
      set = new Set();
    }
    let added = 0;
    members.forEach(member => {
      if (!set.has(member)) {
        set.add(member);
        added++;
      }
    });
    store.set(key, set);
    return added;
  }),

  smembers: jest.fn().mockImplementation(async (key) => {
    const set = store.get(key);
    return (set instanceof Set) ? Array.from(set) : [];
  }),

  sismember: jest.fn().mockImplementation(async (key, member) => {
    const set = store.get(key);
    return (set instanceof Set && set.has(member)) ? 1 : 0;
  }),

  // Key operations
  keys: jest.fn().mockImplementation(async (pattern) => {
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    return Array.from(store.keys()).filter(key => regex.test(key));
  }),

  // Increment
  incr: jest.fn().mockImplementation(async (key) => {
    let value = parseInt(store.get(key) || '0', 10);
    value++;
    store.set(key, value.toString());
    return value;
  }),

  // Connection
  ping: jest.fn().mockResolvedValue('PONG'),
  quit: jest.fn().mockResolvedValue('OK'),

  // Pipeline (returns chainable mock)
  pipeline: jest.fn().mockImplementation(() => {
    const commands = [];
    const pipeline = {
      get: (key) => { commands.push(['get', key]); return pipeline; },
      set: (key, value) => { commands.push(['set', key, value]); return pipeline; },
      del: (key) => { commands.push(['del', key]); return pipeline; },
      expire: (key, sec) => { commands.push(['expire', key, sec]); return pipeline; },
      exec: jest.fn().mockResolvedValue(commands.map(() => [null, 'OK']))
    };
    return pipeline;
  })
};

// Service wrapper (matches real railway-redis.service structure)
const redisService = {
  redis: mockRedis,
  isConnected: jest.fn().mockReturnValue(true),
  getClient: jest.fn().mockReturnValue(mockRedis),

  // Test helpers
  __setStore: (key, value) => {
    store.set(key, value);
  },

  __getStore: (key) => {
    return store.get(key);
  },

  __clearStore: () => {
    store.clear();
    expirations.clear();
  },

  __resetAllMocks: () => {
    store.clear();
    expirations.clear();
    Object.keys(mockRedis).forEach(key => {
      if (typeof mockRedis[key] === 'function' && typeof mockRedis[key].mockClear === 'function') {
        mockRedis[key].mockClear();
      }
    });
  }
};

module.exports = redisService;
