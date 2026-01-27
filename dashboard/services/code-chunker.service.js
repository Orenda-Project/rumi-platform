/**
 * Code Chunker Service
 *
 * Extracts function and class chunks from code using regex-based parsing
 * Provides AST-like chunking without heavy dependencies
 *
 * @author Claude Opus 4.5
 * @date January 2026
 */

// File extensions that should be treated as non-code
const BINARY_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.ico', '.svg', '.woff', '.woff2', '.ttf', '.eot', '.pdf', '.zip', '.tar', '.gz'];

// Maximum chunk size in lines
const MAX_CHUNK_LINES = 500;

/**
 * Check if a file is binary/non-code based on extension
 */
function isBinaryFile(filePath) {
  const ext = filePath.substring(filePath.lastIndexOf('.')).toLowerCase();
  return BINARY_EXTENSIONS.includes(ext);
}

/**
 * Check if content appears to be binary
 */
function isBinaryContent(content) {
  // Check for null bytes or high concentration of non-printable characters
  const nonPrintable = (content.match(/[\x00-\x08\x0E-\x1F]/g) || []).length;
  return nonPrintable > content.length * 0.1; // More than 10% non-printable
}

/**
 * Extract JSDoc comment before a position
 */
function extractDocstring(lines, endLineIndex) {
  let docstring = '';
  let i = endLineIndex - 1;

  // Look back for /** ... */ comment
  while (i >= 0) {
    const line = lines[i].trim();
    if (line.endsWith('*/')) {
      // Found end of JSDoc
      let docLines = [];
      while (i >= 0) {
        const docLine = lines[i].trim();
        docLines.unshift(docLine);
        if (docLine.startsWith('/**') || docLine.startsWith('/*')) {
          break;
        }
        i--;
      }
      docstring = docLines.join('\n');
      break;
    } else if (line && !line.startsWith('//') && !line.startsWith('*')) {
      // Hit non-comment code, stop looking
      break;
    }
    i--;
  }

  return docstring;
}

/**
 * Chunk JavaScript/TypeScript code
 *
 * @param {string} code - Source code content
 * @param {string} filePath - Path to the file
 * @returns {Array} Array of code chunks
 */
