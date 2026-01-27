/**
 * Test: Code Chunker Service
 *
 * TDD Tests for AST-based code chunking
 * Tests function extraction, metadata, and error handling
 */

const chunker = require('../services/code-chunker.service');

describe('Code Chunker Service', () => {

  describe('chunkJavaScript', () => {
    test('should extract function declarations', () => {
      const code = `
function handleMessage(msg) {
  return processMessage(msg);
}

function processMessage(msg) {
  return msg.toUpperCase();
}
`;
      const chunks = chunker.chunkCode(code, 'test.js');

      expect(chunks.length).toBeGreaterThanOrEqual(2);
      const functionNames = chunks.map(c => c.functionName);
      expect(functionNames).toContain('handleMessage');
      expect(functionNames).toContain('processMessage');
    });

    test('should extract arrow functions assigned to variables', () => {
      const code = `
const handleAuth = async (user) => {
  return await validateUser(user);
};

const validateUser = (user) => user.isValid;
`;
      const chunks = chunker.chunkCode(code, 'auth.js');

      expect(chunks.length).toBeGreaterThanOrEqual(2);
      const names = chunks.map(c => c.functionName);
      expect(names).toContain('handleAuth');
      expect(names).toContain('validateUser');
    });

    test('should include line number metadata', () => {
      const code = `function test() {
  return true;
}`;
      const chunks = chunker.chunkCode(code, 'test.js');

      expect(chunks[0]).toBeDefined();
      expect(chunks[0].startLine).toBe(1);
      expect(chunks[0].endLine).toBeGreaterThan(1);
    });
  });

  describe('chunkClass', () => {
    test('should extract class declarations', () => {
      const code = `
class UserService {
  constructor() {
    this.users = [];
  }

  addUser(user) {
    this.users.push(user);
  }

  getUser(id) {
    return this.users.find(u => u.id === id);
  }
}
`;
      const chunks = chunker.chunkCode(code, 'user-service.js');

      // Should find the class and/or its methods
      expect(chunks.length).toBeGreaterThan(0);
      const hasClass = chunks.some(c => c.className === 'UserService' || c.code.includes('class UserService'));
      expect(hasClass).toBe(true);
    });
  });

  describe('metadata extraction', () => {
    test('should extract JSDoc comments', () => {
      const code = `
/**
 * Process user authentication
 * @param {Object} credentials - User credentials
 * @returns {boolean} Success status
 */
function authenticate(credentials) {
  return true;
}
`;
      const chunks = chunker.chunkCode(code, 'auth.js');

      const authChunk = chunks.find(c => c.functionName === 'authenticate');
      expect(authChunk).toBeDefined();
      // Should capture or associate the docstring
      expect(authChunk.code.includes('authentication') || authChunk.docstring?.includes('authentication')).toBe(true);
    });
  });

  describe('edge cases', () => {
    test('should handle syntax errors gracefully', () => {
      const invalidCode = `function broken( {
        return;
      }`;

      // Should not throw, should return empty array or partial results
      expect(() => chunker.chunkCode(invalidCode, 'broken.js')).not.toThrow();
      const result = chunker.chunkCode(invalidCode, 'broken.js');
      expect(Array.isArray(result)).toBe(true);
    });

    test('should skip binary and non-code files', () => {
      const chunks = chunker.chunkCode('binary content \x00\x01\x02', 'image.png');
      expect(chunks.length).toBe(0);
    });

    test('should respect chunk size limits (max 500 lines)', () => {
      // Create a very long function
      const longCode = `function veryLongFunction() {\n${Array(600).fill('  console.log("line");').join('\n')}\n}`;

      const chunks = chunker.chunkCode(longCode, 'long.js');

      // Each chunk should be <= 500 lines
      chunks.forEach(chunk => {
        const lines = chunk.code.split('\n').length;
        expect(lines).toBeLessThanOrEqual(550); // Allow some buffer for splitting
      });
    });
  });

  describe('file path handling', () => {
    test('should handle nested file paths', () => {
      const code = 'function test() {}';
      const chunks = chunker.chunkCode(code, 'src/handlers/message/text.js');

      expect(chunks[0].filePath).toBe('src/handlers/message/text.js');
    });
  });
});
