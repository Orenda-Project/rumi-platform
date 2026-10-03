/**
 * GET /api/portal/channels: does this deployment run WhatsApp, and where do
 * "chat with Rumi" links go.
 *
 * The landing page and the portal used to say "through WhatsApp" and link to
 * one WhatsApp chat on every deployment, including those that run no WhatsApp
 * at all (CHANNEL_DRIVER=none: Slack, Discord, Matrix or Rumi Messenger only).
 * The portal now asks the dashboard. The dashboard ships without bot/, so it
 * carries its own copy of the bot's channel rule; the parity test below keeps
 * the two from drifting apart.
 *
 * The route is booted for real (express + the real portal router); only the
 * database client is faked.
 */

const fs = require('fs');
const http = require('http');
const { createRequire } = require('module');
const path = require('path');

const DASHBOARD = path.join(__dirname, '../../dashboard');

jest.mock('../../dashboard/config/supabase', () => ({ from: () => ({}) }));

const { portalChannels, hasWhatsApp } = require('../../dashboard/lib/portal-channels');
const { resolveChannelDriver } = require('../../bot/shared/config/feature-availability');

const ENV_KEYS = ['CHANNEL_DRIVER', 'PORTAL_CHAT_URL', 'WHATSAPP_TOKEN'];

describe('portalChannels (env -> what the portal shows)', () => {
  test('CHANNEL_DRIVER=none: no WhatsApp', () => {
    expect(portalChannels({ CHANNEL_DRIVER: 'none' })).toEqual({ whatsapp: false, chatUrl: null });
  });

  test('unset: WhatsApp, the default driver', () => {
    expect(portalChannels({})).toEqual({ whatsapp: true, chatUrl: null });
  });

  test.each(['meta', 'baileys', ' Meta '])('CHANNEL_DRIVER=%s: WhatsApp', (driver) => {
    expect(portalChannels({ CHANNEL_DRIVER: driver }).whatsapp).toBe(true);
  });

  test.each(['slack', 'discord', 'matrix'])('CHANNEL_DRIVER=%s as the only channel: no WhatsApp', (driver) => {
    expect(portalChannels({ CHANNEL_DRIVER: driver }).whatsapp).toBe(false);
  });

  test('PORTAL_CHAT_URL is passed through when it is a web link, and ignored otherwise', () => {
    expect(portalChannels({ CHANNEL_DRIVER: 'none', PORTAL_CHAT_URL: ' https://chat.example.org/rumi ' }))
      .toEqual({ whatsapp: false, chatUrl: 'https://chat.example.org/rumi' });
    for (const bad of ['javascript:alert(1)', 'chat.example.org', '', '   ']) {
      expect(portalChannels({ PORTAL_CHAT_URL: bad }).chatUrl).toBeNull();
    }
  });

  test('agrees with the bot on which drivers are WhatsApp', () => {
    const envs = [{}, { WHATSAPP_TOKEN: 'EAAG-fictional' }, { CHANNEL_DRIVER: 'typo' }]
      .concat(['meta', 'baileys', 'slack', 'discord', 'matrix', 'none', 'NONE', ''].map((d) => ({ CHANNEL_DRIVER: d })));
    for (const env of envs) {
      expect([env, hasWhatsApp(env)]).toEqual([env, ['meta', 'baileys'].includes(resolveChannelDriver(env))]);
    }
  });
});

// Booting the real router needs the dashboard's own dependencies (CI installs them).
const HAVE_DASHBOARD_DEPS = fs.existsSync(path.join(DASHBOARD, 'node_modules', 'express-rate-limit'));
const RUN = HAVE_DASHBOARD_DEPS || Boolean(process.env.CI);
if (!RUN) console.warn('portal-channels: route test skipped — run `cd dashboard && npm ci`.');

(RUN ? describe : describe.skip)('GET /api/portal/channels (real portal router)', () => {
  let server;
  const saved = {};

  beforeAll(async () => {
    const express = createRequire(path.join(DASHBOARD, 'package.json'))('express');
    const app = express();
    app.use('/api/portal', require('../../dashboard/routes/portal.routes'));
    server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
    for (const k of ENV_KEYS) saved[k] = process.env[k];
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  afterAll(() => new Promise((resolve) => server.close(resolve)));

  const get = () => new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port: server.address().port, path: '/api/portal/channels' }, (res) => {
      let text = '';
      res.on('data', (c) => { text += c; });
      res.on('end', () => {
        let body = text;
        try { body = JSON.parse(text); } catch { /* not JSON: keep the text */ }
        resolve({ status: res.statusCode, body });
      });
    }).on('error', reject);
  });

  test('CHANNEL_DRIVER=none: whatsapp false, no sign-in needed', async () => {
    process.env.CHANNEL_DRIVER = 'none';
    delete process.env.PORTAL_CHAT_URL;
    expect(await get()).toEqual({ status: 200, body: { whatsapp: false, chatUrl: null } });
  });

  test('CHANNEL_DRIVER unset: whatsapp true', async () => {
    delete process.env.CHANNEL_DRIVER;
    delete process.env.PORTAL_CHAT_URL;
    delete process.env.WHATSAPP_TOKEN;
    expect(await get()).toEqual({ status: 200, body: { whatsapp: true, chatUrl: null } });
  });

  test('PORTAL_CHAT_URL is the chat link', async () => {
    process.env.CHANNEL_DRIVER = 'none';
    process.env.PORTAL_CHAT_URL = 'https://chat.example.org/rumi';
    expect((await get()).body).toEqual({ whatsapp: false, chatUrl: 'https://chat.example.org/rumi' });
  });
});
