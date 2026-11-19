const assert = require('assert');
const nock   = require('nock');
const http   = require('http');
const fs     = require('fs');
const path   = require('path');
const stream = require('stream');
const xmlToJson = require('../xmlToJson.js');
const { getUrlParameters } = require('../helper.js');
/** Required lazily: s3.test.js sets `global.rockReqConf` before index.js is loaded for the first time */
const storageSDK = (config) => require('../index.js')(config);
const s3SDK = (config) => require('../s3.js')(config);

/**
 * Security fixes of 3.7.0: prototype pollution, ReDoS, synchronous throws escaping the callback, Swift bulk-delete
 * alias, Swift authentication redirect and storage validation. Plus the failover fixes found by the failover audit.
 */

const S3_URLS = ['https://s3-0.security.test', 'https://s3-1.security.test'];
const AUTH_URLS = ['https://auth-0.security.test/v3', 'https://auth-1.security.test/v3'];
const REGIONS = ['GRA', 'SBG'];
const ENDPOINTS = ['https://swift-gra.security.test/v1/AUTH_x', 'https://swift-sbg.security.test/v1/AUTH_x'];

function createS3 (count, urls = S3_URLS) {
  const _storages = [];
  for (let i = 0; i < count; i++) {
    _storages.push({ accessKeyId: `key-${i}`, secretAccessKey: `secret-${i}`, url: urls[i], region: `region-${i}`, buckets: { data: `data-${i}` } });
  }
  const _s3 = storageSDK(_storages);
  _s3.setLogFunction(() => {});
  return _s3;
}

function createSwift (count, buckets = (i) => ({ data: `data-${i}` })) {
  const _storages = [];
  for (let i = 0; i < count; i++) {
    _storages.push({ username: `user-${i}`, password: `password-${i}`, authUrl: AUTH_URLS[i], region: REGIONS[i], buckets: buckets(i) });
  }
  const _swift = storageSDK(_storages);
  _swift.setLogFunction(() => {});
  return _swift;
}

function authOK (index) {
  const _catalog = { token: { catalog: [{ type: 'object-store', endpoints: [{ region: REGIONS[index], interface: 'public', url: ENDPOINTS[index] }] }] } };
  return nock(AUTH_URLS[index]).post('/auth/tokens').reply(201, _catalog, { 'X-Subject-Token': `token-${index}` });
}

/** A local HTTP server replying 200 "ok" to every request: real `http.request` header validation, no nock */
function localServer () {
  return new Promise((resolve) => {
    const _server = http.createServer((req, res) => res.end('ok'));
    _server.listen(0, '127.0.0.1', () => resolve(_server));
  });
}

