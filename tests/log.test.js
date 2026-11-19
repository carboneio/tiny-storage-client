const assert = require('assert');
const fs     = require('fs');
const path   = require('path');
const nock   = require('nock');
/** Required lazily: s3.test.js sets `global.rockReqConf` before index.js is loaded for the first time */
const storageSDK = (config) => require('../index.js')(config);

/**
 * Return the source of every `log(...)` call (definitions excluded). Skips strings and template literals, `${}` included.
 */
function logCalls (source) {
  const calls = [];
  const re = /(?<![\w.])log\(/g;
  let match;
  while ((match = re.exec(source)) !== null) {
    if (/function\s+$/.test(source.slice(0, match.index))) continue;
    const quotes = [];
    let depth = 0;
    let i = match.index + 3;
    for (; i < source.length; i++) {
      const c = source[i];
      const top = quotes[quotes.length - 1];
      if (top !== undefined && top !== '}') {
        if (c === '\\') i++;
        else if (c === top) quotes.pop();
        else if (top === '`' && c === '$' && source[i + 1] === '{') { quotes.push('}'); i++; }
        continue;
      }
      if (c === '\'' || c === '"' || c === '`') quotes.push(c);
      else if (c === '}' && top === '}') quotes.pop();
      else if (c === '(') depth++;
      else if (c === ')' && --depth === 0) break;
    }
    calls.push(source.slice(match.index, i + 1));
  }
  return calls;
}

const authURL = 'https://auth.log.test/v3';
const swiftGRA = 'https://swift.gra.log.test/v1/AUTH_x';
const swiftSBG = 'https://swift.sbg.log.test/v1/AUTH_x';
const SECRET_TOKEN = 'secret-token-value';
const catalog = { token: { catalog: [{ type: 'object-store', endpoints: [
  { region: 'GRA', interface: 'public', url: swiftGRA },
  { region: 'SBG', interface: 'public', url: swiftSBG }
] }] } };
const swiftStorages = [
  { username: 'user-gra', password: 'password-gra', authUrl: authURL, region: 'GRA' },
  { username: 'user-sbg', password: 'password-sbg', authUrl: authURL, region: 'SBG' }
];
const s3Storages = [
  { accessKeyId: 'access-1', secretAccessKey: 'secret-1', url: 's3.gra.log.test', region: 'gra' },
  { accessKeyId: 'access-2', secretAccessKey: 'secret-2', url: 's3.de.log.test', region: 'de' }
];
const SECRETS = [SECRET_TOKEN, 'password-gra', 'password-sbg', 'secret-1', 'secret-2', 'access-1', 'access-2'];

/** Every structured field: a known level, an event, flat primitives, no secret, no query string */
function assertFields (logs) {
  assert.ok(logs.length > 0);
  for (const { message, level, fields } of logs) {
    assert.ok(['info', 'warning', 'error'].includes(level), message);
    assert.strictEqual(typeof fields, 'object', message);
    assert.match(fields.event, /^[a-z0-9_]+$/, message);
    for (const key in fields) {
      assert.notStrictEqual(typeof fields[key], 'object', `${message} | ${key}`);
      assert.notStrictEqual(typeof fields[key], 'function', `${message} | ${key}`);
      for (const secret of SECRETS) {
        assert.ok(String(fields[key]).includes(secret) === false, `${message} | ${key}`);
      }
    }
    assert.ok(fields.path === undefined || fields.path.includes('?') === false, message);
  }
}

describe('log', function () {
  ['s3.js', 'swift.js'].forEach((file) => {
    it(`every log() call of ${file} passes a level and structured fields with an event`, function () {
      const calls = logCalls(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'));
      assert.ok(calls.length > 3, calls.length);
      calls.forEach((call) => assert.match(call, /,\s*'(info|warning|error)'\s*,\s*\{[^]*\bevent:\s*'[a-z0-9_]+'[^]*\}\s*\)$/, call));
    });
  });

  describe('structured fields (setLogFunction with 3 arguments)', function () {
    afterEach(function () {
      nock.cleanAll();
    });

    it('Swift: connection, failover, reconnect and unavailable storages', function (done) {
      const logs = [];
      const swift = storageSDK(swiftStorages);
      swift.setLogFunction((message, level, fields) => logs.push({ message, level, fields }));
      nock(authURL)
        .post('/auth/tokens').reply(500, {})
        .post('/auth/tokens').reply(200, catalog, { 'X-Subject-Token': SECRET_TOKEN })
        .post('/auth/tokens').reply(200, catalog, { 'X-Subject-Token': SECRET_TOKEN });
      nock(swiftSBG)
        .get('/templates').query(true).reply(401)
        .get('/templates').query(true).reply(500);
      swift.listFiles('templates', { queries: { prefix: 'a', temp_url_sig: 'signature' } }, (err) => {
        assert.strictEqual(err.message, 'Object Storages are not available');
        assertFields(logs);
        const events = logs.map((l) => l.fields.event);
        assert.deepStrictEqual(events, [
          'storage_connecting', 'storage_connection_failed', 'storage_fallback', 'storage_connecting', 'storage_connected',
          'storage_reconnect', 'storage_connecting', 'storage_connected',
          'storage_request_failed', 'storage_fallback', 'storage_unavailable'
        ]);
        assert.deepStrictEqual(logs[1].fields, { event: 'storage_connection_failed', storage: 'swift', index: 0, region: 'GRA', status: 500, code: undefined });
        assert.deepStrictEqual(logs[2].fields, { event: 'storage_fallback', storage: 'swift', from: 0, to: 1 });
        assert.deepStrictEqual(logs[5].fields, { event: 'storage_reconnect', storage: 'swift', index: 1, region: 'SBG', method: 'GET', path: '/templates', status: 401 });
        assert.deepStrictEqual(logs[8].fields, { event: 'storage_request_failed', storage: 'swift', index: 1, region: 'SBG', method: 'GET', path: '/templates', status: 500, code: undefined });
        assert.strictEqual(logs[10].fields.status, 500);
        done();
      });
    });

    it('Swift: single storage unavailable, with the network error code', function (done) {
      const logs = [];
      const swift = storageSDK(swiftStorages[0]);
      swift.setLogFunction((message, level, fields) => logs.push({ message, level, fields }));
      const _err = new Error('read ETIMEDOUT');
      _err.code = 'ETIMEDOUT';
      nock(authURL).post('/auth/tokens').reply(200, catalog, { 'X-Subject-Token': SECRET_TOKEN });
      nock(swiftGRA).get('/templates/file.txt').times(2).replyWithError(_err);
      swift.downloadFile('templates', 'file.txt', (err) => {
        assert.strictEqual(err.code, 'ETIMEDOUT');
        assertFields(logs);
        assert.deepStrictEqual(logs[logs.length - 1].fields, { event: 'storage_unavailable', storage: 'swift', index: 0, region: 'GRA', method: 'GET', path: '/templates/file.txt', status: undefined, code: 'ETIMEDOUT' });
        done();
      });
    });

    it('S3: fallback, unavailable storages, invalid storage index', function (done) {
      const logs = [];
      const s3 = storageSDK(s3Storages);
      s3.setLogFunction((message, level, fields) => logs.push({ message, level, fields }));
      nock('https://s3.gra.log.test').get('/bucket/file.txt').query(true).times(2).reply(500);
      nock('https://s3.de.log.test').get('/bucket/file.txt').query(true).times(2).reply(503);
      s3.downloadFile('bucket', 'file.txt', { queries: { 'X-Amz-Signature': 'signature' } }, (err) => {
        assert.strictEqual(err.message, 'All S3 storages are not available');
        s3.request('GET', '/', { requestStorageIndex: 5 }, (err) => {
          assert.strictEqual(err.message, 'S3 storage index "5" does not exist');
          assertFields(logs);
          assert.deepStrictEqual(logs.map((l) => l.fields.event), ['storage_fallback', 'storage_fallback', 'storage_unavailable', 'storage_index_invalid']);
          assert.deepStrictEqual(logs[0].fields, { event: 'storage_fallback', storage: 's3', index: 0, region: 'gra', method: 'GET', path: '/bucket/file.txt', status: 500, code: undefined, from: 0, to: 1 });
          assert.deepStrictEqual(logs[2].fields, { event: 'storage_unavailable', storage: 's3', status: 503, code: undefined });
          assert.deepStrictEqual(logs[3].fields, { event: 'storage_index_invalid', storage: 's3', index: 5 });
          done();
        });
      });
    });

    it('a logger with 2 arguments (message, level) keeps working', function (done) {
      const logs = [];
      const swift = storageSDK(swiftStorages[0]);
      swift.setLogFunction((message, level) => logs.push(`${level}: ${message}`));
      nock(authURL).post('/auth/tokens').reply(200, catalog, { 'X-Subject-Token': SECRET_TOKEN });
      swift.connection((err) => {
        assert.strictEqual(err, null);
        assert.deepStrictEqual(logs, [
          'info: SWIFT Storage | Index "0" region "GRA" connection...',
          'info: SWIFT Storage | Index "0" region "GRA" connected!'
        ]);
        done();
      });
    });
  });

  describe('default console logger', function () {
    const _consoleLog = console.log;
    let _printed = [];

    beforeEach(function () {
      _printed = [];
      console.log = (...args) => _printed.push(args);
    });

    afterEach(function () {
      console.log = _consoleLog;
      nock.cleanAll();
    });

    it('Swift: prints the message only, with the same emoji prefixes as before', function (done) {
      const swift = storageSDK(swiftStorages);
      nock(authURL)
        .post('/auth/tokens').reply(500, {})
        .post('/auth/tokens').reply(200, catalog, { 'X-Subject-Token': SECRET_TOKEN });
      swift.connection((err) => {
        console.log = _consoleLog;
        assert.strictEqual(err, null);
        assert.deepStrictEqual(_printed, [
          ['🟢 SWIFT Storage | Index "0" region "GRA" connection...'],
          ['🟠 SWIFT Storage | Index "0" region "GRA" connection failed | Status 500 | Message: Internal Server Error'],
          ['🟠 SWIFT Storage | Activate fallback storage: switch from "0" to "1"'],
          ['🟢 SWIFT Storage | Index "1" region "SBG" connection...'],
          ['🟢 SWIFT Storage | Index "1" region "SBG" connected!']
        ]);
        done();
      });
    });

    it('S3: prints the message only, with the same emoji prefixes as before', function (done) {
      const s3 = storageSDK(s3Storages);
      s3.request('GET', '/', { requestStorageIndex: 9 }, (err) => {
        console.log = _consoleLog;
        assert.strictEqual(err.message, 'S3 storage index "9" does not exist');
        assert.deepStrictEqual(_printed, [['🔴 S3 Storage | The requested storage index "9" does not exist']]);
        done();
      });
    });
  });
});
