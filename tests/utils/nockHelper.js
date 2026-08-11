/**
 * Test helpers shared by the S3 and Swift test suites.
 */

/**
 * Keep a mock's `content-length` header in sync with the body it actually replies.
 *
 * nock@14 (rewritten on top of `@mswjs/interceptors`) streams exactly the number of bytes
 * declared by the mock's `content-length` header. nock@13 recomputed/ignored it, so the
 * captured header dumps used as fixtures could declare any value. Since nock@14 a stale
 * value truncates the payload and the socket is aborted ("Error: aborted").
 *
 * The headers object is mutated in place, and returned for convenience, so assertions
 * comparing the response headers against the same fixture object stay valid.
 *
 * @param  {Object}                headers the reply headers of the mock
 * @param  {String|Buffer|Object}  body    the body replied by the mock (objects are JSON stringified)
 * @return {Object}                the same `headers` object, with a correct `content-length`
 */
function syncContentLength (headers, body) {
  const _payload = (typeof body === 'string' || Buffer.isBuffer(body)) ? body : JSON.stringify(body);
  headers['content-length'] = String(Buffer.byteLength(_payload));
  return headers;
}

module.exports = {
  syncContentLength
};