function chunkCode(code, filePath) {
  // Check for binary files
  if (isBinaryFile(filePath) || isBinaryContent(code)) {
    return [];
  }

  const chunks = [];
  const lines = code.split('\n');

  // Regex patterns for different code constructs
  const patterns = {
    // Named function declarations: function name(...) {
    functionDeclaration: /^(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(/,
    // Arrow functions: const name = (...) => or const name = async (...) =>
    arrowFunction: /^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/,
    // Simple arrow: const name = value =>
    simpleArrow: /^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\w+\s*=>/,
    // Class declarations: class Name {
    classDeclaration: /^(?:export\s+)?class\s+(\w+)/,
    // Method declarations: name(...) { or async name(...) {
    methodDeclaration: /^\s+(?:async\s+)?(\w+)\s*\([^)]*\)\s*\{/,
    // Module exports: module.exports = { or module.exports.name =
    moduleExports: /^module\.exports(?:\.(\w+))?\s*=/
  };

  let currentChunk = null;
  let braceDepth = 0;
  let inClass = false;
  let className = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();

    // Skip empty lines and comments when looking for new chunks
    if (!currentChunk && (trimmedLine === '' || trimmedLine.startsWith('//'))) {
      continue;
    }

    // Count braces to track block boundaries
    const openBraces = (line.match(/\{/g) || []).length;
    const closeBraces = (line.match(/\}/g) || []).length;

    // Check for function declarations
    let match = trimmedLine.match(patterns.functionDeclaration);
    if (match && !currentChunk) {
      const docstring = extractDocstring(lines, i);
      currentChunk = {
        type: 'function',
        functionName: match[1],
        className: inClass ? className : null,
        startLine: i + 1,
        code: docstring ? docstring + '\n' + line : line,
        docstring,
        filePath
      };
      braceDepth = openBraces - closeBraces;
      continue;
    }

    // Check for arrow functions
    match = trimmedLine.match(patterns.arrowFunction) || trimmedLine.match(patterns.simpleArrow);
    if (match && !currentChunk) {
      const docstring = extractDocstring(lines, i);
      currentChunk = {
        type: 'arrow',
        functionName: match[1],
        className: null,
        startLine: i + 1,
        code: docstring ? docstring + '\n' + line : line,
        docstring,
        filePath
      };
      braceDepth = openBraces - closeBraces;

      // One-liner arrow functions
      if (braceDepth === 0 && (trimmedLine.includes('=>') && !trimmedLine.includes('{'))) {
        currentChunk.endLine = i + 1;
        chunks.push(currentChunk);
        currentChunk = null;
      }
      continue;
    }

    // Check for class declarations
    match = trimmedLine.match(patterns.classDeclaration);
    if (match && !currentChunk) {
      inClass = true;
      className = match[1];
      const docstring = extractDocstring(lines, i);
      currentChunk = {
        type: 'class',
        functionName: null,
        className: match[1],
        startLine: i + 1,
        code: docstring ? docstring + '\n' + line : line,
        docstring,
        filePath
      };
      braceDepth = openBraces - closeBraces;
      continue;
    }

    // Check for module.exports
    match = trimmedLine.match(patterns.moduleExports);
    if (match && !currentChunk) {
      currentChunk = {
        type: 'export',
        functionName: match[1] || 'exports',
        className: null,
        startLine: i + 1,
        code: line,
        filePath
      };
      braceDepth = openBraces - closeBraces;

      // Single-line export
      if (braceDepth === 0) {
        currentChunk.endLine = i + 1;
        chunks.push(currentChunk);
        currentChunk = null;
      }
      continue;
    }

    // If we're in a chunk, accumulate code
    if (currentChunk) {
      currentChunk.code += '\n' + line;
      braceDepth += openBraces - closeBraces;

      // Check for chunk end
      if (braceDepth <= 0) {
        currentChunk.endLine = i + 1;

        // Split oversized chunks
        const chunkLines = currentChunk.code.split('\n').length;
        if (chunkLines > MAX_CHUNK_LINES) {
          // Split into smaller chunks
          const splitChunks = splitLargeChunk(currentChunk);
          chunks.push(...splitChunks);
        } else {
          chunks.push(currentChunk);
        }

        // Reset if we were tracking a class
        if (currentChunk.type === 'class') {
          inClass = false;
          className = null;
        }

        currentChunk = null;
        braceDepth = 0;
      }
    }
  }

  // Handle unclosed chunk (syntax error in code)
  if (currentChunk) {
    currentChunk.endLine = lines.length;
    currentChunk.code = currentChunk.code.slice(0, 10000); // Limit size
    chunks.push(currentChunk);
  }

  return chunks;
}

/**
 * Split a large chunk into smaller pieces
 */
function splitLargeChunk(chunk) {
  const lines = chunk.code.split('\n');
  const chunks = [];
  let currentLines = [];
  let currentStartLine = chunk.startLine;

  for (let i = 0; i < lines.length; i++) {
    currentLines.push(lines[i]);

    if (currentLines.length >= MAX_CHUNK_LINES) {
      chunks.push({
        ...chunk,
        startLine: currentStartLine,
        endLine: currentStartLine + currentLines.length - 1,
        code: currentLines.join('\n'),
        functionName: chunk.functionName + `_part${chunks.length + 1}`
      });
      currentStartLine = chunk.startLine + i + 1;
      currentLines = [];
    }
  }

  // Add remaining lines
  if (currentLines.length > 0) {
    chunks.push({
      ...chunk,
      startLine: currentStartLine,
      endLine: currentStartLine + currentLines.length - 1,
      code: currentLines.join('\n'),
      functionName: chunks.length > 0 ? chunk.functionName + `_part${chunks.length + 1}` : chunk.functionName
    });
  }

  return chunks;
}

/**
 * Get supported file extensions
 */
function getSupportedExtensions() {
  return ['.js', '.ts', '.jsx', '.tsx', '.mjs', '.cjs'];
}

/**
 * Check if a file should be chunked based on extension
 */
function shouldChunk(filePath) {
  const ext = filePath.substring(filePath.lastIndexOf('.')).toLowerCase();
  return getSupportedExtensions().includes(ext);
}

module.exports = {
  chunkCode,
  shouldChunk,
  getSupportedExtensions,
  isBinaryFile
};