describe('Security', function () {

  afterEach(function () {
    nock.cleanAll();
  });

  describe('xmlToJson prototype pollution', function () {
    afterEach(function () {
      delete Object.prototype.isadmin;
    });

    it('should not write a `<__proto__>` element on Object.prototype, nor replace the prototype of the result', function () {
      const _json = xmlToJson('<__proto__>x</__proto__><__proto__><isadmin>true</isadmin></__proto__><name>b</name>');
      assert.strictEqual(({}).isadmin, undefined);
      assert.strictEqual(Object.getPrototypeOf(_json), Object.prototype);
      assert.strictEqual(_json.isadmin, undefined);
      assert.deepStrictEqual(_json, { name: 'b' });
    });

    it('should not pollute Object.prototype from an S3 listing or an S3 XML error', function (done) {
      const _s3 = createS3(1);
      nock(S3_URLS[0])
        .get('/data-0').query(true).reply(200, '<ListBucketResult><Name>b</Name><__proto__>x</__proto__><__proto__><isadmin>true</isadmin></__proto__></ListBucketResult>')
        .get('/data-0/file.txt').reply(403, '<__proto__>x</__proto__><__proto__><isadmin>true</isadmin></__proto__>', { 'content-type': 'application/xml' });
      _s3.listFiles('data', (err, resp) => {
        assert.strictEqual(err, null);
        assert.strictEqual(resp.body.name, 'b');
        assert.strictEqual(Object.getPrototypeOf(resp.body), Object.prototype);
        _s3.downloadFile('data', 'file.txt', (err, resp) => {
          assert.strictEqual(err, null);
          assert.strictEqual(resp.statusCode, 403);
          assert.strictEqual(({}).isadmin, undefined);
          done();
        });
      });
    });
  });

  describe('ReDoS', function () {
    it('xmlToJson should parse a body made of "<" in linear time', function () {
      const _start = Date.now();
      assert.deepStrictEqual(xmlToJson('<'.repeat(100000)), {});
      assert.deepStrictEqual(xmlToJson('<a '.repeat(100000)), {});
      assert.ok(Date.now() - _start < 500);
    });

    it('S3 listFiles should reject a body of opening root tags without closing tag in linear time', function (done) {
      const _s3 = createS3(1);
      nock(S3_URLS[0]).get('/data-0').query(true).reply(200, '<ListBucketResult>'.repeat(30000));
      const _start = Date.now();
      _s3.listFiles('data', (err) => {
        assert.ok(Date.now() - _start < 500);
        assert.strictEqual(err.message, 'S3 listFiles | Invalid response: "ListBucketResult" not found in the body');
        done();
      });
    });

    it('S3 listBuckets should still accept an empty "<Buckets/>" and a list of buckets', function (done) {
      const _s3 = createS3(1);
      nock(S3_URLS[0])
        .get('/').reply(200, '<ListAllMyBucketsResult><Owner><ID>1</ID></Owner><Buckets/></ListAllMyBucketsResult>')
        .get('/').reply(200, '<ListAllMyBucketsResult><Buckets><Bucket><Name>a</Name></Bucket></Buckets></ListAllMyBucketsResult>');
      _s3.listBuckets((err, resp) => {
        assert.strictEqual(err, null);
        assert.deepStrictEqual(resp.body, {});
        _s3.listBuckets((err, resp) => {
          assert.strictEqual(err, null);
          assert.deepStrictEqual(resp.body, { bucket: [{ name: 'a' }] });
          done();
        });
      });
    });
  });

  describe('S3 synchronous throws are returned to the callback', function () {
    let _server = null;
    let _s3 = null;
    const _file = path.join(__dirname, 'assets', 'file.txt');

    before(async function () {
      _server = await localServer();
      _s3 = createS3(1, [`http://127.0.0.1:${_server.address().port}`]);
    });

    after(function () {
      _server.close();
    });

    /** Call `fn(callback)`: it must not throw, and must call the callback once with an error */
    function expectError (fn, check, done) {
      let _calls = 0;
      assert.doesNotThrow(() => fn((err) => {
        _calls++;
        check(err);
        setTimeout(() => {
          assert.strictEqual(_calls, 1);
          done();
        }, 20);
      }));
    }

    it('should return an invalid header value (CRLF, non-latin1) of a Buffer upload', function (done) {
      expectError((cb) => _s3.uploadFile('b', 'k', Buffer.from('x'), { headers: { 'x-amz-meta-a': 'v\r\nX-Evil: 1' } }, cb), (err) => {
        assert.strictEqual(err.code, 'ERR_INVALID_CHAR');
      }, () => expectError((cb) => _s3.uploadFile('b', 'k', Buffer.from('x'), { headers: { 'x-amz-meta-a': 'café✓' } }, cb), (err) => {
        assert.strictEqual(err.code, 'ERR_INVALID_CHAR');
      }, done));
    });

    it('should return an invalid header value of a path upload (thrown in the fs callback before)', function (done) {
      expectError((cb) => _s3.uploadFile('b', 'k', _file, { headers: { 'x-amz-meta-a': 'v\r\nX: 1' } }, cb), (err) => {
        assert.strictEqual(err.code, 'ERR_INVALID_CHAR');
      }, done);
    });

    it('should return the URIError of a query with a lone surrogate of a path upload (fs callback)', function (done) {
      expectError((cb) => _s3.uploadFile('b', 'k', _file, { queries: { tagging: '\uD800' } }, cb), (err) => {
        assert.ok(err instanceof URIError);
      }, done);
    });

    it('should return an `undefined` header value (aws4 TypeError)', function (done) {
      expectError((cb) => _s3.uploadFile('b', 'k', Buffer.from('x'), { headers: { 'x-amz-meta-a': undefined } }, cb), (err) => {
        assert.ok(err instanceof TypeError);
      }, done);
    });

    it('should return the URIError of a filename with a lone surrogate (download, path upload, delete)', function (done) {
      expectError((cb) => _s3.downloadFile('b', '\uD800', cb), (err) => {
        assert.ok(err instanceof URIError);
      }, () => expectError((cb) => _s3.uploadFile('b', '\uD800', _file, cb), (err) => {
        assert.ok(err instanceof URIError);
      }, () => expectError((cb) => _s3.deleteFile('b', '\uD800', cb), (err) => {
        assert.ok(err instanceof URIError);
      }, done)));
    });

    it('should not throw for a bucket name with a space (callback called once)', function (done) {
      let _calls = 0;
      assert.doesNotThrow(() => _s3.downloadFile('my bucket', 'k', () => {
        _calls++;
        setTimeout(() => {
          assert.strictEqual(_calls, 1);
          done();
        }, 20);
      }));
    });

    it('should rethrow an exception of the callback, without calling it twice', function () {
      let _calls = 0;
      assert.throws(() => _s3.downloadFile('b', '\uD800', () => {
        _calls++;
        throw new Error('caller error');
      }), /caller error/);
      assert.strictEqual(_calls, 1);
    });

    it('should still serve a valid request', function (done) {
      _s3.uploadFile('b', 'k', _file, { headers: { 'x-amz-meta-a': 'ok' } }, (err, resp) => {
        assert.strictEqual(err, null);
        assert.strictEqual(resp.statusCode, 200);
        done();
      });
    });
  });

  describe('Swift synchronous throws are returned to the callback', function () {
    let _server = null;

    before(async function () {
      _server = http.createServer((req, res) => {
        if (req.url === '/v3/auth/tokens') {
          res.writeHead(201, { 'content-type': 'application/json', 'x-subject-token': 'token' });
          return res.end(JSON.stringify({ token: { catalog: [{ type: 'object-store', endpoints: [{ region: 'GRA', url: `http://127.0.0.1:${_server.address().port}/v1/AUTH_x` }] }] } }));
        }
        res.end('ok');
      });
      await new Promise((resolve) => _server.listen(0, '127.0.0.1', resolve));
    });

    after(function () {
      _server.close();
    });

    function createLocalSwift () {
      const _swift = storageSDK({ username: 'u', password: 'p', authUrl: `http://127.0.0.1:${_server.address().port}/v3`, region: 'GRA' });
      _swift.setLogFunction(() => {});
      return _swift;
    }

    it('should return an invalid header value of the first request (sent from the authentication callback)', function (done) {
      const _swift = createLocalSwift();
      let _calls = 0;
      _swift.setFileMetadata('c', 'k', { headers: { 'X-Object-Meta-a': 'é✓' } }, (err) => {
        _calls++;
        assert.strictEqual(err.code, 'ERR_INVALID_CHAR');
        _swift.setFileMetadata('c', 'k', { headers: { 'X-Object-Meta-a': 'v\r\nX: 1' } }, (err) => {
          assert.strictEqual(err.code, 'ERR_INVALID_CHAR');
          assert.strictEqual(_calls, 1);
          done();
        });
      });
    });

    it('should return the URIError of a query with a lone surrogate on the first request (sent from the authentication callback)', function (done) {
      const _swift = createLocalSwift();
      _swift.listFiles('c', { queries: { prefix: '\uD800' } }, (err) => {
        assert.ok(err instanceof URIError);
        done();
      });
    });

    it('should return the URIError of a filename with a lone surrogate (path upload, bulk delete)', function (done) {
      const _swift = createLocalSwift();
      _swift.uploadFile('c', '\uD800', path.join(__dirname, 'assets', 'file.txt'), (err) => {
        assert.ok(err instanceof URIError);
        _swift.deleteFiles('c', ['\uD800'], (err) => {
          assert.ok(err instanceof URIError);
          done();
        });
      });
    });
  });

  describe('Swift bulk delete with a container alias', function () {
    it('should replace the alias only at the start of each line, not inside object names', function (done) {
      const _swift = createSwift(1, () => ({ invoices: 'invoices-prod', 'a.b': 'ab-prod' }));
      authOK(0);
      const _bodies = [];
      nock(ENDPOINTS[0]).post('/').query({ 'bulk-delete': '' }).times(2).reply(200, function (uri, body) {
        _bodies.push(body);
        return {};
      }, { 'content-type': 'application/json' });
      _swift.deleteFiles('invoices', ['invoices-2024.pdf', '2024/invoices/a.pdf'], (err, resp) => {
        assert.strictEqual(err, null);
        assert.strictEqual(resp.statusCode, 200);
        assert.strictEqual(_bodies[0], 'invoices-prod/invoices-2024.pdf\ninvoices-prod/2024%2Finvoices%2Fa.pdf\n');
        /** "." of the alias is not a regular expression wildcard */
        _swift.deleteFiles('a.b', ['a.b-1', 'axb/1'], (err) => {
          assert.strictEqual(err, null);
          assert.strictEqual(_bodies[1], 'ab-prod/a.b-1\nab-prod/axb%2F1\n');
          done();
        });
      });
    });
  });

  describe('Swift authentication', function () {
    it('should not follow a redirect of the authentication (the body carries the password) and fail over', function (done) {
      const _swift = createSwift(2);
      nock(AUTH_URLS[0]).post('/auth/tokens').reply(307, '', { location: 'https://attacker.security.test/x' });
      const _attacker = nock('https://attacker.security.test').post('/x').reply(201, {});
      authOK(1);
      nock(ENDPOINTS[1]).get('/data-1/file.txt').reply(200, 'second');
      _swift.downloadFile('data', 'file.txt', (err, resp) => {
        assert.strictEqual(err, null);
        assert.strictEqual(resp.body.toString(), 'second');
        assert.strictEqual(_attacker.isDone(), false);
        done();
      });
    });

    it('should never send the credentials of an authUrl without protocol (read as a path on localhost)', function (done) {
      const _swift = storageSDK({ username: 'u', password: 'p', authUrl: 'auth.cloud.ovh.net/v3', region: 'GRA' });
      _swift.setLogFunction(() => {});
      _swift.connection((err) => {
        assert.strictEqual(err.message, 'Object Storages are not available');
        assert.strictEqual(err.cause.message, 'Invalid authUrl "auth.cloud.ovh.net/v3"');
        done();
      });
    });
  });

  describe('Storage validation', function () {
    it('Swift should throw if a fallback storage is null or misses username, password or authUrl', function () {
      const _main = { username: 'u', password: 'p', authUrl: AUTH_URLS[0], region: 'GRA' };
      const _swift = storageSDK(_main);
      for (const _fallback of [null, 'oops', {}, { username: 'u', password: 'p', region: 'SBG' }, { username: 'u', authUrl: AUTH_URLS[1] }]) {
        assert.throws(() => storageSDK([_main, _fallback]), /Swift Storage credentials not correct or missing/);
        assert.throws(() => _swift.setStorages([_main, _fallback]), /Swift Storage credentials not correct or missing/);
      }
      assert.throws(() => _swift.setStorages(null), /Swift Storage credentials not correct or missing/);
      assert.strictEqual(_swift.getStorages()[0], _main);
    });

    it('S3 setConfig should throw the credentials error, not a TypeError, for null or an invalid URL', function () {
      const _s3 = s3SDK({ accessKeyId: 'a', secretAccessKey: 'b', url: 'https://s3.test', region: 'r' });
      for (const _config of [null, undefined, 'x', [null], [{ accessKeyId: 'a', secretAccessKey: 'b', url: 'http://[bad', region: 'r' }]]) {
        assert.throws(() => _s3.setConfig(_config), (err) => err.constructor === Error && /S3 Storage credentials not correct or missing/.test(err.message));
      }
    });
  });

  describe('Query parameters', function () {
    it('should encode the query keys', function () {
      assert.strictEqual(getUrlParameters({ 'a b&c=': '1', prefix: 'x/y' }), '?a%20b%26c%3D=1&prefix=x%2Fy');
      assert.strictEqual(getUrlParameters({ 'max-keys': 2, 'start-after': 'k' }, 'list-type=2'), '?list-type=2&max-keys=2&start-after=k');
    });
  });

  describe('Failover fixes', function () {
    it('S3 should return to the main storage if its health check answers a 403 (no ListAllMyBuckets permission)', function (done) {
      const _s3 = createS3(2);
      _s3.getConfig().activeStorage = 1;
      nock(S3_URLS[0]).get('/').reply(403, '<Error><Code>AccessDenied</Code></Error>', { 'content-type': 'application/xml' });
      nock(S3_URLS[1]).get('/data-1/file.txt').reply(200, 'second');
      _s3.downloadFile('data', 'file.txt', (err) => {
        assert.strictEqual(err, null);
        setTimeout(() => {
          assert.strictEqual(_s3.getConfig().activeStorage, 0);
          done();
        }, 50);
      });
    });

    it('S3 should stay on the fallback if the health check answers a 401', function (done) {
      const _s3 = createS3(2);
      _s3.getConfig().activeStorage = 1;
      nock(S3_URLS[0]).get('/').reply(401);
      nock(S3_URLS[1]).get('/data-1/file.txt').reply(200, 'second');
      _s3.downloadFile('data', 'file.txt', (err) => {
        assert.strictEqual(err, null);
        setTimeout(() => {
          assert.strictEqual(_s3.getConfig().activeStorage, 1);
          done();
        }, 50);
      });
    });

    it('S3 setFileMetadata should send the bucket of the fallback in "x-amz-copy-source", without modifying the caller options', function (done) {
      const _s3 = createS3(2);
      nock(S3_URLS[0]).put('/data-0/file.pdf').reply(500).get('/').reply(500);
      let _copySource = null;
      nock(S3_URLS[1]).put('/data-1/file.pdf').reply(function () {
        _copySource = this.req.headers['x-amz-copy-source'];
        return [200, '<CopyObjectResult><ETag>"abc"</ETag></CopyObjectResult>'];
      });
      const _options = { headers: { 'x-amz-meta-a': '1' } };
      _s3.setFileMetadata('data', 'file.pdf', _options, (err, resp) => {
        assert.strictEqual(err, null);
        assert.strictEqual(resp.statusCode, 200);
        assert.strictEqual(_copySource, '/data-1/file.pdf');
        assert.strictEqual(_options.headers['x-amz-copy-source'], '/data/file.pdf');
        done();
      });
    });

    function collectOutput () {
      const _out = { written: '', calls: 0 };
      _out.output = () => {
        _out.calls++;
        return new stream.Writable({ write (chunk, enc, cb) { _out.written += chunk; cb(); } });
      };
      return _out;
    }

    it('S3 should not write the error body of the failing storage into the stream output', function (done) {
      const _s3 = createS3(2);
      nock(S3_URLS[0]).get('/data-0/file.txt').reply(500, 'Internal Error').get('/').reply(500);
      nock(S3_URLS[1]).get('/data-1/file.txt').reply(200, 'content');
      const _out = collectOutput();
      _s3.downloadFile('data', 'file.txt', { output: _out.output }, (err, resp) => {
        assert.strictEqual(err, null);
        assert.strictEqual(resp.statusCode, 200);
        assert.strictEqual(_out.calls, 1);
        assert.strictEqual(_out.written, 'content');
        done();
      });
    });

    it('S3 should write a 4xx body into the stream output (the response returned to the caller)', function (done) {
      const _s3 = createS3(2);
      nock(S3_URLS[0]).get('/data-0/file.txt').reply(404, 'Not Found');
      const _out = collectOutput();
      _s3.downloadFile('data', 'file.txt', { output: _out.output }, (err, resp) => {
        assert.strictEqual(err, null);
        assert.strictEqual(resp.statusCode, 404);
        assert.strictEqual(_out.written, 'Not Found');
        done();
      });
    });

    it('Swift should not write the error body of the failing storage or of a 401 into the stream output', function (done) {
      const _swift = createSwift(2);
      authOK(0);
      nock(ENDPOINTS[0]).get('/data-0/file.txt').reply(401, 'Unauthorized').get('/data-0/file.txt').reply(500, 'Internal Error');
      authOK(0);
      authOK(1);
      nock(ENDPOINTS[1]).get('/data-1/file.txt').reply(200, 'content');
      const _out = collectOutput();
      _swift.downloadFile('data', 'file.txt', { output: _out.output }, (err, resp) => {
        assert.strictEqual(err, null);
        assert.strictEqual(resp.statusCode, 200);
        assert.strictEqual(_out.calls, 1);
        assert.strictEqual(_out.written, 'content');
        done();
      });
    });

    it('Swift should authenticate again on the main storage after all storages failed', function (done) {
      const _swift = createSwift(2);
      nock(AUTH_URLS[0]).post('/auth/tokens').reply(500);
      authOK(1);
      nock(ENDPOINTS[1]).get('/data-1/file.txt').reply(500);
      _swift.downloadFile('data', 'file.txt', (err) => {
        assert.strictEqual(err.message, 'Object Storages are not available');
        assert.strictEqual(_swift.getConfig().activeStorage, 0);
        assert.strictEqual(_swift.getConfig().token, '');
        const _a0 = authOK(0);
        const _r0 = nock(ENDPOINTS[0]).get('/data-0/file.txt').reply(200, 'main');
        _swift.downloadFile('data', 'file.txt', (err, resp) => {
          assert.strictEqual(err, null);
          assert.strictEqual(resp.body.toString(), 'main');
          assert.ok(_a0.isDone() && _r0.isDone());
          done();
        });
      });
    });

    it('S3 should not storm the storages when they are all down: at most one attempt per storage and per request', function (done) {
      const _urls = [...S3_URLS, 'https://s3-2.security.test'];
      const _s3 = createS3(3, _urls);
      let _requests = 0;
      for (const _url of _urls) {
        nock(_url).persist().get(/.*/).reply(() => {
          _requests++;
          return [500];
        });
      }
      const _total = 30;
      let _errors = 0;
      for (let i = 0; i < _total; i++) {
        _s3.downloadFile('data', `file-${i}.txt`, (err) => {
          assert.strictEqual(err.message, 'All S3 storages are not available');
          if (++_errors === _total) {
            /** + a few health checks of the main storage, one at a time (500 is not retried by rock-req) */
            assert.ok(_requests <= _total * _urls.length + _urls.length, `${_requests} requests`);
            assert.strictEqual(_s3.getConfig().activeStorage, 0);
            done();
          }
        });
      }
    });

    it('Swift should not storm the storages when they are all down: at most one attempt per storage and per request', function (done) {
      const _swift = createSwift(2);
      authOK(0);
      nock(ENDPOINTS[0]).get('/data-0/first.txt').reply(200, 'ok');
      _swift.downloadFile('data', 'first.txt', (err) => {
        assert.strictEqual(err, null);
        let _auths = 0;
        let _requests = 0;
        for (let i = 0; i < 2; i++) {
          nock(AUTH_URLS[i]).persist().post('/auth/tokens').reply(() => {
            _auths++;
            return [201, { token: { catalog: [{ type: 'object-store', endpoints: [{ region: REGIONS[i], url: ENDPOINTS[i] }] }] } }, { 'X-Subject-Token': `token-${i}` }];
          });
          nock(ENDPOINTS[i]).persist().get(/.*/).reply(() => {
            _requests++;
            return [500];
          });
        }
        const _total = 30;
        let _errors = 0;
        for (let i = 0; i < _total; i++) {
          _swift.downloadFile('data', `file-${i}.txt`, (err) => {
            assert.strictEqual(err.message, 'Object Storages are not available');
            if (++_errors === _total) {
              assert.ok(_requests <= _total * 2, `${_requests} requests`);
              assert.ok(_auths <= _total * 2, `${_auths} authentications`);
              done();
            }
          });
        }
      });
    });

    it('S3 deleteFiles should ignore an empty "<Deleted></Deleted>" of a mixed result (MinIO)', function (done) {
      const _s3 = createS3(1);
      nock(S3_URLS[0]).post('/data-0/').query({ delete: '' }).reply(200, '<DeleteResult><Deleted><Key>a</Key></Deleted><Deleted></Deleted><Error><Key>b</Key><Code>AccessDenied</Code></Error></DeleteResult>');
      _s3.deleteFiles('data', ['a', 'b'], (err, resp) => {
        assert.strictEqual(err, null);
        assert.deepStrictEqual(resp.body, { deleted: [{ key: 'a' }], error: [{ key: 'b', code: 'AccessDenied' }] });
        done();
      });
    });

    it('Swift should authenticate a failing fallback once per request failover', function (done) {
      const _swift = createSwift(2);
      authOK(0);
      nock(ENDPOINTS[0]).get('/data-0/file.txt').reply(500);
      let _auth1 = 0;
      nock(AUTH_URLS[1]).post('/auth/tokens').times(3).reply(() => {
        _auth1++;
        return [500];
      });
      _swift.downloadFile('data', 'file.txt', (err) => {
        assert.strictEqual(err.message, 'Object Storages are not available');
        assert.strictEqual(err.storageStatusCode, 500);
        assert.strictEqual(_auth1, 1);
        done();
      });
    });
  });
});

/** The test file asset used by the path uploads must exist */
assert.ok(fs.existsSync(path.join(__dirname, 'assets', 'file.txt')));
