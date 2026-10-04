/**
 * AMA (Ask Me Anything) Service - Open Source Version
 *
 * The AMA feature allows admins to query data using natural language.
 * In the open-source version, this uses safe parameterized queries
 * instead of the exec_sql RPC function (removed for security).
 *
 * For the full AMA feature with natural language SQL, you would need
 * to create a secure exec_sql function with proper guardrails.
 * See docs/customization.md for details.
 *
 * The conversation history (ama_conversations, ama_messages) is stored as
 * usual, so the page works: every question gets FEATURE_DISABLED_MESSAGE as
 * its answer until a query engine is plugged into processMessage.
 *
 * @license Apache-2.0
 */

const FEATURE_DISABLED_MESSAGE = 'The AMA (Ask Me Anything) feature requires additional database configuration for the open-source version. See docs/customization.md for setup instructions.';

/**
 * Process an AMA query (disabled in open-source by default)
 */
async function processAMAQuery(query, userId) {
  return {
    success: false,
    message: FEATURE_DISABLED_MESSAGE,
    type: 'feature_disabled'
  };
}

/**
 * Get query suggestions (disabled in open-source by default)
 */
async function getQuerySuggestions() {
  return {
    success: false,
    message: FEATURE_DISABLED_MESSAGE,
    suggestions: []
  };
}

// ---------------------------------------------------------------------------
// Answers (disabled in open-source by default)
// ---------------------------------------------------------------------------

/**
 * Answer a chat message as a stream of chunks for the /ama/chat SSE route:
 * { type: 'thinking' | 'text' | 'result' | 'error', content, ... }, then
 * { type: 'done', responseTime }. Here: the feature-disabled message.
 */
async function* processMessage(message, conversationHistory, userId) {
  yield { type: 'text', content: FEATURE_DISABLED_MESSAGE };
  yield { type: 'done', responseTime: 0 };
}

/** Tracer reports need the query engine too. */
async function generateTracerReport(userId) {
  return { error: FEATURE_DISABLED_MESSAGE, type: 'feature_disabled' };
}

// ---------------------------------------------------------------------------
// Conversation storage
// ---------------------------------------------------------------------------

const CONVERSATION_COLUMNS = 'id, user_id, title, created_at, updated_at, message_count';
const MESSAGE_COLUMNS = 'id, conversation_id, role, content, thinking_content, sql_query, query_result, '
  + 'chart_type, chart_image_url, response_time_ms, created_at';

/** An error the routes answer with its status instead of 500. */
function notFound(what) {
  const error = new Error(`${what} not found`);
  error.status = 404;
  return error;
}

/** Throw a Supabase error as an Error with its message. */
function check({ data, error }) {
  if (error) throw new Error(error.message || 'Database error');
  return data;
}

/**
 * The service over a Supabase client; the module itself is the service over
 * config/supabase.js (loaded on first use). Tests pass their own client.
 */
function createAmaService(options = {}) {
  function db() {
    const client = 'supabase' in options ? options.supabase : require('../config/supabase');
    if (!client) throw new Error('AMA needs the database: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
    return client;
  }

  /** The user's conversations, most recently active first. */
  async function getConversations(userId) {
    return check(await db().from('ama_conversations')
      .select(CONVERSATION_COLUMNS)
      .eq('user_id', userId)
      .eq('is_archived', false)
      .order('updated_at', { ascending: false }));
  }

  /** One of the user's conversations, or null if it is not theirs (or does not exist). */
  async function getConversation(conversationId, userId) {
    return check(await db().from('ama_conversations')
      .select(CONVERSATION_COLUMNS)
      .eq('id', conversationId)
      .eq('user_id', userId)
      .maybeSingle());
  }

  async function createConversation(userId) {
    return check(await db().from('ama_conversations')
      .insert({ user_id: userId })
      .select(CONVERSATION_COLUMNS)
      .single());
  }

  async function messagesOf(conversationId, limit) {
    if (!limit) {
      return check(await db().from('ama_messages')
        .select(MESSAGE_COLUMNS)
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true }));
    }
    // The latest `limit` messages, oldest first.
    const latest = check(await db().from('ama_messages')
      .select(MESSAGE_COLUMNS)
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(limit));
    return latest.reverse();
  }

  /**
   * A conversation's messages, oldest first (only the latest `limit` if given).
   * With `userId`, a conversation that is not theirs is a 404.
   */
  async function getMessages(conversationId, { userId, limit } = {}) {
    if (userId !== undefined && !(await getConversation(conversationId, userId))) {
      throw notFound('Conversation');
    }
    return messagesOf(conversationId, limit);
  }

  /** Delete one of the user's conversations and its messages. */
  async function deleteConversation(conversationId, userId) {
    if (!(await getConversation(conversationId, userId))) throw notFound('Conversation');
    check(await db().from('ama_messages').delete().eq('conversation_id', conversationId));
    check(await db().from('ama_conversations').delete().eq('id', conversationId).eq('user_id', userId));
  }

  /** Store one turn. The database triggers update the conversation's title and counters. */
  async function saveMessage({
    conversationId, role, content, thinkingContent = null, sqlQuery = null, queryResult = null,
    chartType = null, chartImageUrl = null, responseTimeMs = null, modelUsed = null,
  }) {
    return check(await db().from('ama_messages')
      .insert({
        conversation_id: conversationId,
        role,
        content,
        thinking_content: thinkingContent,
        sql_query: sqlQuery,
        query_result: queryResult,
        chart_type: chartType,
        chart_image_url: chartImageUrl,
        response_time_ms: responseTimeMs,
        model_used: modelUsed,
      })
      .select('id')
      .single());
  }

  /** Super admin: every conversation, most recent first, with its owner's username. */
  async function getAllConversationsAdmin(limit = 100, offset = 0) {
    const { data, error, count } = await db().from('ama_conversations')
      .select(CONVERSATION_COLUMNS, { count: 'exact' })
      .eq('is_archived', false)
      .order('updated_at', { ascending: false })
      .range(offset, offset + limit - 1);
    const rows = check({ data, error });
    const userIds = [...new Set(rows.map((c) => c.user_id))];
    const users = userIds.length
      ? check(await db().from('dashboard_users').select('id, username').in('id', userIds))
      : [];
    const usernames = new Map(users.map((u) => [u.id, u.username]));
    return {
      conversations: rows.map((c) => ({ ...c, username: usernames.get(c.user_id) || null })),
      total: count == null ? rows.length : count,
    };
  }

  /** Super admin: any conversation's messages. */
  async function getMessagesAdmin(conversationId) {
    return messagesOf(conversationId);
  }

  return {
    getConversations,
    getConversation,
    createConversation,
    getMessages,
    deleteConversation,
    saveMessage,
    getAllConversationsAdmin,
    getMessagesAdmin,
    processMessage,
    generateTracerReport,
  };
}

module.exports = {
  ...createAmaService(),
  createAmaService,
  processAMAQuery,
  getQuerySuggestions,
  FEATURE_DISABLED_MESSAGE,
};
