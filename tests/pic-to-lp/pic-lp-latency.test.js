/**
 * Pic-LP latency service — RPC wrapper + cache; returns null on error, shapes
 * the row on success.
 */

let PicLpLatency;
let rpcImpl;

function load() {
  jest.resetModules();
  rpcImpl = jest.fn();
  jest.doMock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
  jest.doMock('../../bot/shared/config/supabase', () => ({ rpc: rpcImpl }));
  PicLpLatency = require('../../bot/shared/services/pic-to-lp/pic-lp-latency.service');
}

beforeEach(load);
afterEach(() => jest.resetModules());

describe('getStats', () => {
  it('returns null for a falsy source (no RPC call)', async () => {
    expect(await PicLpLatency.getStats('')).toBeNull();
    expect(rpcImpl).not.toHaveBeenCalled();
  });

  it('shapes p50/p90/sample_size from the RPC row', async () => {
    rpcImpl.mockResolvedValue({ data: [{ p50_ms: 90000, p90_ms: 180000, sample_size: 12 }], error: null });
    const r = await PicLpLatency.getStats('pic_to_lp_kieai');
    expect(r).toEqual({ p50_ms: 90000, p90_ms: 180000, sample_size: 12 });
  });

  it('returns null on an RPC error', async () => {
    rpcImpl.mockResolvedValue({ data: null, error: { message: 'boom' } });
    expect(await PicLpLatency.getStats('gamma_standard')).toBeNull();
  });

  it('returns null when the RPC throws', async () => {
    rpcImpl.mockRejectedValue(new Error('connection refused'));
    expect(await PicLpLatency.getStats('pic_to_lp_kieai')).toBeNull();
  });

  it('caches a successful result (second call does not re-hit the RPC)', async () => {
    rpcImpl.mockResolvedValue({ data: [{ p50_ms: 1, p90_ms: 2, sample_size: 3 }], error: null });
    await PicLpLatency.getStats('src');
    await PicLpLatency.getStats('src');
    expect(rpcImpl).toHaveBeenCalledTimes(1);
    PicLpLatency.clearCache();
    await PicLpLatency.getStats('src');
    expect(rpcImpl).toHaveBeenCalledTimes(2);
  });
});
