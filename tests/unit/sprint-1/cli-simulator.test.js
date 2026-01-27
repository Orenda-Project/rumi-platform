/**
 * Sprint 1 TDD: CLI Simulator Tests (bd-235)
 *
 * RED phase: Tests define the API contract for the CLI simulator
 * that allows local testing without WhatsApp.
 *
 * The simulator must:
 * - Accept text input and return bot responses
 * - Simulate the WhatsApp webhook payload structure
 * - Support /quit to exit
 */

const path = require('path');

const simulatorPath = path.resolve(
  __dirname,
  '../../../bot/scripts/simulate.js'
);

describe('CLI Simulator', () => {
  let simulator;

  beforeEach(() => {
    jest.resetModules();
    simulator = require(simulatorPath);
  });

  describe('module exports', () => {
    test('exports createSimulator function', () => {
      expect(typeof simulator.createSimulator).toBe('function');
    });

    test('exports simulateMessage function', () => {
      expect(typeof simulator.simulateMessage).toBe('function');
    });
  });

  describe('simulateMessage()', () => {
    test('creates a valid WhatsApp webhook payload from text input', () => {
      const payload = simulator.simulateMessage('Hello');
      expect(payload).toHaveProperty('object', 'whatsapp_business_account');
      expect(payload.entry).toBeDefined();
      expect(payload.entry[0].changes[0].value.messages[0].text.body).toBe('Hello');
    });

    test('includes a from phone number', () => {
      const payload = simulator.simulateMessage('Test');
      const message = payload.entry[0].changes[0].value.messages[0];
      expect(message.from).toBeDefined();
      expect(typeof message.from).toBe('string');
    });

    test('includes message timestamp', () => {
      const payload = simulator.simulateMessage('Test');
      const message = payload.entry[0].changes[0].value.messages[0];
      expect(message.timestamp).toBeDefined();
    });

    test('includes contact info', () => {
      const payload = simulator.simulateMessage('Test');
      const contacts = payload.entry[0].changes[0].value.contacts;
      expect(contacts).toBeDefined();
      expect(contacts[0].profile.name).toBeDefined();
    });
  });

  describe('isQuitCommand()', () => {
    test('returns true for /quit', () => {
      expect(simulator.isQuitCommand('/quit')).toBe(true);
    });

    test('returns true for /exit', () => {
      expect(simulator.isQuitCommand('/exit')).toBe(true);
    });

    test('returns false for normal messages', () => {
      expect(simulator.isQuitCommand('Hello')).toBe(false);
    });
  });
});
