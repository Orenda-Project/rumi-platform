/**
 * asyncRoute -- forward a rejected promise to express instead of losing it.
 *
 * Express 5 does forward rejections from async handlers, but being explicit here
 * keeps the behaviour the same if this ever runs against the express 4 copy in an
 * older checkout, where an unhandled rejection would hang the request.
 *
 * @module onboarding/async-route
 */

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

module.exports = { asyncRoute };
