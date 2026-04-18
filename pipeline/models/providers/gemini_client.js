/**
 * gemini_client.js — unified Gemini access (OpenRouter primary, native fallback).
 *
 * Free-tier Gemini has a hard 20 req/day cap on gemini-2.5-flash. OpenRouter
 * proxies Gemini pay-as-you-go with no daily cap. Both stages that call Gemini
 * go through this module so the entire pipeline benefits from one swap.
 *
 * Usage:
 *   const { callGemini } = require('../models/providers/gemini_client');
 *   const { json, usage, model } = await callGemini({
 *     model: 'gemini-2.5-flash',
 *     text: 'system+user prompt',
 *     imageBase64: optional,
 *     jsonSchema: <OpenAI json_schema object>,  // optional
 *   });
 */

const fs = require('fs');
const { GoogleGenerativeAI, SchemaType } = require('@google/generative-ai');

const PREFER = process.env.OPENROUTER_API_KEY ? 'openrouter' : 'native';

async function callGeminiViaOpenRouter({ model, text, imageBase64, jsonSchema, temperature = 0.1, maxTokens = 4096 }) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const orModel = model.startsWith('google/') ? model : `google/${model}`;
  const content = [{ type: 'text', text }];
  if (imageBase64) content.push({ type: 'image_url', image_url: { url: `data:image/png;base64,${imageBase64}` } });
  const body = {
    model: orModel,
    messages: [{ role: 'user', content }],
    temperature,
    max_tokens: maxTokens,
  };
  if (jsonSchema) body.response_format = { type: 'json_schema', json_schema: jsonSchema };

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
  const outText = j.choices?.[0]?.message?.content;
  if (!outText) throw new Error(`OpenRouter ${orModel}: no content in response`);
  return {
    json: jsonSchema ? JSON.parse(outText) : null,
    text: outText,
    usage: j.usage || {},
    model: `${orModel} (openrouter)`,
  };
}

async function callGeminiNative({ model, text, imageBase64, jsonSchema, temperature = 0.1, maxTokens = 4096 }) {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const modelInstance = genAI.getGenerativeModel({
    model,
    generationConfig: {
      temperature,
      maxOutputTokens: maxTokens,
      ...(jsonSchema ? {
        responseMimeType: 'application/json',
        // Convert OpenAI-style json_schema to Gemini SchemaType (shallow; caller
        // should pass Gemini-style schema via `geminiSchema` if differences matter).
      } : {}),
    },
  });
  const parts = [text];
  if (imageBase64) parts.push({ inlineData: { mimeType: 'image/png', data: imageBase64 } });
  const result = await modelInstance.generateContent(parts);
  const outText = result.response.text();
  return {
    json: jsonSchema ? JSON.parse(outText) : null,
    text: outText,
    usage: result.response.usageMetadata || {},
    model: `${model} (native)`,
  };
}

/**
 * Smart router with fallback.
 */
async function callGemini(opts) {
  try {
    return PREFER === 'openrouter' ? await callGeminiViaOpenRouter(opts) : await callGeminiNative(opts);
  } catch (err) {
    if (!/429|quota|rate/i.test(err.message) || err.status && err.status !== 429) throw err;
    const other = PREFER === 'openrouter' ? 'native' : 'openrouter';
    console.warn(`  [gemini_client] ${PREFER} rate-limited, falling back to ${other}`);
    return other === 'openrouter' ? await callGeminiViaOpenRouter(opts) : await callGeminiNative(opts);
  }
}

module.exports = { callGemini, callGeminiViaOpenRouter, callGeminiNative, PREFER };
