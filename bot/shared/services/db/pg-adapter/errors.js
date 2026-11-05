/**
 * Maps anything that can go wrong in the adapter to the { message, details,
 * hint, code } object and HTTP status PostgREST would have produced, so code
 * that checks error.code ('PGRST116', '23505', '42703', …) keeps working.
 */

const STATUS_BY_CODE = {
  PGRST100: 400,
  PGRST116: 406,
  PGRST200: 400,
  PGRST201: 300,
  PGRST202: 404,
  PGRST204: 400,
  23503: 409,
  23505: 409,
  '42P01': 404,
  42883: 404,
  42501: 403,
};

const STATUS_TEXT = {
  0: '',
  200: 'OK',
  201: 'Created',
  204: 'No Content',
  300: 'Multiple Choices',
  400: 'Bad Request',
  403: 'Forbidden',
  404: 'Not Found',
  406: 'Not Acceptable',
  409: 'Conflict',
};

const SQLSTATE_RE = /^[0-9A-Z]{5}$/;

class AdapterError extends Error {
  /**
   * @param {string} code PostgREST code (PGRSTnnn)
   * @param {string} message
   * @param {string|null} [details]
   */
  constructor(code, message, details = null) {
    super(message);
    this.name = 'AdapterError';
    this.code = code;
    this.details = details;
  }
}

/**
 * @param {unknown} err
 * @returns {{ error: {message: string, details: string|null, hint: string|null, code: string}, status: number }}
 */
function toPostgrestError(err) {
  const e = err instanceof Error ? err : new Error(String(err));
  const code = typeof e.code === 'string' ? e.code : '';
  const isDatabaseOrAdapterError = code.startsWith('PGRST') || (SQLSTATE_RE.test(code) && 'severity' in e);

  if (!isDatabaseOrAdapterError) {
    // Connection refused, pool exhausted, … — supabase-js reports fetch
    // failures the same way: status 0, empty code, the cause in message.
    // No stack in details: error objects can reach API responses.
    return { error: { message: e.message, details: null, hint: '', code: '' }, status: 0 };
  }
  return {
    error: {
      message: e.message,
      details: e.details ?? e.detail ?? null,
      hint: e.hint ?? null,
      code,
    },
    status: STATUS_BY_CODE[code] || 400,
  };
}

const statusText = (status) => STATUS_TEXT[status] ?? '';

module.exports = { AdapterError, statusText, toPostgrestError };
