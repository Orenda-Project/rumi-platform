/**
 * Axios mock for OSS test suite.
 * axios is a runtime dependency in bot/node_modules but not the root, and the
 * root test job runs before bot deps install — so source files that require
 * 'axios' (e.g. whatsapp.service) can't resolve it. This lightweight stub lets
 * them load; tests configure axios.post/get per case (mockResolvedValue, etc.).
 */

const respond = () => Promise.resolve({ data: {}, status: 200 });

const axios = jest.fn(respond);
axios.request = jest.fn(respond);
axios.get = jest.fn(respond);
axios.post = jest.fn(respond);
axios.put = jest.fn(respond);
axios.patch = jest.fn(respond);
axios.delete = jest.fn(respond);
axios.head = jest.fn(respond);
axios.create = jest.fn(() => axios);
axios.defaults = { headers: { common: {} } };
axios.interceptors = {
  request: { use: jest.fn(), eject: jest.fn() },
  response: { use: jest.fn(), eject: jest.fn() },
};
axios.isAxiosError = jest.fn(() => false);

module.exports = axios;
module.exports.default = axios;
