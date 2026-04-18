/**
 * anthropic_client.js — Claude access (OpenRouter primary, native fallback).
 *
 * Mirrors gemini_client.js. The direct Anthropic key may run out of credits;
 * OpenRouter bills separately and tends to be more reliable for ad-hoc volume.
 *
 * Supports:
 *   - model: 'claude-sonnet-4-5' | 'claude-haiku-4-5' | 'claude-opus-4-5' etc.
 *     (native Anthropic IDs; OpenRouter path prefixes with 'anthropic/')
 *   - tool-use via OpenAI-compatible `tools` + `tool_choice` through OpenRouter
 *   - system prompt + user messages
 *   - usage metadata
 */

const Anthropic = require('@anthropic-ai/sdk');

const PREFER = process.env.OPENROUTER_API_KEY ? 'openrouter' : 'anthropic';

/**
 * Unified call signature:
 *   await callClaude({
 *     model: 'claude-sonnet-4-5',
 *     system: '...',
 *     userText: '...',
 *     tools: [{ name, description, input_schema }],        // optional
 *     toolChoice: { type: 'tool', name: 'emit_xxx' },       // optional
 *     maxTokens: 4096, temperature: 0.1,
 *   })
 *
 * Returns: { toolInput, text, usage, model }
 *   toolInput: the structured arguments the model called the tool with (if tools set)
 *   text: the text response (if no tools)
 */
async function callClaudeViaOpenRouter(opts) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const orModel = opts.model.startsWith('anthropic/') ? opts.model : `anthropic/${opts.model}`;
  const body = {
    model: orModel,
    messages: [
      ...(opts.system ? [{ role: 'system', content: opts.system }] : []),
      { role: 'user', content: opts.userText },
    ],
    temperature: opts.temperature ?? 0.1,
    max_tokens: opts.maxTokens ?? 4096,
  };
  if (opts.tools && opts.tools.length) {
    // Convert Anthropic tool format to OpenAI-compatible
    body.tools = opts.tools.map(t => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.input_schema,
      },
    }));
    if (opts.toolChoice) {
      body.tool_choice = opts.toolChoice.type === 'tool'
        ? { type: 'function', function: { name: opts.toolChoice.name } }
        : opts.toolChoice;
    }
  }

  const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://github.com/Orenda-Project/rumi-platform',
      'X-Title': 'rumi-pipeline',
    },
    body: JSON.stringify(body),
  });
  const respText = await resp.text();
  if (!resp.ok) {
    const err = new Error(`OpenRouter ${orModel} HTTP ${resp.status}: ${respText.substring(0, 300)}`);
    err.status = resp.status;
    throw err;
  }
  const j = JSON.parse(respText);
  const message = j.choices?.[0]?.message;
  if (!message) throw new Error(`OpenRouter ${orModel}: no message`);

  // Tool use path
  const toolCall = message.tool_calls?.[0];
  if (toolCall) {
    return {
      toolInput: JSON.parse(toolCall.function.arguments),
      toolName: toolCall.function.name,
      text: message.content || '',
      usage: j.usage || {},
      model: `${orModel} (openrouter)`,
    };
  }

  return {
    toolInput: null,
    toolName: null,
    text: message.content || '',
    usage: j.usage || {},
    model: `${orModel} (openrouter)`,
  };
}

async function callClaudeNative(opts) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const params = {
    model: opts.model,
    max_tokens: opts.maxTokens ?? 4096,
    messages: [{ role: 'user', content: opts.userText }],
    ...(opts.system ? { system: opts.system } : {}),
    ...(opts.tools ? { tools: opts.tools } : {}),
    ...(opts.toolChoice ? { tool_choice: opts.toolChoice } : {}),
  };
  const resp = await client.messages.create(params);
  const toolUse = resp.content.find(b => b.type === 'tool_use');
  const textBlock = resp.content.find(b => b.type === 'text');
  return {
    toolInput: toolUse ? toolUse.input : null,
    toolName: toolUse ? toolUse.name : null,
    text: textBlock ? textBlock.text : '',
    usage: resp.usage,
    model: `${opts.model} (native)`,
  };
}

async function callClaude(opts) {
  try {
    return PREFER === 'openrouter' ? await callClaudeViaOpenRouter(opts) : await callClaudeNative(opts);
  } catch (err) {
    if (!/429|quota|rate|credit|billing/i.test(err.message)) throw err;
    const other = PREFER === 'openrouter' ? 'anthropic' : 'openrouter';
    console.warn(`  [anthropic_client] ${PREFER} failed (${err.message.substring(0, 80)}); falling back to ${other}`);
    return other === 'openrouter' ? await callClaudeViaOpenRouter(opts) : await callClaudeNative(opts);
  }
}

module.exports = { callClaude, callClaudeViaOpenRouter, callClaudeNative, PREFER };
