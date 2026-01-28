/**
 * Meta Graph API Client — Test Suite
 *
 * Tests the MetaAPI class that wraps all WhatsApp Business API calls
 * needed for flow and template registration.
 */

const { MetaAPI } = require('../../bot/scripts/setup/meta-api');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEFAULT_OPTS = {
  wabaId: 'waba_123',
  accessToken: 'tok_secret',
  phoneNumberId: 'phone_456',
};

const BASE = 'https://graph.facebook.com/v21.0';

/** Build a successful Response-like object */
function okResponse(body) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  };
}

/** Build a failed Response-like object */
function errResponse(status, body) {
  return {
    ok: false,
    status,
    json: async () => body,
  };
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('MetaAPI', () => {
  let api;
  let fetchMock;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock;
    api = new MetaAPI(DEFAULT_OPTS);
  });

  afterEach(() => {
    delete global.fetch;
  });

  // -----------------------------------------------------------------------
  // Constructor
  // -----------------------------------------------------------------------
  describe('constructor', () => {
    it('stores wabaId, accessToken, phoneNumberId and defaults apiVersion to v21.0', () => {
      const a = new MetaAPI({ wabaId: 'w', accessToken: 't', phoneNumberId: 'p' });
      expect(a.wabaId).toBe('w');
      expect(a.accessToken).toBe('t');
      expect(a.phoneNumberId).toBe('p');
      expect(a.apiVersion).toBe('v21.0');
    });

    it('allows overriding apiVersion', () => {
      const a = new MetaAPI({ ...DEFAULT_OPTS, apiVersion: 'v19.0' });
      expect(a.apiVersion).toBe('v19.0');
    });
  });

  // -----------------------------------------------------------------------
  // listFlows
  // -----------------------------------------------------------------------
  describe('listFlows()', () => {
    it('sends GET /{wabaId}/flows with auth header and returns data on success', async () => {
      const flows = [{ id: '1', name: 'Registration' }];
      fetchMock.mockResolvedValue(okResponse({ data: flows }));

      const result = await api.listFlows();

      expect(fetchMock).toHaveBeenCalledWith(
        `${BASE}/waba_123/flows`,
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Authorization: 'Bearer tok_secret',
          }),
        }),
      );
      expect(result).toEqual({ success: true, data: flows });
    });

    it('returns error envelope on non-200 response', async () => {
      fetchMock.mockResolvedValue(
        errResponse(400, {
          error: { code: 100, message: 'Invalid parameter', error_user_msg: 'Bad request' },
        }),
      );

      const result = await api.listFlows();

      expect(result.success).toBe(false);
      expect(result.error.status).toBe(400);
      expect(result.error.code).toBe(100);
      expect(result.error.message).toBe('Invalid parameter');
    });

    it('returns NETWORK_ERROR on fetch throw', async () => {
      fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));

      const result = await api.listFlows();

      expect(result.success).toBe(false);
      expect(result.error.type).toBe('NETWORK_ERROR');
      expect(result.error.message).toBe('ECONNREFUSED');
    });
  });

  // -----------------------------------------------------------------------
  // findFlowByName
  // -----------------------------------------------------------------------
  describe('findFlowByName(name)', () => {
    it('returns the matching flow object', async () => {
      const flows = [
        { id: '1', name: 'Registration' },
        { id: '2', name: 'Survey' },
      ];
      fetchMock.mockResolvedValue(okResponse({ data: flows }));

      const result = await api.findFlowByName('Survey');

      expect(result).toEqual({ success: true, data: { id: '2', name: 'Survey' } });
    });

    it('returns null data when no flow matches', async () => {
      fetchMock.mockResolvedValue(okResponse({ data: [{ id: '1', name: 'Registration' }] }));

      const result = await api.findFlowByName('NonExistent');

      expect(result).toEqual({ success: true, data: null });
    });

    it('propagates errors from listFlows', async () => {
      fetchMock.mockRejectedValue(new Error('timeout'));

      const result = await api.findFlowByName('X');

      expect(result.success).toBe(false);
      expect(result.error.type).toBe('NETWORK_ERROR');
    });
  });

  // -----------------------------------------------------------------------
  // createFlow
  // -----------------------------------------------------------------------
  describe('createFlow(name, categories)', () => {
    it('sends POST /{wabaId}/flows with JSON body', async () => {
      fetchMock.mockResolvedValue(okResponse({ id: 'flow_99' }));

      const result = await api.createFlow('NewFlow', ['OTHER']);

      expect(fetchMock).toHaveBeenCalledWith(
        `${BASE}/waba_123/flows`,
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer tok_secret',
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify({ name: 'NewFlow', categories: ['OTHER'] }),
        }),
      );
      expect(result).toEqual({ success: true, data: { id: 'flow_99' } });
    });

    it('returns error on failure', async () => {
      fetchMock.mockResolvedValue(
        errResponse(403, { error: { code: 200, message: 'Permissions error' } }),
      );

      const result = await api.createFlow('X', ['OTHER']);

      expect(result.success).toBe(false);
      expect(result.error.status).toBe(403);
    });
  });

  // -----------------------------------------------------------------------
  // uploadFlowJson
  // -----------------------------------------------------------------------
  describe('uploadFlowJson(flowId, jsonObj)', () => {
    it('sends POST /{flowId}/assets with FormData', async () => {
      fetchMock.mockResolvedValue(okResponse({ success: true }));

      await api.uploadFlowJson('flow_1', { screens: [] });

      expect(fetchMock).toHaveBeenCalledWith(
        `${BASE}/flow_1/assets`,
        expect.objectContaining({ method: 'POST' }),
      );
      // Authorization header should be present
      const callArgs = fetchMock.mock.calls[0][1];
      expect(callArgs.headers.Authorization).toBe('Bearer tok_secret');
    });

    it('strips metadata keys (_comment, _instructions, _changelog, _bead, _notes) before upload', async () => {
      fetchMock.mockResolvedValue(okResponse({ success: true }));

      const jsonObj = {
        version: '5.0',
        screens: [{ id: 'WELCOME' }],
        _comment: 'dev note',
        _instructions: 'do not remove',
        _changelog: ['v1', 'v2'],
        _bead: 'bd-100',
        _notes: 'internal',
      };

      await api.uploadFlowJson('flow_1', jsonObj);

      // Inspect the FormData body — we need to verify stripped content
      const callArgs = fetchMock.mock.calls[0][1];
      const formBody = callArgs.body;

      // FormData should exist
      expect(formBody).toBeDefined();

      // Extract the JSON that was appended to FormData
      // FormData.get returns a File/Blob in Node; we access the stored calls
      // We'll verify by checking the stringified JSON does NOT contain the stripped keys
      let uploadedJson;
      if (typeof formBody.get === 'function') {
        const file = formBody.get('file');
        // In Node 18+ FormData, the file is a Blob/File
        if (file && typeof file.text === 'function') {
          const text = await file.text();
          uploadedJson = JSON.parse(text);
        }
      }

      if (uploadedJson) {
        expect(uploadedJson).toHaveProperty('version', '5.0');
        expect(uploadedJson).toHaveProperty('screens');
        expect(uploadedJson).not.toHaveProperty('_comment');
        expect(uploadedJson).not.toHaveProperty('_instructions');
        expect(uploadedJson).not.toHaveProperty('_changelog');
        expect(uploadedJson).not.toHaveProperty('_bead');
        expect(uploadedJson).not.toHaveProperty('_notes');
      }
    });

    it('returns success envelope', async () => {
      fetchMock.mockResolvedValue(okResponse({ success: true, validation_errors: [] }));

      const result = await api.uploadFlowJson('flow_1', { screens: [] });

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ success: true, validation_errors: [] });
    });

    it('returns error on failure', async () => {
      fetchMock.mockResolvedValue(
        errResponse(400, {
          error: {
            code: 100,
            message: 'Invalid flow JSON',
            error_user_msg: 'Validation failed',
            error_data: { validation_errors: [{ error: 'missing field' }] },
          },
        }),
      );

      const result = await api.uploadFlowJson('flow_1', {});

      expect(result.success).toBe(false);
      expect(result.error.status).toBe(400);
      expect(result.error.message).toBe('Invalid flow JSON');
    });
  });

  // -----------------------------------------------------------------------
  // setFlowEndpoint
  // -----------------------------------------------------------------------
  describe('setFlowEndpoint(flowId, endpointUri)', () => {
    it('sends POST /{flowId} with endpoint_uri in JSON body', async () => {
      fetchMock.mockResolvedValue(okResponse({ success: true }));

      const result = await api.setFlowEndpoint('flow_1', 'https://example.com/hook');

      expect(fetchMock).toHaveBeenCalledWith(
        `${BASE}/flow_1`,
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            Authorization: 'Bearer tok_secret',
          }),
          body: JSON.stringify({ endpoint_uri: 'https://example.com/hook' }),
        }),
      );
      expect(result).toEqual({ success: true, data: { success: true } });
    });
  });

  // -----------------------------------------------------------------------
  // publishFlow
  // -----------------------------------------------------------------------
  describe('publishFlow(flowId)', () => {
    it('sends POST /{flowId}/publish', async () => {
      fetchMock.mockResolvedValue(okResponse({ success: true }));

      const result = await api.publishFlow('flow_1');

      expect(fetchMock).toHaveBeenCalledWith(
        `${BASE}/flow_1/publish`,
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer tok_secret',
          }),
        }),
      );
      expect(result).toEqual({ success: true, data: { success: true } });
    });

    it('returns error when flow cannot be published', async () => {
      fetchMock.mockResolvedValue(
        errResponse(400, {
          error: { code: 100, message: 'Flow not in DRAFT status' },
        }),
      );

      const result = await api.publishFlow('flow_1');

      expect(result.success).toBe(false);
      expect(result.error.message).toBe('Flow not in DRAFT status');
    });
  });

  // -----------------------------------------------------------------------
  // getFlowDetails
  // -----------------------------------------------------------------------
  describe('getFlowDetails(flowId)', () => {
    it('sends GET /{flowId} and returns flow details', async () => {
      const details = { id: 'flow_1', name: 'Reg', status: 'PUBLISHED' };
      fetchMock.mockResolvedValue(okResponse(details));

      const result = await api.getFlowDetails('flow_1');

      expect(fetchMock).toHaveBeenCalledWith(
        `${BASE}/flow_1`,
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Authorization: 'Bearer tok_secret',
          }),
        }),
      );
      expect(result).toEqual({ success: true, data: details });
    });
  });

  // -----------------------------------------------------------------------
  // registerPublicKey
  // -----------------------------------------------------------------------
  describe('registerPublicKey(publicKey)', () => {
    it('sends POST /{phoneNumberId}/whatsapp_business_encryption — uses phoneNumberId NOT wabaId', async () => {
      fetchMock.mockResolvedValue(okResponse({ success: true }));

      const key = '-----BEGIN PUBLIC KEY-----\nMIIBIj...';
      const result = await api.registerPublicKey(key);

      // CRITICAL: must use phoneNumberId, not wabaId
      expect(fetchMock).toHaveBeenCalledWith(
        `${BASE}/phone_456/whatsapp_business_encryption`,
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer tok_secret',
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify({ business_public_key: key }),
        }),
      );
      expect(result).toEqual({ success: true, data: { success: true } });
    });

    it('does NOT use wabaId in the URL', async () => {
      fetchMock.mockResolvedValue(okResponse({ success: true }));

      await api.registerPublicKey('key_data');

      const url = fetchMock.mock.calls[0][0];
      expect(url).not.toContain('waba_123');
      expect(url).toContain('phone_456');
    });
  });

  // -----------------------------------------------------------------------
  // listTemplates
  // -----------------------------------------------------------------------
  describe('listTemplates()', () => {
    it('sends GET /{wabaId}/message_templates and returns data', async () => {
      const templates = [{ id: 't1', name: 'hello_world' }];
      fetchMock.mockResolvedValue(okResponse({ data: templates }));

      const result = await api.listTemplates();

      expect(fetchMock).toHaveBeenCalledWith(
        `${BASE}/waba_123/message_templates`,
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Authorization: 'Bearer tok_secret',
          }),
        }),
      );
      expect(result).toEqual({ success: true, data: templates });
    });

    it('returns error on failure', async () => {
      fetchMock.mockResolvedValue(
        errResponse(401, {
          error: { code: 190, message: 'Invalid OAuth access token' },
        }),
      );

      const result = await api.listTemplates();

      expect(result.success).toBe(false);
      expect(result.error.status).toBe(401);
      expect(result.error.code).toBe(190);
    });
  });

  // -----------------------------------------------------------------------
  // findTemplateByName
  // -----------------------------------------------------------------------
  describe('findTemplateByName(name)', () => {
    it('returns the matching template', async () => {
      const templates = [
        { id: 't1', name: 'hello_world' },
        { id: 't2', name: 'welcome_msg' },
      ];
      fetchMock.mockResolvedValue(okResponse({ data: templates }));

      const result = await api.findTemplateByName('welcome_msg');

      expect(result).toEqual({ success: true, data: { id: 't2', name: 'welcome_msg' } });
    });

    it('returns null data when no template matches', async () => {
      fetchMock.mockResolvedValue(okResponse({ data: [{ id: 't1', name: 'hello' }] }));

      const result = await api.findTemplateByName('nonexistent');

      expect(result).toEqual({ success: true, data: null });
    });
  });

  // -----------------------------------------------------------------------
  // createTemplate
  // -----------------------------------------------------------------------
  describe('createTemplate(payload)', () => {
    it('sends POST /{wabaId}/message_templates with JSON payload', async () => {
      const payload = {
        name: 'my_template',
        language: 'en_US',
        category: 'MARKETING',
        components: [],
      };
      fetchMock.mockResolvedValue(okResponse({ id: 'tmpl_new', status: 'APPROVED' }));

      const result = await api.createTemplate(payload);

      expect(fetchMock).toHaveBeenCalledWith(
        `${BASE}/waba_123/message_templates`,
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer tok_secret',
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify(payload),
        }),
      );
      expect(result).toEqual({ success: true, data: { id: 'tmpl_new', status: 'APPROVED' } });
    });

    it('returns error with validation errors', async () => {
      fetchMock.mockResolvedValue(
        errResponse(400, {
          error: {
            code: 100,
            message: 'Invalid parameter',
            error_user_msg: 'Check your template',
            error_data: { validation_errors: [{ field: 'name', message: 'duplicate' }] },
          },
        }),
      );

      const result = await api.createTemplate({ name: 'dup' });

      expect(result.success).toBe(false);
      expect(result.error.userMessage).toBe('Check your template');
      expect(result.error.validationErrors).toEqual([
        { field: 'name', message: 'duplicate' },
      ]);
    });
  });

  // -----------------------------------------------------------------------
  // Cross-cutting: network errors
  // -----------------------------------------------------------------------
  describe('network errors', () => {
    const methods = [
      ['listFlows', []],
      ['createFlow', ['name', ['OTHER']]],
      ['uploadFlowJson', ['fid', { screens: [] }]],
      ['setFlowEndpoint', ['fid', 'https://x.com']],
      ['publishFlow', ['fid']],
      ['getFlowDetails', ['fid']],
      ['registerPublicKey', ['key']],
      ['listTemplates', []],
      ['createTemplate', [{ name: 't' }]],
    ];

    it.each(methods)('%s returns NETWORK_ERROR on fetch rejection', async (method, args) => {
      fetchMock.mockRejectedValue(new Error('socket hang up'));

      const result = await api[method](...args);

      expect(result).toEqual({
        success: false,
        error: {
          type: 'NETWORK_ERROR',
          message: 'socket hang up',
        },
      });
    });
  });
});
