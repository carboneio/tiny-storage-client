const assert = require('assert');
const nock   = require('nock');
const stream = require('stream');
const rock   = require('rock-req');
/** Required lazily: s3.test.js sets `global.rockReqConf` before index.js is loaded for the first time */
const storageSDK = (config) => require('../index.js')(config);

/**
 * Multi-storage failover scenarios (S3 and Swift): N storages, per-request state, main storage
 * health check, parallel requests, aliases, rock-req retry interplay, streams.
 *
 * The tests tagged [BUG], [RISK] or [DOC MISMATCH] reproduce an issue of v3.6.0 (see the comment of each test):
 * fixed in v4.0.0, they are kept as regression tests.
 */

/** Attempts of rock-req for a retried error (ECONNRESET, 503...): the first try + `maxRetry` */
function rockAttempts () {
  return 1 + rock.defaults.maxRetry;
}

function networkError (code) {
  const _err = new Error(`read ${code}`);
  _err.code = code;
  return _err;
}

describe('Failover', function () {

  afterEach(function () {
    nock.cleanAll();
  });

  describe('S3', function () {
    const urls = ['https://s3-0.failover.test', 'https://s3-1.failover.test', 'https://s3-2.failover.test'];
    let _events = [];
    const _realNow = Date.now;

    /** The clock (probe delay) is stubbed by some tests: never leaked to the next one */
    afterEach(function () {
      Date.now = _realNow;
    });

    /** A new client of `count` storages, the bucket alias "data" is "data-<index>" on each storage */
    function createS3 (count) {
      _events = [];
      const _storages = [];
      for (let i = 0; i < count; i++) {
        _storages.push({ accessKeyId: `key-${i}`, secretAccessKey: `secret-${i}`, url: urls[i], region: `region-${i}`, buckets: { data: `data-${i}` } });
      }
      const _s3 = storageSDK(_storages);
      _s3.setLogFunction((message, level, fields) => _events.push(fields?.event));
      return _s3;
    }

    function download (client, options = {}) {
      return new Promise((resolve) => client.downloadFile('data', 'file.txt', options, (err, resp) => resolve({ err, resp })));
    }

    describe('N=3 storages', function () {
      it('should skip two failing storages and serve the request by the third one', function (done) {
        const _s3 = createS3(3);
        /** A 5xx is sent once (not retried by rock-req nor by the client), then the request moves on to the next storage */
        const _n0 = nock(urls[0]).get('/data-0/file.txt').reply(500);
        const _probe = nock(urls[0]).get('/').reply(200);
        const _n1 = nock(urls[1]).get('/data-1/file.txt').reply(500);
        const _n2 = nock(urls[2]).get('/data-2/file.txt').reply(200, 'third');
        _s3.downloadFile('data', 'file.txt', (err, resp) => {
          assert.strictEqual(err, null);
          assert.strictEqual(resp.body.toString(), 'third');
          assert.ok(_n0.isDone() && _n1.isDone() && _n2.isDone());
          assert.deepStrictEqual(_events, ['storage_request_failed', 'storage_request_failed']);
          /** A single failure of the active storage: below the threshold (3 consecutive failures), the active storage is unchanged */
          assert.strictEqual(_s3.getConfig().activeStorage, 0);
          /** No health check while the main storage is active */
          setTimeout(() => {
            assert.strictEqual(_probe.isDone(), false);
            assert.strictEqual(_s3.getConfig().activeStorage, 0);
            done();
          }, 50);
        });
      });

      it('should skip two unreachable storages (network error) and activate the third one at once', function (done) {
        const _s3 = createS3(3);
        /** A network error is retried once by rock-req, then the storage is down: immediate switch, no retry by the client */
        const _n0 = nock(urls[0]).get('/data-0/file.txt').times(rockAttempts()).replyWithError(networkError('ECONNREFUSED'));
        const _n1 = nock(urls[1]).get('/data-1/file.txt').times(rockAttempts()).replyWithError(networkError('ECONNREFUSED'));
        const _n2 = nock(urls[2]).get('/data-2/file.txt').reply(200, 'third');
        /** Each switch probes the main storage at once, in the background (one probe in flight, so one or two probes): still down */
        let _probes = 0;
        nock(urls[0]).get('/').times(2).reply(() => { _probes++; return [500]; });
        _s3.downloadFile('data', 'file.txt', (err, resp) => {
          assert.strictEqual(err, null);
          assert.strictEqual(resp.body.toString(), 'third');
          assert.ok(_n0.isDone() && _n1.isDone() && _n2.isDone());
          assert.strictEqual(_s3.getConfig().activeStorage, 2);
          assert.deepStrictEqual(_events.filter(e => e !== 'storage_main_unavailable'), ['storage_fallback', 'storage_fallback']);
          setTimeout(() => {
            assert.ok(_probes >= 1 && _probes <= 2, `${_probes} probes`);
            assert.strictEqual(_events.filter(e => e === 'storage_main_unavailable').length, _probes);
            assert.strictEqual(_s3.getConfig().activeStorage, 2);
            done();
          }, 400);
        });
      });

      /** The active storage is not reset to the main anymore when no storage is left: it is switched only by consecutive failures */
      it('should return an error if all storages fail, request each storage once (no loop), the next request starts on the active storage', function (done) {
        const _s3 = createS3(3);
        let _hits = [0, 0, 0];
        nock(urls[0]).get('/data-0/file.txt').times(5).reply(() => { _hits[0]++; return [500]; });
        nock(urls[1]).get('/data-1/file.txt').times(5).reply(() => { _hits[1]++; return [500]; });
        nock(urls[2]).get('/data-2/file.txt').times(5).reply(() => { _hits[2]++; return [502, '<Error><Code>BadGateway</Code></Error>', { 'content-type': 'application/xml' }]; });
        _s3.downloadFile('data', 'file.txt', (err) => {
          assert.strictEqual(err.message, 'All S3 storages are not available');
          assert.strictEqual(err.storageStatusCode, 502);
          assert.strictEqual(err.code, 'BadGateway');
          /** Each storage once: a 500 is not retried, a 502 is retried once by rock-req only */
          assert.deepStrictEqual(_hits, [1, 1, rockAttempts()]);
          assert.strictEqual(_events.filter(e => e === 'storage_unavailable').length, 1);
          assert.strictEqual(_events.includes('storage_fallback'), false);
          assert.strictEqual(_s3.getConfig().activeStorage, 0);
          /** Next request starts again on the main storage */
          _hits = [0, 0, 0];
          nock.cleanAll();
          const _n0 = nock(urls[0]).get('/data-0/file.txt').reply(200, 'main');
          _s3.downloadFile('data', 'file.txt', (err, resp) => {
            assert.strictEqual(err, null);
            assert.strictEqual(resp.body.toString(), 'main');
            assert.ok(_n0.isDone());
            done();
          });
        });
      });

      it('should switch a single time when parallel requests fail on the main storage (no double increment)', function (done) {
        const _s3 = createS3(3);
        /** 5 parallel requests, 1 attempt each on the main storage: the 3rd failure switches, the next ones do not count anymore */
        nock(urls[0]).get('/data-0/file.txt').times(5).reply(500);
        const _n1 = nock(urls[1]).get('/data-1/file.txt').times(5).reply(200, 'second');
        Promise.all([download(_s3), download(_s3), download(_s3), download(_s3), download(_s3)]).then((results) => {
          for (const { err, resp } of results) {
            assert.strictEqual(err, null);
            assert.strictEqual(resp.body.toString(), 'second');
          }
          assert.ok(_n1.isDone());
          assert.strictEqual(_s3.getConfig().activeStorage, 1);
          assert.strictEqual(_events.filter(e => e === 'storage_fallback').length, 1);
          done();
        }).catch(done);
      });
    });

    describe('Main storage health check', function () {
      it('should send a single health check for parallel requests on the fallback storage, then switch back to the main', function (done) {
        const _s3 = createS3(2);
        _s3.getConfig().activeStorage = 1;
        let _checks = 0;
        nock(urls[0]).get('/').times(5).delay(50).reply(() => { _checks++; return [200, '<ListAllMyBucketsResult></ListAllMyBucketsResult>']; });
        nock(urls[1]).get('/data-1/file.txt').times(3).reply(200, 'second');
        Promise.all([download(_s3), download(_s3), download(_s3)]).then((results) => {
          for (const { resp } of results) {
            assert.strictEqual(resp.body.toString(), 'second');
          }
          setTimeout(() => {
            assert.strictEqual(_checks, 1);
            assert.strictEqual(_s3.getConfig().activeStorage, 0);
            assert.ok(_events.includes('storage_main_restored'));
            done();
          }, 150);
        }).catch(done);
      });

      it('should spare a single attempt per request when the main storage flaps (health check OK, requests failing)', function (done) {
        /** The probe runs at most every 60 s: the clock moves 5 s at each reading, the probe restores the main storage many times during the test */
        let _clock = _realNow();
        Date.now = () => (_clock += 5000);
        const _s3 = createS3(2);
        const _attempts = {};
        let _n = 0;
        /** Each attempt fails after a different delay (1-20 ms): parallel requests reach the storages at different times, between the health checks */
        const _fail = function (uri, body, cb) {
          const _key = uri.replace(/data-\d/, 'data');
          _attempts[_key] = (_attempts[_key] ?? 0) + 1;
          setTimeout(() => cb(null, [500]), 1 + (_n++ * 7) % 20);
        };
        nock(urls[0]).get('/').times(5000).reply(200, '<ListAllMyBucketsResult></ListAllMyBucketsResult>');
        nock(urls[0]).get(/^\/data-0\/k\d+$/).times(5000).reply(_fail);
        nock(urls[1]).get(/^\/data-1\/k\d+$/).times(5000).reply(_fail);
        const _calls = new Array(200).fill(0);
        Promise.all(_calls.map((x, i) => new Promise((resolve) => _s3.downloadFile('data', `k${i}`, (err) => { _calls[i]++; resolve(err); })))).then((errors) => {
          for (const err of errors) {
            assert.strictEqual(err.message, 'All S3 storages are not available');
          }
          assert.ok(_events.filter((e) => e === 'storage_main_restored').length > 1);
          /** One attempt per storage, plus one on the main storage if restored meanwhile: 3 at most. Without the limit: unbounded (a request loops between the storages) */
          assert.ok(Math.max(...Object.values(_attempts)) <= 3, JSON.stringify(_attempts));
          setTimeout(() => {
            assert.ok(_calls.every((c) => c === 1));
            done();
          }, 30);
        }).catch(done);
      });

      /** The health check is not sent by every request anymore: a failed probe doubles the delay before the next one (60 s, then 120 s) */
      it('should stay on the fallback if the health check fails, and check again after the doubled probe delay', function (done) {
        let _now = _realNow();
        Date.now = () => _now;
        const _s3 = createS3(2);
        _s3.getConfig().activeStorage = 1;
        let _checks = 0;
        nock(urls[0]).get('/').reply(() => { _checks++; return [500]; }).get('/').reply(() => { _checks++; return [200, '<ListAllMyBucketsResult></ListAllMyBucketsResult>']; });
        nock(urls[1]).get('/data-1/file.txt').times(3).reply(200, 'second');
        const _wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
        download(_s3).then(() => _wait(50)).then(() => {
          assert.strictEqual(_checks, 1);
          assert.strictEqual(_s3.getConfig().activeStorage, 1);
          assert.ok(_events.includes('storage_main_unavailable'));
          /** 60 s later: the delay is now 120 s, no health check */
          _now += 60000;
          return download(_s3);
        }).then(({ resp }) => {
          assert.strictEqual(resp.body.toString(), 'second');
          return _wait(50);
        }).then(() => {
          assert.strictEqual(_checks, 1);
          assert.strictEqual(_s3.getConfig().activeStorage, 1);
          _now += 60000;
          return download(_s3);
        }).then(({ resp }) => {
          /** The request starting the health check is served by the fallback */
          assert.strictEqual(resp.body.toString(), 'second');
          return _wait(50);
        }).then(() => {
          assert.strictEqual(_checks, 2);
          assert.strictEqual(_s3.getConfig().activeStorage, 0);
          assert.ok(_events.includes('storage_main_restored'));
          done();
        }).catch(done);
      });

      /** The probe is a background check of the client (not a request() anymore): a request with "requestStorageIndex" also starts it, and stays on its storage */
      it('should send the health check in the background for a request with "requestStorageIndex", the request stays on its storage', function (done) {
        const _s3 = createS3(2);
        _s3.getConfig().activeStorage = 1;
        let _checks = 0;
        nock(urls[0]).get('/').times(5).reply(() => { _checks++; return [200]; });
        const _main = nock(urls[0]).get('/data-0/file.txt').reply(200, 'main');
        nock(urls[1]).get('/data-1/file.txt').reply(200, 'second');
        _s3.downloadFile('data', 'file.txt', { requestStorageIndex: 1 }, (err, resp) => {
          assert.strictEqual(err, null);
          assert.strictEqual(resp.body.toString(), 'second');
          setTimeout(() => {
            assert.strictEqual(_checks, 1);
            assert.strictEqual(_main.isDone(), false);
            assert.strictEqual(_s3.getConfig().activeStorage, 0);
            done();
          }, 50);
        });
      });

      /**
       * RISK: the health check is a "ListBuckets" (GET /), which needs the "s3:ListAllMyBuckets" permission.
       * Credentials scoped to a bucket get a 403 from a healthy main storage: the client never returns
       * to the main storage (sticky fallback until all fallbacks fail or setConfig() is called).
       */
      it('[RISK] should return to the main storage if it answers the health check with a 403 (no ListAllMyBuckets permission)', function (done) {
        const _s3 = createS3(2);
        _s3.getConfig().activeStorage = 1;
        nock(urls[0]).get('/').reply(403, '<Error><Code>AccessDenied</Code></Error>', { 'content-type': 'application/xml' });
        nock(urls[1]).get('/data-1/file.txt').reply(200, 'second');
        download(_s3).then(() => {
          setTimeout(() => {
            assert.strictEqual(_s3.getConfig().activeStorage, 0);
            done();
          }, 50);
        });
      });
    });

    describe('Errors without failover', function () {
      it('should return a 404/403 of the main storage without switching storage', function (done) {
        const _s3 = createS3(2);
        nock(urls[0]).get('/data-0/file.txt').reply(404).get('/data-0/file.txt').reply(403);
        download(_s3).then(({ err, resp }) => {
          assert.strictEqual(err, null);
          assert.strictEqual(resp.statusCode, 404);
          return download(_s3);
        }).then(({ err, resp }) => {
          assert.strictEqual(err, null);
          assert.strictEqual(resp.statusCode, 403);
          assert.strictEqual(_s3.getConfig().activeStorage, 0);
          assert.strictEqual(_events.length, 0);
          done();
        }).catch(done);
      });

      it('should accept `null` options on `request`', function (done) {
        const _s3 = createS3(1);
        nock(urls[0]).get('/').reply(200, 'ok');
        _s3.request('GET', '/', null, (err, resp) => {
          assert.strictEqual(err, null);
          assert.strictEqual(resp.statusCode, 200);
          done();
        });
      });

      it('should return an error without trying the main storage if a request started on the last fallback fails (current behaviour)', function (done) {
        const _s3 = createS3(2);
        _s3.getConfig().activeStorage = 1;
        nock(urls[0]).get('/').reply(500);
        let _mainData = 0;
        nock(urls[0]).get('/data-0/file.txt').times(2).reply(() => { _mainData++; return [200, 'main']; });
        nock(urls[1]).get('/data-1/file.txt').reply(500);
        download(_s3).then(({ err }) => {
          assert.strictEqual(err.message, 'All S3 storages are not available');
          assert.strictEqual(_mainData, 0);
          /** A single failure of the active storage (below the threshold): the active storage is not reset to the main anymore */
          assert.strictEqual(_s3.getConfig().activeStorage, 1);
          done();
        }).catch(done);
      });
    });

    describe('rock-req retry before the failover', function () {
      /** A 503 without a "slow down" code is a server error: retried once by rock-req (its defaults), never by the client, then the next storage */
      it('should let rock-req retry a 503 of the main storage once, then fail over', function (done) {
        const _s3 = createS3(2);
        let _main = 0;
        nock(urls[0]).get('/data-0/file.txt').times(5).reply(() => { _main++; return [503, '<Error><Code>ServiceUnavailable</Code></Error>', { 'content-type': 'application/xml' }]; });
        nock(urls[1]).get('/data-1/file.txt').reply(200, 'second');
        download(_s3).then(({ err, resp }) => {
          assert.strictEqual(err, null);
          assert.strictEqual(resp.body.toString(), 'second');
          assert.strictEqual(_main, rockAttempts());
          /** A single failure of the active storage: below the threshold, the active storage is unchanged */
          assert.deepStrictEqual(_events, ['storage_request_failed']);
          assert.strictEqual(_s3.getConfig().activeStorage, 0);
          assert.deepStrictEqual(rock.defaults.retryOnCode.includes(503), true, 'the global defaults of rock-req are unchanged');
          done();
        }).catch(done);
      });

      it('should let rock-req retry a network error of the main storage once, then fail over', function (done) {
        const _s3 = createS3(2);
        nock(urls[0]).get('/data-0/file.txt').times(rockAttempts()).replyWithError(networkError('ECONNRESET'));
        nock(urls[0]).get('/').reply(500);
        const _n1 = nock(urls[1]).get('/data-1/file.txt').reply(200, 'second');
        download(_s3).then(({ err, resp }) => {
          assert.strictEqual(err, null);
          assert.strictEqual(resp.body.toString(), 'second');
          assert.ok(_n1.isDone());
          done();
        }).catch(done);
      });
    });

    describe('Aliases and streams during the failover', function () {
      /**
       * BUG (s3.js:341-343): the "x-amz-copy-source" header is rewritten IN PLACE on the caller's options for the
       * main storage ("/data-0/file.pdf"). On the retry, `replace(alias, ...)` does not find the alias anymore:
       * the fallback receives the bucket of the main storage and replies 404 NoSuchBucket (reproduced on MinIO).
       */
      it('[BUG] setFileMetadata should send the bucket of the fallback storage in "x-amz-copy-source" after a failover', function (done) {
        const _s3 = createS3(2);
        nock(urls[0]).put('/data-0/file.pdf').reply(500);
        let _copySource = null;
        nock(urls[1]).put('/data-1/file.pdf').reply(function () {
          _copySource = this.req.headers['x-amz-copy-source'];
          return [200, '<CopyObjectResult><ETag>"abc"</ETag></CopyObjectResult>'];
        });
        _s3.setFileMetadata('data', 'file.pdf', { headers: { 'x-amz-meta-a': '1' } }, (err, resp) => {
          assert.strictEqual(err, null);
          assert.strictEqual(resp.statusCode, 200);
          /** Current value: "/data-0/file.pdf" (bucket of the main storage) */
          assert.strictEqual(_copySource, '/data-1/file.pdf');
          done();
        });
      });

      it('should upload into the bucket alias of the fallback storage', function (done) {
        const _s3 = createS3(2);
        nock(urls[0]).put('/data-0/file.txt').reply(500);
        const _n1 = nock(urls[1]).put('/data-1/file.txt', 'content').reply(200);
        _s3.uploadFile('data', 'file.txt', Buffer.from('content'), (err, resp) => {
          assert.strictEqual(err, null);
          assert.strictEqual(resp.statusCode, 200);
          assert.ok(_n1.isDone());
          done();
        });
      });

      /**
       * RISK: rock-req pipes every response that is not retried into `output()`, the 500/401 body of the failing
       * storage included. On failover `output()` is called again: an output writing to a single destination
       * (HTTP response of the caller, append stream) receives the error body, then the file.
       */
      it('[RISK] a stream download should not write the error body of the failing storage into an output stream', function (done) {
        const _s3 = createS3(2);
        nock(urls[0]).get('/data-0/file.txt').reply(500, 'Internal Error');
        nock(urls[1]).get('/data-1/file.txt').reply(200, 'content');
        let _written = '';
        let _outputs = 0;
        const _output = () => {
          _outputs++;
          return new stream.Writable({ write (chunk, enc, cb) { _written += chunk; cb(); } });
        };
        _s3.downloadFile('data', 'file.txt', { output: _output }, (err, resp) => {
          assert.strictEqual(err, null);
          assert.strictEqual(resp.statusCode, 200);
          resp.on?.('end', () => {});
          setTimeout(() => {
            assert.strictEqual(_outputs, 1);
            assert.strictEqual(_written, 'content');
            done();
          }, 20);
        });
      });
    });
  });

  describe('Swift', function () {
    const auths = ['https://auth-0.failover.test/v3', 'https://auth-1.failover.test/v3', 'https://auth-2.failover.test/v3'];
    const regions = ['GRA', 'SBG', 'DE'];
    const endpoints = regions.map(r => `https://swift-${r.toLowerCase()}.failover.test/v1/AUTH_x`);
    let _events = [];

    /** Keystone v3 token response with an object-store endpoint for `region` */
    function catalog (region) {
      return { token: { catalog: [{ type: 'object-store', endpoints: [{ region, interface: 'public', url: endpoints[regions.indexOf(region)] }] }] } };
    }

    function authOK (index, token = `token-${index}`) {
      return nock(auths[index]).post('/auth/tokens').reply(200, catalog(regions[index]), { 'X-Subject-Token': token });
    }

    /** A new client of `count` storages (lazy connection), the container alias "data" is "data-<index>" on each storage */
    function createSwift (count, authUrls = auths) {
      _events = [];
      const _storages = [];
      for (let i = 0; i < count; i++) {
        _storages.push({ username: `user-${i}`, password: `password-${i}`, authUrl: authUrls[i], region: regions[i], buckets: { data: `data-${i}` } });
      }
      const _swift = storageSDK(_storages);
      _swift.setLogFunction((message, level, fields) => _events.push(fields?.event));
      return _swift;
    }

    function download (client, options = {}) {
      return new Promise((resolve) => client.downloadFile('data', 'file.txt', options, (err, resp) => resolve({ err, resp })));
    }

    describe('N=3 storages, lazy authentication', function () {
      it('should authenticate on the third storage if the first returns a 500 and the second a 401 (wrong credentials)', function (done) {
        const _swift = createSwift(3);
        const _a0 = nock(auths[0]).post('/auth/tokens').reply(500);
        const _a1 = nock(auths[1]).post('/auth/tokens').reply(401);
        const _a2 = authOK(2);
        const _r2 = nock(endpoints[2], { reqheaders: { 'x-auth-token': 'token-2' } }).get('/data-2/file.txt').reply(200, 'third');
        download(_swift).then(({ err, resp }) => {
          assert.strictEqual(err, null);
          assert.strictEqual(resp.body.toString(), 'third');
          assert.ok(_a0.isDone() && _a1.isDone() && _a2.isDone() && _r2.isDone());
          assert.strictEqual(_swift.getConfig().activeStorage, 2);
          assert.strictEqual(_events.filter(e => e === 'storage_fallback').length, 2);
          done();
        }).catch(done);
      });

      it('should return an error if all authentications fail, authenticate once per storage and restart on the main storage', function (done) {
        const _swift = createSwift(3);
        let _auths = [0, 0, 0];
        for (let i = 0; i < 3; i++) {
          nock(auths[i]).post('/auth/tokens').times(5).reply(() => { _auths[i]++; return [500]; });
        }
        download(_swift).then(({ err }) => {
          assert.strictEqual(err.message, 'Object Storages are not available');
          assert.strictEqual(err.storageStatusCode, 500);
          assert.deepStrictEqual(_auths, [1, 1, 1]);
          assert.strictEqual(_swift.getConfig().activeStorage, 0);
          nock.cleanAll();
          _auths = [0, 0, 0];
          const _a0 = authOK(0);
          const _r0 = nock(endpoints[0]).get('/data-0/file.txt').reply(200, 'main');
          return download(_swift).then(({ err, resp }) => {
            assert.strictEqual(err, null);
            assert.strictEqual(resp.body.toString(), 'main');
            assert.ok(_a0.isDone() && _r0.isDone());
            done();
          });
        }).catch(done);
      });

      it('should fail over to the next storage if the main storage catalog has no object-store, or no endpoint for the region', function (done) {
        const _swift = createSwift(3);
        nock(auths[0]).post('/auth/tokens').reply(200, { token: { catalog: [] } }, { 'X-Subject-Token': 'token-0' });
        nock(auths[1]).post('/auth/tokens').reply(200, catalog('GRA'), { 'X-Subject-Token': 'token-1' });
        authOK(2);
        const _r2 = nock(endpoints[2]).get('/data-2/file.txt').reply(200, 'third');
        download(_swift).then(({ err, resp }) => {
          assert.strictEqual(err, null);
          assert.strictEqual(resp.body.toString(), 'third');
          assert.ok(_r2.isDone());
          assert.strictEqual(_swift.getConfig().token, 'token-2');
          done();
        }).catch(done);
      });
    });

    describe('Request failures', function () {
      it('should let rock-req retry a network error once, then fail over and keep the next requests on the fallback', function (done) {
        const _swift = createSwift(2);
        authOK(0);
        let _main = 0;
        nock(endpoints[0]).get('/data-0/file.txt').times(rockAttempts()).replyWithError(networkError('ECONNRESET'));
        nock(endpoints[0]).get('/data-0/file.txt').times(5).reply(() => { _main++; return [200, 'main']; });
        authOK(1);
        nock(endpoints[1], { reqheaders: { 'x-auth-token': 'token-1' } }).get('/data-1/file.txt').times(2).reply(200, 'second');
        download(_swift).then(({ err, resp }) => {
          assert.strictEqual(err, null);
          assert.strictEqual(resp.body.toString(), 'second');
          assert.strictEqual(_swift.getConfig().activeStorage, 1);
          return download(_swift);
        }).then(({ resp }) => {
          assert.strictEqual(resp.body.toString(), 'second');
          assert.strictEqual(_main, 0);
          done();
        }).catch(done);
      });

      it('should return a 404 of the main storage without switching storage', function (done) {
        const _swift = createSwift(2);
        authOK(0);
        nock(endpoints[0]).get('/data-0/file.txt').reply(404);
        download(_swift).then(({ err, resp }) => {
          assert.strictEqual(err, null);
          assert.strictEqual(resp.statusCode, 404);
          assert.strictEqual(_swift.getConfig().activeStorage, 0);
          assert.strictEqual(_events.includes('storage_fallback'), false);
          done();
        }).catch(done);
      });

      it('should renew an expired token of the fallback storage on the fallback storage (credentials of the fallback)', function (done) {
        const _swift = createSwift(2);
        nock(auths[0]).post('/auth/tokens').reply(500);
        authOK(1, 'token-1');
        nock(endpoints[1], { reqheaders: { 'x-auth-token': 'token-1' } }).get('/data-1/file.txt').reply(401);
        const _reauth = nock(auths[1]).post('/auth/tokens', (body) => body.auth.identity.password.user.name === 'user-1').reply(200, catalog('SBG'), { 'X-Subject-Token': 'token-1-new' });
        nock(endpoints[1], { reqheaders: { 'x-auth-token': 'token-1-new' } }).get('/data-1/file.txt').reply(200, 'second');
        download(_swift).then(({ err, resp }) => {
          assert.strictEqual(err, null);
          assert.strictEqual(resp.body.toString(), 'second');
          assert.ok(_reauth.isDone());
          assert.strictEqual(_swift.getConfig().activeStorage, 1);
          done();
        }).catch(done);
      });

      it('should retry without a new authentication if a parallel request has already renewed the token', function (done) {
        const _swift = createSwift(1);
        authOK(0, 'token-old');
        _swift.connection((err) => {
          assert.strictEqual(err, null);
          let _auths = 0;
          nock(auths[0]).post('/auth/tokens').times(3).reply(() => { _auths++; return [200, catalog('GRA'), { 'X-Subject-Token': 'token-new' }]; });
          nock(endpoints[0], { reqheaders: { 'x-auth-token': 'token-old' } })
            .get('/data-0/a').reply(401)
            .get('/data-0/b').delay(100).reply(401);
          nock(endpoints[0], { reqheaders: { 'x-auth-token': 'token-new' } })
            .get('/data-0/a').reply(200, 'a')
            .get('/data-0/b').reply(200, 'b');
          const _get = (name) => new Promise((resolve) => _swift.downloadFile('data', name, (err, resp) => resolve({ err, resp })));
          Promise.all([_get('a'), _get('b')]).then(([a, b]) => {
            assert.strictEqual(a.resp.body.toString(), 'a');
            assert.strictEqual(b.resp.body.toString(), 'b');
            assert.strictEqual(_auths, 1);
            done();
          }).catch(done);
        });
      });

      it('should return the second 401 of a stream request as a response', function (done) {
        const _swift = createSwift(1);
        authOK(0);
        authOK(0, 'token-0-new');
        nock(endpoints[0]).get('/data-0/file.txt').reply(401, 'Unauthorized').get('/data-0/file.txt').reply(401, 'Unauthorized');
        const _output = () => new stream.Writable({ write (chunk, enc, cb) { cb(); } });
        _swift.downloadFile('data', 'file.txt', { output: _output }, (err, resp) => {
          assert.strictEqual(err, null);
          assert.strictEqual(resp.statusCode, 401);
          done();
        });
      });

      it('should remap the container alias of the bulk-delete body on the fallback storage', function (done) {
        const _swift = createSwift(2);
        authOK(0);
        /** A 5xx is sent once, then the request is sent to the next storage */
        nock(endpoints[0]).post('/?bulk-delete').reply(500);
        authOK(1);
        const _r1 = nock(endpoints[1]).post('/?bulk-delete', 'data-1/file1.txt\ndata-1/file2.txt\n').reply(200, { 'Number Deleted': 2 }, { 'content-type': 'application/json' });
        _swift.deleteFiles('data', ['file1.txt', 'file2.txt'], (err, resp) => {
          assert.strictEqual(err, null);
          assert.strictEqual(resp.body['Number Deleted'], 2);
          assert.ok(_r1.isDone());
          done();
        });
      });

      it('should upload a stream body (function) again on the fallback storage', function (done) {
        const _swift = createSwift(2);
        authOK(0);
        nock(endpoints[0]).put('/data-0/file.txt').reply(500);
        authOK(1);
        const _r1 = nock(endpoints[1]).put('/data-1/file.txt', 'stream content').reply(201);
        let _bodies = 0;
        const _body = () => {
          _bodies++;
          return stream.Readable.from([Buffer.from('stream '), Buffer.from('content')]);
        };
        _swift.uploadFile('data', 'file.txt', _body, (err, resp) => {
          assert.strictEqual(err, null);
          assert.strictEqual(resp.statusCode, 201);
          assert.ok(_r1.isDone());
          /** A new stream for each attempt: main storage, fallback storage */
          assert.strictEqual(_bodies, 2);
          done();
        });
      });

      it('should rethrow an exception of a callback called synchronously by the connection', function () {
        const _swift = createSwift(1);
        _swift.setStorages([]);
        assert.throws(() => _swift.connection(() => {
          throw new Error('caller error');
        }), /caller error/);
      });
    });

    describe('Shared authentication on failover', function () {
      function parallel (client, count) {
        const _calls = new Array(count).fill(0);
        return Promise.all(_calls.map((x, i) => new Promise((resolve) => client.downloadFile('data', 'file.txt', (err, resp) => { _calls[i]++; resolve({ err, resp }); })))).then((results) => ({ results, calls: _calls }));
      }

      it('50 parallel requests failing with a 500 on the main storage share the authentications on the fallback (not one per request)', function (done) {
        const _swift = createSwift(2);
        let _auth0 = 0;
        nock(auths[0]).post('/auth/tokens').times(50).reply(() => { _auth0++; return [200, catalog('GRA'), { 'X-Subject-Token': 'token-0' }]; });
        nock(endpoints[0]).get('/data-0/file.txt').times(50).reply(500);
        let _auth1 = 0;
        nock(auths[1]).post('/auth/tokens').times(50).reply(() => { _auth1++; return [200, catalog('SBG'), { 'X-Subject-Token': 'token-1' }]; });
        nock(endpoints[1], { reqheaders: { 'x-auth-token': 'token-1' } }).get('/data-1/file.txt').times(50).reply(200, 'second');
        parallel(_swift, 50).then(({ results }) => {
          for (const { err, resp } of results) {
            assert.strictEqual(err, null);
            assert.strictEqual(resp.body.toString(), 'second');
          }
          /**
           * Not one authentication per request: one shared by the requests sent to the fallback while the main storage is
           * still active (below the threshold of 3 consecutive failures), one when the fallback is activated
           */
          assert.strictEqual(_auth1, 2);
          assert.strictEqual(_auth0, 1);
          assert.strictEqual(_events.filter(e => e === 'storage_fallback').length, 1);
          assert.strictEqual(_swift.getConfig().activeStorage, 1);
          done();
        }).catch(done);
      });

      /**
       * The active storage is switched after 3 consecutive failures. Each storage is authenticated once per activation, plus once
       * for the requests sent to it while it is not the active one (token kept): not once per request
       */
      it('50 parallel requests with every storage answering 500: one authentication per storage activation, each callback once with the error, then the main storage again', function (done) {
        const _swift = createSwift(2);
        const _switches = [];
        _swift.setLogFunction((message, level, fields) => {
          _events.push(fields?.event);
          if (fields?.event === 'storage_fallback') {
            _switches.push(fields.from);
          }
        });
        const _auths = [0, 0];
        nock(auths[0]).post('/auth/tokens').times(50).reply(() => { _auths[0]++; return [200, catalog('GRA'), { 'X-Subject-Token': 'token-0' }]; });
        nock(auths[1]).post('/auth/tokens').times(50).reply(() => { _auths[1]++; return [200, catalog('SBG'), { 'X-Subject-Token': 'token-1' }]; });
        nock(endpoints[0]).get('/data-0/file.txt').times(50).reply(500);
        nock(endpoints[1]).get('/data-1/file.txt').times(50).reply(500);
        parallel(_swift, 50).then(({ results, calls }) => {
          for (const { err } of results) {
            assert.strictEqual(err.message, 'Object Storages are not available');
            assert.strictEqual(err.storageStatusCode, 500);
          }
          /**
           * A single switch per storage: the failures of the requests sent before a switch are not counted again. One authentication
           * on the main storage, two on the fallback: one shared by the requests sent to it below the threshold, one when it is activated
           */
          assert.deepStrictEqual(_switches, [0, 1]);
          assert.deepStrictEqual(_auths, [1, 2]);
          assert.ok(calls.every(c => c === 1));
          assert.strictEqual(_swift.getConfig().activeStorage, 0);
          assert.strictEqual(_swift.getConfig().token, '');
          nock.cleanAll();
          authOK(0);
          nock(endpoints[0]).get('/data-0/file.txt').reply(200, 'main');
          return download(_swift);
        }).then(({ err, resp }) => {
          assert.strictEqual(err, null);
          assert.strictEqual(resp.body.toString(), 'main');
          done();
        }).catch(done);
      });

      it('a fallback authentication finishing after the "all down" reset never writes the endpoint of the fallback while the main storage is active', function (done) {
        /**
         * Request A fails on the main and on the fallback authentication (500), request B joins the second, slow, fallback authentication.
         * The main storage fails with a network error not retried by rock-req (EPROTO): immediate switch, both requests fail at the same time.
         * A 5xx would switch only after 3 consecutive failures
         */
        const _swift = createSwift(2);
        authOK(0);
        /** The regular expression is matched against the whole path, the account path of the endpoint included */
        nock(endpoints[0]).get(/^\/v1\/AUTH_x\/data-0\/[AB]$/).times(2).replyWithError(networkError('EPROTO'));
        nock(auths[1]).post('/auth/tokens').reply(500);
        nock(auths[1]).post('/auth/tokens').times(5).delay(50).reply(200, catalog('SBG'), { 'X-Subject-Token': 'token-1' });
        const _fallbackHits = [];
        nock(endpoints[1]).get(/.*/).times(10).reply(function (uri) { _fallbackHits.push(uri); return [200, 'fallback']; });
        _swift.connection(() => {
          const _get = (name) => new Promise((resolve) => _swift.downloadFile('data', name, (err, resp) => resolve({ err, resp })));
          Promise.all([_get('A'), _get('B')]).then(() => {
            const _main = nock(endpoints[0]).get('/data-0/after').reply(200, 'main');
            authOK(0);
            return _get('after').then(({ err, resp }) => {
              assert.strictEqual(err, null);
              assert.strictEqual(resp.body.toString(), 'main');
              assert.ok(_main.isDone());
              const _config = _swift.getConfig();
              assert.strictEqual(_config.endpoints.url.startsWith(endpoints[_config.activeStorage]), true);
              assert.deepStrictEqual(_fallbackHits.filter(u => u.includes('data-0')), []);
              done();
            });
          }).catch(done);
        });
      });

      it('an exception thrown by the callback of one waiting request does not strand the other waiting requests', function (done) {
        const _swift = createSwift(1);
        authOK(0);
        nock(endpoints[0]).get('/data-0/file.txt').reply(200, 'main');
        const _uncaught = process.listeners('uncaughtException');
        process.removeAllListeners('uncaughtException');
        let _thrown = null;
        process.once('uncaughtException', (err) => { _thrown = err; });
        const _calls = [0, 0];
        /** The first request fails synchronously once authenticated (invalid header), its callback throws */
        _swift.downloadFile('data', 'file.txt', { headers: { 'x-bad': 'a\nb' } }, () => {
          _calls[0]++;
          throw new Error('caller error');
        });
        _swift.downloadFile('data', 'file.txt', (err, resp) => {
          _calls[1]++;
          assert.strictEqual(err, null);
          assert.strictEqual(resp.body.toString(), 'main');
        });
        setTimeout(() => {
          _uncaught.forEach((l) => process.on('uncaughtException', l));
          assert.deepStrictEqual(_calls, [1, 1]);
          assert.strictEqual(_thrown?.message, 'caller error');
          done();
        }, 50);
      });
    });

    describe('Return to the main storage (probe)', function () {
      const _realNow = Date.now;
      let _now = 0;
      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      /** End of a failed probe whose answer is retried by rock-req (503, ECONNRESET: s3.test.js sets a retryDelay of 200 ms) */
      const probeFailed = async (count) => {
        for (let i = 0; i < 200 && _events.filter(e => e === 'storage_main_unavailable').length < count; i++) {
          await sleep(5);
        }
      };
      /** Move the clock of the client forward (Date.now is stubbed, the timers are real) */
      const advance = (ms) => { _now += ms; };
      /** The probe: HEAD on the account URL of the main storage */
      const headMain = (token = 'token-0') => nock('https://swift-gra.failover.test', { reqheaders: { 'x-auth-token': token } }).head('/v1/AUTH_x');

      beforeEach(function () {
        _now = _realNow();
        Date.now = () => _now;
      });

      afterEach(function () {
        Date.now = _realNow;
      });

      /** Main storage down at the first authentication: the client is on the fallback, its token is "token-1" */
      function onFallback () {
        const _swift = createSwift(2);
        nock(auths[0]).post('/auth/tokens').reply(500);
        authOK(1);
        nock(endpoints[1]).get('/data-1/file.txt').times(20).reply(200, 'second');
        return download(_swift).then(({ resp }) => {
          assert.strictEqual(resp.body.toString(), 'second');
          assert.strictEqual(_swift.getConfig().activeStorage, 1);
          return _swift;
        });
      }

      /** Count the probes (authentications on the main storage) answered by `reply` */
      function countAuthMain (reply) {
        const _count = { n: 0 };
        nock(auths[0]).post('/auth/tokens').times(20).reply(() => { _count.n++; return reply(); });
        return _count;
      }

      it('should return to the main storage when it is available again: authentication and HEAD of the account OK', function (done) {
        onFallback().then((_swift) => {
          const _probes = countAuthMain(() => [200, catalog('GRA'), { 'X-Subject-Token': 'token-0' }]);
          const _head = headMain().reply(204);
          /** Less than 60 s after the failover: no probe */
          advance(59999);
          return download(_swift).then(() => sleep(20)).then(() => {
            assert.strictEqual(_probes.n, 0);
            advance(1);
            return download(_swift);
          }).then(({ resp }) => {
            /** The request that starts the probe is served by the fallback */
            assert.strictEqual(resp.body.toString(), 'second');
            return sleep(20);
          }).then(() => {
            assert.strictEqual(_probes.n, 1);
            assert.ok(_head.isDone());
            assert.strictEqual(_swift.getConfig().activeStorage, 0);
            assert.strictEqual(_swift.getConfig().token, 'token-0');
            assert.ok(_events.includes('storage_main_restored'));
            nock(endpoints[0], { reqheaders: { 'x-auth-token': 'token-0' } }).get('/data-0/file.txt').reply(200, 'main');
            return download(_swift);
          }).then(({ err, resp }) => {
            assert.strictEqual(err, null);
            assert.strictEqual(resp.body.toString(), 'main');
            /** No new authentication: the token of the probe is used */
            assert.strictEqual(_probes.n, 1);
            done();
          });
        }).catch(done);
      });

      it('should stay on the fallback if Keystone answers but the HEAD of the main region fails (503)', function (done) {
        onFallback().then((_swift) => {
          const _probes = countAuthMain(() => [200, catalog('GRA'), { 'X-Subject-Token': 'token-0' }]);
          const _head = headMain().times(rockAttempts()).reply(503);
          advance(60000);
          return download(_swift).then(() => probeFailed(1)).then(() => {
            assert.strictEqual(_probes.n, 1);
            assert.ok(_head.isDone());
            assert.strictEqual(_swift.getConfig().activeStorage, 1);
            assert.strictEqual(_swift.getConfig().token, 'token-1');
            assert.ok(_swift.getConfig().endpoints.url.startsWith(endpoints[1]));
            assert.strictEqual(_events.includes('storage_main_restored'), false);
            assert.strictEqual(_events.filter(e => e === 'storage_main_unavailable').length, 1);
            return download(_swift);
          }).then(({ resp }) => {
            assert.strictEqual(resp.body.toString(), 'second');
            done();
          });
        }).catch(done);
      });

      it('should send a single probe for parallel requests, and none within 60 s', function (done) {
        onFallback().then((_swift) => {
          const _probes = countAuthMain(() => [200, catalog('GRA'), { 'X-Subject-Token': 'token-0' }]);
          headMain().delay(30).reply(204);
          advance(60000);
          return Promise.all([download(_swift), download(_swift), download(_swift), download(_swift)]).then((results) => {
            for (const { resp } of results) {
              assert.strictEqual(resp.body.toString(), 'second');
            }
            return sleep(60);
          }).then(() => {
            assert.strictEqual(_probes.n, 1);
            assert.strictEqual(_swift.getConfig().activeStorage, 0);
            done();
          });
        }).catch(done);
      });

      it('should double the delay between probes on each failure, up to 10 min, and reset it on success', function (done) {
        onFallback().then(async (_swift) => {
          let _up = false;
          const _probes = countAuthMain(() => _up ? [200, catalog('GRA'), { 'X-Subject-Token': 'token-0' }] : [500]);
          let _expected = 0;
          for (const _delay of [60000, 120000, 240000, 480000, 600000, 600000]) {
            advance(_delay - 1);
            await download(_swift);
            await sleep(10);
            assert.strictEqual(_probes.n, _expected, `no probe before ${_delay} ms`);
            advance(1);
            await download(_swift);
            await sleep(10);
            assert.strictEqual(_probes.n, ++_expected, `a probe after ${_delay} ms`);
          }
          assert.strictEqual(_events.filter(e => e === 'storage_main_unavailable').length, 6);
          assert.strictEqual(_swift.getConfig().activeStorage, 1);
          /** The main storage is back: restored, then it fails again: the next probe is 60 s after this new failover */
          _up = true;
          headMain().reply(204);
          advance(600000);
          await download(_swift);
          await sleep(10);
          assert.strictEqual(_swift.getConfig().activeStorage, 0);
          _up = false;
          /** Unreachable (network error, retried once by rock-req): immediate failover. A 5xx would need 3 consecutive failures */
          nock(endpoints[0]).get('/data-0/file.txt').times(rockAttempts()).replyWithError(networkError('ECONNRESET'));
          authOK(1);
          assert.strictEqual((await download(_swift)).resp.body.toString(), 'second');
          assert.strictEqual(_swift.getConfig().activeStorage, 1);
          const _before = _probes.n;
          advance(59999);
          await download(_swift);
          await sleep(10);
          assert.strictEqual(_probes.n, _before);
          advance(1);
          await download(_swift);
          await sleep(10);
          assert.strictEqual(_probes.n, _before + 1);
          done();
        }).catch(done);
      });

      it('should discard the probe if setStorages() is called meanwhile', function (done) {
        onFallback().then((_swift) => {
          countAuthMain(() => [200, catalog('GRA'), { 'X-Subject-Token': 'token-0' }]);
          headMain().delay(30).reply(204);
          advance(60000);
          return download(_swift).then(() => {
            _swift.setStorages([{ username: 'user-x', password: 'password-x', authUrl: auths[2], region: 'DE' }]);
            return sleep(60);
          }).then(() => {
            const _config = _swift.getConfig();
            assert.strictEqual(_config.activeStorage, 0);
            assert.strictEqual(_config.token, '');
            assert.deepStrictEqual(_config.endpoints, {});
            assert.strictEqual(_events.includes('storage_main_restored'), false);
            done();
          });
        }).catch(done);
      });

      it('should discard the probe if an authentication is in progress, the requests in progress finish on the fallback', function (done) {
        onFallback().then((_swift) => {
          countAuthMain(() => [200, catalog('GRA'), { 'X-Subject-Token': 'token-0' }]);
          headMain().reply(204);
          /** A 401 on the fallback: slow reconnection on the fallback, the probe ends meanwhile */
          nock(endpoints[1], { reqheaders: { 'x-auth-token': 'token-1' } }).get('/data-1/expired.txt').reply(401);
          nock(auths[1]).post('/auth/tokens').delay(50).reply(200, catalog('SBG'), { 'X-Subject-Token': 'token-1b' });
          nock(endpoints[1], { reqheaders: { 'x-auth-token': 'token-1b' } }).get('/data-1/expired.txt').reply(200, 'renewed');
          advance(60000);
          return new Promise((resolve) => _swift.downloadFile('data', 'expired.txt', (err, resp) => resolve({ err, resp }))).then(({ err, resp }) => {
            assert.strictEqual(err, null);
            assert.strictEqual(resp.body.toString(), 'renewed');
            assert.strictEqual(_swift.getConfig().activeStorage, 1);
            assert.strictEqual(_swift.getConfig().token, 'token-1b');
            assert.strictEqual(_events.includes('storage_main_restored'), false);
            done();
          });
        }).catch(done);
      });

      it('should never probe while the main storage is active', function (done) {
        const _swift = createSwift(2);
        const _probes = countAuthMain(() => [200, catalog('GRA'), { 'X-Subject-Token': 'token-0' }]);
        nock(endpoints[0]).get('/data-0/file.txt').times(3).reply(200, 'main');
        download(_swift).then(() => {
          advance(3600000);
          return download(_swift);
        }).then(() => sleep(20)).then(() => {
          assert.strictEqual(_probes.n, 1);
          assert.strictEqual(_events.filter(e => e === 'storage_connecting').length, 1);
          done();
        }).catch(done);
      });

      it('should never return a probe error to a caller nor throw (synchronous throw, network error, malformed catalog)', function (done) {
        /** authUrl "ftp://x": the HTTP client throws synchronously, on the first authentication and on the probe */
        const _swift = createSwift(2, ['ftp://x', auths[1]]);
        authOK(1);
        nock(endpoints[1]).get('/data-1/file.txt').times(20).reply(200, 'second');
        const _calls = [];
        const _get = () => new Promise((resolve) => _swift.downloadFile('data', 'file.txt', (err, resp) => { _calls.push(err); resolve({ err, resp }); }));
        _get().then(async ({ resp }) => {
          assert.strictEqual(resp.body.toString(), 'second');
          advance(60000);
          assert.strictEqual((await _get()).resp.body.toString(), 'second');
          await sleep(10);
          assert.strictEqual(_events.filter(e => e === 'storage_main_unavailable').length, 1);
          /** A malformed catalog, then a network error on the HEAD */
          _swift.getStorages()[0].authUrl = auths[0];
          nock(auths[0]).post('/auth/tokens').reply(200, { token: {} }, { 'X-Subject-Token': 'token-0' });
          advance(120000);
          assert.strictEqual((await _get()).resp.body.toString(), 'second');
          await sleep(20);
          assert.strictEqual(_events.filter(e => e === 'storage_main_unavailable').length, 2);
          authOK(0);
          headMain().times(rockAttempts()).replyWithError(networkError('ECONNRESET'));
          advance(240000);
          assert.strictEqual((await _get()).resp.body.toString(), 'second');
          await probeFailed(3);
          assert.strictEqual(_events.filter(e => e === 'storage_main_unavailable').length, 3);
          assert.strictEqual(_swift.getConfig().activeStorage, 1);
          assert.ok(_calls.every(err => err === null));
          assert.strictEqual(_calls.length, 4);
          done();
        }).catch(done);
      });

      it('should log the probe failure at the info level, with the structured fields', function (done) {
        const _logs = [];
        onFallback().then((_swift) => {
          _swift.setLogFunction((message, level, fields) => { _events.push(fields?.event); _logs.push({ message, level, fields }); });
          countAuthMain(() => [503]);
          advance(60000);
          return download(_swift).then(() => probeFailed(1)).then(() => {
            const _probe = _logs.filter(l => l.fields.event === 'storage_main_unavailable');
            assert.strictEqual(_probe.length, 1);
            assert.strictEqual(_probe[0].level, 'info');
            assert.deepStrictEqual(_probe[0].fields, { event: 'storage_main_unavailable', storage: 'swift', index: 0, region: 'GRA', status: 503, code: undefined });
            assert.strictEqual(_logs.some(l => l.level === 'error'), false);
            done();
          });
        }).catch(done);
      });
    });

    describe('Malformed authentication response and synchronous throw of the HTTP client (guard of connection())', function () {
      /** Two parallel downloads (the second one waits for the shared authentication): resolves with each result and the number of calls of each callback */
      function twoParallelDownloads (client) {
        const _calls = [0, 0];
        const _results = [];
        return new Promise((resolve) => {
          for (let i = 0; i < 2; i++) {
            client.downloadFile('data', 'file.txt', (err, resp) => {
              _calls[i]++;
              _results[i] = { err, resp };
              if (_results.filter(Boolean).length === 2) {
                /** Wait: a second call of a callback would be counted */
                setTimeout(() => resolve({ calls: _calls, results: _results }), 50);
              }
            });
          }
        });
      }

      /** A later request must authenticate again: the shared connection is not stuck */
      function assertAuthenticatesAgain (client, done) {
        const _a0 = authOK(0);
        const _r0 = nock(endpoints[0]).get('/data-0/file.txt').reply(200, 'main');
        download(client).then(({ err, resp }) => {
          assert.strictEqual(err, null);
          assert.strictEqual(resp.body.toString(), 'main');
          assert.ok(_a0.isDone() && _r0.isDone());
          done();
        }).catch(done);
      }

      const malformed = [
        { name: 'a 2xx with an empty body (data null)', status: 201, body: '' },
        { name: 'a 2xx without "token"', status: 200, body: { foo: 1 } },
        { name: 'a 2xx with an object-store catalog entry without "endpoints"', status: 201, body: { token: { catalog: [{ type: 'object-store' }] } } }
      ];

      for (const variant of malformed) {
        it(`single storage, ${variant.name}: each callback is called once with the error, then a later request authenticates again`, function (done) {
          const _swift = createSwift(1);
          const _a0 = nock(auths[0]).post('/auth/tokens').reply(variant.status, variant.body, { 'X-Subject-Token': 'token-0', 'Content-Type': 'application/json' });
          twoParallelDownloads(_swift).then(({ calls, results }) => {
            assert.deepStrictEqual(calls, [1, 1]);
            for (const { err } of results) {
              assert.strictEqual(err.message, 'Object Storages are not available');
            }
            assert.ok(_a0.isDone());
            assert.strictEqual(_swift.getConfig().activeStorage, 0);
            assertAuthenticatesAgain(_swift, done);
          }).catch(done);
        });

        it(`two storages, ${variant.name} on the main: both requests are served by the fallback storage, each callback once`, function (done) {
          const _swift = createSwift(2);
          nock(auths[0]).post('/auth/tokens').reply(variant.status, variant.body, { 'X-Subject-Token': 'token-0', 'Content-Type': 'application/json' });
          const _a1 = authOK(1);
          const _r1 = nock(endpoints[1], { reqheaders: { 'x-auth-token': 'token-1' } }).get('/data-1/file.txt').times(2).reply(200, 'second');
          twoParallelDownloads(_swift).then(({ calls, results }) => {
            assert.deepStrictEqual(calls, [1, 1]);
            for (const { err, resp } of results) {
              assert.strictEqual(err, null);
              assert.strictEqual(resp.body.toString(), 'second');
            }
            assert.ok(_a1.isDone() && _r1.isDone());
            assert.strictEqual(_swift.getConfig().activeStorage, 1);
            done();
          }).catch(done);
        });
      }

      it('synchronous throw on the fallback (authUrl "ftp://x"), main returns a 500: each callback once with the error, then a later request authenticates again', function (done) {
        const _swift = createSwift(2, [auths[0], 'ftp://x']);
        const _a0 = nock(auths[0]).post('/auth/tokens').reply(500);
        twoParallelDownloads(_swift).then(({ calls, results }) => {
          assert.deepStrictEqual(calls, [1, 1]);
          for (const { err } of results) {
            assert.strictEqual(err.message, 'Object Storages are not available');
            assert.strictEqual(err.cause?.code, 'ERR_INVALID_PROTOCOL');
          }
          assert.ok(_a0.isDone());
          assert.strictEqual(_swift.getConfig().activeStorage, 0);
          assert.ok(_events.includes('storage_connection_failed'));
          assertAuthenticatesAgain(_swift, done);
        }).catch(done);
      });

      it('synchronous throw on the second storage, a third storage is available: both requests are served by the third storage', function (done) {
        const _swift = createSwift(3, [auths[0], 'ftp://x', auths[2]]);
        nock(auths[0]).post('/auth/tokens').reply(500);
        const _a2 = authOK(2);
        const _r2 = nock(endpoints[2]).get('/data-2/file.txt').times(2).reply(200, 'third');
        twoParallelDownloads(_swift).then(({ calls, results }) => {
          assert.deepStrictEqual(calls, [1, 1]);
          for (const { err, resp } of results) {
            assert.strictEqual(err, null);
            assert.strictEqual(resp.body.toString(), 'third');
          }
          assert.ok(_a2.isDone() && _r2.isDone());
          assert.strictEqual(_swift.getConfig().activeStorage, 2);
          done();
        }).catch(done);
      });

      it('synchronous throw on a single storage (authUrl "ftp://x"): the error is returned, connection() can be called again', function (done) {
        const _swift = createSwift(1, ['ftp://x']);
        let _calls = 0;
        _swift.connection((err) => {
          _calls++;
          assert.strictEqual(err.message, 'Object Storages are not available');
          setTimeout(() => {
            assert.strictEqual(_calls, 1);
            _swift.connection((err) => {
              assert.strictEqual(err.message, 'Object Storages are not available');
              done();
            });
          }, 20);
        });
      });

      it('an exception thrown by the caller callback of a successful authentication is not swallowed and the callback is not called twice', function (done) {
        const _swift = createSwift(1);
        authOK(0);
        let _calls = 0;
        /** Mocha's handler is restored in any case: the exception must reach the process, not the test runner */
        const _listeners = process.listeners('uncaughtException');
        const _restore = () => {
          clearTimeout(_guard);
          process.removeListener('uncaughtException', _onUncaught);
          _listeners.forEach(l => process.listeners('uncaughtException').includes(l) === false && process.on('uncaughtException', l));
        };
        const _guard = setTimeout(() => {
          _restore();
          done(new Error('the exception of the caller was swallowed'));
        }, 1000);
        const _onUncaught = (err) => {
          _restore();
          assert.strictEqual(err.message, 'caller error');
          setTimeout(() => {
            assert.strictEqual(_calls, 1);
            done();
          }, 20);
        };
        process.removeAllListeners('uncaughtException');
        process.on('uncaughtException', _onUncaught);
        _swift.connection(() => {
          _calls++;
          throw new Error('caller error');
        });
      });
    });

    describe('Bugs and illogical behaviours', function () {
      /**
       * BUG (swift.js:47-55): after "Object Storages are not available" reached from a request failing on the last
       * storage, `activeStorage` is reset to 0 but `endpoints`/`token` still belong to the last storage. The next
       * request is sent to the endpoint of the last storage with the container alias of the main storage
       * ("/data-0/..." on SBG), and the main storage is not authenticated again.
       */
      it('[BUG] after all storages failed, the next request should authenticate again on the main storage', function (done) {
        const _swift = createSwift(2);
        nock(auths[0]).post('/auth/tokens').reply(500);
        authOK(1);
        /**
         * The last storage is unreachable (network error, retried once by rock-req): immediate switch past the last storage,
         * the main storage is active again. A single 5xx would not switch (threshold of 3 consecutive failures)
         */
        nock(endpoints[1]).get('/data-1/file.txt').times(rockAttempts()).replyWithError(networkError('ECONNRESET'));
        download(_swift).then(({ err }) => {
          assert.strictEqual(err.message, 'Object Storages are not available');
          assert.strictEqual(_swift.getConfig().activeStorage, 0);
          const _a0 = authOK(0);
          const _r0 = nock(endpoints[0]).get('/data-0/file.txt').reply(200, 'main');
          const _stale = nock(endpoints[1]).get('/data-0/file.txt').reply(404);
          return download(_swift).then(({ err, resp }) => {
            assert.strictEqual(_stale.isDone(), false, 'the request went to the endpoint of storage 1 with the alias of storage 0');
            assert.strictEqual(err, null);
            assert.strictEqual(resp.body.toString(), 'main');
            assert.ok(_a0.isDone() && _r0.isDone());
            done();
          });
        }).catch(done);
      });

      /**
       * ILLOGICAL (swift.js:473 + 492, 71): a request failing with a 5xx/network error switches the storage and calls
       * connection() with the ORIGINAL storage index. If the authentication of the fallback fails,
       * activateFallbackStorage(original) does nothing and the SAME fallback is authenticated a second time
       * (doubles the failover latency with a black-hole fallback: 2 x timeout x rock-req attempts).
       */
      it('[BUG] a failing fallback authentication should be tried once per request failover', function (done) {
        const _swift = createSwift(3);
        authOK(0);
        nock(endpoints[0]).get('/data-0/file.txt').reply(500);
        let _auth1 = 0;
        nock(auths[1]).post('/auth/tokens').times(3).reply(() => { _auth1++; return [500]; });
        authOK(2);
        nock(endpoints[2]).get('/data-2/file.txt').reply(200, 'third');
        download(_swift).then(({ err, resp }) => {
          assert.strictEqual(err, null);
          assert.strictEqual(resp.body.toString(), 'third');
          assert.strictEqual(_auth1, 1);
          done();
        }).catch(done);
      });

      /**
       * RISK (swift.js:492): parallel requests failing with a 5xx call connection() directly (not sharedConnection),
       * each one authenticates on the fallback storage: N failed requests = N authentications (Keystone rate limits).
       */
      it('[RISK] parallel requests failing on the main storage should share the authentications on the fallback (not one per request)', function (done) {
        const _swift = createSwift(2);
        authOK(0);
        nock(endpoints[0]).get('/data-0/file.txt').times(3).reply(500);
        let _auth1 = 0;
        nock(auths[1]).post('/auth/tokens').times(3).reply(() => { _auth1++; return [200, catalog('SBG'), { 'X-Subject-Token': 'token-1' }]; });
        nock(endpoints[1]).get('/data-1/file.txt').times(3).reply(200, 'second');
        Promise.all([download(_swift), download(_swift), download(_swift)]).then((results) => {
          for (const { resp } of results) {
            assert.strictEqual(resp.body.toString(), 'second');
          }
          /** One authentication shared by the requests sent to the fallback below the threshold, one when the 3rd failure activates it */
          assert.strictEqual(_auth1, 2);
          assert.strictEqual(_events.filter(e => e === 'storage_fallback').length, 1);
          done();
        }).catch(done);
      });

      /**
       * ILLOGICAL / DOC MISMATCH: README.md:12 and USAGE-SWIFT.md:6 say "As soon as the main storage is available, the SDK
       * returns to the main storage". The Swift client had no health check (unlike S3): it stayed on the fallback
       * until the fallback failed or setStorages() was called. Writes kept going to the fallback (reproduced on OVH).
       * Now probed at most every 60 s (Date.now stubbed), see "Return to the main storage (probe)"
       */
      it('[DOC MISMATCH] should return to the main storage when it is available again', function (done) {
        const _realNow = Date.now;
        const _now = _realNow();
        Date.now = () => _now;
        const _swift = createSwift(2);
        nock(auths[0]).post('/auth/tokens').reply(500);
        authOK(1);
        nock(endpoints[1]).get('/data-1/file.txt').times(5).reply(200, 'second');
        authOK(0);
        nock('https://swift-gra.failover.test').head('/v1/AUTH_x').reply(204);
        nock(endpoints[0]).get('/data-0/file.txt').times(5).reply(200, 'main');
        const _end = (err) => {
          Date.now = _realNow;
          done(err);
        };
        download(_swift).then(() => {
          Date.now = () => _now + 60000;
          return download(_swift);
        }).then(() => new Promise((resolve) => setTimeout(resolve, 20))).then(() => download(_swift)).then(({ resp }) => {
          assert.strictEqual(resp.body.toString(), 'main');
          assert.strictEqual(_swift.getConfig().activeStorage, 0);
          _end();
        }).catch(_end);
      });

      /** RISK: same as S3, the error body of the failing storage is written into the output stream before the failover */
      it('[RISK] a stream download should not write the error body of the failing storage into an output stream', function (done) {
        const _swift = createSwift(2);
        authOK(0);
        nock(endpoints[0]).get('/data-0/file.txt').reply(500, 'Internal Error');
        authOK(1);
        nock(endpoints[1]).get('/data-1/file.txt').reply(200, 'content');
        let _written = '';
        let _outputs = 0;
        const _output = () => {
          _outputs++;
          return new stream.Writable({ write (chunk, enc, cb) { _written += chunk; cb(); } });
        };
        _swift.downloadFile('data', 'file.txt', { output: _output }, (err, resp) => {
          assert.strictEqual(err, null);
          assert.strictEqual(resp.statusCode, 200);
          setTimeout(() => {
            assert.strictEqual(_outputs, 1);
            assert.strictEqual(_written, 'content');
            done();
          }, 20);
        });
      });
    });
  });
});
