const assert = require('assert');
const nock   = require('nock');
const http   = require('http');
const rock   = require('rock-req');
const { Writable, PassThrough } = require('stream');
const { throttleDelay, retryAfter, streamOutput } = require('../helper.js');
/** Required lazily: s3.test.js sets `global.rockReqConf` before index.js is loaded for the first time */
const storageSDK = (config) => require('../index.js')(config);

/**
 * v4.1.0 resilience: throttling (backoff on the same storage, then the next storage, never counted), failover after consecutive failures only,
 * probe of the main S3 storage, stream output safety, Keystone without token, caller options, redirects, storageClass.
 */
describe('Resilience', function () {
  const _realRandom = Math.random;
  const _realNow = Date.now;
  let _events = [];

  beforeEach(function () {
    /** Backoff delays of 0 ms (full jitter `random() * ...`): fast and deterministic tests */
    Math.random = () => 0;
    _events = [];
  });

  afterEach(function () {
    Math.random = _realRandom;
    Date.now = _realNow;
    nock.cleanAll();
  });

  const urls = ['https://s3-0.resilience.test', 'https://s3-1.resilience.test'];

  function createS3 (count, extra = {}) {
    const _storages = [];
    for (let i = 0; i < count; i++) {
      _storages.push({ accessKeyId: `key-${i}`, secretAccessKey: `secret-${i}`, url: urls[i], region: `region-${i}`, ...extra[i] });
    }
    const _s3 = storageSDK(_storages);
    _s3.setLogFunction((message, level, fields) => _events.push(fields?.event));
    return _s3;
  }

  function call (fn, ...args) {
    return new Promise((resolve) => fn(...args, (err, resp) => resolve({ err, resp })));
  }

  /** The probe of the main storage started at once by a switch, still down. Returns a wait for its end: no background request is left for the next test */
  function mockProbe () {
    const _scope = nock(urls[0]).get('/').delay(20).reply(500);
    return () => new Promise((resolve) => {
      const _timer = setInterval(() => {
        if (_scope.isDone() === true && _events.includes('storage_main_unavailable') === true) {
          clearInterval(_timer);
          resolve();
        }
      }, 5);
    });
  }

  const SLOW_DOWN = '<?xml version="1.0" encoding="UTF-8"?><Error><Code>SlowDown</Code><Message>Please reduce your request rate.</Message></Error>';
  const INTERNAL_ERROR = '<?xml version="1.0" encoding="UTF-8"?><Error><Code>InternalError</Code><Message>We encountered an internal error.</Message></Error>';
  const XML = { 'content-type': 'application/xml' };

  describe('helpers', function () {
    it('throttleDelay should use a full jitter capped at 20 s, and honour Retry-After up to 5 s more than the delay', function () {
      Math.random = () => 1;
      assert.strictEqual(throttleDelay(0, {}), 500);
      assert.strictEqual(throttleDelay(2, {}), 2000);
      assert.strictEqual(throttleDelay(10, {}), 20000);
      Math.random = () => 0.5;
      assert.strictEqual(throttleDelay(1, {}), 500);
      Math.random = () => 0;
      assert.strictEqual(throttleDelay(3, {}), 0);
      /** max(delay, min(retryAfter, delay + 5000)) */
      assert.strictEqual(throttleDelay(0, { 'retry-after': '2' }), 2000);
      assert.strictEqual(throttleDelay(0, { 'retry-after': '60' }), 5000);
      Math.random = () => 1;
      assert.strictEqual(throttleDelay(0, { 'retry-after': '60' }), 5500);
      assert.strictEqual(throttleDelay(3, { 'retry-after': '1' }), 4000);
    });

    it('retryAfter should read seconds or an HTTP-date, 0 if missing, invalid or past', function () {
      assert.strictEqual(retryAfter({ 'retry-after': '3' }), 3000);
      assert.strictEqual(retryAfter({}), 0);
      assert.strictEqual(retryAfter(undefined), 0);
      assert.strictEqual(retryAfter({ 'retry-after': 'soon' }), 0);
      assert.strictEqual(retryAfter({ 'retry-after': '-1' }), 0);
      assert.strictEqual(retryAfter({ 'retry-after': new Date(_realNow() - 10000).toUTCString() }), 0);
      const _ms = retryAfter({ 'retry-after': new Date(_realNow() + 10000).toUTCString() });
      assert.ok(_ms > 8000 && _ms <= 10000, `${_ms}`);
    });

  });

  describe('S3 throttling (T1)', function () {
    it('should log storage_unavailable when a 503 is still throttled on every storage, with one storage or several, as 4.0 did', async function () {
      for (const _count of [1, 2]) {
        _events = [];
        const _s3 = createS3(_count);
        for (let i = 0; i < _count; i++) {
          nock(urls[i]).get('/bucket/file.txt').times(2).reply(503, SLOW_DOWN, XML);
        }
        const { err } = await call(_s3.downloadFile, 'bucket', 'file.txt');
        assert.strictEqual(err.message, 'All S3 storages are not available | Throttled by the storage (slow down)');
        assert.strictEqual(err.code, 'SlowDown');
        assert.strictEqual(err.storageStatusCode, 503);
        assert.strictEqual(_events.filter((e) => e === 'storage_unavailable').length, 1, `${_count} storage(s): ${_events}`);
      }
    });

    it('should never retry without bound when maxThrottleRetry is changed on the storage object after setConfig (Infinity, a string)', async function () {
      for (const _value of [Infinity, '1e9', 'abc']) {
        const _s3 = createS3(1);
        _s3.getConfig().storages[0].maxThrottleRetry = _value;
        const _n = nock(urls[0]).get('/bucket/file.txt').times(2).reply(429, 'busy');
        const { resp } = await call(_s3.downloadFile, 'bucket', 'file.txt');
        assert.strictEqual(resp.statusCode, 429, String(_value));
        assert.ok(_n.isDone(), String(_value));
      }
    });

    it('should validate maxThrottleRetry like storageClass: an integer >= 0, else setConfig/setStorages throw (S3 and Swift)', function () {
      const _s3 = (value) => storageSDK([{ accessKeyId: 'k', secretAccessKey: 's', url: urls[0], region: 'r', maxThrottleRetry: value }]);
      const _swift = (value) => storageSDK([{ username: 'u', password: 'p', authUrl: 'https://auth.test/v3', region: 'R', maxThrottleRetry: value }]);
      for (const _valid of [undefined, 0, 3]) {
        assert.doesNotThrow(() => _s3(_valid));
        assert.doesNotThrow(() => _swift(_valid));
      }
      for (const _invalid of ['3', -1, 1.5, null, NaN, Infinity]) {
        assert.throws(() => _s3(_invalid), /S3 Storage "maxThrottleRetry" must be an integer >= 0/, String(_invalid));
        assert.throws(() => _swift(_invalid), /Swift Storage "maxThrottleRetry" must be an integer >= 0/, String(_invalid));
      }
    });

    it('should handle throttles as before 4.1 by default (maxThrottleRetry 0): a 429 returned after the quick retry of rock-req, a 503 SlowDown sent to the next storage', async function () {
      const _s3 = createS3(2);
      const _n429 = nock(urls[0]).get('/bucket/a.txt').times(2).reply(429, 'busy');
      const { resp } = await call(_s3.downloadFile, 'bucket', 'a.txt');
      assert.strictEqual(resp.statusCode, 429);
      assert.ok(_n429.isDone());
      const _n503 = nock(urls[0]).get('/bucket/b.txt').times(2).reply(503, SLOW_DOWN, XML);
      const _n1 = nock(urls[1]).get('/bucket/b.txt').reply(200, 'fallback');
      const { resp: _resp } = await call(_s3.downloadFile, 'bucket', 'b.txt');
      assert.strictEqual(_resp.body.toString(), 'fallback');
      assert.ok(_n503.isDone() && _n1.isDone());
      assert.strictEqual(_events.includes('storage_throttled'), false, 'no backoff retry by default');
    });

    it('should retry a 503 SlowDown on the same storage with a backoff after the quick retry of rock-req, without failover', async function () {
      const _s3 = createS3(2, [{ maxThrottleRetry: 3 }, { maxThrottleRetry: 3 }]);
      /** rock-req retries the 503 once (its defaults), then the client retries after a backoff */
      const _n0 = nock(urls[0]).get('/bucket/file.txt').times(2).reply(503, SLOW_DOWN, XML).get('/bucket/file.txt').reply(200, 'main');
      const _n1 = nock(urls[1]).get('/bucket/file.txt').reply(200, 'fallback');
      const { err, resp } = await call(_s3.downloadFile, 'bucket', 'file.txt');
      assert.strictEqual(err, null);
      assert.strictEqual(resp.body.toString(), 'main');
      assert.ok(_n0.isDone());
      assert.strictEqual(_n1.isDone(), false);
      assert.strictEqual(_s3.getConfig().activeStorage, 0);
      assert.deepStrictEqual(_events, ['storage_throttled']);
    });

    it('B3: a 503 still throttled after the retries is served by the next storage, counted as one failure (no switch below 3)', async function () {
      const _s3 = createS3(2, [{ maxThrottleRetry: 3 }, { maxThrottleRetry: 3 }]);
      /** 1 request + 3 backoff retries, each retried once by rock-req */
      const _n0 = nock(urls[0]).get('/bucket/file.txt').times(8).reply(503, SLOW_DOWN, XML);
      const _n1 = nock(urls[1]).get('/bucket/file.txt').reply(200, 'fallback');
      const { err, resp } = await call(_s3.downloadFile, 'bucket', 'file.txt');
      assert.strictEqual(err, null);
      assert.strictEqual(resp.body.toString(), 'fallback');
      assert.ok(_n0.isDone() && _n1.isDone());
      assert.strictEqual(_s3.getConfig().activeStorage, 0);
      assert.deepStrictEqual(_events, ['storage_throttled', 'storage_throttled', 'storage_throttled', 'storage_request_failed']);
    });

    it('B3: a 503 throttled on every storage returns the error of 4.0 (code SlowDown); a 429 is returned by the first storage, as in 4.0', async function () {
      const _s3 = createS3(2, [{ maxThrottleRetry: 0 }, { maxThrottleRetry: 0 }]);
      nock(urls[0]).get('/bucket/file.txt').times(2).reply(503, SLOW_DOWN, XML);
      nock(urls[1]).get('/bucket/file.txt').times(2).reply(503, SLOW_DOWN, XML);
      const { err, resp } = await call(_s3.downloadFile, 'bucket', 'file.txt');
      assert.strictEqual(resp, undefined);
      /** Starts with the message of 4.0: callers matching it keep working */
      assert.strictEqual(err.message, 'All S3 storages are not available | Throttled by the storage (slow down)');
      assert.strictEqual(err.storageStatusCode, 503);
      assert.strictEqual(err.code, 'SlowDown');
      assert.strictEqual(err.statusCode, undefined);
      /** The 503 above counted one failure of the main storage: a success resets it before the 429 */
      nock(urls[0]).get('/bucket/ok.txt').reply(200, 'ok');
      await call(_s3.downloadFile, 'bucket', 'ok.txt');
      const _n429 = nock(urls[0]).get('/bucket/file.txt').times(2).reply(429, 'busy');
      const _fallback = nock(urls[1]).get('/bucket/file.txt').reply(200, 'fallback');
      const { err: _err, resp: _resp } = await call(_s3.downloadFile, 'bucket', 'file.txt');
      assert.strictEqual(_err, null);
      assert.strictEqual(_resp.statusCode, 429);
      assert.strictEqual(_resp.body.toString(), 'busy');
      assert.ok(_n429.isDone());
      assert.strictEqual(_fallback.isDone(), false, 'a 429 is never sent to another storage');
      assert.strictEqual(_s3.getConfig().activeStorage, 0);
      const _single = createS3(1, [{ maxThrottleRetry: 1 }]);
      const _n = nock(urls[0]).get('/bucket/file.txt').times(4).reply(503, SLOW_DOWN, XML);
      const { err: _e } = await call(_single.downloadFile, 'bucket', 'file.txt');
      assert.strictEqual(_e.code, 'SlowDown');
      assert.ok(_n.isDone());
    });

    it('B2: a 503 still throttled after its retries counts as a failure: a storage throttling every request is left after 3 of them', async function () {
      const _s3 = createS3(2, [{ maxThrottleRetry: 0 }, {}]);
      nock(urls[1]).get('/bucket/file.txt').times(3).reply(200, 'fallback');
      for (const _status of [500, 503]) {
        if (_status === 503) {
          nock(urls[0]).get('/bucket/file.txt').times(2).reply(503, SLOW_DOWN, XML);
        } else {
          nock(urls[0]).get('/bucket/file.txt').reply(500);
        }
        const { resp } = await call(_s3.downloadFile, 'bucket', 'file.txt');
        assert.strictEqual(resp.body.toString(), 'fallback');
        assert.strictEqual(_s3.getConfig().activeStorage, 0);
      }
      nock(urls[0]).get('/bucket/file.txt').times(2).reply(503, SLOW_DOWN, XML);
      const _probeEnd = mockProbe();
      await call(_s3.downloadFile, 'bucket', 'file.txt');
      /** 3 consecutive failures (500, throttled 503, throttled 503): switched, as 4.0 did at the first 503 */
      assert.strictEqual(_s3.getConfig().activeStorage, 1);
      await _probeEnd();
      assert.strictEqual(_s3.getConfig().activeStorage, 1);
    });

    it('should return a 429 after "maxThrottleRetry" retries of the storage (0: no retry by the client, once by rock-req)', async function () {
      const _s3 = createS3(1, [{ maxThrottleRetry: 0 }]);
      const _n0 = nock(urls[0]).get('/bucket/file.txt').times(2).reply(429, 'Too Many Requests');
      const { err, resp } = await call(_s3.downloadFile, 'bucket', 'file.txt');
      assert.strictEqual(err, null);
      assert.strictEqual(resp.statusCode, 429);
      assert.ok(_n0.isDone());
      const _s3b = createS3(1, [{ maxThrottleRetry: 1 }]);
      const _n1 = nock(urls[0]).get('/bucket/file.txt').times(4).reply(429);
      const { resp: _resp } = await call(_s3b.downloadFile, 'bucket', 'file.txt');
      assert.strictEqual(_resp.statusCode, 429);
      assert.ok(_n1.isDone());
    });

    it('should honour a Retry-After on a 429', async function () {
      const _s3 = createS3(1, [{ maxThrottleRetry: 3 }]);
      /** A Retry-After above 2 s: rock-req does not retry, the client waits for it */
      nock(urls[0]).get('/bucket/file.txt').reply(429, '', { 'retry-after': '3' }).get('/bucket/file.txt').reply(200, 'ok');
      Math.random = () => 0;
      const _start = _realNow();
      this.timeout(6000);
      const { resp } = await call(_s3.downloadFile, 'bucket', 'file.txt');
      assert.strictEqual(resp.statusCode, 200);
      assert.ok(_realNow() - _start >= 2900, `${_realNow() - _start} ms`);
    });

    it('B1: a 503 without body (HEAD) is a server error: the main storage in an outage fails over, as in 4.0', async function () {
      const _s3 = createS3(2);
      /** rock-req retries the 503 once */
      const _n0 = nock(urls[0]).head('/bucket/file.txt').times(2).reply(503);
      const _n1 = nock(urls[1]).head('/bucket/file.txt').reply(200);
      const { err, resp } = await call(_s3.getFileMetadata, 'bucket', 'file.txt');
      assert.strictEqual(err, null);
      assert.strictEqual(resp.statusCode, 200);
      assert.ok(_n0.isDone() && _n1.isDone());
      assert.deepStrictEqual(_events, ['storage_request_failed']);
      const _single = createS3(1);
      nock(urls[0]).head('/bucket/file.txt').times(2).reply(503);
      const { err: _err } = await call(_single.getFileMetadata, 'bucket', 'file.txt');
      assert.strictEqual(_err.message, 'All S3 storages are not available');
      assert.strictEqual(_err.storageStatusCode, 503);
    });
  });

  describe('B2: rock-req retries as in 4.0, through the caller\'s rock.defaults', function () {
    const _defaults = { ...rock.defaults };
    let _servers = [];

    afterEach(function () {
      rock.defaults.maxRetry = _defaults.maxRetry;
      rock.defaults.beforeRequest = _defaults.beforeRequest;
      for (const _srv of _servers) {
        _srv.closeAllConnections();
        _srv.close();
      }
      _servers = [];
    });

    function listen (handler) {
      const _srv = http.createServer((req, res) => {
        req.resume();
        req.on('end', () => handler(req, res));
      });
      _servers.push(_srv);
      return new Promise((resolve) => _srv.listen(0, '127.0.0.1', () => resolve(_srv)));
    }

    for (const _status of [502, 503, 429]) {
      it(`should send the retry of a ${_status} of the primary egress proxy through the secondary one (beforeRequest of rock.defaults)`, async function () {
        const _hits = { primary: 0, secondary: 0 };
        const _secondary = await listen((req, res) => { _hits.secondary++; res.end('via secondary proxy'); });
        const _primary = await listen((req, res) => {
          _hits.primary++;
          res.writeHead(_status, _status === 503 ? { 'content-type': 'application/xml' } : {});
          res.end(_status === 503 ? SLOW_DOWN : 'Bad Gateway');
        });
        /** The egress failover of Carbone: a retry (remainingRetry < maxRetry) goes through the secondary proxy */
        rock.defaults.maxRetry = 1;
        rock.defaults.beforeRequest = (opts) => {
          if (opts.remainingRetry < opts.maxRetry) {
            opts.port = _secondary.address().port;
          }
          return opts;
        };
        const _s3 = storageSDK({ accessKeyId: 'key', secretAccessKey: 'secret', url: `http://127.0.0.1:${_primary.address().port}`, region: 'r' });
        _s3.setLogFunction((message, level, fields) => _events.push(fields?.event));
        const { err, resp } = await call(_s3.downloadFile, 'b', 'k');
        assert.strictEqual(err, null);
        assert.strictEqual(resp.body.toString(), 'via secondary proxy');
        assert.deepStrictEqual(_hits, { primary: 1, secondary: 1 });
        assert.deepStrictEqual(_events, []);
      });
    }

    it('should never change the retryOnCode of the shared rock-req defaults', async function () {
      const _retryOnCode = [...rock.defaults.retryOnCode];
      const _s3 = createS3(1);
      nock(urls[0]).get('/bucket/file.txt').times(2).reply(502);
      await call(_s3.downloadFile, 'bucket', 'file.txt');
      assert.deepStrictEqual(rock.defaults.retryOnCode, _retryOnCode);
      assert.ok(rock.defaults.retryOnCode.includes(503) && rock.defaults.retryOnCode.includes(429));
    });
  });

  describe('S3 failover (T2)', function () {
    it('should send the request to the next storage on a 500 (no retry on the same storage), without switching the active storage', async function () {
      const _s3 = createS3(2);
      const _n0 = nock(urls[0]).get('/bucket/file.txt').reply(500, INTERNAL_ERROR, XML);
      const _n1 = nock(urls[1]).get('/bucket/file.txt').reply(200, 'fallback');
      const { err, resp } = await call(_s3.downloadFile, 'bucket', 'file.txt');
      assert.strictEqual(err, null);
      assert.strictEqual(resp.body.toString(), 'fallback');
      assert.ok(_n0.isDone() && _n1.isDone());
      assert.strictEqual(_s3.getConfig().activeStorage, 0);
      assert.deepStrictEqual(_events, ['storage_request_failed']);
    });

    it('should switch the active storage after 3 consecutive failures, a success of the active storage resets the counter', async function () {
      const _s3 = createS3(2);
      nock(urls[1]).get('/bucket/file.txt').times(5).reply(200, 'fallback');
      for (const _status of [500, 500, 200, 500, 500]) {
        nock(urls[0]).get('/bucket/file.txt').reply(_status, 'main');
        await call(_s3.downloadFile, 'bucket', 'file.txt');
        assert.strictEqual(_s3.getConfig().activeStorage, 0);
      }
      /** A 502 is retried once by rock-req */
      nock(urls[0]).get('/bucket/file.txt').times(2).reply(502);
      const _probeEnd = mockProbe();
      const { resp } = await call(_s3.downloadFile, 'bucket', 'file.txt');
      assert.strictEqual(resp.body.toString(), 'fallback');
      assert.strictEqual(_s3.getConfig().activeStorage, 1);
      assert.strictEqual(_events.filter(e => e === 'storage_fallback').length, 1);
      await _probeEnd();
      assert.strictEqual(_s3.getConfig().activeStorage, 1);
    });

    it('should switch the active storage at once on a network error (already retried by rock-req)', async function () {
      const _s3 = createS3(2);
      nock(urls[0]).get('/bucket/file.txt').times(2).replyWithError(Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }));
      /** The switch probes the main storage at once, in the background: still down */
      const _probe = nock(urls[0]).get('/').delay(50).reply(500);
      nock(urls[1]).get('/bucket/file.txt').reply(200, 'fallback');
      const { resp } = await call(_s3.downloadFile, 'bucket', 'file.txt');
      assert.strictEqual(resp.body.toString(), 'fallback');
      assert.strictEqual(_s3.getConfig().activeStorage, 1);
      assert.deepStrictEqual(_events, ['storage_fallback']);
      await new Promise((resolve) => setTimeout(resolve, 150));
      assert.ok(_probe.isDone());
      assert.strictEqual(_s3.getConfig().activeStorage, 1);
      assert.deepStrictEqual(_events, ['storage_fallback', 'storage_main_unavailable']);
    });

    it('should return a 501 Not Implemented to the caller, without retry nor failover', async function () {
      const _s3 = createS3(2);
      const _n0 = nock(urls[0]).get('/bucket/file.txt').reply(501, '<Error><Code>NotImplemented</Code></Error>', XML);
      const _n1 = nock(urls[1]).get('/bucket/file.txt').reply(200, 'fallback');
      const { err, resp } = await call(_s3.downloadFile, 'bucket', 'file.txt');
      assert.strictEqual(err, null);
      assert.strictEqual(resp.statusCode, 501);
      assert.strictEqual(resp.body.error.code, 'NotImplemented');
      assert.ok(_n0.isDone());
      assert.strictEqual(_n1.isDone(), false);
      assert.deepStrictEqual(_events, []);
    });

    it('should treat a 503 with an error code other than a throttle as a server error, and keep the S3 code on the error (single storage)', async function () {
      const _s3 = createS3(1);
      /** rock-req retries the 503 once */
      const _n0 = nock(urls[0]).get('/bucket/file.txt').times(2).reply(503, '<Error><Code>ServiceUnavailable</Code></Error>', XML);
      const { err } = await call(_s3.downloadFile, 'bucket', 'file.txt');
      assert.strictEqual(err.message, 'All S3 storages are not available');
      assert.strictEqual(err.storageStatusCode, 503);
      assert.strictEqual(err.code, 'ServiceUnavailable');
      assert.strictEqual(err.statusCode, undefined);
      assert.ok(_n0.isDone());
    });

    it('should keep the 401 failover of S3: immediate switch', async function () {
      const _s3 = createS3(2);
      nock(urls[0]).get('/bucket/file.txt').reply(401);
      nock(urls[1]).get('/bucket/file.txt').reply(200, 'fallback');
      const _probeEnd = mockProbe();
      const { resp } = await call(_s3.downloadFile, 'bucket', 'file.txt');
      assert.strictEqual(resp.body.toString(), 'fallback');
      assert.strictEqual(_s3.getConfig().activeStorage, 1);
      await _probeEnd();
      assert.strictEqual(_s3.getConfig().activeStorage, 1);
    });
  });

  describe('S3 probe of the main storage (T3)', function () {
    let _now = 0;

    /** A 401 switches to the fallback at once: the next request (here the retry on the fallback) probes the main storage at once */
    async function failover (s3, probe) {
      nock(urls[0]).get('/bucket/file.txt').reply(401);
      nock(urls[1]).get('/bucket/file.txt').reply(200, 'fallback');
      const _probe = probe(nock(urls[0]).get('/'));
      await call(s3.downloadFile, 'bucket', 'file.txt');
      assert.strictEqual(_events[0], 'storage_fallback');
      return _probe;
    }

    function waitEvent (event, callback, count = 1) {
      const _timer = setInterval(() => {
        if (_events.filter((e) => e === event).length >= count) {
          clearInterval(_timer);
          callback();
        }
      }, 5);
    }

    beforeEach(function () {
      _now = _realNow();
      Date.now = () => _now;
    });

    it('should recover from a single network blip at once: the switch probes the main storage, the next requests use it again', async function () {
      const _s3 = createS3(2);
      /** Two resets (the request and the retry of rock-req): the storage is down, the active storage is switched at once */
      nock(urls[0]).get('/bucket/file.txt').times(2).replyWithError(Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' }));
      nock(urls[1]).get('/bucket/file.txt').reply(200, 'fallback');
      const _probe = nock(urls[0]).get('/').reply(200);
      const { resp } = await call(_s3.downloadFile, 'bucket', 'file.txt');
      assert.strictEqual(resp.body.toString(), 'fallback');
      await new Promise((resolve) => waitEvent('storage_main_restored', resolve));
      assert.ok(_probe.isDone());
      assert.strictEqual(_s3.getConfig().activeStorage, 0);
      assert.deepStrictEqual(_events, ['storage_fallback', 'storage_main_restored']);
      const _main = nock(urls[0]).get('/bucket/file.txt').times(2).reply(200, 'main');
      for (let i = 0; i < 2; i++) {
        const { resp: _resp } = await call(_s3.downloadFile, 'bucket', 'file.txt');
        assert.strictEqual(_resp.body.toString(), 'main');
      }
      assert.ok(_main.isDone());
    });

    it('should probe the main storage once right after the switch, then not before 60 s while it stays down', async function () {
      const _s3 = createS3(2);
      const _first = await failover(_s3, (scope) => scope.reply(500));
      await new Promise((resolve) => waitEvent('storage_main_unavailable', resolve));
      assert.ok(_first.isDone());
      const _probe = nock(urls[0]).get('/').reply(200);
      nock(urls[1]).get('/bucket/file.txt').times(3).reply(200, 'fallback');
      for (let i = 0; i < 3; i++) {
        await call(_s3.downloadFile, 'bucket', 'file.txt');
      }
      _now += 59000;
      await call(_s3.downloadFile, 'bucket', 'file.txt');
      assert.strictEqual(_probe.isDone(), false);
      _now += 1000;
      await new Promise((resolve) => {
        nock(urls[1]).get('/bucket/file.txt').reply(200, 'fallback');
        _s3.downloadFile('bucket', 'file.txt', () => waitEvent('storage_main_restored', resolve));
      });
      assert.ok(_probe.isDone());
      assert.strictEqual(_s3.getConfig().activeStorage, 0);
    });

    for (const _status of [429, 500, 503, 401]) {
      it(`should not restore the main storage on a ${_status}: the next probe after 60 s, then the delay doubles`, async function () {
        const _s3 = createS3(2);
        /** rock-req retries a 429 or a 503 once */
        const _times = _status === 429 || _status === 503 ? 2 : 1;
        await failover(_s3, (scope) => scope.times(_times).reply(_status));
        await new Promise((resolve) => waitEvent('storage_main_unavailable', resolve));
        assert.strictEqual(_s3.getConfig().activeStorage, 1);
        nock(urls[1]).get('/bucket/file.txt').times(4).reply(200, 'fallback');
        /** Second probe 60 s after the first one, still failing */
        nock(urls[0]).get('/').times(_times).reply(_status);
        _now += 60000;
        await new Promise((resolve) => _s3.downloadFile('bucket', 'file.txt', () => waitEvent('storage_main_unavailable', resolve, 2)));
        assert.strictEqual(_s3.getConfig().activeStorage, 1);
        /** Third probe after 120 s */
        const _probe = nock(urls[0]).get('/').reply(200);
        _now += 119000;
        await call(_s3.downloadFile, 'bucket', 'file.txt');
        assert.strictEqual(_probe.isDone(), false);
        _now += 1000;
        await new Promise((resolve) => _s3.downloadFile('bucket', 'file.txt', () => waitEvent('storage_main_restored', resolve)));
        assert.strictEqual(_s3.getConfig().activeStorage, 0);
      });
    }

    for (const _status of [403, 404, 204]) {
      it(`should restore the main storage on a ${_status} (credentials scoped to a bucket)`, async function () {
        const _s3 = createS3(2);
        const _probe = await failover(_s3, (scope) => scope.reply(_status));
        await new Promise((resolve) => waitEvent('storage_main_restored', resolve));
        assert.ok(_probe.isDone());
        assert.strictEqual(_s3.getConfig().activeStorage, 0);
      });
    }

    it('should send a single probe at a time', async function () {
      const _s3 = createS3(2);
      let _probes = 0;
      await failover(_s3, (scope) => scope.times(5).delay(100).reply(() => { _probes++; return [500]; }));
      nock(urls[1]).get('/bucket/file.txt').times(5).reply(200, 'fallback');
      await Promise.all([1, 2, 3, 4, 5].map(() => call(_s3.downloadFile, 'bucket', 'file.txt')));
      await new Promise((resolve) => waitEvent('storage_main_unavailable', resolve));
      assert.strictEqual(_probes, 1);
    });

    it('should keep a single probe in flight when it outlasts the probe delay (black-holed main storage)', async function () {
      const _probes = [];
      const _held = [];
      const _listen = (handler) => new Promise((resolve) => {
        const _srv = http.createServer(handler);
        _srv.listen(0, '127.0.0.1', () => resolve(_srv));
      });
      /** The main storage answers 401 (switch at once) and never answers the probe */
      const _main = await _listen((req, res) => {
        if (req.url === '/') {
          _probes.push(req.method);
          return _held.push(res);
        }
        res.writeHead(401);
        res.end();
      });
      const _fallback = await _listen((req, res) => res.end('fallback'));
      try {
        const _s3 = storageSDK([_main, _fallback].map((srv, i) => ({ accessKeyId: 'key', secretAccessKey: 'secret', url: `http://127.0.0.1:${srv.address().port}`, region: `r${i}` })));
        _s3.setLogFunction((message, level, fields) => _events.push(fields?.event));
        /** Longer than every probe delay below: the probe is still running when they expire */
        _s3.setTimeout(600000);
        const { resp } = await call(_s3.downloadFile, 'bucket', 'file.txt');
        assert.strictEqual(resp.body.toString(), 'fallback');
        assert.deepStrictEqual(_events, ['storage_fallback']);
        /** The switch sent the first probe at once: wait until the main storage holds it */
        await new Promise((resolve) => {
          const _timer = setInterval(() => _probes.length > 0 && (clearInterval(_timer), resolve()), 5);
        });
        for (let i = 0; i < 5; i++) {
          _now += 61000;
          const { resp: _resp } = await call(_s3.downloadFile, 'bucket', 'file.txt');
          assert.strictEqual(_resp.body.toString(), 'fallback');
        }
        /** Let any extra probe reach the main storage before counting */
        await new Promise((resolve) => setTimeout(resolve, 50));
        assert.deepStrictEqual(_probes, ['GET']);
        assert.strictEqual(_s3.getConfig().activeStorage, 1);
        assert.deepStrictEqual(_events, ['storage_fallback']);
      } finally {
        /** Answer the hanging probe at last and wait for its end: no socket, timer or log is left for the next test */
        _held.forEach((res) => res.writeHead(500).end());
        await new Promise((resolve) => waitEvent('storage_main_unavailable', resolve));
        _main.closeAllConnections();
        _fallback.closeAllConnections();
        await Promise.all([_main, _fallback].map((srv) => new Promise((resolve) => srv.close(resolve))));
      }
    });

    /** Wait for the end of a probe which logs nothing: nock marks it done when it is sent, its answer comes 20 ms later */
    function probeEnd (scope) {
      return new Promise((resolve) => {
        const _timer = setInterval(() => scope.isDone() === true && (clearInterval(_timer), setTimeout(resolve, 100)), 5);
      });
    }

    it('should discard a probe that ends after setConfig(): no log, the new configuration is unchanged', async function () {
      const _s3 = createS3(2);
      const _probe = await failover(_s3, (scope) => scope.delay(20).reply(500));
      _s3.setConfig(_s3.getConfig().storages.map((storage) => ({ ...storage })));
      await probeEnd(_probe);
      assert.deepStrictEqual(_events, ['storage_fallback']);
      assert.strictEqual(_s3.getConfig().activeStorage, 0);
    });

    it('should change nothing when a probe answers while the client is already back on the main storage (no storage_main_restored)', async function () {
      const _s3 = createS3(2);
      /** The fallback fails too (401): after the last storage, the main storage is active again while the probe is in flight */
      nock(urls[0]).get('/bucket/file.txt').reply(401);
      nock(urls[1]).get('/bucket/file.txt').reply(401);
      const _probe = nock(urls[0]).get('/').delay(20).reply(200);
      const { err } = await call(_s3.downloadFile, 'bucket', 'file.txt');
      assert.strictEqual(err.message, 'All S3 storages are not available');
      assert.strictEqual(_s3.getConfig().activeStorage, 0);
      await probeEnd(_probe);
      assert.deepStrictEqual(_events, ['storage_fallback', 'storage_fallback', 'storage_unavailable']);
      assert.strictEqual(_s3.getConfig().activeStorage, 0);
    });
  });

  describe('Stream output (T4)', function () {
    let _server = null;
    let _handler = null;

    before(function (done) {
      _server = http.createServer((req, res) => _handler(req, res));
      _server.listen(0, '127.0.0.1', done);
    });

    after(function (done) {
      _server.closeAllConnections();
      _server.close(done);
    });

    function localS3 (count) {
      const _url = `http://127.0.0.1:${_server.address().port}`;
      const _storages = [];
      for (let i = 0; i < count; i++) {
        _storages.push({ accessKeyId: 'key', secretAccessKey: 'secret', url: _url, region: `region-${i}`, buckets: { bucket: `bucket-${i}` } });
      }
      const _s3 = storageSDK(_storages);
      _s3.setLogFunction((message, level, fields) => _events.push(fields?.event));
      return _s3;
    }

    function sink (chunks, fail) {
      return new Writable({
        write (chunk, encoding, cb) {
          if (fail === true) {
            return cb(Object.assign(new Error('ENOSPC: no space left on device'), { code: 'ENOSPC' }));
          }
          chunks.push(chunk);
          cb();
        }
      });
    }

    it('should never write a 4xx/3xx/throttled body into the caller stream, and return it parsed', async function () {
      _handler = (req, res) => {
        if (req.url.endsWith('/missing')) {
          res.writeHead(404, { 'content-type': 'application/xml' });
          return res.end('<Error><Code>NoSuchKey</Code></Error>');
        }
        if (req.url.endsWith('/moved')) {
          res.writeHead(301, { 'content-type': 'application/xml', location: 'http://127.0.0.1:1/elsewhere' });
          return res.end('<Error><Code>PermanentRedirect</Code><Endpoint>s3.other.test</Endpoint></Error>');
        }
        res.writeHead(429);
        res.end('Too Many Requests');
      };
      const _s3 = localS3(1);
      for (const [_file, _status] of [['missing', 404], ['moved', 301], ['busy', 429]]) {
        let _outputs = 0;
        const _chunks = [];
        const { err, resp } = await call(_s3.downloadFile, 'bucket', _file, { output: () => { _outputs++; return sink(_chunks); } });
        assert.strictEqual(err, null);
        assert.strictEqual(resp.statusCode, _status);
        assert.strictEqual(_outputs, 0);
        assert.strictEqual(_chunks.length, 0);
        if (_status === 404) {
          assert.strictEqual(resp.body.error.code, 'NoSuchKey');
        }
        if (_status === 301) {
          assert.strictEqual(resp.body.error.endpoint, 's3.other.test');
        }
        if (_status === 429) {
          assert.strictEqual(resp.body.toString(), 'Too Many Requests');
        }
      }
    });

    it('should write a 2xx into the caller stream after a throttled attempt', async function () {
      let _hits = 0;
      _handler = (req, res) => {
        if (++_hits === 1) {
          res.writeHead(503, { 'content-type': 'application/xml' });
          return res.end(SLOW_DOWN);
        }
        res.writeHead(200);
        res.end('DATA');
      };
      const _s3 = localS3(1);
      const _chunks = [];
      let _outputs = 0;
      const { err, resp } = await call(_s3.downloadFile, 'bucket', 'file', { output: () => { _outputs++; return sink(_chunks); } });
      assert.strictEqual(err, null);
      assert.strictEqual(resp.statusCode, 200);
      assert.strictEqual(_outputs, 1);
      assert.strictEqual(Buffer.concat(_chunks).toString(), 'DATA');
    });

    it('should return a body cut mid-stream at once, without retry nor failover, and call back once (same destination)', async function () {
      const _hits = [];
      _handler = (req, res) => {
        _hits.push(req.url);
        res.writeHead(200, { 'content-length': 100 });
        res.write('PARTIAL');
        setTimeout(() => res.socket.destroy(), 20);
      };
      const _s3 = localS3(2);
      const _destination = new PassThrough();
      const _received = [];
      _destination.on('data', (chunk) => _received.push(chunk));
      _destination.on('error', () => {});
      let _outputs = 0;
      let _calls = 0;
      const _result = await new Promise((resolve) => _s3.downloadFile('bucket', 'file', { output: () => { _outputs++; return _destination; } }, (err, resp) => {
        _calls++;
        setTimeout(() => resolve({ err, resp }), 100);
      }));
      assert.ok(_result.err instanceof Error);
      assert.notStrictEqual(_result.err.message, 'All S3 storages are not available');
      assert.strictEqual(_calls, 1);
      /** rock-req retries the network error on the same storage: the caller's output() is not called again, the retry gets its destroyed stream and ends */
      assert.strictEqual(_outputs, 1);
      assert.deepStrictEqual(_hits, ['/bucket-0/file', '/bucket-0/file']);
      assert.strictEqual(Buffer.concat(_received).toString(), 'PARTIAL');
      assert.strictEqual(_s3.getConfig().activeStorage, 0);
      assert.deepStrictEqual(_events, []);
    });

    it('should return an error of the caller stream (ENOSPC) at once, without failover', async function () {
      const _hits = [];
      _handler = (req, res) => {
        _hits.push(req.url);
        res.writeHead(200);
        res.end('DATA');
      };
      const _s3 = localS3(2);
      let _outputs = 0;
      const { err } = await call(_s3.downloadFile, 'bucket', 'file', { output: () => { _outputs++; return sink([], true); } });
      assert.strictEqual(err.code, 'ENOSPC');
      assert.strictEqual(_outputs, 1);
      assert.deepStrictEqual(_hits, ['/bucket-0/file']);
      assert.strictEqual(_s3.getConfig().activeStorage, 0);
      assert.deepStrictEqual(_events, []);
    });

    it('should still fail over a stream download on a 500 without writing its body', async function () {
      _handler = (req, res) => {
        if (req.url.startsWith('/bucket-0/')) {
          res.writeHead(500, { 'content-type': 'application/xml' });
          return res.end(INTERNAL_ERROR);
        }
        res.writeHead(200);
        res.end('FALLBACK');
      };
      const _s3 = localS3(2);
      const _chunks = [];
      const { err, resp } = await call(_s3.downloadFile, 'bucket', 'file', { output: () => sink(_chunks) });
      assert.strictEqual(err, null);
      assert.strictEqual(resp.statusCode, 200);
      assert.strictEqual(Buffer.concat(_chunks).toString(), 'FALLBACK');
    });
  });

  describe('Caller options (T6)', function () {
    it('S3 should never mutate the options of the caller', async function () {
      const _s3 = createS3(1);
      const _options = { headers: { 'x-amz-meta-a': '1' } };
      const _copy = JSON.parse(JSON.stringify(_options));
      nock(urls[0])
        .put('/bucket/file1.pdf').matchHeader('x-amz-copy-source', '/bucket/file1.pdf').reply(200, '<CopyObjectResult><ETag>"e"</ETag></CopyObjectResult>', XML)
        .put('/bucket/file2.pdf').matchHeader('x-amz-copy-source', '/bucket/file2.pdf').reply(200, '<CopyObjectResult><ETag>"e"</ETag></CopyObjectResult>', XML)
        .put('/bucket/up.pdf').reply(200)
        .delete('/bucket/up.pdf').reply(204)
        .head('/bucket/up.pdf').reply(200)
        .head('/bucket').reply(200)
        .get('/bucket').query(true).reply(200, '<ListBucketResult><Name>bucket</Name></ListBucketResult>', XML)
        .post('/bucket/').query(true).reply(200, '<DeleteResult></DeleteResult>', XML);
      assert.strictEqual((await call(_s3.setFileMetadata, 'bucket', 'file1.pdf', _options)).err, null);
      assert.strictEqual((await call(_s3.setFileMetadata, 'bucket', 'file2.pdf', _options)).err, null);
      await call(_s3.uploadFile, 'bucket', 'up.pdf', Buffer.from('x'), _options);
      await call(_s3.deleteFile, 'bucket', 'up.pdf', _options);
      await call(_s3.getFileMetadata, 'bucket', 'up.pdf', _options);
      await call(_s3.headBucket, 'bucket', _options);
      await call(_s3.listFiles, 'bucket', _options);
      await call(_s3.deleteFiles, 'bucket', ['a'], _options);
      assert.deepStrictEqual(_options, _copy);
    });

    it('Swift should never mutate the options of the caller', async function () {
      const _swift = storageSDK({ username: 'u', password: 'p', authUrl: 'https://auth.resilience.test/v3', region: 'GRA' });
      _swift.setLogFunction(() => {});
      nock('https://auth.resilience.test').post('/v3/auth/tokens').reply(200, { token: { catalog: [{ type: 'object-store', endpoints: [{ region: 'GRA', interface: 'public', url: 'https://swift.resilience.test/v1/AUTH_x' }] }] } }, { 'X-Subject-Token': 'tok' });
      nock('https://swift.resilience.test')
        .put('/v1/AUTH_x/c/file.pdf').reply(201)
        .post('/v1/AUTH_x/').query(true).reply(200, { 'Number Deleted': 1, Errors: [] })
        .delete('/v1/AUTH_x/c/file.pdf').reply(204)
        .post('/v1/AUTH_x/c/file.pdf').reply(202)
        .get('/v1/AUTH_x/c').reply(200, [])
        .get('/v1/AUTH_x/').reply(200, []);
      const _options = { headers: { 'x-object-meta-a': '1' } };
      const _copy = JSON.parse(JSON.stringify(_options));
      await call(_swift.uploadFile, 'c', 'file.pdf', Buffer.from('x'), _options);
      await call(_swift.deleteFiles, 'c', ['file.pdf'], _options);
      await call(_swift.deleteFile, 'c', 'file.pdf', _options);
      await call(_swift.setFileMetadata, 'c', 'file.pdf', _options);
      await call(_swift.listFiles, 'c', _options);
      await call(_swift.listBuckets, _options);
      assert.deepStrictEqual(_options, _copy);
    });
  });

  describe('Redirects (T7)', function () {
    it('S3 should return a 3xx without following it, its XML body parsed', async function () {
      const _s3 = createS3(1);
      nock(urls[0]).put('/bucket/file.txt').reply(307, '<Error><Code>TemporaryRedirect</Code><Endpoint>bucket.s3-eu.test</Endpoint></Error>', { 'content-type': 'application/xml', location: 'https://evil.test/bucket/file.txt' });
      const _evil = nock('https://evil.test').put('/bucket/file.txt').reply(200);
      const { err, resp } = await call(_s3.uploadFile, 'bucket', 'file.txt', Buffer.from('secret'));
      assert.strictEqual(err, null);
      assert.strictEqual(resp.statusCode, 307);
      assert.strictEqual(resp.body.error.code, 'TemporaryRedirect');
      assert.strictEqual(_evil.isDone(), false);
    });

    it('S3 should parse an error body with a "text/xml" content type, but not a 304', async function () {
      const _s3 = createS3(1);
      nock(urls[0]).get('/bucket/missing.txt').reply(404, '<Error><Code>NoSuchKey</Code></Error>', { 'content-type': 'text/xml; charset=utf-8' });
      nock(urls[0]).get('/bucket/same.xml').reply(304, '', { 'content-type': 'application/xml' });
      const { resp } = await call(_s3.downloadFile, 'bucket', 'missing.txt');
      assert.strictEqual(resp.body.error.code, 'NoSuchKey');
      const { resp: _resp } = await call(_s3.downloadFile, 'bucket', 'same.xml');
      assert.strictEqual(_resp.statusCode, 304);
      assert.ok(Buffer.isBuffer(_resp.body));
    });

    it('Swift should never send the token to the location of a 3xx', async function () {
      const _swift = storageSDK({ username: 'u', password: 'p', authUrl: 'https://auth.resilience.test/v3', region: 'GRA' });
      _swift.setLogFunction(() => {});
      nock('https://auth.resilience.test').post('/v3/auth/tokens').reply(200, { token: { catalog: [{ type: 'object-store', endpoints: [{ region: 'GRA', interface: 'public', url: 'https://swift.resilience.test/v1/AUTH_x' }] }] } }, { 'X-Subject-Token': 'tok' });
      nock('https://swift.resilience.test').get('/v1/AUTH_x/c/file.txt').reply(302, '', { location: 'https://swift.resilience.test:8443/steal' });
      const _steal = nock('https://swift.resilience.test:8443').get('/steal').reply(200);
      const { err, resp } = await call(_swift.downloadFile, 'c', 'file.txt');
      assert.strictEqual(err, null);
      assert.strictEqual(resp.statusCode, 302);
      assert.strictEqual(_steal.isDone(), false);
    });
  });

  describe('storageClass (T8)', function () {
    it('should send the storage class of the storage on uploadFile and setFileMetadata, never on other requests', async function () {
      const _s3 = createS3(1, [{ storageClass: 'EXPRESS_ONEZONE' }]);
      nock(urls[0])
        .put('/bucket/a.pdf').matchHeader('x-amz-storage-class', 'EXPRESS_ONEZONE').reply(200)
        .put('/bucket/a.pdf').matchHeader('x-amz-storage-class', 'EXPRESS_ONEZONE').matchHeader('x-amz-copy-source', '/bucket/a.pdf').reply(200, '<CopyObjectResult><ETag>"e"</ETag></CopyObjectResult>', XML)
        .get('/bucket/a.pdf').matchHeader('x-amz-storage-class', (value) => value === undefined).reply(200, 'a')
        .put('/bucket/b.pdf').matchHeader('x-amz-storage-class', (value) => value === undefined).reply(200);
      assert.strictEqual((await call(_s3.uploadFile, 'bucket', 'a.pdf', Buffer.from('a'))).resp.statusCode, 200);
      assert.strictEqual((await call(_s3.setFileMetadata, 'bucket', 'a.pdf', {})).resp.statusCode, 200);
      assert.strictEqual((await call(_s3.downloadFile, 'bucket', 'a.pdf')).resp.statusCode, 200);
      /** Custom request: unchanged */
      assert.strictEqual((await call(_s3.request, 'PUT', '/bucket/b.pdf', { body: 'b' })).resp.statusCode, 200);
    });

    it('should not override the storage class set by the caller (any case)', async function () {
      const _s3 = createS3(1, [{ storageClass: 'EXPRESS_ONEZONE' }]);
      const _n0 = nock(urls[0]).put('/bucket/a.pdf').matchHeader('x-amz-storage-class', 'STANDARD').reply(200);
      const { resp } = await call(_s3.uploadFile, 'bucket', 'a.pdf', Buffer.from('a'), { headers: { 'X-Amz-Storage-Class': 'STANDARD' } });
      assert.strictEqual(resp.statusCode, 200);
      assert.ok(_n0.isDone());
    });

    it('should send the storage class of the storage actually used after a failover', async function () {
      const _s3 = createS3(2, [{ storageClass: 'EXPRESS_ONEZONE' }, {}]);
      const _classes = [];
      nock(urls[0]).put('/bucket/a.pdf').reply(function () { _classes.push(this.req.headers['x-amz-storage-class']); return [500]; });
      nock(urls[1]).put('/bucket/a.pdf').reply(function () { _classes.push(this.req.headers['x-amz-storage-class']); return [200]; });
      const { resp } = await call(_s3.uploadFile, 'bucket', 'a.pdf', Buffer.from('a'));
      assert.strictEqual(resp.statusCode, 200);
      /** The class of the main storage on the main storage, none on the fallback (bucket default) */
      assert.deepStrictEqual(_classes, ['EXPRESS_ONEZONE', undefined]);
    });

    it('should throw on an invalid storageClass', function () {
      assert.throws(() => createS3(1, [{ storageClass: 3 }]), /storageClass/);
      assert.throws(() => createS3(1, [{ storageClass: '' }]), /storageClass/);
    });
  });

  describe('Swift', function () {
    const auths = ['https://auth-0.resilience.test', 'https://auth-1.resilience.test'];
    const endpoints = ['https://swift-0.resilience.test/v1/AUTH_x', 'https://swift-1.resilience.test/v1/AUTH_x'];

    function createSwift (count, extra = {}) {
      const _storages = [];
      for (let i = 0; i < count; i++) {
        _storages.push({ username: 'u', password: 'p', authUrl: `${auths[i]}/v3`, region: `R${i}`, ...extra[i] });
      }
      const _swift = storageSDK(_storages);
      _swift.setLogFunction((message, level, fields) => _events.push(fields?.event));
      return _swift;
    }

    function authOK (index, times = 1, token = `token-${index}`) {
      let _count = 0;
      nock(auths[index]).post('/v3/auth/tokens').times(times).reply(() => {
        _count++;
        return [201, { token: { catalog: [{ type: 'object-store', endpoints: [{ region: `R${index}`, interface: 'public', url: endpoints[index] }] }] } }, { 'X-Subject-Token': token }];
      });
      return () => _count;
    }

    it('B1: a 498 (rate limit) is retried on the same storage, then returned as in 4.0: never sent to another storage (T1)', async function () {
      const _swift = createSwift(2, [{ maxThrottleRetry: 3 }, { maxThrottleRetry: 3 }]);
      authOK(0);
      authOK(1);
      const _n0 = nock(endpoints[0]).get('/c/file.txt').times(4).reply(498, 'Rate limited');
      const _n1 = nock(endpoints[1]).get('/c/file.txt').reply(200, 'fallback');
      const { err, resp } = await call(_swift.downloadFile, 'c', 'file.txt');
      assert.strictEqual(err, null);
      assert.strictEqual(resp.statusCode, 498);
      assert.ok(_n0.isDone());
      assert.strictEqual(_n1.isDone(), false);
      assert.strictEqual(_swift.getConfig().activeStorage, 0);
      assert.strictEqual(_events.filter(e => e === 'storage_throttled').length, 3);
    });

    it('B3: a 498 on the single storage is returned as a response after the retries, as in 4.0 (T1)', async function () {
      const _swift = createSwift(1, [{ maxThrottleRetry: 3 }]);
      authOK(0);
      const _n0 = nock(endpoints[0]).get('/c/file.txt').times(4).reply(498, 'Rate limited');
      const { err, resp } = await call(_swift.downloadFile, 'c', 'file.txt');
      assert.strictEqual(err, null);
      assert.strictEqual(resp.statusCode, 498);
      assert.ok(_n0.isDone());
    });

    it('should retry a 429 on the same storage and succeed (T1)', async function () {
      const _swift = createSwift(1, [{ maxThrottleRetry: 3 }]);
      authOK(0);
      /** rock-req retries the 429 once, then the client after a backoff */
      nock(endpoints[0]).get('/c/file.txt').times(2).reply(429).get('/c/file.txt').reply(200, 'ok');
      const { resp } = await call(_swift.downloadFile, 'c', 'file.txt');
      assert.strictEqual(resp.body.toString(), 'ok');
    });

    it('should send the request to the next storage on a 500 (no retry on the same storage), without switching the active storage (T2)', async function () {
      const _swift = createSwift(2);
      authOK(0);
      const _auths1 = authOK(1);
      nock(endpoints[0]).get('/c/file.txt').reply(500).get('/c/file.txt').reply(200, 'main');
      nock(endpoints[1], { reqheaders: { 'x-auth-token': 'token-1' } }).get('/c/file.txt').reply(200, 'fallback');
      const { resp } = await call(_swift.downloadFile, 'c', 'file.txt');
      assert.strictEqual(resp.body.toString(), 'fallback');
      assert.strictEqual(_swift.getConfig().activeStorage, 0);
      assert.strictEqual(_auths1(), 1);
      /** The next request is still sent to the main storage */
      const { resp: _resp } = await call(_swift.downloadFile, 'c', 'file.txt');
      assert.strictEqual(_resp.body.toString(), 'main');
    });

    it('should share one authentication per storage between the parallel requests sent apart, and never send a token to another storage', async function () {
      const _swift = createSwift(2);
      authOK(0);
      const _auths1 = authOK(1, 5);
      nock(endpoints[0]).get('/c/file.txt').times(2).reply(500);
      const _n1 = nock(endpoints[1], { reqheaders: { 'x-auth-token': 'token-1' } }).get('/c/file.txt').times(2).reply(200, 'fallback');
      /** 2 failures: below the threshold, the active storage is kept */
      const _results = await Promise.all([call(_swift.downloadFile, 'c', 'file.txt'), call(_swift.downloadFile, 'c', 'file.txt')]);
      for (const { resp } of _results) {
        assert.strictEqual(resp.body.toString(), 'fallback');
      }
      assert.ok(_n1.isDone());
      assert.strictEqual(_auths1(), 1);
      assert.strictEqual(_swift.getConfig().activeStorage, 0);
      assert.strictEqual(_swift.getConfig().token, 'token-0');
    });

    it('should authenticate again once on a 401 of a storage used apart, then return the 401 (no loop)', async function () {
      const _swift = createSwift(2);
      authOK(0);
      const _auths1 = authOK(1, 5);
      nock(endpoints[0]).get('/c/file.txt').reply(500);
      const _n1 = nock(endpoints[1]).get('/c/file.txt').times(2).reply(401);
      const { err, resp } = await call(_swift.downloadFile, 'c', 'file.txt');
      assert.strictEqual(err, null);
      assert.strictEqual(resp.statusCode, 401);
      assert.ok(_n1.isDone());
      assert.strictEqual(_auths1(), 2);
    });

    it('should forget the authentications of the storages used apart on setStorages()', async function () {
      const _swift = createSwift(2);
      authOK(0, 2);
      const _auths1 = authOK(1, 5);
      nock(endpoints[0]).get('/c/file.txt').times(2).reply(500);
      nock(endpoints[1]).get('/c/file.txt').times(2).reply(200, 'fallback');
      await call(_swift.downloadFile, 'c', 'file.txt');
      assert.strictEqual(_auths1(), 1);
      _swift.setStorages(_swift.getStorages().map((storage) => ({ ...storage })));
      const { resp } = await call(_swift.downloadFile, 'c', 'file.txt');
      assert.strictEqual(resp.body.toString(), 'fallback');
      assert.strictEqual(_auths1(), 2);
    });

    it('should reuse the token of a storage used apart for the next request sent to it apart (a single authentication)', async function () {
      const _swift = createSwift(2);
      authOK(0);
      const _auths1 = authOK(1, 5);
      /** 2 failures: below the threshold, the active storage is kept, each request is sent apart to the next storage */
      nock(endpoints[0]).get('/c/file.txt').times(2).reply(500);
      const _n1 = nock(endpoints[1], { reqheaders: { 'x-auth-token': 'token-1' } }).get('/c/file.txt').times(2).reply(200, 'fallback');
      for (let i = 0; i < 2; i++) {
        const { resp } = await call(_swift.downloadFile, 'c', 'file.txt');
        assert.strictEqual(resp.body.toString(), 'fallback');
      }
      assert.ok(_n1.isDone());
      assert.strictEqual(_auths1(), 1);
      assert.strictEqual(_swift.getConfig().activeStorage, 0);
      assert.strictEqual(_swift.getConfig().token, 'token-0');
    });

    it('should never write a JSON error into the caller stream (stream output), and return it parsed', async function () {
      const _swift = createSwift(1);
      authOK(0);
      nock(endpoints[0]).get('/c/file.txt').reply(404, JSON.stringify({ error: 'Not Found' }), { 'content-type': 'application/json; charset=utf-8' });
      const _chunks = [];
      let _outputs = 0;
      const { err, resp } = await call(_swift.downloadFile, 'c', 'file.txt', { output: () => { _outputs++; return new Writable({ write (chunk, encoding, cb) { _chunks.push(chunk); cb(); } }); } });
      assert.strictEqual(err, null);
      assert.strictEqual(resp.statusCode, 404);
      assert.deepStrictEqual(resp.body, { error: 'Not Found' });
      assert.strictEqual(_outputs, 0);
      assert.strictEqual(_chunks.length, 0);
    });

    it('should return a 501 without failover (T2)', async function () {
      const _swift = createSwift(2);
      authOK(0);
      nock(endpoints[0]).get('/c/file.txt').reply(501);
      const { err, resp } = await call(_swift.downloadFile, 'c', 'file.txt');
      assert.strictEqual(err, null);
      assert.strictEqual(resp.statusCode, 501);
      assert.strictEqual(_swift.getConfig().activeStorage, 0);
    });

    it('should treat a Keystone answer without X-Subject-Token as an authentication failure (T5)', async function () {
      const _swift = createSwift(2);
      nock(auths[0]).post('/v3/auth/tokens').reply(201, { token: { catalog: [{ type: 'object-store', endpoints: [{ region: 'R0', url: endpoints[0] }] }] } });
      authOK(1);
      nock(endpoints[1], { reqheaders: { 'x-auth-token': 'token-1' } }).get('/c/file.txt').reply(200, 'fallback');
      const { err, resp } = await call(_swift.downloadFile, 'c', 'file.txt');
      assert.strictEqual(err, null);
      assert.strictEqual(resp.body.toString(), 'fallback');
      assert.strictEqual(_swift.getConfig().activeStorage, 1);
    });

    it('should return an error with a single storage whose Keystone answers without X-Subject-Token, never sending "undefined" (T5)', async function () {
      const _swift = createSwift(1);
      nock(auths[0]).post('/v3/auth/tokens').reply(201, { token: { catalog: [{ type: 'object-store', endpoints: [{ region: 'R0', url: endpoints[0] }] }] } });
      const _object = nock(endpoints[0]).get('/c/file.txt').reply(200);
      const { err } = await call(_swift.downloadFile, 'c', 'file.txt');
      assert.strictEqual(err.message, 'Object Storages are not available');
      assert.strictEqual(_object.isDone(), false);
    });
  });

  describe('Review and fuzz regressions', function () {
    it('should give the caller\'s stream back to any response after the first write: a retry (2xx or not) never reaches another stream nor returns a response', function () {
      let _calls = 0;
      const _dest = new PassThrough();
      const _stream = streamOutput(() => { _calls++; return _dest; });
      assert.strictEqual(_stream.output({}, { statusCode: 200 }), _dest);
      /** Body cut mid-stream, retried by rock-req: the new response is a 500, a 404 or a 200 */
      for (const _status of [500, 503, 404, 301, 200]) {
        assert.strictEqual(_stream.output({}, { statusCode: _status }), _dest, `status ${_status}`);
        assert.strictEqual(_stream.body, null, `no body kept for status ${_status}`);
      }
      assert.strictEqual(_calls, 1);
      assert.strictEqual(_stream.written, true);
    });

    it('should still divert a non-2xx response before the first write, then call the caller\'s output once', function () {
      let _calls = 0;
      const _dest = new PassThrough();
      const _stream = streamOutput(() => { _calls++; return _dest; });
      const _buffer = _stream.output({}, { statusCode: 503 });
      assert.notStrictEqual(_buffer, _dest);
      assert.deepStrictEqual(_stream.body, []);
      assert.strictEqual(_stream.written, false);
      assert.strictEqual(_stream.output({}, { statusCode: 200 }), _dest);
      assert.strictEqual(_calls, 1);
    });

    const UPGRADE ='HTTP/1.1 101 Switching Protocols\r\nUpgrade: x\r\nConnection: Upgrade\r\n\r\n';
    let _servers = [];

    /** A local server; Keystone on "/v3/auth/tokens" (object store at "/v1/AUTH_x") when `keystone` is true */
    function localServer (handler, keystone = false) {
      const _srv = { hits: [], auths: 0, handler };
      _srv.http = http.createServer((req, res) => {
        req.resume();
        req.on('end', () => {
          if (keystone === true && req.url === '/v3/auth/tokens') {
            _srv.auths++;
            if (_srv.auth) {
              return _srv.auth(req, res);
            }
            res.writeHead(201, { 'content-type': 'application/json', 'x-subject-token': `tok-${_srv.port}` });
            return res.end(JSON.stringify({ token: { catalog: [{ type: 'object-store', endpoints: [{ region: 'R', interface: 'public', url: `${_srv.url}/v1/AUTH_x` }] }] } }));
          }
          _srv.hits.push(`${req.method} ${req.url}`);
          _srv.handler(req, res);
        });
      });
      _servers.push(_srv);
      return new Promise((resolve) => _srv.http.listen(0, '127.0.0.1', () => {
        _srv.port = _srv.http.address().port;
        _srv.url = `http://127.0.0.1:${_srv.port}`;
        resolve(_srv);
      }));
    }

    afterEach(function () {
      for (const _srv of _servers) {
        _srv.http.closeAllConnections();
        _srv.http.close();
      }
      _servers = [];
    });

    function localS3 (servers) {
      const _s3 = storageSDK(servers.map((srv, i) => ({ accessKeyId: 'key', secretAccessKey: 'secret', url: srv.url, region: `r${i}` })));
      _s3.setLogFunction((message, level, fields) => _events.push(fields?.event));
      _s3.setTimeout(500);
      return _s3;
    }

    function localSwift (servers, extra = {}) {
      const _swift = storageSDK(servers.map((srv) => ({ username: 'u', password: 'p', authUrl: `${srv.url}/v3`, region: 'R', ...extra })));
      _swift.setLogFunction((message, level, fields) => _events.push(fields?.event));
      _swift.setTimeout(500);
      return _swift;
    }

    /** Call `fn` and resolve after 100 ms more, with the number of callback calls */
    function callOnce (fn, ...args) {
      return new Promise((resolve) => {
        let _calls = 0;
        let _result = null;
        fn(...args, (err, resp) => {
          _calls++;
          _result = { err, resp };
          setTimeout(() => resolve({ ..._result, calls: _calls }), 100);
        });
      });
    }

    for (const _count of [1, 2]) {
      it(`S3 stream: an output() returning the same destination, headers then reset before the first byte, calls back once with the error (${_count} storage(s), output() called once, no failover)`, async function () {
        let _first = true;
        const A = await localServer((req, res) => {
          if (_first === true) {
            _first = false;
            res.writeHead(200, { 'content-length': 100 });
            res.flushHeaders();
            return setTimeout(() => req.socket.destroy(), 20);
          }
          res.end('DATA');
        });
        const B = await localServer((req, res) => res.end('FALLBACK'));
        const _s3 = localS3(_count === 1 ? [A] : [A, B]);
        const _destination = new Writable({ write (chunk, encoding, cb) { cb(); } });
        _destination.on('error', () => {});
        let _outputs = 0;
        const { err, calls } = await callOnce(_s3.downloadFile, 'b', 'k', { output: () => { _outputs++; return _destination; } });
        assert.ok(err instanceof Error);
        assert.strictEqual(calls, 1);
        assert.strictEqual(_outputs, 1);
        assert.strictEqual(B.hits.length, 0);
        assert.strictEqual(_s3.getConfig().activeStorage, 0);
      });
    }

    it('S3 stream: a network error before any response is retried on the same storage, the caller stream gets the file (no failover)', async function () {
      /** nock: a local server resetting the socket, then retried, hits a bug of the nock passthrough */
      const _s3 = createS3(2);
      const _n0 = nock(urls[0]).get('/b/k').replyWithError(Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' })).get('/b/k').reply(200, 'DATA');
      const _n1 = nock(urls[1]).get('/b/k').reply(200, 'FALLBACK');
      const _chunks = [];
      let _outputs = 0;
      const { err, resp } = await callOnce(_s3.downloadFile, 'b', 'k', { output: () => { _outputs++; return new Writable({ write (chunk, encoding, cb) { _chunks.push(chunk); cb(); } }); } });
      assert.strictEqual(err, null);
      assert.strictEqual(resp.statusCode, 200);
      assert.strictEqual(Buffer.concat(_chunks).toString(), 'DATA');
      assert.strictEqual(_outputs, 1);
      assert.ok(_n0.isDone());
      assert.strictEqual(_n1.isDone(), false);
      assert.strictEqual(_s3.getConfig().activeStorage, 0);
    });

    it('S3 stream: an output stream with emitClose: false calls back once', async function () {
      const A = await localServer((req, res) => res.end('DATA'));
      const _s3 = localS3([A]);
      const { err, resp, calls } = await callOnce(_s3.downloadFile, 'b', 'k', { output: () => new Writable({ emitClose: false, write (chunk, encoding, cb) { cb(); } }) });
      assert.strictEqual(err, null);
      assert.strictEqual(resp.statusCode, 200);
      assert.strictEqual(calls, 1);
    });

    it('S3 stream: an already destroyed stream returned by output() is an error, without failover', async function () {
      const A = await localServer((req, res) => res.end('DATA'));
      const B = await localServer((req, res) => res.end('FALLBACK'));
      const _s3 = localS3([A, B]);
      const _destroyed = new Writable({ write (chunk, encoding, cb) { cb(); } });
      _destroyed.destroy();
      const { err, calls } = await callOnce(_s3.downloadFile, 'b', 'k', { output: () => _destroyed });
      assert.strictEqual(err.message, 'opts.output returned a destroyed stream');
      assert.strictEqual(calls, 1);
      assert.strictEqual(B.hits.length, 0);
    });

    it('S3: a 503 without throttle code (XML or HTML body without code, empty body, HEAD) is a server error: failover', async function () {
      const _bodies = [['<Error><Message>backend down</Message></Error>', 'application/xml'], ['<html><body>503</body></html>', 'application/xml'], ['<html>503</html>', 'text/html'], ['', undefined]];
      for (const [_body, _type] of _bodies) {
        const A = await localServer((req, res) => {
          res.writeHead(503, _type ? { 'content-type': _type } : {});
          res.end(_body);
        });
        const B = await localServer((req, res) => res.end('FALLBACK'));
        const _s3 = localS3([A, B]);
        const { err, resp } = await callOnce(_s3.downloadFile, 'b', 'k');
        assert.strictEqual(err, null, _body);
        assert.strictEqual(resp.body.toString(), 'FALLBACK', _body);
        assert.strictEqual(A.hits.length, 2, _body);
      }
      /** A 503 to a HEAD (no body) is a server error too (B1): retried once by rock-req, then the error of 4.0 */
      const H = await localServer((req, res) => {
        res.writeHead(503);
        res.end();
      });
      const { err } = await callOnce(localS3([H]).getFileMetadata, 'b', 'k');
      assert.strictEqual(err.message, 'All S3 storages are not available');
      assert.strictEqual(err.storageStatusCode, 503);
      assert.strictEqual(H.hits.length, 2);
    });

    it('S3: a requestStorageIndex request never changes the failure count, and a throttled 503 is returned as a response (as in 4.0)', async function () {
      const _s3 = createS3(2);
      nock(urls[0]).get('/b/k').times(2).reply(500).get('/').reply(500).get('/b/k').reply(500);
      nock(urls[1]).get('/b/k').times(3).reply(200, 'ok');
      await call(_s3.downloadFile, 'b', 'k');
      await call(_s3.downloadFile, 'b', 'k');
      const { resp: _listed } = await call(_s3.listBuckets, { requestStorageIndex: 0 });
      assert.strictEqual(_listed.statusCode, 500);
      const _probeEnd = mockProbe();
      await call(_s3.downloadFile, 'b', 'k');
      /** 3 consecutive failures of the active storage: the listBuckets of storage 0 did not reset the count */
      assert.strictEqual(_s3.getConfig().activeStorage, 1);
      await _probeEnd();
      /** 1 request + 3 backoff retries, each retried once by rock-req */
      nock(urls[1]).get('/').times(8).reply(503, SLOW_DOWN, XML);
      const { err, resp } = await call(_s3.listBuckets, { requestStorageIndex: 1 });
      assert.strictEqual(err, null);
      assert.strictEqual(resp.statusCode, 503);
      assert.strictEqual(resp.body.error.code, 'SlowDown');
    });

    it('a 101 answer never loses the callback: S3 fails over, Swift returns an error (socket kept open or closed)', async function () {
      for (const _keepOpen of [true, false]) {
        const _answer101 = (req) => {
          req.socket.write(UPGRADE);
          if (_keepOpen === false) {
            req.socket.end();
          }
        };
        const A = await localServer(_answer101);
        const B = await localServer((req, res) => res.end('FALLBACK'));
        const { resp, calls } = await callOnce(localS3([A, B]).downloadFile, 'b', 'k');
        assert.strictEqual(resp.body.toString(), 'FALLBACK');
        assert.strictEqual(calls, 1);
        const S = await localServer(_answer101, true);
        const { err, calls: _calls } = await callOnce(localSwift([S]).listFiles, 'c');
        assert.strictEqual(err.message, 'Object Storages are not available');
        assert.strictEqual(err.code, 'EUNEXPECTEDUPGRADE');
        assert.strictEqual(_calls, 1);
      }
    });

    it('Swift stream: a body cut mid-stream returns the error at once, without retry by the client nor failover, and calls back once', async function () {
      const A = await localServer((req, res) => {
        res.writeHead(200, { 'content-length': 100 });
        res.write('PARTIAL');
        setTimeout(() => res.socket.destroy(), 20);
      }, true);
      const B = await localServer((req, res) => res.end('FALLBACK'), true);
      const _swift = localSwift([A, B]);
      const _destination = new PassThrough();
      const _received = [];
      _destination.on('data', (chunk) => _received.push(chunk));
      _destination.on('error', () => {});
      let _outputs = 0;
      const { err, calls } = await callOnce(_swift.downloadFile, 'c', 'file', { output: () => { _outputs++; return _destination; } });
      assert.ok(err instanceof Error);
      assert.notStrictEqual(err.message, 'Object Storages are not available');
      assert.strictEqual(calls, 1);
      /** rock-req retries the network error on the same storage: the caller's output() is not called again, the retry gets its destroyed stream and ends */
      assert.strictEqual(_outputs, 1);
      assert.deepStrictEqual(A.hits, ['GET /v1/AUTH_x/c/file', 'GET /v1/AUTH_x/c/file']);
      assert.strictEqual(Buffer.concat(_received).toString(), 'PARTIAL');
      assert.strictEqual(B.auths + B.hits.length, 0);
      assert.strictEqual(_swift.getConfig().activeStorage, 0);
      assert.deepStrictEqual(_events, ['storage_connecting', 'storage_connected']);
    });

    it('Swift: a Keystone 101 does not freeze the shared authentication, the fallback serves every request', async function () {
      const _list = (req, res) => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end('[]');
      };
      const A = await localServer(_list, true);
      A.auth = (req) => req.socket.write(UPGRADE);
      const B = await localServer(_list, true);
      const _swift = localSwift([A, B]);
      const _results = await Promise.all([1, 2, 3].map(() => callOnce(_swift.listFiles, 'c')));
      for (const { err, resp, calls } of _results) {
        assert.strictEqual(err, null);
        assert.strictEqual(resp.statusCode, 200);
        assert.strictEqual(calls, 1);
      }
      assert.strictEqual(B.auths, 1);
    });

    it('S3: a 101 answer to the probe does not leave it running, the next probe restores the main storage (T-e)', async function () {
      let _probes = 0;
      let _mainDown = true;
      const A = await localServer((req, res) => {
        if (req.url === '/') {
          if (++_probes === 1) {
            return req.socket.write(UPGRADE);
          }
          return res.end();
        }
        /** A 401 switches to the fallback at once */
        res.writeHead(_mainDown === true ? 401 : 200);
        res.end('MAIN');
      });
      const B = await localServer((req, res) => res.end('FALLBACK'));
      const _s3 = localS3([A, B]);
      let _now = _realNow();
      Date.now = () => _now;
      /** The switch probes the main storage at once: this first probe gets a 101 */
      await callOnce(_s3.downloadFile, 'b', 'k');
      await new Promise((resolve) => setTimeout(resolve, 100));
      assert.strictEqual(_probes, 1);
      assert.strictEqual(_s3.getConfig().activeStorage, 1);
      assert.strictEqual(_events.includes('storage_main_unavailable'), true);
      _mainDown = false;
      /** Not stuck: the next probe is sent 60 s after the failed one, and restores the main storage */
      _now += 59000;
      await callOnce(_s3.downloadFile, 'b', 'k');
      await new Promise((resolve) => setTimeout(resolve, 100));
      assert.strictEqual(_probes, 1);
      _now += 1000;
      await callOnce(_s3.downloadFile, 'b', 'k');
      await new Promise((resolve) => setTimeout(resolve, 100));
      assert.strictEqual(_probes, 2);
      assert.strictEqual(_s3.getConfig().activeStorage, 0);
    });

    it('Swift: setStorages() with fewer storages during the backoff of a request sent apart returns one error, never throws from a timer (T-a)', async function () {
      const A = await localServer((req, res) => {
        res.writeHead(500);
        res.end();
      }, true);
      /** A Retry-After above 2 s: not retried by rock-req, the client waits 3 s before its retry */
      const B = await localServer((req, res) => {
        res.writeHead(429, { 'retry-after': '3' });
        res.end();
      }, true);
      const C = await localServer((req, res) => res.end('[]'), true);
      this.timeout(6000);
      const _swift = localSwift([A, B], { maxThrottleRetry: 1 });
      setTimeout(() => _swift.setStorages([{ username: 'u', password: 'p', authUrl: `${C.url}/v3`, region: 'R' }]), 300);
      const { err, calls } = await callOnce(_swift.listFiles, 'c');
      assert.strictEqual(err.message, 'Object Storages are not available');
      assert.strictEqual(err.storageStatusCode, 429);
      assert.strictEqual(calls, 1);
    });

    it('Swift: the active storage is always a valid index, the main storage is active again after the last storage failed (T-f)', async function () {
      let _healthy = false;
      const _data = (req, res) => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end('[]');
      };
      /** While unhealthy, Keystone gives an endpoint on a closed port: a network error on each storage */
      const _keystone = (srv) => (req, res) => {
        res.writeHead(201, { 'content-type': 'application/json', 'x-subject-token': 'tok' });
        res.end(JSON.stringify({ token: { catalog: [{ type: 'object-store', endpoints: [{ region: 'R', url: _healthy === true ? `${srv.url}/v1/AUTH_x` : 'http://127.0.0.1:1/v1/AUTH_x' }] }] } }));
      };
      const A = await localServer(_data, true);
      const B = await localServer(_data, true);
      A.auth = _keystone(A);
      B.auth = _keystone(B);
      const _swift = localSwift([A, B]);
      const _active = [];
      _swift.setLogFunction((message, level, fields) => {
        _events.push(fields?.event);
        _active.push(_swift.getConfig().activeStorage);
      });
      const { err } = await callOnce(_swift.listFiles, 'c');
      assert.strictEqual(err.message, 'Object Storages are not available');
      assert.ok(_active.every((index) => index >= 0 && index < 2), JSON.stringify(_active));
      assert.strictEqual(_swift.getConfig().activeStorage, 0);
      _healthy = true;
      const { resp } = await callOnce(_swift.listFiles, 'c');
      assert.strictEqual(resp.statusCode, 200);
    });

    it('Swift: setStorages() copies the list of the caller (T-g)', function () {
      const _list = [{ username: 'u', password: 'p', authUrl: 'http://127.0.0.1:1/v3', region: 'R' }];
      const _swift = storageSDK(_list);
      _list.push(null);
      assert.strictEqual(_swift.getStorages().length, 1);
    });
  });
});
