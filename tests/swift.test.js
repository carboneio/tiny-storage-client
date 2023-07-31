const storageSDK   = require('../index.js');
const nock   = require('nock');
const assert = require('assert');
const fs     = require('fs');
const path   = require('path');
var stream = require('stream');

const authURL   = 'https://auth.cloud.ovh.net/v3';
const publicUrlGRA = 'https://storage.gra.cloud.ovh.net/v1/AUTH_ce3e510224d740a685cb0ae7bdb8ebc3';
const publicUrlSBG = 'https://storage.sbg.cloud.ovh.net/v1/AUTH_ce3e510224d740a685cb0ae7bdb8ebc3';

const tokenAuth = 'gAAAAABe8JlEGYPUwwOyjqgUBl11gSjDOw5VTtUZ5n8SWxghRGwakDkP_lelLfRctzyhbIFUXjsdPaGmV2xicL-9333lJUnL3M4JYlYCYMWsX3IhnLPYboyti835VdhAHQ7K_d0OC4OYvM04bvL3w_uSbkxPmL27uO0ISUgQdB_mHxoYlol8xYI'

const fileTxt = fs.readFileSync(path.join(__dirname, './assets/file.txt'));

let _dataStreams = ['', '', '', ''];
function resetDataStreams() {
  _dataStreams = ['', '', '', '']
}
function getOutputStreamFunction (index) {
  return function (opt, res) {
    _dataStreams[index] = ''
    const outputStream = new stream.Writable();
    outputStream._write = function (chunk, encoding, done) {
      _dataStreams[index] += chunk;
      done();
    };

    outputStream.on('error', (err) => {
      console.log('Error Stream:', err.toString());
      _dataStreams[index] = '';
    });
    return outputStream
  }
}

let dataStream = ''
const outputStreamFunction = function (opt, res) {

  dataStream = ''
  const outputStream = new stream.Writable();
  outputStream._write = function (chunk, encoding, done) {
    dataStream += chunk;
    done();
  };

  outputStream.on('error', (err) => {
    console.log('Error Stream:', err.toString());
    dataStream = '';
  });
  return outputStream
}


describe('Ovh Object Storage Swift', function () {
  let storage = storageSDK([{
    username                     : 'storage-1-user',
    password                     : 'storage-1-password',
    authUrl                      : authURL,
    tenantName                   : 'storage-1-tenant',
    region                       : 'GRA'
  }]);

  beforeEach(function (done) {
    const firstNock = nock(authURL)
        .post('/auth/tokens')
        .reply(200, connectionResultSuccessV3, { "X-Subject-Token": tokenAuth });

    storage.setTimeout(5000);
    storage.setStorages([{
      username                     : 'storage-1-user',
      password                     : 'storage-1-password',
      authUrl                      : authURL,
      tenantName                   : 'storage-1-tenant',
      region                       : 'GRA'
    }]);
    storage.connection((err) => {
      assert.strictEqual(err, null)
      assert.strictEqual(firstNock.pendingMocks().length, 0);
      done();
    })
  })

  describe('New instance', function() {
    it('should create 2 new instances', function () {
      const _swift1 = storageSDK({
        username                     : 'storage-1-user',
        password                     : 'storage-1-password',
        authUrl                      : 'swift.gra.ovh.io',
        tenantName                   : 'storage-1-tenant',
        region                       : 'GRA'
      })
      const _swift2 = storageSDK({
        username                     : 'storage-2-user',
        password                     : 'storage-2-password',
        authUrl                      : 'swift.sbg.ovh.io',
        tenantName                   : 'storage-2-tenant',
        region                       : 'SBG'
      })
      assert.strictEqual(_swift1.getConfig().storages.length, 1);
      assert.strictEqual(_swift1.getConfig().storages[0].username, 'storage-1-user');
      assert.strictEqual(_swift1.getConfig().storages[0].password, 'storage-1-password');
      assert.strictEqual(_swift1.getConfig().storages[0].tenantName, 'storage-1-tenant');
      assert.strictEqual(_swift1.getConfig().storages[0].authUrl, 'swift.gra.ovh.io');
      assert.strictEqual(_swift1.getConfig().storages[0].region, 'GRA');
      assert.strictEqual(_swift2.getConfig().storages.length, 1);
      assert.strictEqual(_swift2.getConfig().storages[0].username, 'storage-2-user');
      assert.strictEqual(_swift2.getConfig().storages[0].password, 'storage-2-password');
      assert.strictEqual(_swift2.getConfig().storages[0].tenantName, 'storage-2-tenant');
      assert.strictEqual(_swift2.getConfig().storages[0].authUrl, 'swift.sbg.ovh.io');
      assert.strictEqual(_swift2.getConfig().storages[0].region, 'SBG');
    });

    it('should not throw an error without tenantName', function (done) {
      const _swift1 = storageSDK({
        username                     : 'storage-1-user',
        password                     : 'storage-1-password',
        authUrl                      : 'swift.gra.ovh.io',
        region                       : 'GRA'
      })
      assert.strictEqual(_swift1.getConfig().storages.length, 1);
      assert.strictEqual(_swift1.getConfig().storages[0].username, 'storage-1-user');
      assert.strictEqual(_swift1.getConfig().storages[0].password, 'storage-1-password');
      assert.strictEqual(_swift1.getConfig().storages[0].authUrl, 'swift.gra.ovh.io');
      assert.strictEqual(_swift1.getConfig().storages[0].region, 'GRA');
      assert.strictEqual(_swift1.getConfig().storages[0]?.tenantName, undefined);
      done();
    })
  });

  describe('Connection', function () {

    it('should connect to object storage swift (without tenantName)', function(done) {
      let storageTest = storageSDK([{
        username                     : 'storage-X-user',
        password                     : 'storage-X-password',
        authUrl                      : authURL,
        region                       : 'GRA'
      }]);

      const firstNock = nock(authURL)
        .post('/auth/tokens')
        .reply(200, function (uri, body) {
          assert.strictEqual(!!body?.auth?.scope, false);
          assert.strictEqual(JSON.stringify(body), '{"auth":{"identity":{"methods":["password"],"password":{"user":{"name":"storage-X-user","domain":{"id":"default"},"password":"storage-X-password"}}}}}')
          return connectionResultSuccessV3;
        }, { "X-Subject-Token": tokenAuth });
      
      storageTest.connection((err) => {
        assert.strictEqual(err, null);
        assert.deepStrictEqual(storage.getConfig().token, tokenAuth);
        assert.deepStrictEqual(storage.getConfig().endpoints.url, connectionResultSuccessV3.token.catalog[9].endpoints[20].url);
        assert.strictEqual(firstNock.pendingMocks().length, 0);
        done();
      });
    });

    it('should connect to object storage swift (with a tenantName)', function (done) {
      const firstNock = nock(authURL)
        .post('/auth/tokens')
        .reply(200, function (uri, body) {
          assert.strictEqual(!!body?.auth?.scope, true);
          assert.strictEqual(JSON.stringify(body), '{"auth":{"identity":{"methods":["password"],"password":{"user":{"name":"storage-1-user","domain":{"id":"default"},"password":"storage-1-password"}}},"scope":{"project":{"domain":{"id":"default"},"name":"storage-1-tenant"}}}}')
          return connectionResultSuccessV3;
        }, { "X-Subject-Token": tokenAuth });

      storage.connection((err) => {
        assert.strictEqual(err, null);
        assert.deepStrictEqual(storage.getConfig().token, tokenAuth);
        assert.deepStrictEqual(storage.getConfig().endpoints.url, connectionResultSuccessV3.token.catalog[9].endpoints[20].url);
        assert.strictEqual(firstNock.pendingMocks().length, 0);
        done();
      });
    });

    it('should return an error if status code is not a 200', function (done) {
      const firstNock = nock(authURL)
        .post('/auth/tokens')
        .reply(300, {});

      storage.connection((err) => {
        assert.notStrictEqual(err, null);
        assert.strictEqual(err.message, 'Object Storages are not available');
        assert.strictEqual(firstNock.pendingMocks().length, 0);
        done();
      });
    });

    it('should return an error if endpoints cannot be found', function (done) {
      const firstNock = nock(authURL)
        .post('/auth/tokens')
        .reply(200, connectionResultSuccessV3WithoutObjectStore);

      storage.connection((err) => {
        assert.notStrictEqual(err, null);
        assert.strictEqual(err.message, 'Object Storages are not available');
        assert.strictEqual(firstNock.pendingMocks().length, 0);
        done();
      });
    });

    it('should return an error if endpoints cannot be found because region is invalid', function (done) {
      const firstNock = nock(authURL)
        .post('/auth/tokens')
        .reply(200, connectionResultSuccessV3WithoutRegion);

      storage.connection((err) => {
        assert.notStrictEqual(err, null);
        assert.strictEqual(err.message, 'Object Storages are not available');
        assert.strictEqual(firstNock.pendingMocks().length, 0);
        done();
      });
    });

    it('should connect to the second object storage if the first one is not available (error 500)', function (done) {
      storage.setStorages([{
        username                     : 'storage-1-user',
        password                     : 'storage-1-password',
        authUrl                      : authURL,
        tenantName                   : 'storage-1-tenant',
        region                       : 'GRA'
      },
      {
        username                     : 'storage-2-user',
        password                     : 'storage-2-password',
        authUrl                      : authURL,
        tenantName                   : 'storage-2-tenant',
        region                       : 'SBG'
      }])

      const firstNock = nock(authURL)
        .post('/auth/tokens')
        .reply(500, {})
        .post('/auth/tokens')
        .reply(200, connectionResultSuccessV3, { "X-Subject-Token": tokenAuth });

      storage.connection((err) => {
        assert.strictEqual(err, null);
        assert.deepStrictEqual(storage.getConfig().activeStorage, 1);
        assert.deepStrictEqual(storage.getConfig().token, tokenAuth);
        assert.deepStrictEqual(storage.getConfig().endpoints.url, connectionResultSuccessV3.token.catalog[9].endpoints[4].url);
        assert.strictEqual(firstNock.pendingMocks().length, 0);
        done();
      });
    });

    it('should connect to the second object storage if any request is return', function (done) {
      storage.setStorages([{
        username                     : 'storage-1-user',
        password                     : 'storage-1-password',
        authUrl                      : authURL,
        tenantName                   : 'storage-1-tenant',
        region                       : 'GRA'
      },
      {
        username                     : 'storage-2-user',
        password                     : 'storage-2-password',
        authUrl                      : authURL,
        tenantName                   : 'storage-2-tenant',
        region                       : 'SBG'
      }])

      const firstNock = nock(authURL)
        .post('/auth/tokens')
        .replyWithError("This is an error")
        .post('/auth/tokens')
        .reply(200, connectionResultSuccessV3, { "X-Subject-Token": tokenAuth });

      storage.connection((err) => {
        assert.strictEqual(err, null);
        assert.deepStrictEqual(storage.getConfig().activeStorage, 1);
        assert.deepStrictEqual(storage.getConfig().token, tokenAuth);
        assert.deepStrictEqual(storage.getConfig().endpoints.url, connectionResultSuccessV3.token.catalog[9].endpoints[4].url);
        assert.strictEqual(firstNock.pendingMocks().length, 0);
        done();
      });
    });

    it('should connect to the second object storage if the main storage timeout', function (done) {
      storage.setTimeout(200);

      storage.setStorages([{
        username                     : 'storage-1-user',
        password                     : 'storage-1-password',
        authUrl                      : authURL,
        tenantName                   : 'storage-1-tenant',
        region                       : 'GRA'
      },
      {
        username                     : 'storage-2-user',
        password                     : 'storage-2-password',
        authUrl                      : authURL,
        tenantName                   : 'storage-2-tenant',
        region                       : 'SBG'
      }])

      const firstNock = nock(authURL)
        .post('/auth/tokens')
        .delayConnection(500)
        .reply(200, connectionResultSuccessV3, { "X-Subject-Token": tokenAuth })
        .post('/auth/tokens')
        .reply(200, connectionResultSuccessV3, { "X-Subject-Token": tokenAuth });

      storage.connection((err) => {
        assert.strictEqual(err, null);
        assert.deepStrictEqual(storage.getConfig().activeStorage, 1);
        assert.deepStrictEqual(storage.getConfig().token, tokenAuth);
        assert.deepStrictEqual(storage.getConfig().endpoints.url, connectionResultSuccessV3.token.catalog[9].endpoints[4].url);
        assert.strictEqual(firstNock.pendingMocks().length, 0);
        done();
      });
    });

    it('should connect to the second object storage if endpoints of the first object storage cannot be found', function (done) {
      storage.setStorages([{
        username                     : 'storage-1-user',
        password                     : 'storage-1-password',
        authUrl                      : authURL,
        tenantName                   : 'storage-1-tenant',
        region                       : 'GRA'
      },
      {
        username                     : 'storage-2-user',
        password                     : 'storage-2-password',
        authUrl                      : authURL,
        tenantName                   : 'storage-2-tenant',
        region                       : 'SBG'
      }])

      const firstNock = nock(authURL)
        .post('/auth/tokens')
        .reply(200, connectionResultSuccessV3WithoutObjectStore)
        .post('/auth/tokens')
        .reply(200, connectionResultSuccessV3, { "X-Subject-Token": tokenAuth });

      storage.connection((err) => {
        assert.strictEqual(err, null);
        assert.deepStrictEqual(storage.getConfig().activeStorage, 1);
        assert.deepStrictEqual(storage.getConfig().token, tokenAuth);
        assert.deepStrictEqual(storage.getConfig().endpoints.url, connectionResultSuccessV3.token.catalog[9].endpoints[4].url);
        assert.strictEqual(firstNock.pendingMocks().length, 0);
        done();
      });
    });

    it('should connect to the second object storage if endpoints of the first object storage cannot be found because region is invalid', function (done) {
      storage.setStorages([{
        username                     : 'storage-1-user',
        password                     : 'storage-1-password',
        authUrl                      : authURL,
        tenantName                   : 'storage-1-tenant',
        region                       : 'GRA'
      },
      {
        username                     : 'storage-2-user',
        password                     : 'storage-2-password',
        authUrl                      : authURL,
        tenantName                   : 'storage-2-tenant',
        region                       : 'SBG'
      }])

      const firstNock = nock(authURL)
        .post('/auth/tokens')
        .reply(200, connectionResultSuccessV3WithoutRegion)
        .post('/auth/tokens')
        .reply(200, connectionResultSuccessV3, { "X-Subject-Token": tokenAuth });

      storage.connection((err) => {
        assert.strictEqual(err, null);
        assert.deepStrictEqual(storage.getConfig().activeStorage, 1);
        assert.deepStrictEqual(storage.getConfig().token, tokenAuth);
        assert.deepStrictEqual(storage.getConfig().endpoints.url, connectionResultSuccessV3.token.catalog[9].endpoints[4].url);
        assert.strictEqual(firstNock.pendingMocks().length, 0);
        done();
      });
    });

    it('should reconnect to the first object storage if the first and second one are not available (error 500) but the first storage revive', function (done) {
      storage.setStorages([{
        username                     : 'storage-1-user',
        password                     : 'storage-1-password',
        authUrl                      : authURL,
        tenantName                   : 'storage-1-tenant',
        region                       : 'GRA'
      },
      {
        username                     : 'storage-2-user',
        password                     : 'storage-2-password',
        authUrl                      : authURL,
        tenantName                   : 'storage-2-tenant',
        region                       : 'SBG'
      }])

      const firstNock = nock(authURL)
        .post('/auth/tokens')
        .reply(500, {})
        .post('/auth/tokens')
        .reply(500, {})
        .post('/auth/tokens')
        .reply(200, connectionResultSuccessV3, { "X-Subject-Token": tokenAuth });

      storage.connection((err) => {
        assert.notStrictEqual(err, null);
        assert.strictEqual(err.message, 'Object Storages are not available');
        storage.connection((err) => {
          assert.strictEqual(err, null);
          assert.deepStrictEqual(storage.getConfig().activeStorage, 0);
          assert.deepStrictEqual(storage.getConfig().token, tokenAuth);
          assert.deepStrictEqual(storage.getConfig().endpoints.url, connectionResultSuccessV3.token.catalog[9].endpoints[20].url);
          assert.strictEqual(firstNock.pendingMocks().length, 0);
          done();
        });
      });
    });
  });

  describe('deleteFiles', function() {
    it('should deletes files', function(done){
      const _filesToDelete = [ { name: '1685696359848.jpg' }, { name: 'invoice.docx' }, { name: 'test file |1234.odt' }]
      const _headers = {
        'content-type': 'application/json',
        'x-trans-id': 'tx34d586803a5e4acbb9ac5-0064c7dfbc',
        'x-openstack-request-id': 'tx34d586803a5e4acbb9ac5-0064c7dfbc',
        date: 'Mon, 31 Jul 2023 16:22:21 GMT',
        'transfer-encoding': 'chunked',
        'x-iplb-request-id': '53C629C3:E4CA_5762BBC9:01BB_64C7DFBC_B48B74E:1342B',
        'x-iplb-instance': '42087'
      }
      const _returnedBody = '{"Response Status":"200 OK","Response Body":"","Number Deleted":3,"Number Not Found":0,"Errors":[]}'

      let firstNock = nock(publicUrlGRA)
        .defaultReplyHeaders(_headers)
        .post(/\/.*bulk-delete.*/g)
        .reply(200, (url, body) => {
          assert.strictEqual(body.includes('container1/test%20file%20%7C1234.odt'), true);
          assert.strictEqual(body.includes('container1/invoice.docx'), true);
          assert.strictEqual(body.includes('container1/1685696359848.jpg'), true);
          return _returnedBody;
        });

      storage.deleteFiles('container1', _filesToDelete, function(err, resp) {
        assert.strictEqual(err, null);
        assert.strictEqual(resp.statusCode, 200);
        assert.strictEqual(JSON.stringify(resp.headers), JSON.stringify(_headers));
        assert.strictEqual(JSON.stringify(resp.body), _returnedBody);
        assert.strictEqual(firstNock.pendingMocks().length, 0);
        done();
      })
    })

    it('should return the raw result as XML (Buffer)', function(done) {
      const _returnedBodyXML = '<delete><number_deleted>0</number_deleted><number_not_found>3</number_not_found><response_body></response_body><response_status>200 OK</response_status><errors></errors></delete>'
      const _filesToDelete = [ { name: '1685696359848.jpg' }, { name: 'invoice.docx' }, { name: 'test file |1234.odt' }]
      const _headers = {
        'content-type': 'application/xml',
        'x-trans-id': 'tx76823c2b380f47bab5908-0064c7e60d',
        'x-openstack-request-id': 'tx76823c2b380f47bab5908-0064c7e60d',
        date: 'Mon, 31 Jul 2023 16:49:18 GMT',
        'transfer-encoding': 'chunked',
        'x-iplb-request-id': '53C629C3:E61B_3626E64B:01BB_64C7E60D_151EBF17:1C316',
        'x-iplb-instance': '33618'
      }
      let firstNock = nock(publicUrlGRA)
        .defaultReplyHeaders(_headers)
        .post(/\/.*bulk-delete.*/g)
        .reply(200, (url, body) => {
          assert.strictEqual(body.includes('container1/test%20file%20%7C1234.odt'), true);
          assert.strictEqual(body.includes('container1/invoice.docx'), true);
          assert.strictEqual(body.includes('container1/1685696359848.jpg'), true);
          return _returnedBodyXML;
        });

      storage.deleteFiles('container1', _filesToDelete, { headers: { 'Accept': "application/xml" } }, function(err, resp) {
        assert.strictEqual(err, null);
        assert.strictEqual(resp.statusCode, 200);
        assert.strictEqual(JSON.stringify(resp.headers), JSON.stringify(_headers));
        assert.strictEqual(resp.body.toString(), _returnedBodyXML);
        assert.strictEqual(firstNock.pendingMocks().length, 0);
        done();
      })
    });

    
  });

  describe('headBucket', function() {
    it('should return metadatas about a container', function(done){
      const _statusCode = 204;
      const _headers = {
        'content-type': 'application/json; charset=utf-8',
        'x-container-object-count': '4',
        'x-container-bytes-used': '431631',
        'x-timestamp': '1641995016.74740',
        'x-container-sync-key': 'ZAIrQQjDzWM+APD5Fz6stQ/pBUe+Nck2UnPPswJw1cU=',
        'x-container-sync-to': '//OVH_PUBLIC_CLOUD/GRA/AUTH_XXXX/container1',
        'last-modified': 'Wed, 12 Jan 2022 13:58:51 GMT',
        'accept-ranges': 'bytes',
        'x-storage-policy': 'PCS',
        vary: 'Accept',
        'x-trans-id': 'tx3bd64d99f87147f18ffd9-0064c7d400',
        'x-openstack-request-id': 'tx3bd64d99f87147f18ffd9-0064c7d400',
        date: 'Mon, 31 Jul 2023 15:32:17 GMT',
        'transfer-encoding': 'chunked',
        'x-iplb-request-id': '53C629C3:E1FB_3626E64B:01BB_64C7D3FF_150CAC23:25615',
        'x-iplb-instance': '12309'
      };

      let firstNock = nock(publicUrlGRA)
        .defaultReplyHeaders(_headers)
        .intercept("/container1", "HEAD")
        .reply(_statusCode);

      
      storage.headBucket('container1', function(err, resp) {
        assert.strictEqual(err, null);
        assert.strictEqual(resp.statusCode, _statusCode);
        assert.strictEqual(JSON.stringify(resp.headers), JSON.stringify(_headers));
        assert.strictEqual(resp.body.toString(), '');
        assert.strictEqual(firstNock.pendingMocks().length, 0);
        done();
      });
    }); 

    it('should return an error if the container does not exist', function (done) {
      const _statusCode = 404;
      const _headers = {
        'content-type': 'text/html; charset=UTF-8',
        'content-length': '0',
        'x-trans-id': 'txe8450fb1fc8847dbb43bd-0064c7d4db',
        'x-openstack-request-id': 'txe8450fb1fc8847dbb43bd-0064c7d4db',
        date: 'Mon, 31 Jul 2023 15:35:56 GMT',
        'x-iplb-request-id': '53C629C3:E222_3626E64B:01BB_64C7D4DB_169B0C5F:9CAC',
        'x-iplb-instance': '12308'
      }

      let firstNock = nock(publicUrlGRA)
        .defaultReplyHeaders(_headers)
        .intercept("/container1", "HEAD")
        .reply(_statusCode);

      storage.headBucket('container1', function(err, resp) {
        assert.strictEqual(err, null);
        assert.strictEqual(resp.statusCode, _statusCode);
        assert.strictEqual(JSON.stringify(resp.headers), JSON.stringify(_headers));
        assert.strictEqual(resp.body.toString(), '');
        assert.strictEqual(firstNock.pendingMocks().length, 0);
        done();
      });
    })
  });

  describe('listBuckets', function() {
    it('should return the list of containers (as Object)', function (done) {
      const _headers = {
        'content-type': 'application/json; charset=utf-8',
        'x-account-container-count': '3',
        'x-account-object-count': '67',
        'x-account-bytes-used': '471229983',
        'x-timestamp': '1641994731.69438',
        'accept-ranges': 'bytes',
        'content-length': '310',
        'x-account-project-domain-id': 'default',
        vary: 'Accept',
        'x-trans-id': 'tx80980ebf27f64de29c8a5-0064c7d100',
        'x-openstack-request-id': 'tx80980ebf27f64de29c8a5-0064c7d100',
        date: 'Mon, 31 Jul 2023 15:19:28 GMT',
        'x-iplb-request-id': '53C629C3:E186_5762BBC9:01BB_64C7D0FF_C1131CF:1263E',
        'x-iplb-instance': '48126'
      }
      const _body = [
        {
          name: 'container1',
          count: 55,
          bytes: 106522,
          last_modified: '2022-01-12T14:02:33.672010'
        },
        {
          name: 'container2',
          count: 8,
          bytes: 470691830,
          last_modified: '2022-10-24T10:59:13.250920'
        },
        {
          name: 'container3',
          count: 4,
          bytes: 431631,
          last_modified: '2022-01-12T13:58:50.868090'
        }
      ]
      let firstNock = nock(publicUrlGRA)
        .defaultReplyHeaders(_headers)
        .intercept("/", "GET")
        .reply(200, JSON.stringify(_body));

      storage.listBuckets(function(err, resp) {
        assert.strictEqual(err, null);
        assert.strictEqual(resp.statusCode, 200);
        assert.strictEqual(JSON.stringify(resp.headers), JSON.stringify(_headers));
        assert.strictEqual(resp.body[0].name, _body[0].name);
        assert.strictEqual(resp.body[0].count, _body[0].count);
        assert.strictEqual(resp.body[0].bytes, _body[0].bytes);
        assert.strictEqual(resp.body[0].last_modified, _body[0].last_modified);
        assert.strictEqual(resp.body[1].name, _body[1].name);
        assert.strictEqual(resp.body[2].name, _body[2].name);
        assert.strictEqual(firstNock.pendingMocks().length, 0);
        done();
      })
    });

    it('should return an error if the body returned is not a valid JSON format (should never happen)', function (done) {
      const _expectedBody = "BODY NOT VALID"
      let firstNock = nock(publicUrlGRA)
        .defaultReplyHeaders({ 'content-type': 'application/json; charset=utf-8' })
        .intercept("/", "GET")
        .reply(200, _expectedBody);

      storage.listBuckets(function(err, resp) {
        assert.strictEqual(err.toString(), 'Error: Listing bucket JSON parse: SyntaxError: Unexpected token B in JSON at position 0');
        assert.strictEqual(resp.body.toString(), _expectedBody);
        assert.strictEqual(firstNock.pendingMocks().length, 0);
        done();
      })
    });

    it('should return the body as Buffer if the content-type is `application/xml`', function(done) {
      const _expectedBody = '<?xml version="1.0" encoding="UTF-8"?>\n<container name="templates"><object><name>Screenshot 2023-06-16 at 13.26.49.png</name><hash>184e81896337c81836419419455b9954</hash><bytes>166963</bytes><content_type>image/png</content_type><last_modified>2023-06-16T15:30:34.093290</last_modified></object></container>';
      const _headers = {
        'content-type': 'application/xml',
        'x-account-container-count': '3',
        'x-account-object-count': '67',
        'x-account-bytes-used': '471229983',
        'x-timestamp': '1641994731.69438',
        'accept-ranges': 'bytes',
        'content-length': '310',
        'x-account-project-domain-id': 'default',
        vary: 'Accept',
        'x-trans-id': 'tx80980ebf27f64de29c8a5-0064c7d100',
        'x-openstack-request-id': 'tx80980ebf27f64de29c8a5-0064c7d100',
        date: 'Mon, 31 Jul 2023 15:19:28 GMT',
        'x-iplb-request-id': '53C629C3:E186_5762BBC9:01BB_64C7D0FF_C1131CF:1263E',
        'x-iplb-instance': '48126'
      }

      let firstNock = nock(publicUrlGRA)
        .defaultReplyHeaders(_headers)
        .intercept("/", "GET")
        .reply(200, _expectedBody);

      storage.listBuckets({ headers: { "Accept": "application/xml" } }, function(err, resp) {
        assert.strictEqual(err, null);
        assert.strictEqual(resp.statusCode, 200);
        assert.strictEqual(JSON.stringify(resp.headers), JSON.stringify(_headers));
        assert.strictEqual(resp.body.toString(), _expectedBody);
        assert.strictEqual(firstNock.pendingMocks().length, 0);
        done();
      })
    });
  });

  describe('log', function () {
    it('should overload the log function', function (done) {
      let i = 0;

      storage.setLogFunction(function (message) {
        assert.strictEqual(message.length > 0, true)
        i++;
      })

      const firstMock = nock(authURL)
        .post('/auth/tokens')
        .reply(200, connectionResultSuccessV3, { "X-Subject-Token": tokenAuth });

      storage.connection((err) => {
        assert.strictEqual(err, null);
        assert.deepStrictEqual(storage.getConfig().token, tokenAuth);
        assert.deepStrictEqual(storage.getConfig().endpoints.url, connectionResultSuccessV3.token.catalog[9].endpoints[20].url);
        assert.strictEqual(i > 0, true);
        assert.strictEqual(firstMock.pendingMocks().length, 0);
        done();
      });
    });
  });

  describe('setStorage/getStorages/setTimeout/getConfig', function () {

    it('should update the initial configuration', function (done) {
      const _expectedConfig = {
        authUrl    : 'https://carbone.io',
        username   : 'John',
        password   : 'Wick',
        tenantName : 'toto',
        region     : 'GRA22'
      }
      storage.setStorages(_expectedConfig)
      const _storages = storage.getStorages();
      assert.strictEqual(_storages[0].authUrl, _expectedConfig.authUrl);
      assert.strictEqual(_storages[0].username, _expectedConfig.username);
      assert.strictEqual(_storages[0].password, _expectedConfig.password);
      assert.strictEqual(_storages[0].tenantName, _expectedConfig.tenantName);
      assert.strictEqual(_storages[0].region, _expectedConfig.region);
      done();
    });

    it('should set the request timeout', function (done) {
      storage.setTimeout(200);
      assert.strictEqual(storage.getConfig().timeout, 200);
      done();
    });
  });

  describe('listFiles', function() {


    describe("SINGLE STORAGE", function () {
      it('should return a list of files as a JSON and as an XML', function (done) {
        let firstNock = nock(publicUrlGRA)
          .defaultReplyHeaders({
            'content-type': 'application/json',
          })
          .get('/templates')
          .reply(200, () => {
            return fs.createReadStream(path.join(__dirname, 'assets', 'files.json'));
          });

        storage.listFiles('templates', (err, resp) => {
          assert.strictEqual(err, null);
          assert.strictEqual(resp.statusCode, 200);
          assert.strictEqual(JSON.stringify(resp.headers), '{"content-type":"application/json"}');
          const _files = resp.body;
          assert.strictEqual(_files.length > 0, true)
          assert.strictEqual(_files[0].bytes > 0, true)
          assert.strictEqual(_files[0].last_modified.length > 0, true)
          assert.strictEqual(_files[0].hash.length > 0, true)
          assert.strictEqual(_files[0].name.length > 0, true)
          assert.strictEqual(_files[0].content_type.length > 0, true)
          assert.strictEqual(firstNock.pendingMocks().length, 0);
          done();
        });
      });


      it('should return a list of files as a XML and the header is overwritted', function (done) {
        let firstNock = nock(publicUrlGRA)
          .defaultReplyHeaders({
            'content-type': 'application/xml',
          })
          .get('/templates')
          .reply(200, () => {
            return fs.createReadStream(path.join(__dirname, 'assets', 'files.xml'));
          });

        storage.listFiles('templates', { headers : { Accept: 'application/xml' } }, (err, resp) => {
          assert.strictEqual(err, null);
          assert.strictEqual(resp.statusCode, 200);
          assert.strictEqual(JSON.stringify(resp.headers), '{"content-type":"application/xml"}');
          const _files = resp.body.toString();
          assert.strictEqual(_files.includes('<?xml'), true)
          assert.strictEqual(_files.includes('<container name="templates">'), true)
          assert.strictEqual(_files.includes('<bytes>47560</bytes>'), true)
          assert.strictEqual(firstNock.pendingMocks().length, 0);
          done();
        });
      })


      it('should return a list of files with a prefix', function (done) {
        let firstNock = nock(publicUrlGRA)
          .defaultReplyHeaders({
            'content-type': 'application/json',
          })
          .get('/templates')
          .query({ prefix : 'keys' })
          .reply(200, () => {
            let _file = fs.readFileSync(path.join(__dirname, 'assets', 'files.json'))
            return Buffer.from(JSON.stringify(JSON.parse(_file.toString()).filter((el => el.name.includes('keys')))));
          });

        storage.listFiles('templates', { queries: { prefix: 'keys' } }, (err, resp) => {
          assert.strictEqual(err, null);
          assert.strictEqual(resp.statusCode, 200);
          assert.strictEqual(JSON.stringify(resp.headers), '{"content-type":"application/json"}');
          const _files = resp.body;
          _files.forEach(el => {
            assert.strictEqual(el.name.includes('keys'), true);
          });
          assert.strictEqual(firstNock.pendingMocks().length, 0);
          done();
        });
      });

      it('should reconnect automatically to the storage', function (done) {
        let firstNock = nock(publicUrlGRA)
          .defaultReplyHeaders({
            'content-type': 'application/json',
          })
          .get('/templates')
          .reply(401, 'Unauthorized')
          .get('/templates')
          .reply(200, () => {
            return fs.createReadStream(path.join(__dirname, 'assets', 'files.json'));
          });

        let secondNock = nock(authURL)
          .post('/auth/tokens')
          .reply(200, connectionResultSuccessV3, { "X-Subject-Token": tokenAuth });

        storage.listFiles('templates', (err, resp) => {
          assert.strictEqual(err, null);
          assert.strictEqual(resp.statusCode, 200);
          assert.strictEqual(JSON.stringify(resp.headers), '{"content-type":"application/json"}');
          const _files = resp.body;
          assert.strictEqual(_files.length > 0, true)
          assert.strictEqual(_files[0].bytes > 0, true)
          assert.strictEqual(_files[0].last_modified.length > 0, true)
          assert.strictEqual(_files[0].hash.length > 0, true)
          assert.strictEqual(_files[0].name.length > 0, true)
          assert.strictEqual(_files[0].content_type.length > 0, true)
          assert.strictEqual(firstNock.pendingMocks().length, 0);
          assert.strictEqual(secondNock.pendingMocks().length, 0);
          done();
        });
      });

      it('should reconnect automatically to the storage with a prefix and delimiter as option/query parameters', function (done) {
        let firstNock = nock(publicUrlGRA)
          .defaultReplyHeaders({
            'content-type': 'application/json',
          })
          .get('/templates')
          .query({ prefix : 'keys', delimiter : '/' })
          .reply(401, 'Unauthorized')
          .get('/templates')
          .query({ prefix : 'keys', delimiter : '/' })
          .reply(200, () => {
            return Buffer.from(JSON.stringify([
              {
                "subdir": "keys/"
              }]));
          });

        let secondNock = nock(authURL)
          .post('/auth/tokens')
          .reply(200, connectionResultSuccessV3, { "X-Subject-Token": tokenAuth });

        storage.listFiles('templates', { queries: { prefix: 'keys', delimiter : '/' } }, (err, resp) => {
          assert.strictEqual(err, null);
          assert.strictEqual(resp.statusCode, 200);
          assert.strictEqual(JSON.stringify(resp.headers), '{"content-type":"application/json"}');
          const _files = resp.body;
          assert.strictEqual(_files[0].subdir, 'keys/')
          assert.strictEqual(firstNock.pendingMocks().length, 0);
          assert.strictEqual(secondNock.pendingMocks().length, 0);
          done();
        });
      });

      it('should return an error if the single storage timeout', function (done) {
        storage.setTimeout(200);
        const firstNock = nock(publicUrlGRA)
          .get('/templates')
          .delayConnection(500)
          .reply(200, {})

        storage.listFiles('templates', (err, resp) => {
          assert.strictEqual(err.toString(), 'Error: Object Storages are not available');
          assert.strictEqual(resp, undefined);
          assert.strictEqual(storage.getConfig().activeStorage, 0);
          assert.strictEqual(firstNock.pendingMocks().length, 0);
          done();
        });
      });

      it('should return an error if the single storage return any kind of errors', function (done) {
        let firstNock = nock(publicUrlGRA)
          .get('/templates')
          .replyWithError('Error Message 1234')

        storage.listFiles('templates', (err, resp) => {
          assert.strictEqual(err.toString(), 'Error: Object Storages are not available');
          assert.strictEqual(resp, undefined);
          assert.strictEqual(firstNock.pendingMocks().length, 0);
          assert.deepStrictEqual(storage.getConfig().activeStorage, 0);
          done();
        });
      });

      it('should return an error if the container does not exist', function (done) {
        const _expectedContent = '<html><h1>Not Found</h1><p>The resource could not be found.</p></html>'
        let firstNock = nock(publicUrlGRA)
          .get('/templates')
          .reply(404, _expectedContent);

        storage.listFiles('templates', (err, resp) => {
          assert.strictEqual(err, null);
          assert.strictEqual(resp.statusCode, 404);
          assert.strictEqual(resp.body.toString(), _expectedContent);
          assert.strictEqual(JSON.stringify(resp.headers), '{}');
          assert.strictEqual(firstNock.pendingMocks().length, 0);
          done();
        });
      });

    });

    describe("MUTLIPLE STORAGES", function () {
      beforeEach(function (done) {
        const firstNock = nock(authURL)
            .post('/auth/tokens')
            .reply(200, connectionResultSuccessV3, { "X-Subject-Token": tokenAuth });

        storage.setTimeout(5000);
        storage.setStorages([{
          username                     : 'storage-1-user',
          password                     : 'storage-1-password',
          authUrl                      : authURL,
          tenantName                   : 'storage-1-tenant',
          region                       : 'GRA'
        },
        {
          username                     : 'storage-2-user',
          password                     : 'storage-2-password',
          authUrl                      : authURL,
          tenantName                   : 'storage-2-tenant',
          region                       : 'SBG'
        }]);
        storage.connection((err) => {
          assert.strictEqual(err, null)
          assert.strictEqual(firstNock.pendingMocks().length, 0);
          done();
        })
      })

      it('should reconnect automatically to the second object storage if the first storage authentication fail and should retry the request', function (done) {

        let firstNock = nock(publicUrlGRA)
          /** 1 */
          .get('/templates')
          .reply(401, 'Unauthorized')

        let secondNock = nock(authURL)
          /** 2 */
          .post('/auth/tokens')
          .reply(500, {})
          /** 3 */
          .post('/auth/tokens')
          .reply(200, connectionResultSuccessV3, { "X-Subject-Token": tokenAuth });

        let thirdNock = nock(publicUrlSBG)
          .defaultReplyHeaders({
            'content-type': 'application/json',
          })
          /** 4 */
          .get('/templates')
          .reply(200, () => {
            return fs.createReadStream(path.join(__dirname, 'assets', 'files.json'));
          });


        storage.listFiles('templates', (err, resp) => {
          assert.strictEqual(err, null);
          assert.strictEqual(resp.statusCode, 200);
          assert.strictEqual(JSON.stringify(resp.headers), '{"content-type":"application/json"}');
          const _files = resp.body;
          assert.strictEqual(_files.length > 0, true)
          assert.strictEqual(_files[0].bytes > 0, true)
          assert.strictEqual(_files[0].last_modified.length > 0, true)
          assert.strictEqual(_files[0].hash.length > 0, true)
          assert.strictEqual(_files[0].name.length > 0, true)
          assert.strictEqual(_files[0].content_type.length > 0, true)
          assert.strictEqual(firstNock.pendingMocks().length, 0);
          assert.strictEqual(secondNock.pendingMocks().length, 0);
          assert.strictEqual(thirdNock.pendingMocks().length, 0);
          assert.deepStrictEqual(storage.getConfig().activeStorage, 1);
          done();
        });
      });

      it('should retry the request with the second object storage if the first object storage return a 500 error', function (done) {

        let firstNock = nock(publicUrlGRA)
          .get('/templates')
          .reply(500, {});

        let secondNock = nock(authURL)
          .post('/auth/tokens')
          .reply(200, connectionResultSuccessV3, { "X-Subject-Token": tokenAuth });

        let thirdNock = nock(publicUrlSBG)
          .defaultReplyHeaders({
            'content-type': 'application/json',
          })
          .get('/templates')
          .reply(200, () => {
            return fs.createReadStream(path.join(__dirname, 'assets', 'files.json'));
          });


        storage.listFiles('templates', (err, resp) => {
          assert.strictEqual(err, null);
          assert.strictEqual(resp.statusCode, 200);
          assert.strictEqual(JSON.stringify(resp.headers), '{"content-type":"application/json"}');
          const _files = resp.body;
          assert.strictEqual(_files.length > 0, true)
          assert.strictEqual(_files[0].bytes > 0, true)
          assert.strictEqual(_files[0].last_modified.length > 0, true)
          assert.strictEqual(_files[0].hash.length > 0, true)
          assert.strictEqual(_files[0].name.length > 0, true)
          assert.strictEqual(_files[0].content_type.length > 0, true)

          assert.strictEqual(firstNock.pendingMocks().length, 0);
          assert.strictEqual(secondNock.pendingMocks().length, 0);
          assert.strictEqual(thirdNock.pendingMocks().length, 0);
          assert.deepStrictEqual(storage.getConfig().activeStorage, 1);
          done();
        });
      });



      it('should retry the request with the second object storage if the first object storage timeout', function (done) {

        storage.setTimeout(200);

        let firstNock = nock(publicUrlGRA)
          .get('/templates')
          .delayConnection(500)
          .reply(200, {});

        let secondNock = nock(authURL)
          .post('/auth/tokens')
          .reply(200, connectionResultSuccessV3, { "X-Subject-Token": tokenAuth });

        let thirdNock = nock(publicUrlSBG)
          .defaultReplyHeaders({
            'content-type': 'application/json',
          })
          .get('/templates')
          .reply(200, () => {
            return fs.createReadStream(path.join(__dirname, 'assets', 'files.json'));
          });

        storage.listFiles('templates', (err, resp) => {
          assert.strictEqual(err, null);
          assert.strictEqual(resp.statusCode, 200);
          assert.strictEqual(JSON.stringify(resp.headers), '{"content-type":"application/json"}');
          const _files = resp.body;
          assert.strictEqual(_files.length > 0, true)
          assert.strictEqual(_files[0].bytes > 0, true)
          assert.strictEqual(_files[0].last_modified.length > 0, true)
          assert.strictEqual(_files[0].hash.length > 0, true)
          assert.strictEqual(_files[0].name.length > 0, true)
          assert.strictEqual(_files[0].content_type.length > 0, true)

          assert.strictEqual(firstNock.pendingMocks().length, 0);
          assert.strictEqual(secondNock.pendingMocks().length, 0);
          assert.strictEqual(thirdNock.pendingMocks().length, 0);
          assert.deepStrictEqual(storage.getConfig().activeStorage, 1);
          done();
        });
      });

      it('should retry the request with the second storage if the first storage return any kind of errors', function (done) {

        let firstNock = nock(publicUrlGRA)
          .get('/templates')
          .replyWithError('Error Message 1234');


        let secondNock = nock(authURL)
          .post('/auth/tokens')
          .reply(200, connectionResultSuccessV3, { "X-Subject-Token": tokenAuth });

        let thirdNock = nock(publicUrlSBG)
          .defaultReplyHeaders({
            'content-type': 'application/json',
          })
          .get('/templates')
          .reply(200, () => {
            return fs.createReadStream(path.join(__dirname, 'assets', 'files.json'));
          });

        storage.listFiles('templates', (err, resp) => {
          assert.strictEqual(err, null);
          assert.strictEqual(resp.statusCode, 200);
          assert.strictEqual(JSON.stringify(resp.headers), '{"content-type":"application/json"}');
          const _files = resp.body;
          assert.strictEqual(_files.length > 0, true)
          assert.strictEqual(_files[0].bytes > 0, true)
          assert.strictEqual(firstNock.pendingMocks().length, 0);
          assert.strictEqual(secondNock.pendingMocks().length, 0);
          assert.strictEqual(thirdNock.pendingMocks().length, 0);
          assert.deepStrictEqual(storage.getConfig().activeStorage, 1);
          done();
        });
      });

      describe("PARALLEL REQUESTS", function () {

        function getListFilesPromise() {
          return new Promise((resolve, reject) => {
            try {
              storage.listFiles('templates', (err, resp) => {
                if (err) {
                  return reject(err);
                }
                assert.strictEqual(resp.statusCode, 200);
                assert.strictEqual(JSON.stringify(resp.headers), '{"content-type":"application/json"}');
                return resolve(resp.body);
              });
            } catch(err) {
              return reject(err);
            }
          });
        }

        it('should request the object storage in parallel and fallback to SBG if the main storage return any kind of errors', function (done) {

          let firstNock = nock(publicUrlGRA)
            .get('/templates')
            .replyWithError('Error Message 1234')
            .get('/templates')
            .replyWithError('Error Message 1234');

          let secondNock = nock(authURL)
            .post('/auth/tokens')
            .reply(200, connectionResultSuccessV3, { "X-Subject-Token": tokenAuth })
            .post('/auth/tokens')
            .reply(200, connectionResultSuccessV3, { "X-Subject-Token": tokenAuth });


          let thirdNock = nock(publicUrlSBG)
            .defaultReplyHeaders({
              'content-type': 'application/json',
            })
            .get('/templates')
            .reply(200, () => {
              return fs.createReadStream(path.join(__dirname, 'assets', 'files.json'));
            })
            .get('/templates')
            .reply(200, () => {
              return fs.createReadStream(path.join(__dirname, 'assets', 'files.json'));
            });

          let promise1 = getListFilesPromise()
          let promise2 = getListFilesPromise()


          Promise.all([promise1, promise2]).then(results => {
            assert.strictEqual(results.length, 2)

            const _listFiles1 = results[0];
            assert.strictEqual(_listFiles1.length > 0, true)
            assert.strictEqual(_listFiles1[0].bytes > 0, true)
            assert.strictEqual(_listFiles1[0].last_modified.length > 0, true)
            assert.strictEqual(_listFiles1[0].hash.length > 0, true)
            assert.strictEqual(_listFiles1[0].name.length > 0, true)
            assert.strictEqual(_listFiles1[0].content_type.length > 0, true)

            const _listFiles2 = results[1];
            assert.strictEqual(_listFiles2.length > 0, true)
            assert.strictEqual(_listFiles2[0].bytes > 0, true)
            assert.strictEqual(_listFiles2[0].last_modified.length > 0, true)
            assert.strictEqual(_listFiles2[0].hash.length > 0, true)
            assert.strictEqual(_listFiles2[0].name.length > 0, true)
            assert.strictEqual(_listFiles2[0].content_type.length > 0, true)

            assert.deepStrictEqual(storage.getConfig().activeStorage, 1);
            assert.strictEqual(firstNock.pendingMocks().length, 0);
            assert.strictEqual(secondNock.pendingMocks().length, 0);
            assert.strictEqual(thirdNock.pendingMocks().length, 0);
            done();
          }).catch(err => {
            assert.strictEqual(err, null);
            done();
          });
        });

        it('should request the object storage in parallel and fallback to SBG if the authentication of the main storage return an error', function (done) {

          let firstNock = nock(publicUrlGRA)
            .get('/templates')
            .reply(401, 'Unauthorized')
            .get('/templates')
            .reply(401, 'Unauthorized')
            .get('/templates')
            .reply(401, 'Unauthorized')

          let secondNock = nock(authURL)
            .post('/auth/tokens')
            .reply(500, {})
            .post('/auth/tokens')
            .reply(500, {})
            .post('/auth/tokens')
            .reply(500, {})
            .post('/auth/tokens')
            .reply(200, connectionResultSuccessV3, { "X-Subject-Token": tokenAuth })
            .post('/auth/tokens')
            .reply(200, connectionResultSuccessV3, { "X-Subject-Token": tokenAuth })
            .post('/auth/tokens')
            .reply(200, connectionResultSuccessV3, { "X-Subject-Token": tokenAuth });

          let thirdNock = nock(publicUrlSBG)
            .defaultReplyHeaders({
              'content-type': 'application/json',
            })
            .get('/templates')
            .reply(200, () => {
              return fs.createReadStream(path.join(__dirname, 'assets', 'files.json'));
            })
            .get('/templates')
            .reply(200, () => {
              return fs.createReadStream(path.join(__dirname, 'assets', 'files.json'));
            })
            .get('/templates')
            .reply(200, () => {
              return fs.createReadStream(path.join(__dirname, 'assets', 'files.json'));
            })
            .get('/templates')
            .reply(200, () => {
              return fs.createReadStream(path.join(__dirname, 'assets', 'files.json'));
            });

          let promise1 = getListFilesPromise()
          let promise2 = getListFilesPromise()
          let promise3 = getListFilesPromise()

          Promise.all([promise1, promise2, promise3]).then(async results => {
            assert.strictEqual(results.length, 3)

            const _listFiles1 = results[0];
            assert.strictEqual(_listFiles1.length > 0, true)
            assert.strictEqual(_listFiles1[0].bytes > 0, true)
            assert.strictEqual(_listFiles1[0].last_modified.length > 0, true)
            assert.strictEqual(_listFiles1[0].hash.length > 0, true)
            assert.strictEqual(_listFiles1[0].name.length > 0, true)
            assert.strictEqual(_listFiles1[0].content_type.length > 0, true)

            const _listFiles2 = results[1];
            assert.strictEqual(_listFiles2.length > 0, true)
            assert.strictEqual(_listFiles2[0].bytes > 0, true)
            assert.strictEqual(_listFiles2[0].last_modified.length > 0, true)
            assert.strictEqual(_listFiles2[0].hash.length > 0, true)
            assert.strictEqual(_listFiles2[0].name.length > 0, true)
            assert.strictEqual(_listFiles2[0].content_type.length > 0, true)

            const _listFiles3 = results[2];
            assert.strictEqual(_listFiles3.length > 0, true)
            assert.strictEqual(_listFiles3[0].bytes > 0, true)
            assert.strictEqual(_listFiles3[0].last_modified.length > 0, true)
            assert.strictEqual(_listFiles3[0].hash.length > 0, true)
            assert.strictEqual(_listFiles3[0].name.length > 0, true)
            assert.strictEqual(_listFiles3[0].content_type.length > 0, true)

            const _listFiles4 = await getListFilesPromise();
            assert.strictEqual(_listFiles4.length > 0, true)
            assert.strictEqual(_listFiles4[0].bytes > 0, true)
            assert.strictEqual(_listFiles4[0].last_modified.length > 0, true)
            assert.strictEqual(_listFiles4[0].hash.length > 0, true)
            assert.strictEqual(_listFiles4[0].name.length > 0, true)
            assert.strictEqual(_listFiles4[0].content_type.length > 0, true)

            assert.deepStrictEqual(storage.getConfig().activeStorage, 1);
            assert.strictEqual(firstNock.pendingMocks().length, 0);
            assert.strictEqual(secondNock.pendingMocks().length, 0);
            assert.strictEqual(thirdNock.pendingMocks().length, 0);
            done();
          });
        });

        it('should request the object storage in parallel and fallback to SBG if the main storage timeout', function (done) {

          storage.setTimeout(200);

          let firstNock = nock(publicUrlGRA)
            .get('/templates')
            .delayConnection(500)
            .reply(200, {})
            .get('/templates')
            .delayConnection(500)
            .reply(200, {});

          let secondNock = nock(authURL)
            .post('/auth/tokens')
            .reply(200, connectionResultSuccessV3, { "X-Subject-Token": tokenAuth })
            .post('/auth/tokens')
            .reply(200, connectionResultSuccessV3, { "X-Subject-Token": tokenAuth });

          let thirdNock = nock(publicUrlSBG)
            .defaultReplyHeaders({
              'content-type': 'application/json',
            })
            .get('/templates')
            .reply(200, () => {
              return fs.createReadStream(path.join(__dirname, 'assets', 'files.json'));
            })
            .get('/templates')
            .reply(200, () => {
              return fs.createReadStream(path.join(__dirname, 'assets', 'files.json'));
            });


          let promise1 = getListFilesPromise()
          let promise2 = getListFilesPromise()


          Promise.all([promise1, promise2]).then(results => {
            assert.strictEqual(results.length, 2)

            const _listFiles1 = results[0];
            assert.strictEqual(_listFiles1.length > 0, true)
            assert.strictEqual(_listFiles1[0].bytes > 0, true)
            assert.strictEqual(_listFiles1[0].last_modified.length > 0, true)
            assert.strictEqual(_listFiles1[0].hash.length > 0, true)
            assert.strictEqual(_listFiles1[0].name.length > 0, true)
            assert.strictEqual(_listFiles1[0].content_type.length > 0, true)

            const _listFiles2 = results[1];
            assert.strictEqual(_listFiles2.length > 0, true)
            assert.strictEqual(_listFiles2[0].bytes > 0, true)
            assert.strictEqual(_listFiles2[0].last_modified.length > 0, true)
            assert.strictEqual(_listFiles2[0].hash.length > 0, true)
            assert.strictEqual(_listFiles2[0].name.length > 0, true)
            assert.strictEqual(_listFiles2[0].content_type.length > 0, true)

            assert.deepStrictEqual(storage.getConfig().activeStorage, 1);
            assert.strictEqual(firstNock.pendingMocks().length, 0);
            assert.strictEqual(secondNock.pendingMocks().length, 0);
            assert.strictEqual(thirdNock.pendingMocks().length, 0);
            done();
          }).catch(err => {
            assert.strictEqual(err, null);
            done();
          });
        });

        it('should request the object storage in parallel and fallback to SBG if the main storage return a 500 error', function (done) {

          let firstNock = nock(publicUrlGRA)
            .get('/templates')
            .reply(500, {})
            .get('/templates')
            .reply(500, {});

          let secondNock = nock(authURL)
            .post('/auth/tokens')
            .reply(200, connectionResultSuccessV3, { "X-Subject-Token": tokenAuth })
            .post('/auth/tokens')
            .reply(200, connectionResultSuccessV3, { "X-Subject-Token": tokenAuth });

          let thirdNock = nock(publicUrlSBG)
            .defaultReplyHeaders({
              'content-type': 'application/json',
            })
            .get('/templates')
            .reply(200, () => {
              return fs.createReadStream(path.join(__dirname, 'assets', 'files.json'));
            })
            .get('/templates')
            .reply(200, () => {
              return fs.createReadStream(path.join(__dirname, 'assets', 'files.json'));
            });

          let promise1 = getListFilesPromise(0)
          let promise2 = getListFilesPromise(0)


          Promise.all([promise1, promise2]).then(results => {
            assert.strictEqual(results.length, 2)

            const _listFiles1 = results[0];
            assert.strictEqual(_listFiles1.length > 0, true)
            assert.strictEqual(_listFiles1[0].bytes > 0, true)
            assert.strictEqual(_listFiles1[0].last_modified.length > 0, true)
            assert.strictEqual(_listFiles1[0].hash.length > 0, true)
            assert.strictEqual(_listFiles1[0].name.length > 0, true)
            assert.strictEqual(_listFiles1[0].content_type.length > 0, true)

            const _listFiles2 = results[1];
            assert.strictEqual(_listFiles2.length > 0, true)
            assert.strictEqual(_listFiles2[0].bytes > 0, true)
            assert.strictEqual(_listFiles2[0].last_modified.length > 0, true)
            assert.strictEqual(_listFiles2[0].hash.length > 0, true)
            assert.strictEqual(_listFiles2[0].name.length > 0, true)
            assert.strictEqual(_listFiles2[0].content_type.length > 0, true)

            assert.deepStrictEqual(storage.getConfig().activeStorage, 1);
            assert.strictEqual(firstNock.pendingMocks().length, 0);
            assert.strictEqual(secondNock.pendingMocks().length, 0);
            assert.strictEqual(thirdNock.pendingMocks().length, 0);
            done();
          }).catch(err => {
            assert.strictEqual(err, null);
            done();
          });
        });

        it('should request the object storage in parallel and fallback to SBG if the authentication of the main storage return does not return the object storage list [Special case and should never happen]', function (done) {

          let firstNock = nock(publicUrlGRA)
            .get('/templates')
            .reply(401, 'Unauthorized')
            .get('/templates')
            .reply(401, 'Unauthorized')

          let secondNock = nock(authURL)
            .post('/auth/tokens')
            .reply(200, connectionResultSuccessV3WithoutObjectStore)
            .post('/auth/tokens')
            .reply(200, connectionResultSuccessV3WithoutObjectStore)
            .post('/auth/tokens')
            .reply(200, connectionResultSuccessV3, { "X-Subject-Token": tokenAuth })
            .post('/auth/tokens')
            .reply(200, connectionResultSuccessV3, { "X-Subject-Token": tokenAuth })


          let thirdNock = nock(publicUrlSBG)
            .defaultReplyHeaders({
              'content-type': 'application/json',
            })
            .get('/templates')
            .reply(200, () => {
              return fs.createReadStream(path.join(__dirname, 'assets', 'files.json'));
            })
            .get('/templates')
            .reply(200, () => {
              return fs.createReadStream(path.join(__dirname, 'assets', 'files.json'));
            })

          let promise1 = getListFilesPromise()
          let promise2 = getListFilesPromise()

          Promise.all([promise1, promise2]).then(async results => {
            assert.strictEqual(results.length, 2)

            const _listFiles1 = results[0];
            assert.strictEqual(_listFiles1.length > 0, true)
            assert.strictEqual(_listFiles1[0].bytes > 0, true)
            assert.strictEqual(_listFiles1[0].last_modified.length > 0, true)
            assert.strictEqual(_listFiles1[0].hash.length > 0, true)
            assert.strictEqual(_listFiles1[0].name.length > 0, true)
            assert.strictEqual(_listFiles1[0].content_type.length > 0, true)

            const _listFiles2 = results[1];
            assert.strictEqual(_listFiles2.length > 0, true)
            assert.strictEqual(_listFiles2[0].bytes > 0, true)
            assert.strictEqual(_listFiles2[0].last_modified.length > 0, true)
            assert.strictEqual(_listFiles2[0].hash.length > 0, true)
            assert.strictEqual(_listFiles2[0].name.length > 0, true)
            assert.strictEqual(_listFiles2[0].content_type.length > 0, true)

            assert.deepStrictEqual(storage.getConfig().activeStorage, 1);
            assert.strictEqual(firstNock.pendingMocks().length, 0);
            assert.strictEqual(secondNock.pendingMocks().length, 0);
            assert.strictEqual(thirdNock.pendingMocks().length, 0);
            done();
          });
        });
      });
    });
  });

  describe('downloadFile', function () {

    describe('SINGLE STORAGE', function () {
      it('should download file and return the header', function (done) {
        const firstNock = nock(publicUrlGRA)
          .defaultReplyHeaders({
            'content-length': '1492',
            'accept-ranges': 'bytes',
            'last-modified': 'Wed, 03 Nov 2021 13:02:39 GMT',
            'content-type': 'application/json',
            etag: 'a30776a059eaf26eebf27756a849097d',
            'x-openstack-request-id': 'tx136c028c478a4b40a7014-0061829c9f',
            date: 'Wed, 03 Nov 2021 14:28:48 GMT',
            'x-iplb-request-id': '25A66014:1D97_3626E64B:01BB_61829C9E_3C28BD:960D'
          })
          .get('/templates/test.odt')
          .reply(200, () => {
            return fs.createReadStream(path.join(__dirname, 'assets', 'file.txt'));
          });

        storage.downloadFile('templates', 'test.odt', (err, resp) => {
          assert.strictEqual(err, null);
          assert.strictEqual(resp.body.toString(), 'The platypus, sometimes referred to as the duck-billed platypus, is a semiaquatic, egg-laying mammal endemic to eastern Australia.');
          assert.strictEqual(firstNock.pendingMocks().length, 0);
          assert.strictEqual(resp.headers['etag'].length > 0, true);
          assert.strictEqual(resp.headers['x-openstack-request-id'].length > 0, true);
          assert.strictEqual(resp.headers['content-length'].length > 0, true);
          assert.strictEqual(resp.headers['date'].length > 0, true);
          assert.strictEqual(resp.statusCode, 200);
          done();
        });
      });

      it('should reconnect automatically to object storage and retry', function (done) {
        let firstNock = nock(publicUrlGRA)
          .defaultReplyHeaders({
            'content-length': '1492',
            'accept-ranges': 'bytes',
            'last-modified': 'Wed, 03 Nov 2021 13:02:39 GMT',
            'content-type': 'application/json',
            etag: 'a30776a059eaf26eebf27756a849097d',
            'x-openstack-request-id': 'tx136c028c478a4b40a7014-0061829c9f',
            date: 'Wed, 03 Nov 2021 14:28:48 GMT',
            'x-iplb-request-id': '25A66014:1D97_3626E64B:01BB_61829C9E_3C28BD:960D'
          })
          .get('/templates/test.odt')
          .reply(401, 'Unauthorized')
          .get('/templates/test.odt')
          .reply(200, () => {
            return fs.createReadStream(path.join(__dirname, 'assets', 'file.txt'));
          });

        let secondNock = nock(authURL)
          .post('/auth/tokens')
          .reply(200, connectionResultSuccessV3, { "X-Subject-Token": tokenAuth });

        storage.downloadFile('templates', 'test.odt', (err, resp) => {
          assert.strictEqual(err, null);
          assert.strictEqual(resp.body.toString(), 'The platypus, sometimes referred to as the duck-billed platypus, is a semiaquatic, egg-laying mammal endemic to eastern Australia.');
          assert.strictEqual(firstNock.pendingMocks().length, 0);
          assert.strictEqual(secondNock.pendingMocks().length, 0);
          assert.strictEqual(resp.headers['etag'].length > 0, true);
          assert.strictEqual(resp.headers['x-openstack-request-id'].length > 0, true);
          assert.strictEqual(resp.headers['content-length'].length > 0, true);
          assert.strictEqual(resp.headers['date'].length > 0, true);
          assert.strictEqual(resp.statusCode, 200);
          done();
        });
      });

      it('should return an error if the single storage timout', function (done) {
        storage.setTimeout(200);
        const firstNock = nock(publicUrlGRA)
          .get('/templates/test.odt')
          .delayConnection(500)
          .reply(200, {})

        storage.downloadFile('templates', 'test.odt', (err, resp) => {
          assert.strictEqual(err.message, 'Object Storages are not available');
          assert.strictEqual(resp, undefined);
          assert.strictEqual(firstNock.pendingMocks().length, 0);
          done();
        });
      });

      it('should return an error if the single storage return any kind of errors', function (done) {
        const firstNock = nock(publicUrlGRA)
          .get('/templates/test.odt')
          .replyWithError('Error Message 1234');

        storage.downloadFile('templates', 'test.odt', (err, body) => {
          assert.strictEqual(err.message, 'Object Storages are not available');
          assert.strictEqual(body, undefined);
          assert.strictEqual(firstNock.pendingMocks().length, 0);
          done();
        });
      });

      it('should return an error if the file does not exist', function (done) {
        const firstNock = nock(publicUrlGRA)
          .get('/templates/test.odt')
          .reply(404);

        storage.downloadFile('templates', 'test.odt', (err, resp) => {
          assert.strictEqual(err, null);
          assert.strictEqual(resp.statusCode, 404);
          assert.strictEqual(resp.body.toString(), '');
          assert.strictEqual(JSON.stringify(resp.headers), '{}');
          assert.strictEqual(firstNock.pendingMocks().length, 0);
          done();
        });
      });
    });

    describe('MULTIPLE STORAGES', function () {
      beforeEach(function (done) {
        const firstNock = nock(authURL)
            .post('/auth/tokens')
            .reply(200, connectionResultSuccessV3, { "X-Subject-Token": tokenAuth });

        storage.setTimeout(5000);
        storage.setStorages([{
          username                     : 'storage-1-user',
          password                     : 'storage-1-password',
          authUrl                      : authURL,
          tenantName                   : 'storage-1-tenant',
          region                       : 'GRA'
        },
        {
          username                     : 'storage-2-user',
          password                     : 'storage-2-password',
          authUrl                      : authURL,
          tenantName                   : 'storage-2-tenant',
          region                       : 'SBG'
        }]);
        storage.connection((err) => {
          assert.strictEqual(err, null)
          assert.strictEqual(firstNock.pendingMocks().length, 0);
          done();
        })
      })

      it('should reconnect automatically to the second object storage if the first storage authentication fail and should retry the request', function(done){
        let firstNock = nock(publicUrlGRA)
          /** 1 */
          .get('/templates/test.odt')
          .reply(401, 'Unauthorized');

        let secondNock = nock(authURL)
          /** 2 */
          .post('/auth/tokens')
          .reply(500, {})
          /** 3 */
          .post('/auth/tokens')
          .reply(200, connectionResultSuccessV3, { "X-Subject-Token": tokenAuth });

        let thirdNock = nock(publicUrlSBG)
          /** 4 */
          .defaultReplyHeaders({
            'content-length': '1492',
            'accept-ranges': 'bytes',
            'last-modified': 'Wed, 03 Nov 2021 13:02:39 GMT',
            'content-type': 'application/json',
            etag: 'a30776a059eaf26eebf27756a849097d',
            'x-openstack-request-id': 'tx136c028c478a4b40a7014-0061829c9f',
            date: 'Wed, 03 Nov 2021 14:28:48 GMT',
            'x-iplb-request-id': '25A66014:1D97_3626E64B:01BB_61829C9E_3C28BD:960D'
          })
          .get('/templates/test.odt')
          .reply(200, () => {
            return fs.createReadStream(path.join(__dirname, 'assets', 'file.txt'));
          });

        storage.downloadFile('templates', 'test.odt', (err, resp) => {
          assert.strictEqual(err, null);
          assert.strictEqual(resp.statusCode, 200);
          assert.strictEqual(resp.body.toString(), 'The platypus, sometimes referred to as the duck-billed platypus, is a semiaquatic, egg-laying mammal endemic to eastern Australia.');
          assert.strictEqual(resp.headers['etag'].length > 0, true);
          assert.strictEqual(resp.headers['x-openstack-request-id'].length > 0, true);
          assert.strictEqual(resp.headers['content-length'].length > 0, true);
          assert.strictEqual(resp.headers['date'].length > 0, true);
          assert.strictEqual(firstNock.pendingMocks().length, 0);
          assert.strictEqual(secondNock.pendingMocks().length, 0);
          assert.strictEqual(thirdNock.pendingMocks().length, 0);
          assert.deepStrictEqual(storage.getConfig().activeStorage, 1);
          done();
        });


      })

      it('should retry the request with the second object storage if the first object storage return a 500 error', function(done){
        let firstNock = nock(publicUrlGRA)
          .get('/templates/test2.odt')
          .reply(500, () => {
            return '';
          });

        let secondNock = nock(authURL)
          .post('/auth/tokens')
          .reply(200, connectionResultSuccessV3, { "X-Subject-Token": tokenAuth });

        let thirdNock = nock(publicUrlSBG)
          .defaultReplyHeaders({
            'content-length': '1492',
            'accept-ranges': 'bytes',
            'last-modified': 'Wed, 03 Nov 2021 13:02:39 GMT',
            'content-type': 'application/json',
            etag: 'a30776a059eaf26eebf27756a849097d',
            'x-openstack-request-id': 'tx136c028c478a4b40a7014-0061829c9f',
            date: 'Wed, 03 Nov 2021 14:28:48 GMT',
            'x-iplb-request-id': '25A66014:1D97_3626E64B:01BB_61829C9E_3C28BD:960D'
          })
          .get('/templates/test2.odt')
          .reply(200, () => {
            return fs.createReadStream(path.join(__dirname, 'assets', 'file.txt'));
          });

        storage.downloadFile('templates', 'test2.odt', (err, resp) => {
          assert.strictEqual(err, null);
          assert.strictEqual(resp.statusCode, 200);
          assert.strictEqual(resp.body.toString(), 'The platypus, sometimes referred to as the duck-billed platypus, is a semiaquatic, egg-laying mammal endemic to eastern Australia.');
          assert.strictEqual(resp.headers['etag'].length > 0, true);
          assert.strictEqual(resp.headers['x-openstack-request-id'].length > 0, true);
          assert.strictEqual(resp.headers['content-length'].length > 0, true);
          assert.strictEqual(resp.headers['date'].length > 0, true);
          assert.strictEqual(firstNock.pendingMocks().length, 0);
          assert.strictEqual(secondNock.pendingMocks().length, 0);
          assert.strictEqual(thirdNock.pendingMocks().length, 0);
          assert.deepStrictEqual(storage.getConfig().activeStorage, 1);
          done();
        });
      })

      it('should retry the request with the second object storage if the first object storage timeout', function(done){
        storage.setTimeout(200);
        let firstNock = nock(publicUrlGRA)
          .get('/templates/test.odt')
          .delayConnection(500)
          .reply(200, {});

        let secondNock = nock(authURL)
          .post('/auth/tokens')
          .reply(200, connectionResultSuccessV3, { "X-Subject-Token": tokenAuth });

        let thirdNock = nock(publicUrlSBG)
          .defaultReplyHeaders({
            'content-length': '1492',
            'accept-ranges': 'bytes',
            'last-modified': 'Wed, 03 Nov 2021 13:02:39 GMT',
            'content-type': 'application/json',
            etag: 'a30776a059eaf26eebf27756a849097d',
            'x-openstack-request-id': 'tx136c028c478a4b40a7014-0061829c9f',
            date: 'Wed, 03 Nov 2021 14:28:48 GMT',
            'x-iplb-request-id': '25A66014:1D97_3626E64B:01BB_61829C9E_3C28BD:960D'
          })
          .get('/templates/test.odt')
          .reply(200, () => {
            return fs.createReadStream(path.join(__dirname, 'assets', 'file.txt'));
          });


        storage.downloadFile('templates', 'test.odt', (err, resp) => {
          assert.strictEqual(err, null);
          assert.strictEqual(resp.statusCode, 200);
          assert.strictEqual(resp.body.toString(), 'The platypus, sometimes referred to as the duck-billed platypus, is a semiaquatic, egg-laying mammal endemic to eastern Australia.');
          assert.strictEqual(resp.headers['etag'].length > 0, true);
          assert.strictEqual(resp.headers['x-openstack-request-id'].length > 0, true);
          assert.strictEqual(resp.headers['content-length'].length > 0, true);
          assert.strictEqual(resp.headers['date'].length > 0, true);
          assert.strictEqual(firstNock.pendingMocks().length, 0);
          assert.strictEqual(secondNock.pendingMocks().length, 0);
          assert.deepStrictEqual(storage.getConfig().activeStorage, 1);
          assert.strictEqual(thirdNock.pendingMocks().length, 0);
          done();
        });
      })

      it('should retry the request with the second storage if the first storage return any kind of errors', function (done) {
        let firstNock = nock(publicUrlGRA)
          .get('/templates/test.odt')
          .replyWithError('Error Message 1234');

        let secondNock = nock(authURL)
          .post('/auth/tokens')
          .reply(200, connectionResultSuccessV3, { "X-Subject-Token": tokenAuth });

        let thirdNock = nock(publicUrlSBG)
          .defaultReplyHeaders({
            'content-length': '1492',
            'accept-ranges': 'bytes',
            'last-modified': 'Wed, 03 Nov 2021 13:02:39 GMT',
            'content-type': 'application/json',
            etag: 'a30776a059eaf26eebf27756a849097d',
            'x-openstack-request-id': 'tx136c028c478a4b40a7014-0061829c9f',
            date: 'Wed, 03 Nov 2021 14:28:48 GMT',
            'x-iplb-request-id': '25A66014:1D97_3626E64B:01BB_61829C9E_3C28BD:960D'
          })
          .get('/templates/test.odt')
          .reply(200, () => {
            return fs.createReadStream(path.join(__dirname, 'assets', 'file.txt'));
          });


        storage.downloadFile('templates', 'test.odt', (err, resp) => {
          assert.strictEqual(err, null);
          assert.strictEqual(resp.statusCode, 200);
          assert.strictEqual(resp.body.toString(), 'The platypus, sometimes referred to as the duck-billed platypus, is a semiaquatic, egg-laying mammal endemic to eastern Australia.');
          assert.strictEqual(resp.headers['etag'].length > 0, true);
          assert.strictEqual(resp.headers['x-openstack-request-id'].length > 0, true);
          assert.strictEqual(resp.headers['content-length'].length > 0, true);
          assert.strictEqual(resp.headers['date'].length > 0, true);
          assert.strictEqual(firstNock.pendingMocks().length, 0);
          assert.strictEqual(secondNock.pendingMocks().length, 0);
          assert.strictEqual(thirdNock.pendingMocks().length, 0);
          assert.deepStrictEqual(storage.getConfig().activeStorage, 1);
          done();
        });
      });

      describe("PARALLEL REQUESTS", function () {

        function getDownloadFilePromise() {
          return new Promise((resolve, reject) => {
            try {
              storage.downloadFile('templates', 'test.odt', (err, resp) => {
                if (err) {
                  return reject(err);
                }
                return resolve(resp);
              });
            } catch(err) {
              return reject(err);
            }
          });
        }

        it('should request the object storage in parallel and fallback to SBG if the main storage return any kind of errors', function (done) {

          let firstNock = nock(publicUrlGRA)
            .get('/templates/test.odt')
            .replyWithError('Error Message 1234')
            .get('/templates/test.odt')
            .replyWithError('Error Message 1234');

          let secondNock = nock(authURL)
            .post('/auth/tokens')
            .reply(200, connectionResultSuccessV3, { "X-Subject-Token": tokenAuth })
            .post('/auth/tokens')
            .reply(200, connectionResultSuccessV3, { "X-Subject-Token": tokenAuth });

          let thirdNock = nock(publicUrlSBG)
            .defaultReplyHeaders({
              'content-length': '1492',
              'accept-ranges': 'bytes',
              'last-modified': 'Wed, 03 Nov 2021 13:02:39 GMT',
              'content-type': 'application/json',
              etag: 'a30776a059eaf26eebf27756a849097d',
              'x-openstack-request-id': 'tx136c028c478a4b40a7014-0061829c9f',
              date: 'Wed, 03 Nov 2021 14:28:48 GMT',
              'x-iplb-request-id': '25A66014:1D97_3626E64B:01BB_61829C9E_3C28BD:960D'
            })
            .get('/templates/test.odt')
            .reply(200, () => {
              return fs.createReadStream(path.join(__dirname, 'assets', 'file.txt'));
            })
            .get('/templates/test.odt')
            .reply(200, () => {
              return fs.createReadStream(path.join(__dirname, 'assets', 'file.txt'));
            });

          let promise1 = getDownloadFilePromise()
          let promise2 = getDownloadFilePromise()

          Promise.all([promise1, promise2]).then(results => {
            assert.strictEqual(results.length, 2)
            assert.strictEqual(results[0].statusCode, 200);
            assert.strictEqual(results[0].body.toString(), 'The platypus, sometimes referred to as the duck-billed platypus, is a semiaquatic, egg-laying mammal endemic to eastern Australia.');
            assert.strictEqual(results[0].headers['etag'].length > 0, true);
            assert.strictEqual(results[0].headers['x-openstack-request-id'].length > 0, true);
            assert.strictEqual(results[0].headers['content-length'].length > 0, true);
            assert.strictEqual(results[0].headers['date'].length > 0, true);
            assert.strictEqual(results[1].statusCode, 200);
            assert.strictEqual(results[1].body.toString(), 'The platypus, sometimes referred to as the duck-billed platypus, is a semiaquatic, egg-laying mammal endemic to eastern Australia.');
            assert.strictEqual(results[1].headers['etag'].length > 0, true);
            assert.strictEqual(results[1].headers['x-openstack-request-id'].length > 0, true);
            assert.strictEqual(results[1].headers['content-length'].length > 0, true);
            assert.strictEqual(results[1].headers['date'].length > 0, true);
            assert.strictEqual(firstNock.pendingMocks().length, 0);
            assert.strictEqual(secondNock.pendingMocks().length, 0);
            assert.strictEqual(thirdNock.pendingMocks().length, 0);
            assert.deepStrictEqual(storage.getConfig().activeStorage, 1);
            done();
          }).catch(err => {
            assert.strictEqual(err, null);
            done();
          });
        });

        it('should request the object storage in parallel and fallback to SBG if the authentication of the main storage return an error', function (done) {

          let firstNock = nock(publicUrlGRA)
            .get('/templates/test.odt')
            .reply(401, 'Unauthorized')
            .get('/templates/test.odt')
            .reply(401, 'Unauthorized');

          let secondNock = nock(authURL)
            .post('/auth/tokens')
            .reply(500, {})
            .post('/auth/tokens')
            .reply(500, {})
            .post('/auth/tokens')
            .reply(200, connectionResultSuccessV3, { "X-Subject-Token": tokenAuth })
            .post('/auth/tokens')
            .reply(200, connectionResultSuccessV3, { "X-Subject-Token": tokenAuth });

          let thirdNock = nock(publicUrlSBG)
            .defaultReplyHeaders({
              'content-length': '1492',
              'accept-ranges': 'bytes',
              'last-modified': 'Wed, 03 Nov 2021 13:02:39 GMT',
              'content-type': 'application/json',
              etag: 'a30776a059eaf26eebf27756a849097d',
              'x-openstack-request-id': 'tx136c028c478a4b40a7014-0061829c9f',
              date: 'Wed, 03 Nov 2021 14:28:48 GMT',
              'x-iplb-request-id': '25A66014:1D97_3626E64B:01BB_61829C9E_3C28BD:960D'
            })
            .get('/templates/test.odt')
            .reply(200, () => {
              return fs.createReadStream(path.join(__dirname, 'assets', 'file.txt'));
            })
            .get('/templates/test.odt')
            .reply(200, () => {
              return fs.createReadStream(path.join(__dirname, 'assets', 'file.txt'));
            });

          let promise1 = getDownloadFilePromise()
          let promise2 = getDownloadFilePromise()

          Promise.all([promise1, promise2]).then(async results => {
            assert.strictEqual(results.length, 2);
            assert.strictEqual(results[0].statusCode, 200);
            assert.strictEqual(results[0].body.toString(), 'The platypus, sometimes referred to as the duck-billed platypus, is a semiaquatic, egg-laying mammal endemic to eastern Australia.');
            assert.strictEqual(results[0].headers['etag'].length > 0, true);
            assert.strictEqual(results[0].headers['x-openstack-request-id'].length > 0, true);
            assert.strictEqual(results[0].headers['content-length'].length > 0, true);
            assert.strictEqual(results[0].headers['date'].length > 0, true);
            assert.strictEqual(results[1].statusCode, 200);
            assert.strictEqual(results[1].body.toString(), 'The platypus, sometimes referred to as the duck-billed platypus, is a semiaquatic, egg-laying mammal endemic to eastern Australia.');
            assert.strictEqual(results[1].headers['etag'].length > 0, true);
            assert.strictEqual(results[1].headers['x-openstack-request-id'].length > 0, true);
            assert.strictEqual(results[1].headers['content-length'].length > 0, true);
            assert.strictEqual(results[1].headers['date'].length > 0, true);
            assert.deepStrictEqual(storage.getConfig().activeStorage, 1);
            assert.strictEqual(firstNock.pendingMocks().length, 0);
            assert.strictEqual(secondNock.pendingMocks().length, 0);
            assert.strictEqual(thirdNock.pendingMocks().length, 0);
            done();
          });
        });

        it('should request the object storage in parallel and fallback to SBG if the main storage timeout', function (done) {

          storage.setTimeout(200);

          let firstNock = nock(publicUrlGRA)
            .get('/templates/test.odt')
            .delayConnection(500)
            .reply(200, {})
            .get('/templates/test.odt')
            .delayConnection(500)
            .reply(200, {});

          let secondNock = nock(authURL)
            .post('/auth/tokens')
            .reply(200, connectionResultSuccessV3, { "X-Subject-Token": tokenAuth })
            .post('/auth/tokens')
            .reply(200, connectionResultSuccessV3, { "X-Subject-Token": tokenAuth });

          let thirdNock = nock(publicUrlSBG)
            .defaultReplyHeaders({
              'content-length': '1492',
              'accept-ranges': 'bytes',
              'last-modified': 'Wed, 03 Nov 2021 13:02:39 GMT',
              'content-type': 'application/json',
              etag: 'a30776a059eaf26eebf27756a849097d',
              'x-openstack-request-id': 'tx136c028c478a4b40a7014-0061829c9f',
              date: 'Wed, 03 Nov 2021 14:28:48 GMT',
              'x-iplb-request-id': '25A66014:1D97_3626E64B:01BB_61829C9E_3C28BD:960D'
            })
            .get('/templates/test.odt')
            .reply(200, () => {
              return fs.createReadStream(path.join(__dirname, 'assets', 'file.txt'));
            })
            .get('/templates/test.odt')
            .reply(200, () => {
              return fs.createReadStream(path.join(__dirname, 'assets', 'file.txt'));
            });

          let promise1 = getDownloadFilePromise()
          let promise2 = getDownloadFilePromise()


          Promise.all([promise1, promise2]).then(results => {
            assert.strictEqual(results.length, 2);
            assert.strictEqual(results[0].statusCode, 200);
            assert.strictEqual(results[0].body.toString(), 'The platypus, sometimes referred to as the duck-billed platypus, is a semiaquatic, egg-laying mammal endemic to eastern Australia.');
            assert.strictEqual(results[0].headers['etag'].length > 0, true);
            assert.strictEqual(results[0].headers['x-openstack-request-id'].length > 0, true);
            assert.strictEqual(results[0].headers['content-length'].length > 0, true);
            assert.strictEqual(results[0].headers['date'].length > 0, true);
            assert.strictEqual(results[1].statusCode, 200);
            assert.strictEqual(results[1].body.toString(), 'The platypus, sometimes referred to as the duck-billed platypus, is a semiaquatic, egg-laying mammal endemic to eastern Australia.');
            assert.strictEqual(results[1].headers['etag'].length > 0, true);
            assert.strictEqual(results[1].headers['x-openstack-request-id'].length > 0, true);
            assert.strictEqual(results[1].headers['content-length'].length > 0, true);
            assert.strictEqual(results[1].headers['date'].length > 0, true);
            assert.deepStrictEqual(storage.getConfig().activeStorage, 1);
            assert.strictEqual(firstNock.pendingMocks().length, 0);
            assert.strictEqual(secondNock.pendingMocks().length, 0);
            assert.strictEqual(thirdNock.pendingMocks().length, 0);
            done();
          }).catch(err => {
            assert.strictEqual(err, null);
            done();
          });
        });

        it('should request the object storage in parallel and fallback to SBG if the main storage return a 500 error', function (done) {

          let firstNock = nock(publicUrlGRA)
            .get('/templates/test.odt')
            .reply(500, {})
            .get('/templates/test.odt')
            .reply(500, {});

          let secondNock = nock(authURL)
            .post('/auth/tokens')
            .reply(200, connectionResultSuccessV3, { "X-Subject-Token": tokenAuth })
            .post('/auth/tokens')
            .reply(200, connectionResultSuccessV3, { "X-Subject-Token": tokenAuth });

          let thirdNock = nock(publicUrlSBG)
            .defaultReplyHeaders({
              'content-length': '1492',
              'accept-ranges': 'bytes',
              'last-modified': 'Wed, 03 Nov 2021 13:02:39 GMT',
              'content-type': 'application/json',
              etag: 'a30776a059eaf26eebf27756a849097d',
              'x-openstack-request-id': 'tx136c028c478a4b40a7014-0061829c9f',
              date: 'Wed, 03 Nov 2021 14:28:48 GMT',
              'x-iplb-request-id': '25A66014:1D97_3626E64B:01BB_61829C9E_3C28BD:960D'
            })
            .get('/templates/test.odt')
            .reply(200, () => {
              return fs.createReadStream(path.join(__dirname, 'assets', 'file.txt'));
            })
            .get('/templates/test.odt')
            .reply(200, () => {
              return fs.createReadStream(path.join(__dirname, 'assets', 'file.txt'));
            });

          let promise1 = getDownloadFilePromise()
          let promise2 = getDownloadFilePromise()


          Promise.all([promise1, promise2]).then(results => {
            assert.strictEqual(results.length, 2);
            assert.strictEqual(results[0].statusCode, 200);
            assert.strictEqual(results[0].body.toString(), 'The platypus, sometimes referred to as the duck-billed platypus, is a semiaquatic, egg-laying mammal endemic to eastern Australia.');
            assert.strictEqual(results[0].headers['etag'].length > 0, true);
            assert.strictEqual(results[0].headers['x-openstack-request-id'].length > 0, true);
            assert.strictEqual(results[0].headers['content-length'].length > 0, true);
            assert.strictEqual(results[0].headers['date'].length > 0, true);
            assert.strictEqual(results[1].statusCode, 200);
            assert.strictEqual(results[1].body.toString(), 'The platypus, sometimes referred to as the duck-billed platypus, is a semiaquatic, egg-laying mammal endemic to eastern Australia.');
            assert.strictEqual(results[1].headers['etag'].length > 0, true);
            assert.strictEqual(results[1].headers['x-openstack-request-id'].length > 0, true);
            assert.strictEqual(results[1].headers['content-length'].length > 0, true);
            assert.strictEqual(results[1].headers['date'].length > 0, true);
            assert.deepStrictEqual(storage.getConfig().activeStorage, 1);
            assert.strictEqual(firstNock.pendingMocks().length, 0);
            assert.strictEqual(secondNock.pendingMocks().length, 0);
            assert.strictEqual(thirdNock.pendingMocks().length, 0);
            done();
          }).catch(err => {
            assert.strictEqual(err, null);
            done();
          });
        });
      });
    });
  });

  describe('uploadFile', function () {

    describe("SINGLE STORAGE", function () {
      it('should write file on server from a local path', function (done) {
        const _expectedFileContent = fs.readFileSync(path.join(__dirname, './assets/file.txt'));

        const firstNock = nock(publicUrlGRA)
          .put('/templates/test.odt')
          .reply(201, (uri, requestBody) => {
            assert.strictEqual(requestBody, _expectedFileContent.toString());
            return '';
          });

        storage.uploadFile('templates', 'test.odt', path.join(__dirname, './assets/file.txt'), (err) => {
          assert.strictEqual(err, null);
          assert.strictEqual(firstNock.pendingMocks().length, 0);
          done();
        });
      });

      it('should write file on server from a read Stream function', function (done) {
        const _expectedFileContent = fs.readFileSync(path.join(__dirname, './assets/file.txt'));

        const firstNock = nock(publicUrlGRA)
          .put('/templates/test.odt')
          .reply(201, (uri, requestBody) => {
            assert.strictEqual(requestBody, _expectedFileContent.toString());
            return '';
          });

        storage.uploadFile('templates', 'test.odt', () => fs.createReadStream(path.join(__dirname, './assets/file.txt')), (err) => {
          assert.strictEqual(err, null);
          assert.strictEqual(firstNock.pendingMocks().length, 0);
          done();
        });
      });

      it('should write file on server from a buffer', function (done) {
        const _expectedFileContent = fs.readFileSync(path.join(__dirname, './assets/file.txt'));

        const firstNock = nock(publicUrlGRA)
          .put('/templates/test.odt')
          .reply(201, (uri, requestBody) => {
            assert.strictEqual(requestBody, _expectedFileContent.toString());
            return '';
          });

        storage.uploadFile('templates', 'test.odt', _expectedFileContent, (err) => {
          assert.strictEqual(err, null);
          assert.strictEqual(firstNock.pendingMocks().length, 0);
          done();
        });
      });

      it('should reconnect automatically if the token is invalid and retry', function (done) {
        let firstNock = nock(publicUrlGRA)
          .put('/templates/test.odt')
          .reply(401, 'Unauthorized')
          .put('/templates/test.odt')
          .reply(201, '');

        let secondNock = nock(authURL)
          .post('/auth/tokens')
          .reply(200, connectionResultSuccessV3, { "X-Subject-Token": tokenAuth });

        storage.uploadFile('templates', 'test.odt', path.join(__dirname, './assets/file.txt'), (err) => {
          assert.strictEqual(err, null);
          assert.strictEqual(firstNock.pendingMocks().length, 0);
          assert.strictEqual(secondNock.pendingMocks().length, 0);
          done();
        });
      });

      it('should return an error if the single storage timout', function (done) {
        storage.setTimeout(200);
        const firstNock = nock(publicUrlGRA)
          .put('/templates/test.odt')
          .delayConnection(500)
          .reply(200, {})

        storage.uploadFile('templates', 'test.odt', path.join(__dirname, './assets/file.txt'), (err) => {
          assert.strictEqual(err.message, 'Object Storages are not available');
          assert.strictEqual(firstNock.pendingMocks().length, 0);
          done();
        });
      });


      it('should write file on server from a local path with query parameters and params', function (done) {
        const _expectedFileContent = fs.readFileSync(path.join(__dirname, './assets/file.txt'));
        const _headers = { ETag: "md5CheckSum" }
        const _queries = { temp_url_expires: "1440619048" }

        const firstNock = nock(publicUrlGRA, { reqheaders: _headers })
          .put('/templates/test.odt')
          .query(_queries)
          .reply(201, (uri, requestBody) => {
            assert.strictEqual(requestBody, _expectedFileContent.toString());
            return '';
          });

        storage.uploadFile('templates', 'test.odt', path.join(__dirname, './assets/file.txt'), { headers: _headers, queries: _queries}, (err, resp) => {
          assert.strictEqual(err, null);
          assert.strictEqual(resp.statusCode, 201);
          assert.strictEqual(resp.body.toString(), '');
          assert.strictEqual(JSON.stringify(resp.headers), '{}');
          assert.strictEqual(firstNock.pendingMocks().length, 0);
          done();
        });
      });

      it('should return an error if the local path does not exist', function (done) {
        storage.uploadFile('templates', 'test.odt', '/assets/fileee.txt', (err, resp) => {
          assert.strictEqual(err.toString(), "Error: ENOENT: no such file or directory, open '/assets/fileee.txt'");
          assert.strictEqual(resp, undefined);
          done();
        });
      });


      it('should return an error if containers or the file does not exists', function (done) {
        const firstNock = nock(publicUrlGRA)
          .put('/templates/test.odt')
          .reply(404, '<html><h1>Not Found</h1><p>The resource could not be found.</p></html>');

        storage.uploadFile('templates', 'test.odt', path.join(__dirname, './assets/file.txt'), (err, resp) => {
          assert.strictEqual(err, null);
          assert.strictEqual(resp.statusCode, 404);
          assert.strictEqual(resp.body.toString(), '<html><h1>Not Found</h1><p>The resource could not be found.</p></html>');
          assert.strictEqual(JSON.stringify(resp.headers), '{}');
          assert.strictEqual(firstNock.pendingMocks().length, 0);
          done();
        });
      });

      it('should return an error if the single storage return any kind of errors', function (done) {
        const firstNock = nock(publicUrlGRA)
          .put('/templates/test.odt')
          .replyWithError('Error Message 1234');

        storage.uploadFile('templates', 'test.odt', path.join(__dirname, './assets/file.txt'), (err, resp) => {
          assert.strictEqual(err.message, 'Object Storages are not available');
          assert.strictEqual(resp, undefined);
          assert.strictEqual(firstNock.pendingMocks().length, 0);
          done();
        });
      });

      it('should return an error if the MD5 etag is not correct', function (done) {
        const _expectedResult = '<html><h1>Unprocessable Entity</h1><p>Unable to process the contained instructions</p></html>'
        const firstNock = nock(publicUrlGRA)
          .put('/templates/test.odt')
          .reply(422, _expectedResult);

        storage.uploadFile('templates', 'test.odt', path.join(__dirname, './assets/file.txt'), (err, resp) => {
          assert.strictEqual(err, null);
          assert.strictEqual(resp.statusCode, 422)
          assert.strictEqual(resp.body.toString(), _expectedResult)
          assert.strictEqual(JSON.stringify(resp.headers), '{}')
          assert.strictEqual(firstNock.pendingMocks().length, 0);
          done();
        });
      });
    })

    describe("MULTIPLE STORAGES", function () {

      beforeEach(function (done) {
        const firstNock = nock(authURL)
            .post('/auth/tokens')
            .reply(200, connectionResultSuccessV3, { "X-Subject-Token": tokenAuth });

        storage.setTimeout(5000);
        storage.setStorages([{
          username                     : 'storage-1-user',
          password                     : 'storage-1-password',
          authUrl                      : authURL,
          tenantName                   : 'storage-1-tenant',
          region                       : 'GRA'
        },
        {
          username                     : 'storage-2-user',
          password                     : 'storage-2-password',
          authUrl                      : authURL,
          tenantName                   : 'storage-2-tenant',
          region                       : 'SBG'
        }]);
        storage.connection((err) => {
          assert.strictEqual(err, null)
          assert.strictEqual(firstNock.pendingMocks().length, 0);
          done();
        })
      })

      it('should reconnect automatically to the second object storage if the first storage authentication fail and should retry the request', function(done){

        let firstNock = nock(publicUrlGRA)
          /** 1 */
          .put('/templates/test.odt')
          .reply(401, 'Unauthorized')


        let secondNock = nock(authURL)
          /** 2 */
          .post('/auth/tokens')
          .reply(500, {})
          /** 3 */
          .post('/auth/tokens')
          .reply(200, connectionResultSuccessV3, { "X-Subject-Token": tokenAuth });

        let thirdNock = nock(publicUrlSBG)
          /** 4 */
          .put('/templates/test.odt')
          .reply(201, '');

        storage.uploadFile('templates', 'test.odt', path.join(__dirname, './assets/file.txt'), (err, resp) => {
          assert.strictEqual(err, null);
          assert.strictEqual(resp.statusCode, 201)
          assert.strictEqual(resp.body.toString(), '')
          assert.strictEqual(JSON.stringify(resp.headers), '{}')
          assert.strictEqual(firstNock.pendingMocks().length, 0);
          assert.strictEqual(secondNock.pendingMocks().length, 0);
          assert.strictEqual(thirdNock.pendingMocks().length, 0);
          done();
        });
      })

      it('should retry the request with the second object storage if the first object storage return a 500 error', function(done){

        let firstNock = nock(publicUrlGRA)
          .put('/templates/test.odt')
          .reply(500, {});

        let secondNock = nock(authURL)
          .post('/auth/tokens')
          .reply(200, connectionResultSuccessV3, { "X-Subject-Token": tokenAuth });

        let thirdNock = nock(publicUrlSBG)
          .put('/templates/test.odt')
          .reply(201, '');

        storage.uploadFile('templates', 'test.odt', path.join(__dirname, './assets/file.txt'), (err, resp) => {
          assert.strictEqual(err, null);
          assert.strictEqual(resp.statusCode, 201)
          assert.strictEqual(resp.body.toString(), '')
          assert.strictEqual(JSON.stringify(resp.headers), '{}')
          assert.strictEqual(firstNock.pendingMocks().length, 0);
          assert.strictEqual(secondNock.pendingMocks().length, 0);
          assert.strictEqual(thirdNock.pendingMocks().length, 0);
          done();
        });
      })



      it('should retry the request with the second object storage if the first object storage timeout', function(done){
        storage.setTimeout(200);
        let firstNock = nock(publicUrlGRA)
          .put('/templates/test.odt')
          .delayConnection(500)
          .reply(200, {});

        let secondNock = nock(authURL)
          .post('/auth/tokens')
          .reply(200, connectionResultSuccessV3, { "X-Subject-Token": tokenAuth });

        let thirdNock = nock(publicUrlSBG)
          .put('/templates/test.odt')
          .reply(201, '');

        storage.uploadFile('templates', 'test.odt', path.join(__dirname, './assets/file.txt'), (err, resp) => {
          assert.strictEqual(err, null);
          assert.strictEqual(resp.statusCode, 201)
          assert.strictEqual(resp.body.toString(), '')
          assert.strictEqual(JSON.stringify(resp.headers), '{}')
          assert.strictEqual(firstNock.pendingMocks().length, 0);
          assert.strictEqual(secondNock.pendingMocks().length, 0);
          assert.strictEqual(thirdNock.pendingMocks().length, 0);
          done();
        });
      })

      it('should retry the request with the second storage if the first storage return any kind of errors', function (done) {
        const _expectedFileContent = fs.readFileSync(path.join(__dirname, './assets/file.txt'));

        let firstNock = nock(publicUrlGRA)
          .put('/templates/test.odt')
          .replyWithError('Error Message 1234');


        let secondNock = nock(authURL)
          .post('/auth/tokens')
          .reply(200, connectionResultSuccessV3, { "X-Subject-Token": tokenAuth });

        let thirdNock = nock(publicUrlSBG)
          .put('/templates/test.odt')
          .reply(201, (uri, requestBody) => {
            assert.strictEqual(requestBody, _expectedFileContent.toString());
            return '';
          });

        storage.uploadFile('templates', 'test.odt', path.join(__dirname, './assets/file.txt'), (err, resp) => {
          assert.strictEqual(err, null);
          assert.strictEqual(resp.statusCode, 201)
          assert.strictEqual(resp.body.toString(), '')
          assert.strictEqual(JSON.stringify(resp.headers), '{}')
          assert.strictEqual(firstNock.pendingMocks().length, 0);
          assert.strictEqual(secondNock.pendingMocks().length, 0);
          assert.strictEqual(thirdNock.pendingMocks().length, 0);
          done();
        });
      });

      describe("PARALLEL REQUESTS", function () {
        function uploadFilePromise() {
          return new Promise((resolve, reject) => {
            try {
              storage.uploadFile('templates', 'test.odt', fileTxt, (err, resp) => {
                if (err) {
                  return reject(err);
                }
                return resolve(resp);
              });
            } catch(err) {
              return reject(err);
            }
          });
        }

        it('should request the object storage in parallel and fallback to SBG if the main storage return any kind of errors', function (done) {
          const _expectedFileContent = fs.readFileSync(path.join(__dirname, './assets/file.txt'));

          let firstNock = nock(publicUrlGRA)
            .put('/templates/test.odt')
            .replyWithError('Error Message 1234')
            .put('/templates/test.odt')
            .replyWithError('Error Message 1234');

          let secondNock = nock(authURL)
            .post('/auth/tokens')
            .reply(200, connectionResultSuccessV3, { "X-Subject-Token": tokenAuth })
            .post('/auth/tokens')
            .reply(200, connectionResultSuccessV3, { "X-Subject-Token": tokenAuth });


          let thirdNock = nock(publicUrlSBG)
            .put('/templates/test.odt')
            .reply(201, (uri, requestBody) => {
              assert.strictEqual(requestBody, _expectedFileContent.toString());
              return '';
            })
            .put('/templates/test.odt')
            .reply(201, (uri, requestBody) => {
              assert.strictEqual(requestBody, _expectedFileContent.toString());
              return '';
            });

          let promise1 = uploadFilePromise()
          let promise2 = uploadFilePromise()


          Promise.all([promise1, promise2]).then(results => {
            assert.strictEqual(results.length, 2);
            assert.strictEqual(results[0].statusCode, 201)
            assert.strictEqual(results[0].body.toString(), '')
            assert.strictEqual(JSON.stringify(results[0].headers), '{}')
            assert.strictEqual(results[1].statusCode, 201)
            assert.strictEqual(results[1].body.toString(), '')
            assert.strictEqual(JSON.stringify(results[1].headers), '{}')
            assert.deepStrictEqual(storage.getConfig().activeStorage, 1);
            assert.strictEqual(firstNock.pendingMocks().length, 0);
            assert.strictEqual(secondNock.pendingMocks().length, 0);
            assert.strictEqual(thirdNock.pendingMocks().length, 0);
            done();
          }).catch(err => {
            assert.strictEqual(err, null);
            done();
          });
        });

        it('should request the object storage in parallel and fallback to SBG if the authentication of the main storage return an error', function (done) {
          const _expectedFileContent = fs.readFileSync(path.join(__dirname, './assets/file.txt'));

          let firstNock = nock(publicUrlGRA)
            .put('/templates/test.odt')
            .reply(401, 'Unauthorized')
            .put('/templates/test.odt')
            .reply(401, 'Unauthorized')
            .put('/templates/test.odt')
            .reply(401, 'Unauthorized')

          let secondNock = nock(authURL)
            .post('/auth/tokens')
            .reply(500, {})
            .post('/auth/tokens')
            .reply(500, {})
            .post('/auth/tokens')
            .reply(500, {})
            .post('/auth/tokens')
            .reply(200, connectionResultSuccessV3, { "X-Subject-Token": tokenAuth })
            .post('/auth/tokens')
            .reply(200, connectionResultSuccessV3, { "X-Subject-Token": tokenAuth })
            .post('/auth/tokens')
            .reply(200, connectionResultSuccessV3, { "X-Subject-Token": tokenAuth });

          let thirdNock = nock(publicUrlSBG)
            .put('/templates/test.odt')
            .reply(201, (uri, requestBody) => {
              assert.strictEqual(requestBody, _expectedFileContent.toString());
              return '';
            })
            .put('/templates/test.odt')
            .reply(201, (uri, requestBody) => {
              assert.strictEqual(requestBody, _expectedFileContent.toString());
              return '';
            })
            .put('/templates/test.odt')
            .reply(201, (uri, requestBody) => {
              assert.strictEqual(requestBody, _expectedFileContent.toString());
              return '';
            })
            .put('/templates/test.odt')
            .reply(201, (uri, requestBody) => {
              assert.strictEqual(requestBody, _expectedFileContent.toString());
              return '';
            });

          let promise1 = uploadFilePromise()
          let promise2 = uploadFilePromise()
          let promise3 = uploadFilePromise()

          Promise.all([promise1, promise2, promise3]).then(async results => {

            assert.strictEqual(results.length, 3);

            assert.strictEqual(results[0].statusCode, 201)
            assert.strictEqual(results[0].body.toString(), '')
            assert.strictEqual(JSON.stringify(results[0].headers), '{}')
            
            assert.strictEqual(results[1].statusCode, 201)
            assert.strictEqual(results[1].body.toString(), '')
            assert.strictEqual(JSON.stringify(results[1].headers), '{}')

            assert.strictEqual(results[2].statusCode, 201)
            assert.strictEqual(results[2].body.toString(), '')
            assert.strictEqual(JSON.stringify(results[2].headers), '{}')

            let _result3 = await uploadFilePromise();
            assert.strictEqual(_result3.statusCode, 201)
            assert.strictEqual(_result3.body.toString(), '')
            assert.strictEqual(JSON.stringify(_result3.headers), '{}')

            assert.deepStrictEqual(storage.getConfig().activeStorage, 1);
            assert.strictEqual(firstNock.pendingMocks().length, 0);
            assert.strictEqual(secondNock.pendingMocks().length, 0);
            assert.strictEqual(thirdNock.pendingMocks().length, 0);
            done();
          });
        });

        it('should request the object storage in parallel and fallback to SBG if the main storage timeout', function (done) {
          const _expectedFileContent = fs.readFileSync(path.join(__dirname, './assets/file.txt'));
          storage.setTimeout(10);

          let firstNock = nock(publicUrlGRA)
            .put('/templates/test.odt')
            .delayConnection(100)
            .reply(200)
            .put('/templates/test.odt')
            .delayConnection(100)
            .reply(200);

          let secondNock = nock(authURL)
            .post('/auth/tokens')
            .reply(200, connectionResultSuccessV3, { "X-Subject-Token": tokenAuth })
            .post('/auth/tokens')
            .reply(200, connectionResultSuccessV3, { "X-Subject-Token": tokenAuth });

          let thirdNock = nock(publicUrlSBG)
            .put('/templates/test.odt')
            .reply(201, (uri, requestBody) => {
              assert.strictEqual(requestBody, _expectedFileContent.toString());
              return '';
            })
            .put('/templates/test.odt')
            .reply(201, (uri, requestBody) => {
              assert.strictEqual(requestBody, _expectedFileContent.toString());
              return '';
            });


          let promise1 = uploadFilePromise()
          let promise2 = uploadFilePromise()


          Promise.all([promise1, promise2]).then(results => {
            assert.strictEqual(results.length, 2);

            assert.strictEqual(results[0].statusCode, 201)
            assert.strictEqual(results[0].body.toString(), '')
            assert.strictEqual(JSON.stringify(results[0].headers), '{}')
            
            assert.strictEqual(results[1].statusCode, 201)
            assert.strictEqual(results[1].body.toString(), '')
            assert.strictEqual(JSON.stringify(results[1].headers), '{}')

            assert.deepStrictEqual(storage.getConfig().activeStorage, 1);
            assert.strictEqual(firstNock.pendingMocks().length, 0);
            assert.strictEqual(secondNock.pendingMocks().length, 0);
            assert.strictEqual(thirdNock.pendingMocks().length, 0);
            done();
          }).catch(err => {
            assert.strictEqual(err, null);
            done();
          });
        });

        it('should request the object storage in parallel and fallback to SBG if the main storage return a 500 error', function (done) {
          const _expectedFileContent = fs.readFileSync(path.join(__dirname, './assets/file.txt'));

          let firstNock = nock(publicUrlGRA)
            .put('/templates/test.odt')
            .reply(500, {})
            .put('/templates/test.odt')
            .reply(500, {});

          let secondNock = nock(authURL)
            .post('/auth/tokens')
            .reply(200, connectionResultSuccessV3, { "X-Subject-Token": tokenAuth })
            .post('/auth/tokens')
            .reply(200, connectionResultSuccessV3, { "X-Subject-Token": tokenAuth });

          let thirdNock = nock(publicUrlSBG)
            .put('/templates/test.odt')
            .reply(201, (uri, requestBody) => {
              assert.strictEqual(requestBody, _expectedFileContent.toString());
              return '';
            })
            .put('/templates/test.odt')
            .reply(201, (uri, requestBody) => {
              assert.strictEqual(requestBody, _expectedFileContent.toString());
              return '';
            });

          let promise1 = uploadFilePromise()
          let promise2 = uploadFilePromise()

          Promise.all([promise1, promise2]).then(results => {
            assert.strictEqual(results.length, 2);
            
            assert.strictEqual(results[0].statusCode, 201)
            assert.strictEqual(results[0].body.toString(), '')
            assert.strictEqual(JSON.stringify(results[0].headers), '{}')
            
            assert.strictEqual(results[1].statusCode, 201)
            assert.strictEqual(results[1].body.toString(), '')
            assert.strictEqual(JSON.stringify(results[1].headers), '{}')

            assert.deepStrictEqual(storage.getConfig().activeStorage, 1);
            assert.strictEqual(firstNock.pendingMocks().length, 0);
            assert.strictEqual(secondNock.pendingMocks().length, 0);
            assert.strictEqual(thirdNock.pendingMocks().length, 0);
            done();
          }).catch(err => {
            assert.strictEqual(err, null);
            done();
          });
        });

      });
    });
  });



  describe('deleteFile', function () {
    describe('SINGLE STORAGE', function () {

      it('should delete a file on the server', function (done) {
        const firstNock = nock(publicUrlGRA)
          .delete('/templates/test.odt')
          .reply(201, '');

        storage.deleteFile('templates', 'test.odt', (err, resp) => {
          assert.strictEqual(err, null);
          assert.strictEqual(resp.statusCode, 201);
          assert.strictEqual(resp.body.toString(), '');
          assert.strictEqual(JSON.stringify(resp.headers), '{}');
          assert.strictEqual(firstNock.pendingMocks().length, 0);
          done();
        });
      });

      it('should reconnect automatically if the token is invalid and retry', function (done) {
        let firstNock = nock(publicUrlGRA)
          .delete('/templates/test.odt')
          .reply(401, 'Unauthorized')
          .delete('/templates/test.odt')
          .reply(201, '');

        let secondNock = nock(authURL)
          .post('/auth/tokens')
          .reply(200, connectionResultSuccessV3, { "X-Subject-Token": tokenAuth });

        storage.deleteFile('templates', 'test.odt', (err, resp) => {
          assert.strictEqual(err, null);
          assert.strictEqual(resp.statusCode, 201);
          assert.strictEqual(resp.body.toString(), '');
          assert.strictEqual(JSON.stringify(resp.headers), '{}');
          assert.strictEqual(firstNock.pendingMocks().length, 0);
          assert.strictEqual(secondNock.pendingMocks().length, 0);
          done();
        });
      });

      it('should return an error if the single storage timout', function (done) {
        storage.setTimeout(200);
        const firstNock = nock(publicUrlGRA)
          .delete('/templates/test.odt')
          .delayConnection(500)
          .reply(200, {})

        storage.deleteFile('templates', 'test.odt', (err, resp) => {
          assert.strictEqual(err.message, 'Object Storages are not available');
          assert.strictEqual(resp, undefined);
          assert.strictEqual(firstNock.pendingMocks().length, 0);
          done();
        });
      });

      it('should return an error if the single storage return any kind of errors', function (done) {
        const firstNock = nock(publicUrlGRA)
          .delete('/templates/test.odt')
          .replyWithError('Error Message 1234');

        storage.deleteFile('templates', 'test.odt', (err, resp) => {
          assert.strictEqual(err.message, 'Object Storages are not available');
          assert.strictEqual(resp, undefined);
          assert.strictEqual(firstNock.pendingMocks().length, 0);
          done();
        });
      });

      it('should return an error if the file does not exist', function (done) {
        const firstNock = nock(publicUrlGRA)
          .delete('/templates/test.odt')
          .reply(404);

        storage.deleteFile('templates', 'test.odt', (err, resp) => {
          assert.strictEqual(err, null);
          assert.strictEqual(resp.statusCode, 404);
          assert.strictEqual(resp.body.toString(), '');
          assert.strictEqual(JSON.stringify(resp.headers), '{}');
          assert.strictEqual(firstNock.pendingMocks().length, 0);
          done();
        });
      });
    })

    describe('MULTIPLE STORAGES', function () {

      beforeEach(function (done) {
        const firstNock = nock(authURL)
            .post('/auth/tokens')
            .reply(200, connectionResultSuccessV3, { "X-Subject-Token": tokenAuth });

        storage.setTimeout(5000);
        storage.setStorages([{
          username                     : 'storage-1-user',
          password                     : 'storage-1-password',
          authUrl                      : authURL,
          tenantName                   : 'storage-1-tenant',
          region                       : 'GRA'
        },
        {
          username                     : 'storage-2-user',
          password                     : 'storage-2-password',
          authUrl                      : authURL,
          tenantName                   : 'storage-2-tenant',
          region                       : 'SBG'
        }]);
        storage.connection((err) => {
          assert.strictEqual(err, null)
          assert.strictEqual(firstNock.pendingMocks().length, 0);
          done();
        })
      })

      it('should reconnect automatically to the second object storage if the first storage authentication fail and should retry the request', function(done){
        let firstNock = nock(publicUrlGRA)
          /** 1 */
          .delete('/templates/test.odt')
          .reply(401, 'Unauthorized')
          /** 4 */

        let secondNock = nock(authURL)
          /** 2 */
          .post('/auth/tokens')
          .reply(500, {})
          /** 3 */
          .post('/auth/tokens')
          .reply(200, connectionResultSuccessV3, { "X-Subject-Token": tokenAuth });

        let thirdNock = nock(publicUrlSBG)
          .delete('/templates/test.odt')
          .reply(200, {})


        storage.deleteFile('templates', 'test.odt', (err) => {
          assert.strictEqual(err, null);
          assert.strictEqual(firstNock.pendingMocks().length, 0);
          assert.strictEqual(secondNock.pendingMocks().length, 0);
          assert.strictEqual(thirdNock.pendingMocks().length, 0);
          done();
        });
      });

      it('should retry the request with the second object storage if the first object storage return a 500 error', function(done){

        let firstNock = nock(publicUrlGRA)
          .delete('/templates/test.odt')
          .reply(500, {})

        let secondNock = nock(authURL)
          .post('/auth/tokens')
          .reply(200, connectionResultSuccessV3, { "X-Subject-Token": tokenAuth });


        let thirdNock = nock(publicUrlSBG)
          .delete('/templates/test.odt')
          .reply(200, {})

        storage.deleteFile('templates', 'test.odt', (err) => {
          assert.strictEqual(err, null);
          assert.strictEqual(firstNock.pendingMocks().length, 0);
          assert.strictEqual(secondNock.pendingMocks().length, 0);
          assert.strictEqual(thirdNock.pendingMocks().length, 0);
          done();
        });
      })


      it('should retry the request with the second object storage if the first object storage timeout', function(done){

        storage.setTimeout(200);

        let firstNock = nock(publicUrlGRA)
          .delete('/templates/test.odt')
          .delayConnection(500)
          .reply(200, {});

        let secondNock = nock(authURL)
          .post('/auth/tokens')
          .reply(200, connectionResultSuccessV3, { "X-Subject-Token": tokenAuth });


        let thirdNock = nock(publicUrlSBG)
          .delete('/templates/test.odt')
          .reply(200, {});

        storage.deleteFile('templates', 'test.odt', (err) => {
          assert.strictEqual(err, null);
          assert.strictEqual(firstNock.pendingMocks().length, 0);
          assert.strictEqual(secondNock.pendingMocks().length, 0);
          assert.strictEqual(thirdNock.pendingMocks().length, 0);
          done();
        });
      })



      it('should retry the request with the second storage if the first storage return any kind of errors', function (done) {

        let firstNock = nock(publicUrlGRA)
          .delete('/templates/test.odt')
          .replyWithError('Error Message 1234');

        let secondNock = nock(authURL)
          .post('/auth/tokens')
          .reply(200, connectionResultSuccessV3, { "X-Subject-Token": tokenAuth });

        let thirdNock = nock(publicUrlSBG)
          .delete('/templates/test.odt')
          .reply(200, {});

        storage.deleteFile('templates', 'test.odt', (err) => {
          assert.strictEqual(err, null);
          assert.strictEqual(firstNock.pendingMocks().length, 0);
          assert.strictEqual(secondNock.pendingMocks().length, 0);
          assert.strictEqual(thirdNock.pendingMocks().length, 0);
          done();
        });
      });

      describe("PARALLEL REQUESTS", function () {

        function deleteFilePromise() {
          return new Promise((resolve, reject) => {
            try {
              storage.deleteFile('templates', 'test.odt', (err, resp) => {
                if (err) {
                  return reject(err);
                }
                return resolve(resp);
              });
            } catch(err) {
              return reject(err);
            }
          });
        }

        it('should request the object storage in parallel and fallback to SBG if the main storage return any kind of errors', function (done) {

          let firstNock = nock(publicUrlGRA)
            .delete('/templates/test.odt')
            .replyWithError('Error Message 1234')
            .delete('/templates/test.odt')
            .replyWithError('Error Message 1234');

          let secondNock = nock(authURL)
            .post('/auth/tokens')
            .reply(200, connectionResultSuccessV3, { "X-Subject-Token": tokenAuth })
            .post('/auth/tokens')
            .reply(200, connectionResultSuccessV3, { "X-Subject-Token": tokenAuth });


          let thirdNock = nock(publicUrlSBG)
            .delete('/templates/test.odt')
            .reply(200)
            .delete('/templates/test.odt')
            .reply(200);

          let promise1 = deleteFilePromise()
          let promise2 = deleteFilePromise()


          Promise.all([promise1, promise2]).then(results => {
            assert.strictEqual(results.length, 2);
            
            assert.strictEqual(results[0].statusCode, 200);
            assert.strictEqual(results[0].body.toString(), '');
            assert.strictEqual(JSON.stringify(results[0].headers), '{}');

            assert.strictEqual(results[1].statusCode, 200);
            assert.strictEqual(results[1].body.toString(), '');
            assert.strictEqual(JSON.stringify(results[1].headers), '{}');
            
            assert.deepStrictEqual(storage.getConfig().activeStorage, 1);
            assert.strictEqual(firstNock.pendingMocks().length, 0);
            assert.strictEqual(secondNock.pendingMocks().length, 0);
            assert.strictEqual(thirdNock.pendingMocks().length, 0);
            done();
          }).catch(err => {
            assert.strictEqual(err, null);
            done();
          });
        });

        it('should request the object storage in parallel and fallback to SBG if the authentication of the main storage return an error', function (done) {

          let firstNock = nock(publicUrlGRA)
            .delete('/templates/test.odt')
            .reply(401, 'Unauthorized')
            .delete('/templates/test.odt')
            .reply(401, 'Unauthorized')
            .delete('/templates/test.odt')
            .reply(401, 'Unauthorized')

          let secondNock = nock(authURL)
            .post('/auth/tokens')
            .reply(500, {})
            .post('/auth/tokens')
            .reply(500, {})
            .post('/auth/tokens')
            .reply(500, {})
            .post('/auth/tokens')
            .reply(200, connectionResultSuccessV3, { "X-Subject-Token": tokenAuth })
            .post('/auth/tokens')
            .reply(200, connectionResultSuccessV3, { "X-Subject-Token": tokenAuth })
            .post('/auth/tokens')
            .reply(200, connectionResultSuccessV3, { "X-Subject-Token": tokenAuth });

          let thirdNock = nock(publicUrlSBG)
            .delete('/templates/test.odt')
            .reply(200)
            .delete('/templates/test.odt')
            .reply(200)
            .delete('/templates/test.odt')
            .reply(200)
            .delete('/templates/test.odt')
            .reply(200);

          let promise1 = deleteFilePromise()
          let promise2 = deleteFilePromise()
          let promise3 = deleteFilePromise()

          Promise.all([promise1, promise2, promise3]).then(async results => {

            assert.strictEqual(results.length, 3);
            assert.strictEqual(results[0].statusCode, 200);
            assert.strictEqual(results[0].body.toString(), '');
            assert.strictEqual(JSON.stringify(results[0].headers), '{}');

            assert.strictEqual(results[1].statusCode, 200);
            assert.strictEqual(results[1].body.toString(), '');
            assert.strictEqual(JSON.stringify(results[1].headers), '{}');

            assert.strictEqual(results[2].statusCode, 200);
            assert.strictEqual(results[2].body.toString(), '');
            assert.strictEqual(JSON.stringify(results[2].headers), '{}');

            let _result3 = await deleteFilePromise();

            assert.strictEqual(_result3.statusCode, 200);
            assert.strictEqual(_result3.body.toString(), '');
            assert.strictEqual(JSON.stringify(_result3.headers), '{}');

            assert.deepStrictEqual(storage.getConfig().activeStorage, 1);
            assert.strictEqual(firstNock.pendingMocks().length, 0);
            assert.strictEqual(secondNock.pendingMocks().length, 0);
            assert.strictEqual(thirdNock.pendingMocks().length, 0);
            done();
          });
        });

        it('should request the object storage in parallel and fallback to SBG if the main storage timeout', function (done) {
          storage.setTimeout(200);

          let firstNock = nock(publicUrlGRA)
            .delete('/templates/test.odt')
            .delayConnection(500)
            .reply(200, {})
            .delete('/templates/test.odt')
            .delayConnection(500)
            .reply(200, {});

          let secondNock = nock(authURL)
            .post('/auth/tokens')
            .reply(200, connectionResultSuccessV3, { "X-Subject-Token": tokenAuth })
            .post('/auth/tokens')
            .reply(200, connectionResultSuccessV3, { "X-Subject-Token": tokenAuth });

          let thirdNock = nock(publicUrlSBG)
            .delete('/templates/test.odt')
            .reply(200)
            .delete('/templates/test.odt')
            .reply(200);


          let promise1 = deleteFilePromise()
          let promise2 = deleteFilePromise()


          Promise.all([promise1, promise2]).then(results => {
            assert.strictEqual(results.length, 2);

            assert.strictEqual(results[0].statusCode, 200);
            assert.strictEqual(results[0].body.toString(), '');
            assert.strictEqual(JSON.stringify(results[0].headers), '{}');
            
            assert.strictEqual(results[1].statusCode, 200);
            assert.strictEqual(results[1].body.toString(), '');
            assert.strictEqual(JSON.stringify(results[1].headers), '{}');

            assert.deepStrictEqual(storage.getConfig().activeStorage, 1);
            assert.strictEqual(firstNock.pendingMocks().length, 0);
            assert.strictEqual(secondNock.pendingMocks().length, 0);
            assert.strictEqual(thirdNock.pendingMocks().length, 0);
            done();
          }).catch(err => {
            assert.strictEqual(err, null);
            done();
          });
        });

        it('should request the object storage in parallel and fallback to SBG if the main storage return a 500 error', function (done) {

          let firstNock = nock(publicUrlGRA)
            .delete('/templates/test.odt')
            .reply(500, {})
            .delete('/templates/test.odt')
            .reply(500, {});

          let secondNock = nock(authURL)
            .post('/auth/tokens')
            .reply(200, connectionResultSuccessV3, { "X-Subject-Token": tokenAuth })
            .post('/auth/tokens')
            .reply(200, connectionResultSuccessV3, { "X-Subject-Token": tokenAuth });

          let thirdNock = nock(publicUrlSBG)
            .delete('/templates/test.odt')
            .reply(200)
            .delete('/templates/test.odt')
            .reply(200);

          let promise1 = deleteFilePromise()
          let promise2 = deleteFilePromise()

          Promise.all([promise1, promise2]).then(results => {
            assert.strictEqual(results.length, 2);
            
            assert.strictEqual(results[0].statusCode, 200);
            assert.strictEqual(results[0].body.toString(), '');
            assert.strictEqual(JSON.stringify(results[0].headers), '{}');

            
            assert.strictEqual(results[1].statusCode, 200);
            assert.strictEqual(results[1].body.toString(), '');
            assert.strictEqual(JSON.stringify(results[1].headers), '{}');

            assert.deepStrictEqual(storage.getConfig().activeStorage, 1);
            assert.strictEqual(firstNock.pendingMocks().length, 0);
            assert.strictEqual(secondNock.pendingMocks().length, 0);
            assert.strictEqual(thirdNock.pendingMocks().length, 0);
            done();
          }).catch(err => {
            assert.strictEqual(err, null);
            done();
          });
        });

      });
    });
  });

  describe('getFileMetadata', function () {

    describe('SINGLE STORAGE', function () {
      it('should get file metadata (headers)', function (done) {
        const firstNock = nock(publicUrlGRA)
          .defaultReplyHeaders({
            'content-length': '1492',
            'accept-ranges': 'bytes',
            'last-modified': 'Wed, 03 Nov 2021 13:02:39 GMT',
            'content-type': 'application/json',
            etag: 'a30776a059eaf26eebf27756a849097d',
            'x-openstack-request-id': 'tx136c028c478a4b40a7014-0061829c9f',
            date: 'Wed, 03 Nov 2021 14:28:48 GMT',
            'x-iplb-request-id': '25A66014:1D97_3626E64B:01BB_61829C9E_3C28BD:960D'
          })
          .intercept("/templates/test.odt", "HEAD")
          .reply(200,"OK");

        storage.getFileMetadata('templates', 'test.odt', (err, resp) => {
          assert.strictEqual(err, null);
          assert.strictEqual(firstNock.pendingMocks().length, 0);
          assert.strictEqual(resp.statusCode, 200);
          assert.strictEqual(resp.body.toString(), 'OK');
          assert.strictEqual(resp.headers['etag'].length > 0, true);
          assert.strictEqual(resp.headers['x-openstack-request-id'].length > 0, true);
          assert.strictEqual(resp.headers['content-length'].length > 0, true);
          assert.strictEqual(resp.headers['date'].length > 0, true);
          done();
        });
      });

      it('should reconnect automatically to object storage and retry', function (done) {
        let firstNock = nock(publicUrlGRA)
          .defaultReplyHeaders({
            'content-length': '1492',
            'accept-ranges': 'bytes',
            'last-modified': 'Wed, 03 Nov 2021 13:02:39 GMT',
            'content-type': 'application/json',
            etag: 'a30776a059eaf26eebf27756a849097d',
            'x-openstack-request-id': 'tx136c028c478a4b40a7014-0061829c9f',
            date: 'Wed, 03 Nov 2021 14:28:48 GMT',
            'x-iplb-request-id': '25A66014:1D97_3626E64B:01BB_61829C9E_3C28BD:960D'
          })
          .intercept("/templates/test.odt", "HEAD")
          .reply(401, 'Unauthorized')
          .intercept("/templates/test.odt", "HEAD")
          .reply(200,"OK");

        let secondNock = nock(authURL)
          .post('/auth/tokens')
          .reply(200, connectionResultSuccessV3, { "X-Subject-Token": tokenAuth });

        storage.getFileMetadata('templates', 'test.odt', (err, resp) => {
          assert.strictEqual(err, null);
          assert.strictEqual(firstNock.pendingMocks().length, 0);
          assert.strictEqual(secondNock.pendingMocks().length, 0);
          assert.strictEqual(resp.statusCode, 200);
          assert.strictEqual(resp.body.toString(), 'OK');
          assert.strictEqual(resp.headers['etag'].length > 0, true);
          assert.strictEqual(resp.headers['x-openstack-request-id'].length > 0, true);
          assert.strictEqual(resp.headers['content-length'].length > 0, true);
          assert.strictEqual(resp.headers['date'].length > 0, true);
          done();
        });
      });

      it('should return an error if the single storage timeout', function (done) {
        storage.setTimeout(200);
        const firstNock = nock(publicUrlGRA)
          .intercept("/templates/test.odt", "HEAD")
          .delayConnection(500)
          .reply(200)

        storage.getFileMetadata('templates', 'test.odt', (err, resp) => {
          assert.notStrictEqual(err, null);
          assert.strictEqual(err.message, 'Object Storages are not available');
          assert.strictEqual(resp, undefined);
          assert.strictEqual(firstNock.pendingMocks().length, 0);
          done();
        });
      });

      it('should return an error if the single storage return any kind of errors', function (done) {
        const firstNock = nock(publicUrlGRA)
          .intercept("/templates/test.odt", "HEAD")
          .replyWithError('Error Message 1234');

        storage.getFileMetadata('templates', 'test.odt', (err, resp) => {
          assert.notStrictEqual(err, null);
          assert.strictEqual(err.message, 'Object Storages are not available');
          assert.strictEqual(resp, undefined);
          assert.strictEqual(firstNock.pendingMocks().length, 0);
          done();
        });
      });

      it('should return an error if the file does not exist', function (done) {
        const firstNock = nock(publicUrlGRA)
          .intercept("/templates/test.odt", "HEAD")
          .reply(404);

        storage.getFileMetadata('templates', 'test.odt', (err, resp) => {
          assert.strictEqual(err, null);
          assert.strictEqual(resp.statusCode, 404);
          assert.strictEqual(resp.body.toString(), '');
          assert.strictEqual(JSON.stringify(resp.headers), '{}');
          assert.strictEqual(firstNock.pendingMocks().length, 0);
          done();
        });
      });
    });

    describe('MULTIPLE STORAGES', function () {
      beforeEach(function (done) {
        const firstNock = nock(authURL)
            .post('/auth/tokens')
            .reply(200, connectionResultSuccessV3, { "X-Subject-Token": tokenAuth });

        storage.setTimeout(5000);
        storage.setStorages([{
          username                     : 'storage-1-user',
          password                     : 'storage-1-password',
          authUrl                      : authURL,
          tenantName                   : 'storage-1-tenant',
          region                       : 'GRA'
        },
        {
          username                     : 'storage-2-user',
          password                     : 'storage-2-password',
          authUrl                      : authURL,
          tenantName                   : 'storage-2-tenant',
          region                       : 'SBG'
        }]);
        storage.connection((err) => {
          assert.strictEqual(err, null)
          assert.strictEqual(firstNock.pendingMocks().length, 0);
          done();
        })
      })

      it('should reconnect automatically to the second object storage if the first storage authentication fail and should retry the request', function(done){
        let firstNock = nock(publicUrlGRA)
          /** 1 */
          .intercept("/templates/test.odt", "HEAD")
          .reply(401, 'Unauthorized');

        let secondNock = nock(authURL)
          /** 2 */
          .post('/auth/tokens')
          .reply(500, {})
          /** 3 */
          .post('/auth/tokens')
          .reply(200, connectionResultSuccessV3, { "X-Subject-Token": tokenAuth });

        let thirdNock = nock(publicUrlSBG)
          /** 4 */
          .defaultReplyHeaders({
            'content-length': '1492',
            'accept-ranges': 'bytes',
            'last-modified': 'Wed, 03 Nov 2021 13:02:39 GMT',
            'content-type': 'application/json',
            etag: 'a30776a059eaf26eebf27756a849097d',
            'x-openstack-request-id': 'tx136c028c478a4b40a7014-0061829c9f',
            date: 'Wed, 03 Nov 2021 14:28:48 GMT',
            'x-iplb-request-id': '25A66014:1D97_3626E64B:01BB_61829C9E_3C28BD:960D'
          })
          .intercept("/templates/test.odt", "HEAD")
          .reply(200);

        storage.getFileMetadata('templates', 'test.odt', (err, resp) => {
          assert.strictEqual(err, null);
          assert.strictEqual(resp.statusCode, 200);
          assert.strictEqual(resp.body.toString(), '');
          assert.strictEqual(resp.headers['etag'].length > 0, true);
          assert.strictEqual(resp.headers['x-openstack-request-id'].length > 0, true);
          assert.strictEqual(resp.headers['content-length'].length > 0, true);
          assert.strictEqual(resp.headers['date'].length > 0, true);
          assert.strictEqual(firstNock.pendingMocks().length, 0);
          assert.strictEqual(secondNock.pendingMocks().length, 0);
          assert.strictEqual(thirdNock.pendingMocks().length, 0);
          assert.deepStrictEqual(storage.getConfig().activeStorage, 1);
          done();
        });


      })

      it('should retry the request with the second object storage if the first object storage return a 500 error', function(done){
        let firstNock = nock(publicUrlGRA)
          .intercept("/templates/test2.odt", "HEAD")
          .reply(500, () => {
            return '';
          });

        let secondNock = nock(authURL)
          .post('/auth/tokens')
          .reply(200, connectionResultSuccessV3, { "X-Subject-Token": tokenAuth });

        let thirdNock = nock(publicUrlSBG)
          .defaultReplyHeaders({
            'content-length': '1492',
            'accept-ranges': 'bytes',
            'last-modified': 'Wed, 03 Nov 2021 13:02:39 GMT',
            'content-type': 'application/json',
            etag: 'a30776a059eaf26eebf27756a849097d',
            'x-openstack-request-id': 'tx136c028c478a4b40a7014-0061829c9f',
            date: 'Wed, 03 Nov 2021 14:28:48 GMT',
            'x-iplb-request-id': '25A66014:1D97_3626E64B:01BB_61829C9E_3C28BD:960D'
          })
          .intercept("/templates/test2.odt", "HEAD")
          .reply(200);

        storage.getFileMetadata('templates', 'test2.odt', (err, resp) => {
          assert.strictEqual(err, null);
          assert.strictEqual(resp.statusCode, 200);
          assert.strictEqual(resp.body.toString(), '');
          assert.strictEqual(resp.headers['etag'].length > 0, true);
          assert.strictEqual(resp.headers['x-openstack-request-id'].length > 0, true);
          assert.strictEqual(resp.headers['content-length'].length > 0, true);
          assert.strictEqual(resp.headers['date'].length > 0, true);
          assert.strictEqual(firstNock.pendingMocks().length, 0);
          assert.strictEqual(secondNock.pendingMocks().length, 0);
          assert.strictEqual(thirdNock.pendingMocks().length, 0);
          assert.deepStrictEqual(storage.getConfig().activeStorage, 1);
          done();
        });
      })

      it('should retry the request with the second object storage if the first object storage timeout', function(done){
        storage.setTimeout(200);
        let firstNock = nock(publicUrlGRA)
          .intercept("/templates/test.odt", "HEAD")
          .delayConnection(500)
          .reply(200);

        let secondNock = nock(authURL)
          .post('/auth/tokens')
          .reply(200, connectionResultSuccessV3, { "X-Subject-Token": tokenAuth });

        let thirdNock = nock(publicUrlSBG)
          .defaultReplyHeaders({
            'content-length': '1492',
            'accept-ranges': 'bytes',
            'last-modified': 'Wed, 03 Nov 2021 13:02:39 GMT',
            'content-type': 'application/json',
            etag: 'a30776a059eaf26eebf27756a849097d',
            'x-openstack-request-id': 'tx136c028c478a4b40a7014-0061829c9f',
            date: 'Wed, 03 Nov 2021 14:28:48 GMT',
            'x-iplb-request-id': '25A66014:1D97_3626E64B:01BB_61829C9E_3C28BD:960D'
          })
          .intercept("/templates/test.odt", "HEAD")
          .reply(200);


        storage.getFileMetadata('templates', 'test.odt', (err, resp) => {
          assert.strictEqual(err, null);
          assert.strictEqual(resp.statusCode, 200);
          assert.strictEqual(resp.body.toString(), '');
          assert.strictEqual(resp.headers['etag'].length > 0, true);
          assert.strictEqual(resp.headers['x-openstack-request-id'].length > 0, true);
          assert.strictEqual(resp.headers['content-length'].length > 0, true);
          assert.strictEqual(resp.headers['date'].length > 0, true);
          assert.strictEqual(firstNock.pendingMocks().length, 0);
          assert.strictEqual(secondNock.pendingMocks().length, 0);
          assert.deepStrictEqual(storage.getConfig().activeStorage, 1);
          assert.strictEqual(thirdNock.pendingMocks().length, 0);
          done();
        });
      })

      it('should retry the request with the second storage if the first storage return any kind of errors', function (done) {
        let firstNock = nock(publicUrlGRA)
          .intercept("/templates/test.odt", "HEAD")
          .replyWithError('Error Message 1234');

        let secondNock = nock(authURL)
          .post('/auth/tokens')
          .reply(200, connectionResultSuccessV3, { "X-Subject-Token": tokenAuth });

        let thirdNock = nock(publicUrlSBG)
          .defaultReplyHeaders({
            'content-length': '1492',
            'accept-ranges': 'bytes',
            'last-modified': 'Wed, 03 Nov 2021 13:02:39 GMT',
            'content-type': 'application/json',
            etag: 'a30776a059eaf26eebf27756a849097d',
            'x-openstack-request-id': 'tx136c028c478a4b40a7014-0061829c9f',
            date: 'Wed, 03 Nov 2021 14:28:48 GMT',
            'x-iplb-request-id': '25A66014:1D97_3626E64B:01BB_61829C9E_3C28BD:960D'
          })
          .intercept("/templates/test.odt", "HEAD")
          .reply(200);


        storage.getFileMetadata('templates', 'test.odt', (err, resp) => {
          assert.strictEqual(err, null);
          assert.strictEqual(resp.statusCode, 200);
          assert.strictEqual(resp.body.toString(), '');
          assert.strictEqual(resp.headers['etag'].length > 0, true);
          assert.strictEqual(resp.headers['x-openstack-request-id'].length > 0, true);
          assert.strictEqual(resp.headers['content-length'].length > 0, true);
          assert.strictEqual(resp.headers['date'].length > 0, true);
          assert.strictEqual(firstNock.pendingMocks().length, 0);
          assert.strictEqual(secondNock.pendingMocks().length, 0);
          assert.strictEqual(thirdNock.pendingMocks().length, 0);
          assert.deepStrictEqual(storage.getConfig().activeStorage, 1);
          done();
        });
      });

      describe("PARALLEL REQUESTS", function () {

        function getFileMetadataPromise() {
          return new Promise((resolve, reject) => {
            try {
              storage.getFileMetadata('templates', 'test.odt', (err, resp) => {
                if (err) {
                  return reject(err);
                }
                return resolve(resp);
              });
            } catch(err) {
              return reject(err);
            }
          });
        }

        it('should request the object storage in parallel and fallback to SBG if the main storage return any kind of errors', function (done) {

          let firstNock = nock(publicUrlGRA)
            .intercept("/templates/test.odt", "HEAD")
            .replyWithError('Error Message 1234')
            .intercept("/templates/test.odt", "HEAD")
            .replyWithError('Error Message 1234');

          let secondNock = nock(authURL)
            .post('/auth/tokens')
            .reply(200, connectionResultSuccessV3, { "X-Subject-Token": tokenAuth })
            .post('/auth/tokens')
            .reply(200, connectionResultSuccessV3, { "X-Subject-Token": tokenAuth });

          let thirdNock = nock(publicUrlSBG)
            .defaultReplyHeaders({
              'content-length': '1492',
              'accept-ranges': 'bytes',
              'last-modified': 'Wed, 03 Nov 2021 13:02:39 GMT',
              'content-type': 'application/json',
              etag: 'a30776a059eaf26eebf27756a849097d',
              'x-openstack-request-id': 'tx136c028c478a4b40a7014-0061829c9f',
              date: 'Wed, 03 Nov 2021 14:28:48 GMT',
              'x-iplb-request-id': '25A66014:1D97_3626E64B:01BB_61829C9E_3C28BD:960D'
            })
            .intercept("/templates/test.odt", "HEAD")
            .reply(200)
            .intercept("/templates/test.odt", "HEAD")
            .reply(200);

          let promise1 = getFileMetadataPromise()
          let promise2 = getFileMetadataPromise()

          Promise.all([promise1, promise2]).then(results => {
            assert.strictEqual(results.length, 2)
            
            assert.strictEqual(results[0].statusCode, 200);
            assert.strictEqual(results[0].body.toString(), '');
            assert.strictEqual(results[0].headers['etag'].length > 0, true);
            assert.strictEqual(results[0].headers['x-openstack-request-id'].length > 0, true);
            assert.strictEqual(results[0].headers['content-length'].length > 0, true);
            assert.strictEqual(results[0].headers['date'].length > 0, true);

            assert.strictEqual(results[1].statusCode, 200);
            assert.strictEqual(results[1].body.toString(), '');
            assert.strictEqual(results[1].headers['etag'].length > 0, true);
            assert.strictEqual(results[1].headers['x-openstack-request-id'].length > 0, true);
            assert.strictEqual(results[1].headers['content-length'].length > 0, true);
            assert.strictEqual(results[1].headers['date'].length > 0, true);

            assert.strictEqual(firstNock.pendingMocks().length, 0);
            assert.strictEqual(secondNock.pendingMocks().length, 0);
            assert.strictEqual(thirdNock.pendingMocks().length, 0);
            assert.deepStrictEqual(storage.getConfig().activeStorage, 1);
            done();
          }).catch(err => {
            assert.strictEqual(err, null);
            done();
          });
        });

        it('should request the object storage in parallel and fallback to SBG if the authentication of the main storage return an error', function (done) {

          let firstNock = nock(publicUrlGRA)
            .intercept("/templates/test.odt", "HEAD")
            .reply(401, 'Unauthorized')
            .intercept("/templates/test.odt", "HEAD")
            .reply(401, 'Unauthorized');

          let secondNock = nock(authURL)
            .post('/auth/tokens')
            .reply(500, {})
            .post('/auth/tokens')
            .reply(500, {})
            .post('/auth/tokens')
            .reply(200, connectionResultSuccessV3, { "X-Subject-Token": tokenAuth })
            .post('/auth/tokens')
            .reply(200, connectionResultSuccessV3, { "X-Subject-Token": tokenAuth });

          let thirdNock = nock(publicUrlSBG)
            .defaultReplyHeaders({
              'content-length': '1492',
              'accept-ranges': 'bytes',
              'last-modified': 'Wed, 03 Nov 2021 13:02:39 GMT',
              'content-type': 'application/json',
              etag: 'a30776a059eaf26eebf27756a849097d',
              'x-openstack-request-id': 'tx136c028c478a4b40a7014-0061829c9f',
              date: 'Wed, 03 Nov 2021 14:28:48 GMT',
              'x-iplb-request-id': '25A66014:1D97_3626E64B:01BB_61829C9E_3C28BD:960D'
            })
            .intercept("/templates/test.odt", "HEAD")
            .reply(200)
            .intercept("/templates/test.odt", "HEAD")
            .reply(200);

          let promise1 = getFileMetadataPromise()
          let promise2 = getFileMetadataPromise()

          Promise.all([promise1, promise2]).then(async results => {
            assert.strictEqual(results.length, 2);
            
            assert.strictEqual(results[0].statusCode, 200);
            assert.strictEqual(results[0].body.toString(), '');
            assert.strictEqual(results[0].headers['etag'].length > 0, true);
            assert.strictEqual(results[0].headers['x-openstack-request-id'].length > 0, true);
            assert.strictEqual(results[0].headers['content-length'].length > 0, true);
            assert.strictEqual(results[0].headers['date'].length > 0, true);

            assert.strictEqual(results[1].statusCode, 200);
            assert.strictEqual(results[1].body.toString(), '');
            assert.strictEqual(results[1].headers['etag'].length > 0, true);
            assert.strictEqual(results[1].headers['x-openstack-request-id'].length > 0, true);
            assert.strictEqual(results[1].headers['content-length'].length > 0, true);
            assert.strictEqual(results[1].headers['date'].length > 0, true);
            
            assert.deepStrictEqual(storage.getConfig().activeStorage, 1);
            assert.strictEqual(firstNock.pendingMocks().length, 0);
            assert.strictEqual(secondNock.pendingMocks().length, 0);
            assert.strictEqual(thirdNock.pendingMocks().length, 0);
            done();
          });
        });

        it('should request the object storage in parallel and fallback to SBG if the main storage timeout', function (done) {

          storage.setTimeout(200);

          let firstNock = nock(publicUrlGRA)
            .intercept("/templates/test.odt", "HEAD")
            .delayConnection(500)
            .reply(200, {})
            .intercept("/templates/test.odt", "HEAD")
            .delayConnection(500)
            .reply(200, {});

          let secondNock = nock(authURL)
            .post('/auth/tokens')
            .reply(200, connectionResultSuccessV3, { "X-Subject-Token": tokenAuth })
            .post('/auth/tokens')
            .reply(200, connectionResultSuccessV3, { "X-Subject-Token": tokenAuth });

          let thirdNock = nock(publicUrlSBG)
            .defaultReplyHeaders({
              'content-length': '1492',
              'accept-ranges': 'bytes',
              'last-modified': 'Wed, 03 Nov 2021 13:02:39 GMT',
              'content-type': 'application/json',
              etag: 'a30776a059eaf26eebf27756a849097d',
              'x-openstack-request-id': 'tx136c028c478a4b40a7014-0061829c9f',
              date: 'Wed, 03 Nov 2021 14:28:48 GMT',
              'x-iplb-request-id': '25A66014:1D97_3626E64B:01BB_61829C9E_3C28BD:960D'
            })
            .intercept("/templates/test.odt", "HEAD")
            .reply(200)
            .intercept("/templates/test.odt", "HEAD")
            .reply(200);

          let promise1 = getFileMetadataPromise()
          let promise2 = getFileMetadataPromise()


          Promise.all([promise1, promise2]).then(results => {
            assert.strictEqual(results.length, 2);

            assert.strictEqual(results[0].statusCode, 200);
            assert.strictEqual(results[0].body.toString(), '');
            assert.strictEqual(results[0].headers['etag'].length > 0, true);
            assert.strictEqual(results[0].headers['x-openstack-request-id'].length > 0, true);
            assert.strictEqual(results[0].headers['content-length'].length > 0, true);
            assert.strictEqual(results[0].headers['date'].length > 0, true);

            assert.strictEqual(results[1].statusCode, 200);
            assert.strictEqual(results[1].body.toString(), '');
            assert.strictEqual(results[1].headers['etag'].length > 0, true);
            assert.strictEqual(results[1].headers['x-openstack-request-id'].length > 0, true);
            assert.strictEqual(results[1].headers['content-length'].length > 0, true);
            assert.strictEqual(results[1].headers['date'].length > 0, true);

            assert.deepStrictEqual(storage.getConfig().activeStorage, 1);
            assert.strictEqual(firstNock.pendingMocks().length, 0);
            assert.strictEqual(secondNock.pendingMocks().length, 0);
            assert.strictEqual(thirdNock.pendingMocks().length, 0);
            done();
          }).catch(err => {
            assert.strictEqual(err, null);
            done();
          });
        });

        it('should request the object storage in parallel and fallback to SBG if the main storage return a 500 error', function (done) {

          let firstNock = nock(publicUrlGRA)
            .intercept("/templates/test.odt", "HEAD")
            .reply(500, {})
            .intercept("/templates/test.odt", "HEAD")
            .reply(500, {});

          let secondNock = nock(authURL)
            .post('/auth/tokens')
            .reply(200, connectionResultSuccessV3, { "X-Subject-Token": tokenAuth })
            .post('/auth/tokens')
            .reply(200, connectionResultSuccessV3, { "X-Subject-Token": tokenAuth });

          let thirdNock = nock(publicUrlSBG)
            .defaultReplyHeaders({
              'content-length': '1492',
              'accept-ranges': 'bytes',
              'last-modified': 'Wed, 03 Nov 2021 13:02:39 GMT',
              'content-type': 'application/json',
              etag: 'a30776a059eaf26eebf27756a849097d',
              'x-openstack-request-id': 'tx136c028c478a4b40a7014-0061829c9f',
              date: 'Wed, 03 Nov 2021 14:28:48 GMT',
              'x-iplb-request-id': '25A66014:1D97_3626E64B:01BB_61829C9E_3C28BD:960D'
            })
            .intercept("/templates/test.odt", "HEAD")
            .reply(200)
            .intercept("/templates/test.odt", "HEAD")
            .reply(200);

          let promise1 = getFileMetadataPromise()
          let promise2 = getFileMetadataPromise()


          Promise.all([promise1, promise2]).then(results => {
            assert.strictEqual(results.length, 2);
            
            assert.strictEqual(results[0].statusCode, 200);
            assert.strictEqual(results[0].body.toString(), '');
            assert.strictEqual(results[0].headers['etag'].length > 0, true);
            assert.strictEqual(results[0].headers['x-openstack-request-id'].length > 0, true);
            assert.strictEqual(results[0].headers['content-length'].length > 0, true);
            assert.strictEqual(results[0].headers['date'].length > 0, true);

            assert.strictEqual(results[1].statusCode, 200);
            assert.strictEqual(results[1].body.toString(), '');
            assert.strictEqual(results[1].headers['etag'].length > 0, true);
            assert.strictEqual(results[1].headers['x-openstack-request-id'].length > 0, true);
            assert.strictEqual(results[1].headers['content-length'].length > 0, true);
            assert.strictEqual(results[1].headers['date'].length > 0, true);

            assert.deepStrictEqual(storage.getConfig().activeStorage, 1);
            assert.strictEqual(firstNock.pendingMocks().length, 0);
            assert.strictEqual(secondNock.pendingMocks().length, 0);
            assert.strictEqual(thirdNock.pendingMocks().length, 0);
            done();
          }).catch(err => {
            assert.strictEqual(err, null);
            done();
          });
        });
      });
    });
  });

  describe('setFileMetadata', function () {

    const _headers = {
      'Content-Type': 'image/jpeg',
      'X-Object-Meta-LocationOrigin': 'Paris/France',
      'X-Delete-At': 1440619048
    }

    describe("SINGLE STORAGE", function () {
      it('should set file metadata', function (done) {
        const firstNock = nock(publicUrlGRA)
          .matchHeader('x-object-meta-locationorigin', 'Paris/France')
          .matchHeader('Content-Type', 'image/jpeg')
          .matchHeader('X-Delete-At', 1440619048)
          .defaultReplyHeaders({
            'content-length': '0',
            'date': 'Wed, 03 Nov 2021 14:28:48 GMT',
            'x-trans-id': 'tx37ea34dcd1ed48ca9bc7d-0052d84b6f',
            'x-openstack-request-id': 'tx136c028c478a4b40a7014-0061829c9f',
          })
          .post('/templates/test.odt')
          .reply(200)

        storage.setFileMetadata('templates', 'test.odt', { headers: _headers }, (err, resp) => {
          assert.strictEqual(err, null);
          assert.strictEqual(firstNock.pendingMocks().length, 0);
          assert.strictEqual(resp.statusCode, 200);
          assert.strictEqual(resp.body.toString(), '');
          assert.strictEqual(resp.headers['x-trans-id'].length > 0, true);
          assert.strictEqual(resp.headers['x-openstack-request-id'].length > 0, true);
          assert.strictEqual(resp.headers['content-length'] === '0', true);
          assert.strictEqual(resp.headers['date'].length > 0, true);
          done();
        });
      });

      it('should reconnect automatically if the token is invalid and retry', function (done) {
        let firstNock = nock(publicUrlGRA)
          .matchHeader('x-object-meta-locationorigin', 'Paris/France')
          .matchHeader('Content-Type', 'image/jpeg')
          .matchHeader('X-Delete-At', 1440619048)
          .defaultReplyHeaders({
            'content-length': '0',
            'date': 'Wed, 03 Nov 2021 14:28:48 GMT',
            'x-trans-id': 'tx37ea34dcd1ed48ca9bc7d-0052d84b6f',
            'x-openstack-request-id': 'tx136c028c478a4b40a7014-0061829c9f',
          })
          .post('/templates/test.odt')
          .reply(401, 'Unauthorized')
          .post('/templates/test.odt')
          .reply(200)

        let secondNock = nock(authURL)
          .post('/auth/tokens')
          .reply(200, connectionResultSuccessV3, { "X-Subject-Token": tokenAuth });

        storage.setFileMetadata('templates', 'test.odt', { headers: _headers }, (err, resp) => {
          assert.strictEqual(err, null);
          assert.strictEqual(firstNock.pendingMocks().length, 0);
          assert.strictEqual(secondNock.pendingMocks().length, 0);
          
          assert.strictEqual(resp.statusCode, 200);
          assert.strictEqual(resp.body.toString(), '');
          assert.strictEqual(resp.headers['x-trans-id'].length > 0, true);
          assert.strictEqual(resp.headers['x-openstack-request-id'].length > 0, true);
          assert.strictEqual(resp.headers['content-length'] === '0', true);
          assert.strictEqual(resp.headers['date'].length > 0, true);
          done();
        });
      });

      it('should return an error if the single storage timeout', function (done) {
        storage.setTimeout(200);
        const firstNock = nock(publicUrlGRA)
          .matchHeader('x-object-meta-locationorigin', 'Paris/France')
          .matchHeader('Content-Type', 'image/jpeg')
          .matchHeader('X-Delete-At', 1440619048)
          .post('/templates/test.odt')
          .delayConnection(500)
          .reply(200)

        storage.setFileMetadata('templates', 'test.odt', { headers: _headers }, (err, resp) => {
          assert.notStrictEqual(err, null);
          assert.strictEqual(err.toString(), 'Error: Object Storages are not available');
          assert.strictEqual(resp, undefined);
          assert.strictEqual(firstNock.pendingMocks().length, 0);
          done();
        });
      });

      it('should return an error if containers or the file does not exists', function (done) {
        const _expectedContent = '<html><h1>Not Found</h1><p>The resource could not be found.</p></html>';
        const firstNock = nock(publicUrlGRA)
          .matchHeader('x-object-meta-locationorigin', 'Paris/France')
          .matchHeader('Content-Type', 'image/jpeg')
          .matchHeader('X-Delete-At', 1440619048)
          .post('/templates/test.odt')
          .reply(404, _expectedContent);

        storage.setFileMetadata('templates', 'test.odt', { headers: _headers }, (err, resp) => {
          assert.strictEqual(err, null);
          assert.strictEqual(resp.statusCode, 404);
          assert.strictEqual(resp.body.toString(), _expectedContent);
          assert.strictEqual(JSON.stringify(resp.headers), '{}');
          assert.strictEqual(firstNock.pendingMocks().length, 0);
          done();
        });
      });

      it('should return an error if the single storage return any kind of errors', function (done) {
        const firstNock = nock(publicUrlGRA)
          .matchHeader('x-object-meta-locationorigin', 'Paris/France')
          .matchHeader('Content-Type', 'image/jpeg')
          .matchHeader('X-Delete-At', 1440619048)
          .post('/templates/test.odt')
          .replyWithError('Error Message 1234');

        storage.setFileMetadata('templates', 'test.odt', { headers: _headers }, (err, resp) => {
          assert.notStrictEqual(err, null);
          assert.strictEqual(err.message, 'Object Storages are not available');
          assert.strictEqual(resp, undefined);
          assert.strictEqual(firstNock.pendingMocks().length, 0);
          done();
        });
      });
    })

    describe("MULTIPLE STORAGES", function () {

      beforeEach(function (done) {
        const firstNock = nock(authURL)
            .post('/auth/tokens')
            .reply(200, connectionResultSuccessV3, { "X-Subject-Token": tokenAuth });

        storage.setTimeout(5000);
        storage.setStorages([{
          username                     : 'storage-1-user',
          password                     : 'storage-1-password',
          authUrl                      : authURL,
          tenantName                   : 'storage-1-tenant',
          region                       : 'GRA'
        },
        {
          username                     : 'storage-2-user',
          password                     : 'storage-2-password',
          authUrl                      : authURL,
          tenantName                   : 'storage-2-tenant',
          region                       : 'SBG'
        }]);
        storage.connection((err) => {
          assert.strictEqual(err, null)
          assert.strictEqual(firstNock.pendingMocks().length, 0);
          done();
        })
      })

      it('should reconnect automatically to the second object storage if the first storage authentication fail and should retry the request', function(done){

        let firstNock = nock(publicUrlGRA)
          .matchHeader('x-object-meta-locationorigin', 'Paris/France')
          .matchHeader('Content-Type', 'image/jpeg')
          .matchHeader('X-Delete-At', 1440619048)
          /** 1 */
          .post('/templates/test.odt')
          .reply(401, 'Unauthorized')


        let secondNock = nock(authURL)
          /** 2 */
          .post('/auth/tokens')
          .reply(500, {})
          /** 3 */
          .post('/auth/tokens')
          .reply(200, connectionResultSuccessV3, { "X-Subject-Token": tokenAuth });

        let thirdNock = nock(publicUrlSBG)
          .matchHeader('x-object-meta-locationorigin', 'Paris/France')
          .matchHeader('Content-Type', 'image/jpeg')
          .matchHeader('X-Delete-At', 1440619048)
          .defaultReplyHeaders({
            'content-length': '0',
            'date': 'Wed, 03 Nov 2021 14:28:48 GMT',
            'x-trans-id': 'tx37ea34dcd1ed48ca9bc7d-0052d84b6f',
            'x-openstack-request-id': 'tx136c028c478a4b40a7014-0061829c9f',
          })
          /** 4 */
          .post('/templates/test.odt')
          .reply(201);

        storage.setFileMetadata('templates', 'test.odt', { headers: _headers }, (err, resp) => {
          assert.strictEqual(err, null);
          assert.strictEqual(firstNock.pendingMocks().length, 0);
          assert.strictEqual(secondNock.pendingMocks().length, 0);
          assert.strictEqual(thirdNock.pendingMocks().length, 0);
          assert.strictEqual(resp.statusCode, 201);
          assert.strictEqual(resp.body.toString(), '');
          assert.strictEqual(resp.headers['x-trans-id'].length > 0, true);
          assert.strictEqual(resp.headers['x-openstack-request-id'].length > 0, true);
          assert.strictEqual(resp.headers['content-length'] === '0', true);
          assert.strictEqual(resp.headers['date'].length > 0, true);
          done();
        });
      })

      it('should retry the request with the second object storage if the first object storage return a 500 error', function(done){

        let firstNock = nock(publicUrlGRA)
          .matchHeader('x-object-meta-locationorigin', 'Paris/France')
          .matchHeader('Content-Type', 'image/jpeg')
          .matchHeader('X-Delete-At', 1440619048)
          .post('/templates/test.odt')
          .reply(500, {});

        let secondNock = nock(authURL)
          .post('/auth/tokens')
          .reply(200, connectionResultSuccessV3, { "X-Subject-Token": tokenAuth });

        let thirdNock = nock(publicUrlSBG)
          .matchHeader('x-object-meta-locationorigin', 'Paris/France')
          .matchHeader('Content-Type', 'image/jpeg')
          .matchHeader('X-Delete-At', 1440619048)
          .defaultReplyHeaders({
            'content-length': '0',
            'date': 'Wed, 03 Nov 2021 14:28:48 GMT',
            'x-trans-id': 'tx37ea34dcd1ed48ca9bc7d-0052d84b6f',
            'x-openstack-request-id': 'tx136c028c478a4b40a7014-0061829c9f',
          })
          .post('/templates/test.odt')
          .reply(201, '');

        storage.setFileMetadata('templates', 'test.odt', { headers: _headers }, (err, resp) => {
          assert.strictEqual(err, null);
          assert.strictEqual(firstNock.pendingMocks().length, 0);
          assert.strictEqual(secondNock.pendingMocks().length, 0);
          assert.strictEqual(thirdNock.pendingMocks().length, 0);
          assert.strictEqual(resp.statusCode, 201);
          assert.strictEqual(resp.body.toString(), '');
          assert.strictEqual(resp.headers['x-trans-id'].length > 0, true);
          assert.strictEqual(resp.headers['x-openstack-request-id'].length > 0, true);
          assert.strictEqual(resp.headers['content-length'] === '0', true);
          assert.strictEqual(resp.headers['date'].length > 0, true);
          done();
        });
      })



      it('should retry the request with the second object storage if the first object storage timeout', function(done){
        storage.setTimeout(200);
        let firstNock = nock(publicUrlGRA)
          .matchHeader('x-object-meta-locationorigin', 'Paris/France')
          .matchHeader('Content-Type', 'image/jpeg')
          .matchHeader('X-Delete-At', 1440619048)
          .post('/templates/test.odt')
          .delayConnection(500)
          .reply(200, {});

        let secondNock = nock(authURL)
          .post('/auth/tokens')
          .reply(200, connectionResultSuccessV3, { "X-Subject-Token": tokenAuth });

        let thirdNock = nock(publicUrlSBG)
          .matchHeader('x-object-meta-locationorigin', 'Paris/France')
          .matchHeader('Content-Type', 'image/jpeg')
          .matchHeader('X-Delete-At', 1440619048)
          .defaultReplyHeaders({
            'content-length': '0',
            'date': 'Wed, 03 Nov 2021 14:28:48 GMT',
            'x-trans-id': 'tx37ea34dcd1ed48ca9bc7d-0052d84b6f',
            'x-openstack-request-id': 'tx136c028c478a4b40a7014-0061829c9f',
          })
          .post('/templates/test.odt')
          .reply(201, '');

        storage.setFileMetadata('templates', 'test.odt', { headers: _headers }, (err, resp) => {
          assert.strictEqual(err, null);
          assert.strictEqual(firstNock.pendingMocks().length, 0);
          assert.strictEqual(secondNock.pendingMocks().length, 0);
          assert.strictEqual(thirdNock.pendingMocks().length, 0);
          assert.strictEqual(resp.statusCode, 201);
          assert.strictEqual(resp.body.toString(), '');
          assert.strictEqual(resp.headers['x-trans-id'].length > 0, true);
          assert.strictEqual(resp.headers['x-openstack-request-id'].length > 0, true);
          assert.strictEqual(resp.headers['content-length'] === '0', true);
          assert.strictEqual(resp.headers['date'].length > 0, true);
          done();
        });
      })

      it('should retry the request with the second storage if the first storage return any kind of errors', function (done) {

        let firstNock = nock(publicUrlGRA)
          .matchHeader('x-object-meta-locationorigin', 'Paris/France')
          .matchHeader('Content-Type', 'image/jpeg')
          .matchHeader('X-Delete-At', 1440619048)
          .post('/templates/test.odt')
          .replyWithError('Error Message 1234');


        let secondNock = nock(authURL)
          .post('/auth/tokens')
          .reply(200, connectionResultSuccessV3, { "X-Subject-Token": tokenAuth });

        let thirdNock = nock(publicUrlSBG)
          .matchHeader('x-object-meta-locationorigin', 'Paris/France')
          .matchHeader('Content-Type', 'image/jpeg')
          .matchHeader('X-Delete-At', 1440619048)
          .defaultReplyHeaders({
            'content-length': '0',
            'date': 'Wed, 03 Nov 2021 14:28:48 GMT',
            'x-trans-id': 'tx37ea34dcd1ed48ca9bc7d-0052d84b6f',
            'x-openstack-request-id': 'tx136c028c478a4b40a7014-0061829c9f',
          })
          .post('/templates/test.odt')
          .reply(200);


        storage.setFileMetadata('templates', 'test.odt', { headers: _headers }, (err, resp) => {
          assert.strictEqual(err, null);
          assert.strictEqual(firstNock.pendingMocks().length, 0);
          assert.strictEqual(secondNock.pendingMocks().length, 0);
          assert.strictEqual(thirdNock.pendingMocks().length, 0);
          assert.strictEqual(resp.statusCode, 200);
          assert.strictEqual(resp.body.toString(), '');
          assert.strictEqual(resp.headers['x-trans-id'].length > 0, true);
          assert.strictEqual(resp.headers['x-openstack-request-id'].length > 0, true);
          assert.strictEqual(resp.headers['content-length'] === '0', true);
          assert.strictEqual(resp.headers['date'].length > 0, true);
          done();
        });
      });

      describe("PARALLEL REQUESTS", function () {

        function setFileMetadataPromise() {
          return new Promise((resolve, reject) => {
            try {
              storage.setFileMetadata('templates', 'test.odt', { headers: _headers }, (err, resp) => {
                if (err) {
                  return reject(err);
                }
                return resolve(resp);
              });
            } catch(err) {
              return reject(err);
            }
          });
        }

        it('should request the object storage in parallel and fallback to SBG if the main storage return any kind of errors', function (done) {

          let firstNock = nock(publicUrlGRA)
            .matchHeader('x-object-meta-locationorigin', 'Paris/France')
            .matchHeader('Content-Type', 'image/jpeg')
            .matchHeader('X-Delete-At', 1440619048)
            .post('/templates/test.odt')
            .replyWithError('Error Message 1234')
            .post('/templates/test.odt')
            .replyWithError('Error Message 1234');

          let secondNock = nock(authURL)
            .post('/auth/tokens')
            .reply(200, connectionResultSuccessV3, { "X-Subject-Token": tokenAuth })
            .post('/auth/tokens')
            .reply(200, connectionResultSuccessV3, { "X-Subject-Token": tokenAuth });


          let thirdNock = nock(publicUrlSBG)
            .matchHeader('x-object-meta-locationorigin', 'Paris/France')
            .matchHeader('Content-Type', 'image/jpeg')
            .matchHeader('X-Delete-At', 1440619048)
            .defaultReplyHeaders({
              'content-length': '0',
              'date': 'Wed, 03 Nov 2021 14:28:48 GMT',
              'x-trans-id': 'tx37ea34dcd1ed48ca9bc7d-0052d84b6f',
              'x-openstack-request-id': 'tx136c028c478a4b40a7014-0061829c9f',
            })
            .post('/templates/test.odt')
            .reply(200)
            .post('/templates/test.odt')
            .reply(200)

          let promise1 = setFileMetadataPromise()
          let promise2 = setFileMetadataPromise()


          Promise.all([promise1, promise2]).then(results => {
            assert.strictEqual(results.length, 2);

            assert.strictEqual(results[0].statusCode, 200);
            assert.strictEqual(results[0].body.toString(), '');
            assert.strictEqual(results[0].headers['x-trans-id'].length > 0, true);
            assert.strictEqual(results[0].headers['x-openstack-request-id'].length > 0, true);
            assert.strictEqual(results[0].headers['content-length'] === '0', true);
            assert.strictEqual(results[0].headers['date'].length > 0, true);

            assert.strictEqual(results[1].statusCode, 200);
            assert.strictEqual(results[1].body.toString(), '');
            assert.strictEqual(results[1].headers['x-trans-id'].length > 0, true);
            assert.strictEqual(results[1].headers['x-openstack-request-id'].length > 0, true);
            assert.strictEqual(results[1].headers['content-length'] === '0', true);
            assert.strictEqual(results[1].headers['date'].length > 0, true);

            assert.deepStrictEqual(storage.getConfig().activeStorage, 1);
            assert.strictEqual(firstNock.pendingMocks().length, 0);
            assert.strictEqual(secondNock.pendingMocks().length, 0);
            assert.strictEqual(thirdNock.pendingMocks().length, 0);
            done();
          }).catch(err => {
            assert.strictEqual(err, null);
            done();
          });
        });

        it('should request the object storage in parallel and fallback to SBG if the authentication of the main storage return an error', function (done) {

          let firstNock = nock(publicUrlGRA)
            .matchHeader('x-object-meta-locationorigin', 'Paris/France')
            .matchHeader('Content-Type', 'image/jpeg')
            .matchHeader('X-Delete-At', 1440619048)
            .post('/templates/test.odt')
            .reply(401, 'Unauthorized')
            .post('/templates/test.odt')
            .reply(401, 'Unauthorized')
            .post('/templates/test.odt')
            .reply(401, 'Unauthorized')

          let secondNock = nock(authURL)
            .post('/auth/tokens')
            .reply(500, {})
            .post('/auth/tokens')
            .reply(500, {})
            .post('/auth/tokens')
            .reply(500, {})
            .post('/auth/tokens')
            .reply(200, connectionResultSuccessV3, { "X-Subject-Token": tokenAuth })
            .post('/auth/tokens')
            .reply(200, connectionResultSuccessV3, { "X-Subject-Token": tokenAuth })
            .post('/auth/tokens')
            .reply(200, connectionResultSuccessV3, { "X-Subject-Token": tokenAuth });

          let thirdNock = nock(publicUrlSBG)
            .matchHeader('x-object-meta-locationorigin', 'Paris/France')
            .matchHeader('Content-Type', 'image/jpeg')
            .matchHeader('X-Delete-At', 1440619048)
            .defaultReplyHeaders({
              'content-length': '0',
              'date': 'Wed, 03 Nov 2021 14:28:48 GMT',
              'x-trans-id': 'tx37ea34dcd1ed48ca9bc7d-0052d84b6f',
              'x-openstack-request-id': 'tx136c028c478a4b40a7014-0061829c9f',
            })
            .post('/templates/test.odt')
            .reply(200)
            .post('/templates/test.odt')
            .reply(200)
            .post('/templates/test.odt')
            .reply(200)
            .post('/templates/test.odt')
            .reply(200)

          let promise1 = setFileMetadataPromise()
          let promise2 = setFileMetadataPromise()
          let promise3 = setFileMetadataPromise()

          Promise.all([promise1, promise2, promise3]).then(async results => {

            assert.strictEqual(results.length, 3);
            
            assert.strictEqual(results[0].statusCode, 200);
            assert.strictEqual(results[0].body.toString(), '');
            assert.strictEqual(results[0].headers['x-trans-id'].length > 0, true);
            assert.strictEqual(results[0].headers['x-openstack-request-id'].length > 0, true);
            assert.strictEqual(results[0].headers['content-length'] === '0', true);
            assert.strictEqual(results[0].headers['date'].length > 0, true);
            
            assert.strictEqual(results[1].statusCode, 200);
            assert.strictEqual(results[1].body.toString(), '');
            assert.strictEqual(results[1].headers['x-trans-id'].length > 0, true);
            assert.strictEqual(results[1].headers['x-openstack-request-id'].length > 0, true);
            assert.strictEqual(results[1].headers['content-length'] === '0', true);
            assert.strictEqual(results[1].headers['date'].length > 0, true);
            
            assert.strictEqual(results[2].statusCode, 200);
            assert.strictEqual(results[2].body.toString(), '');
            assert.strictEqual(results[2].headers['x-trans-id'].length > 0, true);
            assert.strictEqual(results[2].headers['x-openstack-request-id'].length > 0, true);
            assert.strictEqual(results[2].headers['content-length'] === '0', true);
            assert.strictEqual(results[2].headers['date'].length > 0, true);


            let _result3 = await setFileMetadataPromise();
            assert.strictEqual(_result3.statusCode, 200);
            assert.strictEqual(_result3.body.toString(), '');
            assert.strictEqual(_result3.headers['x-trans-id'].length > 0, true);
            assert.strictEqual(_result3.headers['x-openstack-request-id'].length > 0, true);
            assert.strictEqual(_result3.headers['content-length'] === '0', true);
            assert.strictEqual(_result3.headers['date'].length > 0, true);

            assert.deepStrictEqual(storage.getConfig().activeStorage, 1);
            assert.strictEqual(firstNock.pendingMocks().length, 0);
            assert.strictEqual(secondNock.pendingMocks().length, 0);
            assert.strictEqual(thirdNock.pendingMocks().length, 0);
            done();
          });
        });

        it('should request the object storage in parallel and fallback to SBG if the main storage timeout', function (done) {
          storage.setTimeout(200);

          let firstNock = nock(publicUrlGRA)
            .matchHeader('x-object-meta-locationorigin', 'Paris/France')
            .matchHeader('Content-Type', 'image/jpeg')
            .matchHeader('X-Delete-At', 1440619048)
            .post('/templates/test.odt')
            .delayConnection(500)
            .reply(200, {})
            .post('/templates/test.odt')
            .delayConnection(500)
            .reply(200, {});

          let secondNock = nock(authURL)
            .post('/auth/tokens')
            .reply(200, connectionResultSuccessV3, { "X-Subject-Token": tokenAuth })
            .post('/auth/tokens')
            .reply(200, connectionResultSuccessV3, { "X-Subject-Token": tokenAuth });

          let thirdNock = nock(publicUrlSBG)
            .matchHeader('x-object-meta-locationorigin', 'Paris/France')
            .matchHeader('Content-Type', 'image/jpeg')
            .matchHeader('X-Delete-At', 1440619048)
            .defaultReplyHeaders({
              'content-length': '0',
              'date': 'Wed, 03 Nov 2021 14:28:48 GMT',
              'x-trans-id': 'tx37ea34dcd1ed48ca9bc7d-0052d84b6f',
              'x-openstack-request-id': 'tx136c028c478a4b40a7014-0061829c9f',
            })
            .post('/templates/test.odt')
            .reply(200)
            .post('/templates/test.odt')
            .reply(200)


          let promise1 = setFileMetadataPromise()
          let promise2 = setFileMetadataPromise()


          Promise.all([promise1, promise2]).then(results => {
            assert.strictEqual(results.length, 2);
            
            assert.strictEqual(results[0].statusCode, 200);
            assert.strictEqual(results[0].body.toString(), '');
            assert.strictEqual(results[0].headers['x-trans-id'].length > 0, true);
            assert.strictEqual(results[0].headers['x-openstack-request-id'].length > 0, true);
            assert.strictEqual(results[0].headers['content-length'] === '0', true);
            assert.strictEqual(results[0].headers['date'].length > 0, true);

            assert.strictEqual(results[1].statusCode, 200);
            assert.strictEqual(results[1].body.toString(), '');
            assert.strictEqual(results[1].headers['x-trans-id'].length > 0, true);
            assert.strictEqual(results[1].headers['x-openstack-request-id'].length > 0, true);
            assert.strictEqual(results[1].headers['content-length'] === '0', true);
            assert.strictEqual(results[1].headers['date'].length > 0, true);

            assert.deepStrictEqual(storage.getConfig().activeStorage, 1);
            assert.strictEqual(firstNock.pendingMocks().length, 0);
            assert.strictEqual(secondNock.pendingMocks().length, 0);
            assert.strictEqual(thirdNock.pendingMocks().length, 0);
            done();
          }).catch(err => {
            assert.strictEqual(err, null);
            done();
          });
        });

        it('should request the object storage in parallel and fallback to SBG if the main storage return a 500 error', function (done) {

          let firstNock = nock(publicUrlGRA)
            .matchHeader('x-object-meta-locationorigin', 'Paris/France')
            .matchHeader('Content-Type', 'image/jpeg')
            .matchHeader('X-Delete-At', 1440619048)
            .post('/templates/test.odt')
            .reply(500, {})
            .post('/templates/test.odt')
            .reply(500, {});

          let secondNock = nock(authURL)
            .post('/auth/tokens')
            .reply(200, connectionResultSuccessV3, { "X-Subject-Token": tokenAuth })
            .post('/auth/tokens')
            .reply(200, connectionResultSuccessV3, { "X-Subject-Token": tokenAuth });

          let thirdNock = nock(publicUrlSBG)
            .matchHeader('x-object-meta-locationorigin', 'Paris/France')
            .matchHeader('Content-Type', 'image/jpeg')
            .matchHeader('X-Delete-At', 1440619048)
            .defaultReplyHeaders({
              'content-length': '0',
              'date': 'Wed, 03 Nov 2021 14:28:48 GMT',
              'x-trans-id': 'tx37ea34dcd1ed48ca9bc7d-0052d84b6f',
              'x-openstack-request-id': 'tx136c028c478a4b40a7014-0061829c9f',
            })
            .post('/templates/test.odt')
            .reply(200)
            .post('/templates/test.odt')
            .reply(200)

          let promise1 = setFileMetadataPromise()
          let promise2 = setFileMetadataPromise()


          Promise.all([promise1, promise2]).then(results => {
            assert.strictEqual(results.length, 2);
            assert.strictEqual(results[0].statusCode, 200);
            assert.strictEqual(results[0].body.toString(), '');
            assert.strictEqual(results[0].headers['x-trans-id'].length > 0, true);
            assert.strictEqual(results[0].headers['x-openstack-request-id'].length > 0, true);
            assert.strictEqual(results[0].headers['content-length'] === '0', true);
            assert.strictEqual(results[0].headers['date'].length > 0, true);

            assert.strictEqual(results[1].statusCode, 200);
            assert.strictEqual(results[1].body.toString(), '');
            assert.strictEqual(results[1].headers['x-trans-id'].length > 0, true);
            assert.strictEqual(results[1].headers['x-openstack-request-id'].length > 0, true);
            assert.strictEqual(results[1].headers['content-length'] === '0', true);
            assert.strictEqual(results[1].headers['date'].length > 0, true);

            assert.deepStrictEqual(storage.getConfig().activeStorage, 1);
            assert.strictEqual(firstNock.pendingMocks().length, 0);
            assert.strictEqual(secondNock.pendingMocks().length, 0);
            assert.strictEqual(thirdNock.pendingMocks().length, 0);
            done();
          }).catch(err => {
            assert.strictEqual(err, null);
            done();
          });
        });

      });
    });
  });

  describe('Request [WITHOUT Stream]', function () {

    const _headers = {
      'Content-Type': 'image/jpeg',
      'X-Object-Meta-LocationOrigin': 'Paris/France',
      'X-Delete-At': 1440619048
    }

    describe("SINGLE STORAGE", function () {
      it('should set file metadata', function (done) {
        const firstNock = nock(publicUrlGRA)
          .matchHeader('x-object-meta-locationorigin', 'Paris/France')
          .matchHeader('Content-Type', 'image/jpeg')
          .matchHeader('X-Delete-At', 1440619048)
          .defaultReplyHeaders({
            'content-length': '0',
            'date': 'Wed, 03 Nov 2021 14:28:48 GMT',
            'x-trans-id': 'tx37ea34dcd1ed48ca9bc7d-0052d84b6f',
            'x-openstack-request-id': 'tx136c028c478a4b40a7014-0061829c9f',
          })
          .intercept("/templates/test.odt", "COPY")
          .reply(200,"OK");

        storage.request('COPY', '/templates/test.odt', { headers: _headers }, (err, resp) => {
          assert.strictEqual(err, null);
          assert.strictEqual(firstNock.pendingMocks().length, 0);
          assert.strictEqual(resp.headers['x-trans-id'].length > 0, true);
          assert.strictEqual(resp.headers['x-openstack-request-id'].length > 0, true);
          assert.strictEqual(resp.headers['content-length'] === '0', true);
          assert.strictEqual(resp.headers['date'].length > 0, true);
          assert.strictEqual(resp.body.toString(), "OK");
          assert.strictEqual(resp.statusCode, 200);
          done();
        });
      });

      it('should bulk delete files from a container', function (done) {
        const _expectedBody = '' +
         '/templates/335162359311268850|a07c420feededcd9ddc5c082f7feb8add3bb0571ea8ae4c775af12ea21e8ce08\n' +
         '/templates/335162359311268850|a07c420feededcd9ddc5c082f7feb8add3bb0571ea8ae4c775af12ea21e8ce08\n'
        const _expectedHeader = {
          'Content-Type': 'text/plain',
          'Accept'      : 'application/json'
        }
        const _expectedResponse = {
          "Number Not Found": 2,
          "Response Status": "200 OK",
          "Errors": [],
          "Number Deleted": 1,
          "Response Body": ""
        }
        const firstNock = nock(publicUrlGRA)
          .matchHeader('Content-Type', 'text/plain')
          .matchHeader('Accept', 'application/json')
          .defaultReplyHeaders({
            'content-length': '0',
            'date': 'Wed, 03 Nov 2021 14:28:48 GMT',
            'x-trans-id': 'tx37ea34dcd1ed48ca9bc7d-0052d84b6f',
            'x-openstack-request-id': 'tx136c028c478a4b40a7014-0061829c9f',
          })
          .post("/templates?bulk-delete")
          .reply(201, (uri, requestBody) => {
            assert.strictEqual(requestBody, _expectedBody);
            return Buffer.from(JSON.stringify(_expectedResponse));
          });

        storage.request('POST', '/templates?bulk-delete', { headers: _expectedHeader, body: _expectedBody }, (err, resp) => {
          assert.strictEqual(err, null);
          assert.strictEqual(firstNock.pendingMocks().length, 0);
          assert.strictEqual(resp.headers['x-trans-id'].length > 0, true);
          assert.strictEqual(resp.headers['x-openstack-request-id'].length > 0, true);
          assert.strictEqual(resp.headers['content-length'] === '0', true);
          assert.strictEqual(resp.headers['date'].length > 0, true);
          assert.strictEqual(resp.body.toString(), JSON.stringify(_expectedResponse));
          assert.strictEqual(resp.statusCode, 201);
          done();
        });
      });

      it('should reconnect automatically if the token is invalid and retry', function (done) {

        let firstNock = nock(publicUrlGRA)
          .matchHeader('x-object-meta-locationorigin', 'Paris/France')
          .matchHeader('Content-Type', 'image/jpeg')
          .matchHeader('X-Delete-At', 1440619048)
          .defaultReplyHeaders({
            'content-length': '0',
            'date': 'Wed, 03 Nov 2021 14:28:48 GMT',
            'x-trans-id': 'tx37ea34dcd1ed48ca9bc7d-0052d84b6f',
            'x-openstack-request-id': 'tx136c028c478a4b40a7014-0061829c9f',
          })
          .intercept("/templates/test.odt", "COPY")
          .reply(401, 'Unauthorized')
          .intercept("/templates/test.odt", "COPY")
          .reply(200, 'OK')

        let secondNock = nock(authURL)
          .post('/auth/tokens')
          .reply(200, connectionResultSuccessV3, { "X-Subject-Token": tokenAuth });

        storage.request('COPY', '/templates/test.odt', { headers: _headers }, (err, resp) => {
          assert.strictEqual(err, null);
          assert.strictEqual(firstNock.pendingMocks().length, 0);
          assert.strictEqual(secondNock.pendingMocks().length, 0);
          assert.strictEqual(resp.statusCode, 200);
          assert.strictEqual(resp.headers['x-trans-id'].length > 0, true);
          assert.strictEqual(resp.headers['x-openstack-request-id'].length > 0, true);
          assert.strictEqual(resp.headers['content-length'] === '0', true);
          assert.strictEqual(resp.headers['date'].length > 0, true);
          assert.strictEqual(resp.body.toString(), "OK");
          done();
        });
      });

      it('should return an error if the single storage timeout', function (done) {
        storage.setTimeout(200);
        const firstNock = nock(publicUrlGRA)
          .matchHeader('x-object-meta-locationorigin', 'Paris/France')
          .matchHeader('Content-Type', 'image/jpeg')
          .matchHeader('X-Delete-At', 1440619048)
          .intercept("/templates/test.odt", "COPY")
          .delayConnection(500)
          .reply(200)

        storage.request('COPY', '/templates/test.odt', { headers: _headers }, (err, resp) => {
          assert.notStrictEqual(err, null);
          assert.strictEqual(err.message, 'Object Storages are not available');
          assert.strictEqual(resp, undefined);
          assert.strictEqual(firstNock.pendingMocks().length, 0);
          done();
        });
      });

      it('should return an error if containers or the file does not exists', function (done) {
        const _expectedContent = '<html><h1>Not Found</h1><p>The resource could not be found.</p></html>';
        const firstNock = nock(publicUrlGRA)
          .matchHeader('x-object-meta-locationorigin', 'Paris/France')
          .matchHeader('Content-Type', 'image/jpeg')
          .matchHeader('X-Delete-At', 1440619048)
          .intercept("/templates/test.odt", "COPY")
          .reply(404, _expectedContent);

        storage.request('COPY', '/templates/test.odt', { headers: _headers }, (err, resp) => {
          assert.strictEqual(err, null);
          assert.strictEqual(JSON.stringify(resp.headers), '{}');
          assert.strictEqual(resp.body.toString(), _expectedContent);
          assert.strictEqual(resp.statusCode, 404);
          assert.strictEqual(firstNock.pendingMocks().length, 0);
          done();
        });
      });

      it('should return an error if the single storage return any kind of errors', function (done) {
        const firstNock = nock(publicUrlGRA)
          .matchHeader('x-object-meta-locationorigin', 'Paris/France')
          .matchHeader('Content-Type', 'image/jpeg')
          .matchHeader('X-Delete-At', 1440619048)
          .intercept("/templates/test.odt", "COPY")
          .replyWithError('Error Message 1234');

        storage.request('COPY', '/templates/test.odt', { headers: _headers }, (err, resp) => {
          assert.notStrictEqual(err, null);
          assert.strictEqual(err.message, 'Object Storages are not available');
          assert.strictEqual(resp, undefined);
          assert.strictEqual(firstNock.pendingMocks().length, 0);
          done();
        });
      });
    })

    describe("MULTIPLE STORAGES", function () {

      beforeEach(function (done) {
        const firstNock = nock(authURL)
            .post('/auth/tokens')
            .reply(200, connectionResultSuccessV3, { "X-Subject-Token": tokenAuth });

        storage.setTimeout(5000);
        storage.setStorages([{
          username                     : 'storage-1-user',
          password                     : 'storage-1-password',
          authUrl                      : authURL,
          tenantName                   : 'storage-1-tenant',
          region                       : 'GRA'
        },
        {
          username                     : 'storage-2-user',
          password                     : 'storage-2-password',
          authUrl                      : authURL,
          tenantName                   : 'storage-2-tenant',
          region                       : 'SBG'
        }]);
        storage.connection((err) => {
          assert.strictEqual(err, null)
          assert.strictEqual(firstNock.pendingMocks().length, 0);
          done();
        })
      })

      it('should reconnect automatically to the second object storage if the first storage authentication fail and should retry the request', function(done){

        let firstNock = nock(publicUrlGRA)
          .matchHeader('x-object-meta-locationorigin', 'Paris/France')
          .matchHeader('Content-Type', 'image/jpeg')
          .matchHeader('X-Delete-At', 1440619048)
          /** 1 */
          .intercept("/templates/test.odt", "COPY")
          .reply(401, 'Unauthorized')


        let secondNock = nock(authURL)
          /** 2 */
          .post('/auth/tokens')
          .reply(500, {})
          /** 3 */
          .post('/auth/tokens')
          .reply(200, connectionResultSuccessV3, { "X-Subject-Token": tokenAuth });

        let thirdNock = nock(publicUrlSBG)
          .matchHeader('x-object-meta-locationorigin', 'Paris/France')
          .matchHeader('Content-Type', 'image/jpeg')
          .matchHeader('X-Delete-At', 1440619048)
          .defaultReplyHeaders({
            'content-length': '0',
            'date': 'Wed, 03 Nov 2021 14:28:48 GMT',
            'x-trans-id': 'tx37ea34dcd1ed48ca9bc7d-0052d84b6f',
            'x-openstack-request-id': 'tx136c028c478a4b40a7014-0061829c9f',
          })
          /** 4 */
          .intercept("/templates/test.odt", "COPY")
          .reply(201, 'OK');

        storage.request('COPY', '/templates/test.odt', { headers: _headers }, (err, resp) => {
          assert.strictEqual(err, null);
          assert.strictEqual(firstNock.pendingMocks().length, 0);
          assert.strictEqual(secondNock.pendingMocks().length, 0);
          assert.strictEqual(thirdNock.pendingMocks().length, 0);
          assert.strictEqual(resp.headers['x-trans-id'].length > 0, true);
          assert.strictEqual(resp.headers['x-openstack-request-id'].length > 0, true);
          assert.strictEqual(resp.headers['content-length'] === '0', true);
          assert.strictEqual(resp.headers['date'].length > 0, true);
          assert.strictEqual(resp.body.toString(), "OK");
          assert.strictEqual(resp.statusCode, 201);
          done();
        });
      })

      it('should retry the request with the second object storage if the first object storage return a 500 error', function(done){

        let firstNock = nock(publicUrlGRA)
          .matchHeader('x-object-meta-locationorigin', 'Paris/France')
          .matchHeader('Content-Type', 'image/jpeg')
          .matchHeader('X-Delete-At', 1440619048)
          .intercept("/templates/test.odt", "COPY")
          .reply(500, {});

        let secondNock = nock(authURL)
          .post('/auth/tokens')
          .reply(200, connectionResultSuccessV3, { "X-Subject-Token": tokenAuth });

        let thirdNock = nock(publicUrlSBG)
          .matchHeader('x-object-meta-locationorigin', 'Paris/France')
          .matchHeader('Content-Type', 'image/jpeg')
          .matchHeader('X-Delete-At', 1440619048)
          .defaultReplyHeaders({
            'content-length': '0',
            'date': 'Wed, 03 Nov 2021 14:28:48 GMT',
            'x-trans-id': 'tx37ea34dcd1ed48ca9bc7d-0052d84b6f',
            'x-openstack-request-id': 'tx136c028c478a4b40a7014-0061829c9f',
          })
          .intercept("/templates/test.odt", "COPY")
          .reply(201, 'OK');

        storage.request('COPY', '/templates/test.odt', { headers: _headers }, (err, resp) => {
          assert.strictEqual(err, null);
          assert.strictEqual(firstNock.pendingMocks().length, 0);
          assert.strictEqual(secondNock.pendingMocks().length, 0);
          assert.strictEqual(thirdNock.pendingMocks().length, 0);
          assert.strictEqual(resp.headers['x-trans-id'].length > 0, true);
          assert.strictEqual(resp.headers['x-openstack-request-id'].length > 0, true);
          assert.strictEqual(resp.headers['content-length'] === '0', true);
          assert.strictEqual(resp.headers['date'].length > 0, true);
          assert.strictEqual(resp.body.toString(), "OK");
          assert.strictEqual(resp.statusCode, 201);
          done();
        });
      })



      it('should retry the request with the second object storage if the first object storage timeout', function(done){
        storage.setTimeout(200);
        let firstNock = nock(publicUrlGRA)
          .matchHeader('x-object-meta-locationorigin', 'Paris/France')
          .matchHeader('Content-Type', 'image/jpeg')
          .matchHeader('X-Delete-At', 1440619048)
          .intercept("/templates/test.odt", "COPY")
          .delayConnection(500)
          .reply(200, {});

        let secondNock = nock(authURL)
          .post('/auth/tokens')
          .reply(200, connectionResultSuccessV3, { "X-Subject-Token": tokenAuth });

        let thirdNock = nock(publicUrlSBG)
          .matchHeader('x-object-meta-locationorigin', 'Paris/France')
          .matchHeader('Content-Type', 'image/jpeg')
          .matchHeader('X-Delete-At', 1440619048)
          .defaultReplyHeaders({
            'content-length': '0',
            'date': 'Wed, 03 Nov 2021 14:28:48 GMT',
            'x-trans-id': 'tx37ea34dcd1ed48ca9bc7d-0052d84b6f',
            'x-openstack-request-id': 'tx136c028c478a4b40a7014-0061829c9f',
          })
          .intercept("/templates/test.odt", "COPY")
          .reply(201, 'OK');

        storage.request('COPY', '/templates/test.odt', { headers: _headers }, (err, resp) => {
          assert.strictEqual(err, null);
          assert.strictEqual(firstNock.pendingMocks().length, 0);
          assert.strictEqual(secondNock.pendingMocks().length, 0);
          assert.strictEqual(thirdNock.pendingMocks().length, 0);
          assert.strictEqual(resp.headers['x-trans-id'].length > 0, true);
          assert.strictEqual(resp.headers['x-openstack-request-id'].length > 0, true);
          assert.strictEqual(resp.headers['content-length'] === '0', true);
          assert.strictEqual(resp.headers['date'].length > 0, true);
          assert.strictEqual(resp.body.toString(), "OK");
          assert.strictEqual(resp.statusCode, 201);
          done();
        });
      })

      it('should retry the request with the second storage if the first storage return any kind of errors', function (done) {

        let firstNock = nock(publicUrlGRA)
          .matchHeader('x-object-meta-locationorigin', 'Paris/France')
          .matchHeader('Content-Type', 'image/jpeg')
          .matchHeader('X-Delete-At', 1440619048)
          .intercept("/templates/test.odt", "COPY")
          .replyWithError('Error Message 1234');


        let secondNock = nock(authURL)
          .post('/auth/tokens')
          .reply(200, connectionResultSuccessV3, { "X-Subject-Token": tokenAuth });

        let thirdNock = nock(publicUrlSBG)
          .matchHeader('x-object-meta-locationorigin', 'Paris/France')
          .matchHeader('Content-Type', 'image/jpeg')
          .matchHeader('X-Delete-At', 1440619048)
          .defaultReplyHeaders({
            'content-length': '0',
            'date': 'Wed, 03 Nov 2021 14:28:48 GMT',
            'x-trans-id': 'tx37ea34dcd1ed48ca9bc7d-0052d84b6f',
            'x-openstack-request-id': 'tx136c028c478a4b40a7014-0061829c9f',
          })
          .intercept("/templates/test.odt", "COPY")
          .reply(200, 'OK');


        storage.request('COPY', '/templates/test.odt', { headers: _headers }, (err, resp) => {
          assert.strictEqual(err, null);
          assert.strictEqual(firstNock.pendingMocks().length, 0);
          assert.strictEqual(secondNock.pendingMocks().length, 0);
          assert.strictEqual(thirdNock.pendingMocks().length, 0);
          assert.strictEqual(resp.headers['x-trans-id'].length > 0, true);
          assert.strictEqual(resp.headers['x-openstack-request-id'].length > 0, true);
          assert.strictEqual(resp.headers['content-length'] === '0', true);
          assert.strictEqual(resp.headers['date'].length > 0, true);
          assert.strictEqual(resp.body.toString(), "OK");
          assert.strictEqual(resp.statusCode, 200);
          done();
        });
      });

      describe("PARALLEL REQUESTS", function () {

        function copyRequestPromise() {
          return new Promise((resolve, reject) => {
            try {
              storage.request('COPY', '/templates/test.odt', { headers: _headers }, (err, resp) => {
                if (err) {
                  return reject(err);
                }
                return resolve(resp);
              });
            } catch(err) {
              return reject(err);
            }
          });
        }

        it('should request the object storage in parallel and fallback to SBG if the main storage return any kind of errors', function (done) {

          let firstNock = nock(publicUrlGRA)
            .matchHeader('x-object-meta-locationorigin', 'Paris/France')
            .matchHeader('Content-Type', 'image/jpeg')
            .matchHeader('X-Delete-At', 1440619048)
            .intercept("/templates/test.odt", "COPY")
            .replyWithError('Error Message 1234')
            .intercept("/templates/test.odt", "COPY")
            .replyWithError('Error Message 1234');

          let secondNock = nock(authURL)
            .post('/auth/tokens')
            .reply(200, connectionResultSuccessV3, { "X-Subject-Token": tokenAuth })
            .post('/auth/tokens')
            .reply(200, connectionResultSuccessV3, { "X-Subject-Token": tokenAuth });


          let thirdNock = nock(publicUrlSBG)
            .matchHeader('x-object-meta-locationorigin', 'Paris/France')
            .matchHeader('Content-Type', 'image/jpeg')
            .matchHeader('X-Delete-At', 1440619048)
            .defaultReplyHeaders({
              'content-length': '0',
              'date': 'Wed, 03 Nov 2021 14:28:48 GMT',
              'x-trans-id': 'tx37ea34dcd1ed48ca9bc7d-0052d84b6f',
              'x-openstack-request-id': 'tx136c028c478a4b40a7014-0061829c9f',
            })
            .intercept("/templates/test.odt", "COPY")
            .reply(200, 'OK')
            .intercept("/templates/test.odt", "COPY")
            .reply(200, 'OK')

          let promise1 = copyRequestPromise()
          let promise2 = copyRequestPromise()


          Promise.all([promise1, promise2]).then(results => {
            assert.strictEqual(results.length, 2);
            assert.strictEqual(results[0]['headers']['x-trans-id'].length > 0, true);
            assert.strictEqual(results[0]['headers']['x-openstack-request-id'].length > 0, true);
            assert.strictEqual(results[0]['headers']['content-length'] === '0', true);
            assert.strictEqual(results[0]['headers']['date'].length > 0, true);
            assert.strictEqual(results[0]['body'].toString(), 'OK');
            assert.strictEqual(results[0]['statusCode'], 200);
            assert.strictEqual(results[1]['headers']['x-trans-id'].length > 0, true);
            assert.strictEqual(results[1]['headers']['x-openstack-request-id'].length > 0, true);
            assert.strictEqual(results[1]['headers']['content-length'] === '0', true);
            assert.strictEqual(results[1]['headers']['date'].length > 0, true);
            assert.strictEqual(results[1]['body'].toString(), 'OK');
            assert.strictEqual(results[1]['statusCode'], 200);
            assert.deepStrictEqual(storage.getConfig().activeStorage, 1);
            assert.strictEqual(firstNock.pendingMocks().length, 0);
            assert.strictEqual(secondNock.pendingMocks().length, 0);
            assert.strictEqual(thirdNock.pendingMocks().length, 0);
            done();
          }).catch(err => {
            assert.strictEqual(err, null);
            done();
          });
        });

        it('should request the object storage in parallel and fallback to SBG if the authentication of the main storage return an error', function (done) {

          let firstNock = nock(publicUrlGRA)
            .matchHeader('x-object-meta-locationorigin', 'Paris/France')
            .matchHeader('Content-Type', 'image/jpeg')
            .matchHeader('X-Delete-At', 1440619048)
            .intercept("/templates/test.odt", "COPY")
            .reply(401, 'Unauthorized')
            .intercept("/templates/test.odt", "COPY")
            .reply(401, 'Unauthorized')
            .intercept("/templates/test.odt", "COPY")
            .reply(401, 'Unauthorized')

          let secondNock = nock(authURL)
            .post('/auth/tokens')
            .reply(500, {})
            .post('/auth/tokens')
            .reply(500, {})
            .post('/auth/tokens')
            .reply(500, {})
            .post('/auth/tokens')
            .reply(200, connectionResultSuccessV3, { "X-Subject-Token": tokenAuth })
            .post('/auth/tokens')
            .reply(200, connectionResultSuccessV3, { "X-Subject-Token": tokenAuth })
            .post('/auth/tokens')
            .reply(200, connectionResultSuccessV3, { "X-Subject-Token": tokenAuth });

          let thirdNock = nock(publicUrlSBG)
            .matchHeader('x-object-meta-locationorigin', 'Paris/France')
            .matchHeader('Content-Type', 'image/jpeg')
            .matchHeader('X-Delete-At', 1440619048)
            .defaultReplyHeaders({
              'content-length': '0',
              'date': 'Wed, 03 Nov 2021 14:28:48 GMT',
              'x-trans-id': 'tx37ea34dcd1ed48ca9bc7d-0052d84b6f',
              'x-openstack-request-id': 'tx136c028c478a4b40a7014-0061829c9f',
            })
            .intercept("/templates/test.odt", "COPY")
            .reply(200, 'OK')
            .intercept("/templates/test.odt", "COPY")
            .reply(200, 'OK')
            .intercept("/templates/test.odt", "COPY")
            .reply(200, 'OK')
            .intercept("/templates/test.odt", "COPY")
            .reply(200, 'OK')

          let promise1 = copyRequestPromise()
          let promise2 = copyRequestPromise()
          let promise3 = copyRequestPromise()

          Promise.all([promise1, promise2, promise3]).then(async results => {

            assert.strictEqual(results.length, 3);
            assert.strictEqual(results[0]['headers']['x-trans-id'].length > 0, true);
            assert.strictEqual(results[0]['headers']['x-openstack-request-id'].length > 0, true);
            assert.strictEqual(results[0]['headers']['content-length'] === '0', true);
            assert.strictEqual(results[0]['headers']['date'].length > 0, true);
            assert.strictEqual(results[0]['body'].toString(), 'OK');
            assert.strictEqual(results[0]['statusCode'], 200);
            assert.strictEqual(results[1]['headers']['x-trans-id'].length > 0, true);
            assert.strictEqual(results[1]['headers']['x-openstack-request-id'].length > 0, true);
            assert.strictEqual(results[1]['headers']['content-length'] === '0', true);
            assert.strictEqual(results[1]['headers']['date'].length > 0, true);
            assert.strictEqual(results[1]['body'].toString(), 'OK');
            assert.strictEqual(results[1]['statusCode'], 200);
            assert.strictEqual(results[2]['headers']['x-trans-id'].length > 0, true);
            assert.strictEqual(results[2]['headers']['x-openstack-request-id'].length > 0, true);
            assert.strictEqual(results[2]['headers']['content-length'] === '0', true);
            assert.strictEqual(results[2]['headers']['date'].length > 0, true);
            assert.strictEqual(results[2]['body'].toString(), 'OK');
            assert.strictEqual(results[2]['statusCode'], 200);


            let _result3 = await copyRequestPromise();
            assert.strictEqual(_result3['headers']['x-trans-id'].length > 0, true);
            assert.strictEqual(_result3['headers']['x-openstack-request-id'].length > 0, true);
            assert.strictEqual(_result3['headers']['content-length'] === '0', true);
            assert.strictEqual(_result3['headers']['date'].length > 0, true);
            assert.strictEqual(_result3['body'].toString(), 'OK');
            assert.strictEqual(_result3['statusCode'], 200);

            assert.deepStrictEqual(storage.getConfig().activeStorage, 1);
            assert.strictEqual(firstNock.pendingMocks().length, 0);
            assert.strictEqual(secondNock.pendingMocks().length, 0);
            assert.strictEqual(thirdNock.pendingMocks().length, 0);
            done();
          });
        });

        it('should request the object storage in parallel and fallback to SBG if the main storage timeout', function (done) {
          storage.setTimeout(200);

          let firstNock = nock(publicUrlGRA)
            .matchHeader('x-object-meta-locationorigin', 'Paris/France')
            .matchHeader('Content-Type', 'image/jpeg')
            .matchHeader('X-Delete-At', 1440619048)
            .intercept("/templates/test.odt", "COPY")
            .delayConnection(500)
            .reply(200, 'NOT OK')
            .intercept("/templates/test.odt", "COPY")
            .delayConnection(500)
            .reply(200, 'NOT OK');

          let secondNock = nock(authURL)
            .post('/auth/tokens')
            .reply(200, connectionResultSuccessV3, { "X-Subject-Token": tokenAuth })
            .post('/auth/tokens')
            .reply(200, connectionResultSuccessV3, { "X-Subject-Token": tokenAuth });

          let thirdNock = nock(publicUrlSBG)
            .matchHeader('x-object-meta-locationorigin', 'Paris/France')
            .matchHeader('Content-Type', 'image/jpeg')
            .matchHeader('X-Delete-At', 1440619048)
            .defaultReplyHeaders({
              'content-length': '0',
              'date': 'Wed, 03 Nov 2021 14:28:48 GMT',
              'x-trans-id': 'tx37ea34dcd1ed48ca9bc7d-0052d84b6f',
              'x-openstack-request-id': 'tx136c028c478a4b40a7014-0061829c9f',
            })
            .intercept("/templates/test.odt", "COPY")
            .reply(200, 'OK')
            .intercept("/templates/test.odt", "COPY")
            .reply(200, 'OK')


          let promise1 = copyRequestPromise()
          let promise2 = copyRequestPromise()


          Promise.all([promise1, promise2]).then(results => {
            assert.strictEqual(results.length, 2);
            assert.strictEqual(results[0]['headers']['x-trans-id'].length > 0, true);
            assert.strictEqual(results[0]['headers']['x-openstack-request-id'].length > 0, true);
            assert.strictEqual(results[0]['headers']['content-length'] === '0', true);
            assert.strictEqual(results[0]['headers']['date'].length > 0, true);
            assert.strictEqual(results[0]['body'].toString(), 'OK');
            assert.strictEqual(results[0]['statusCode'], 200);
            assert.strictEqual(results[1]['headers']['x-trans-id'].length > 0, true);
            assert.strictEqual(results[1]['headers']['x-openstack-request-id'].length > 0, true);
            assert.strictEqual(results[1]['headers']['content-length'] === '0', true);
            assert.strictEqual(results[1]['headers']['date'].length > 0, true);
            assert.strictEqual(results[1]['body'].toString(), 'OK');
            assert.strictEqual(results[1]['statusCode'], 200);

            assert.deepStrictEqual(storage.getConfig().activeStorage, 1);
            assert.strictEqual(firstNock.pendingMocks().length, 0);
            assert.strictEqual(secondNock.pendingMocks().length, 0);
            assert.strictEqual(thirdNock.pendingMocks().length, 0);
            done();
          }).catch(err => {
            assert.strictEqual(err, null);
            done();
          });
        });

        it('should request the object storage in parallel and fallback to SBG if the main storage return a 500 error', function (done) {

          let firstNock = nock(publicUrlGRA)
            .matchHeader('x-object-meta-locationorigin', 'Paris/France')
            .matchHeader('Content-Type', 'image/jpeg')
            .matchHeader('X-Delete-At', 1440619048)
            .intercept("/templates/test.odt", "COPY")
            .reply(500, {})
            .intercept("/templates/test.odt", "COPY")
            .reply(500, {});

          let secondNock = nock(authURL)
            .post('/auth/tokens')
            .reply(200, connectionResultSuccessV3, { "X-Subject-Token": tokenAuth })
            .post('/auth/tokens')
            .reply(200, connectionResultSuccessV3, { "X-Subject-Token": tokenAuth });

          let thirdNock = nock(publicUrlSBG)
            .matchHeader('x-object-meta-locationorigin', 'Paris/France')
            .matchHeader('Content-Type', 'image/jpeg')
            .matchHeader('X-Delete-At', 1440619048)
            .defaultReplyHeaders({
              'content-length': '0',
              'date': 'Wed, 03 Nov 2021 14:28:48 GMT',
              'x-trans-id': 'tx37ea34dcd1ed48ca9bc7d-0052d84b6f',
              'x-openstack-request-id': 'tx136c028c478a4b40a7014-0061829c9f',
            })
            .intercept("/templates/test.odt", "COPY")
            .reply(200, 'OK')
            .intercept("/templates/test.odt", "COPY")
            .reply(200, 'OK')

          let promise1 = copyRequestPromise()
          let promise2 = copyRequestPromise()


          Promise.all([promise1, promise2]).then(results => {
            assert.strictEqual(results.length, 2);
            assert.strictEqual(results[0]['headers']['x-trans-id'].length > 0, true);
            assert.strictEqual(results[0]['headers']['x-openstack-request-id'].length > 0, true);
            assert.strictEqual(results[0]['headers']['content-length'] === '0', true);
            assert.strictEqual(results[0]['headers']['date'].length > 0, true);
            assert.strictEqual(results[0]['body'].toString(), 'OK');
            assert.strictEqual(results[0]['statusCode'], 200);
            assert.strictEqual(results[1]['headers']['x-trans-id'].length > 0, true);
            assert.strictEqual(results[1]['headers']['x-openstack-request-id'].length > 0, true);
            assert.strictEqual(results[1]['headers']['content-length'] === '0', true);
            assert.strictEqual(results[1]['headers']['date'].length > 0, true);
            assert.strictEqual(results[1]['body'].toString(), 'OK');
            assert.strictEqual(results[1]['statusCode'], 200);

            assert.deepStrictEqual(storage.getConfig().activeStorage, 1);
            assert.strictEqual(firstNock.pendingMocks().length, 0);
            assert.strictEqual(secondNock.pendingMocks().length, 0);
            assert.strictEqual(thirdNock.pendingMocks().length, 0);
            done();
          }).catch(err => {
            assert.strictEqual(err, null);
            done();
          });
        });

      });
    });
  });
  describe('Request [Stream]', function () {

    describe("SINGLE STORAGE", function () {
      it('should receive a file from a stream', function (done) {
        const firstNock = nock(publicUrlGRA)
          .get('/templates/file.txt')
          .reply(200, fileTxt);

        assert.strictEqual(dataStream, '');
        storage.request('GET', '/templates/file.txt', { output : outputStreamFunction }, (err, resp) => {
          assert.strictEqual(err, null);
          assert.strictEqual(firstNock.pendingMocks().length, 0);
          assert.strictEqual(dataStream, 'The platypus, sometimes referred to as the duck-billed platypus, is a semiaquatic, egg-laying mammal endemic to eastern Australia.');
          assert.strictEqual(resp.statusCode, 200);
          assert.strictEqual(JSON.stringify(resp.headers), '{}');
          dataStream = '';
          done();
        });
      });

      it('should reconnect automatically if the token is invalid and retry', function (done) {

        let firstNock = nock(publicUrlGRA)
          .intercept("/templates/file.txt", "GET")
          .reply(401, 'Unauthorized')
          .intercept("/templates/file.txt", "GET")
          .reply(200, fileTxt);

        let secondNock = nock(authURL)
          .post('/auth/tokens')
          .reply(200, connectionResultSuccessV3, { "X-Subject-Token": tokenAuth });

        assert.strictEqual(dataStream, '');
        storage.request('GET', '/templates/file.txt', { output : outputStreamFunction }, (err, resp) => {
          assert.strictEqual(err, null);
          assert.strictEqual(firstNock.pendingMocks().length, 0);
          assert.strictEqual(secondNock.pendingMocks().length, 0);
          assert.strictEqual(dataStream, 'The platypus, sometimes referred to as the duck-billed platypus, is a semiaquatic, egg-laying mammal endemic to eastern Australia.');
          assert.strictEqual(resp.statusCode, 200);
          assert.strictEqual(JSON.stringify(resp.headers), '{}');
          done();
        });
      });

      it('should return an error if the single storage timeout', function (done) {
        storage.setTimeout(200);
        const firstNock = nock(publicUrlGRA)
          .get('/templates/file.txt')
          .delayConnection(500)
          .reply(200, fileTxt);

        storage.request('GET', '/templates/file.txt', { output : outputStreamFunction }, (err, res) => {
          assert.notStrictEqual(err, null);
          assert.strictEqual(err.message, 'Object Storages are not available');
          assert.strictEqual(res, undefined);
          assert.strictEqual(firstNock.pendingMocks().length, 0);
          done();
        });
      });

      it('should return an error if containers or the file does not exists', function (done) {
        const firstNock = nock(publicUrlGRA)
          .intercept("/templates/file.txt", "GET")
          .reply(404);

        storage.request('GET', '/templates/file.txt', { output : outputStreamFunction }, (err, res) => {
          assert.strictEqual(err, null);
          assert.strictEqual(res.statusCode, 404);
          assert.strictEqual(JSON.stringify(res.headers), '{}');
          assert.strictEqual(firstNock.pendingMocks().length, 0);
          done();
        });
      });

      it('should return an error if the single storage return any kind of errors', function (done) {
        const firstNock = nock(publicUrlGRA)
          .intercept("/templates/file.txt", "GET")
          .replyWithError('Error Message 1234');

        storage.request('GET', '/templates/file.txt', { output : outputStreamFunction }, (err, res) => {
          assert.notStrictEqual(err, null);
          assert.strictEqual(err.message, 'Object Storages are not available');
          assert.strictEqual(res, undefined);
          assert.strictEqual(firstNock.pendingMocks().length, 0);
          done();
        });
      });
    })

    describe("MULTIPLE STORAGES", function () {

      beforeEach(function (done) {
        const firstNock = nock(authURL)
            .post('/auth/tokens')
            .reply(200, connectionResultSuccessV3, { "X-Subject-Token": tokenAuth });

        storage.setTimeout(5000);
        storage.setStorages([{
          username                     : 'storage-1-user',
          password                     : 'storage-1-password',
          authUrl                      : authURL,
          tenantName                   : 'storage-1-tenant',
          region                       : 'GRA'
        },
        {
          username                     : 'storage-2-user',
          password                     : 'storage-2-password',
          authUrl                      : authURL,
          tenantName                   : 'storage-2-tenant',
          region                       : 'SBG'
        }]);
        storage.connection((err) => {
          assert.strictEqual(err, null)
          assert.strictEqual(firstNock.pendingMocks().length, 0);
          done();
        })
      })

      it('should reconnect automatically to the second object storage if the first storage authentication fail and should retry the request', function(done){

        let firstNock = nock(publicUrlGRA)
          /** 1 */
          .intercept('/templates/file.txt', "GET")
          .reply(401, 'Unauthorized')

        let secondNock = nock(authURL)
          /** 2 */
          .post('/auth/tokens')
          .reply(500, {})
          /** 3 */
          .post('/auth/tokens')
          .reply(200, connectionResultSuccessV3, { "X-Subject-Token": tokenAuth });

        let thirdNock = nock(publicUrlSBG)
          /** 4 */
          .intercept('/templates/file.txt', "GET")
          .reply(200, fileTxt);

        assert.strictEqual(dataStream, '')
        storage.request('GET', '/templates/file.txt', { output : outputStreamFunction }, (err, res) => {
          assert.strictEqual(err, null);
          assert.strictEqual(firstNock.pendingMocks().length, 0);
          assert.strictEqual(secondNock.pendingMocks().length, 0);
          assert.strictEqual(thirdNock.pendingMocks().length, 0);
          assert.strictEqual(dataStream, 'The platypus, sometimes referred to as the duck-billed platypus, is a semiaquatic, egg-laying mammal endemic to eastern Australia.');
          assert.strictEqual(res.statusCode, 200);
          assert.strictEqual(JSON.stringify(res.headers), '{}');
          dataStream = '';
          done();
        });
      })

      it('should retry the request with the second object storage if the first object storage return a 500 error', function(done){

        let firstNock = nock(publicUrlGRA)
          .intercept('/templates/file.txt', "GET")
          .reply(500, {});

        let secondNock = nock(authURL)
          .post('/auth/tokens')
          .reply(200, connectionResultSuccessV3, { "X-Subject-Token": tokenAuth });

        let thirdNock = nock(publicUrlSBG)
          .intercept('/templates/file.txt', "GET")
          .reply(200, fileTxt);

        assert.strictEqual(dataStream, '');
        storage.request('GET', '/templates/file.txt', { output : outputStreamFunction }, (err, res) => {
          assert.strictEqual(err, null);
          assert.strictEqual(firstNock.pendingMocks().length, 0);
          assert.strictEqual(secondNock.pendingMocks().length, 0);
          assert.strictEqual(thirdNock.pendingMocks().length, 0);
          assert.strictEqual(dataStream, 'The platypus, sometimes referred to as the duck-billed platypus, is a semiaquatic, egg-laying mammal endemic to eastern Australia.');
          assert.strictEqual(res.statusCode, 200);
          assert.strictEqual(JSON.stringify(res.headers), '{}');
          dataStream = '';
          done();
        });
      })



      it('should retry the request with the second object storage if the first object storage timeout', function(done){
        storage.setTimeout(10);
        let firstNock = nock(publicUrlGRA)
          .intercept('/templates/file.txt', "GET")
          .delayConnection(500)
          .reply(200);

        let secondNock = nock(authURL)
          .post('/auth/tokens')
          .reply(200, connectionResultSuccessV3, { "X-Subject-Token": tokenAuth });

        let thirdNock = nock(publicUrlSBG)
          .intercept('/templates/file.txt', "GET")
          .reply(200, fileTxt);

        assert.strictEqual(dataStream, '');
        storage.request('GET', '/templates/file.txt', { output : outputStreamFunction }, (err, res) => {
          assert.strictEqual(err, null);
          assert.strictEqual(firstNock.pendingMocks().length, 0);
          assert.strictEqual(secondNock.pendingMocks().length, 0);
          assert.strictEqual(thirdNock.pendingMocks().length, 0);
          assert.strictEqual(dataStream, 'The platypus, sometimes referred to as the duck-billed platypus, is a semiaquatic, egg-laying mammal endemic to eastern Australia.');
          assert.strictEqual(res.statusCode, 200);
          assert.strictEqual(JSON.stringify(res.headers), '{}');
          dataStream = '';
          done();
        });
      })

      it('should retry the request with the second storage if the first storage return any kind of errors', function (done) {

        let firstNock = nock(publicUrlGRA)
          .intercept('/templates/file.txt', "GET")
          .replyWithError('Error Message 1234');

        let secondNock = nock(authURL)
          .post('/auth/tokens')
          .reply(200, connectionResultSuccessV3, { "X-Subject-Token": tokenAuth });

        let thirdNock = nock(publicUrlSBG)
          .intercept('/templates/file.txt', "GET")
          .reply(200, fileTxt);


        assert.strictEqual(dataStream, '');
        storage.request('GET', '/templates/file.txt', { output : outputStreamFunction }, (err, res) => {
          assert.strictEqual(err, null);
          assert.strictEqual(firstNock.pendingMocks().length, 0);
          assert.strictEqual(secondNock.pendingMocks().length, 0);
          assert.strictEqual(thirdNock.pendingMocks().length, 0);
          assert.strictEqual(dataStream, 'The platypus, sometimes referred to as the duck-billed platypus, is a semiaquatic, egg-laying mammal endemic to eastern Australia.');
          assert.strictEqual(res.statusCode, 200);
          assert.strictEqual(JSON.stringify(res.headers), '{}');
          dataStream = '';
          done();
        });
      });

      describe("PARALLEL REQUESTS", function () {

        function copyRequestPromise(index) {
          return new Promise((resolve, reject) => {
            storage.request('GET', '/templates/file.txt', { output: getOutputStreamFunction(index) }, (err) => {
              if (err) {
                return reject(err);
              }
              return resolve({ body: _dataStreams[index] });
            });
          });
        }

        it('should request the object storage in parallel and fallback to SBG if the main storage return any kind of errors', function (done) {

          let firstNock = nock(publicUrlGRA)
            .intercept('/templates/file.txt', "GET")
            .replyWithError('Error Message 1234')
            .intercept('/templates/file.txt', "GET")
            .replyWithError('Error Message 1234');

          let secondNock = nock(authURL)
            .post('/auth/tokens')
            .reply(200, connectionResultSuccessV3, { "X-Subject-Token": tokenAuth })
            .post('/auth/tokens')
            .reply(200, connectionResultSuccessV3, { "X-Subject-Token": tokenAuth });


          let thirdNock = nock(publicUrlSBG)
            .intercept('/templates/file.txt', "GET")
            .reply(200, function() {
              return fileTxt;
            })
            .intercept('/templates/file.txt', "GET")
            .reply(200, function() {
              return fileTxt;
            });

          let promise1 = copyRequestPromise(0)
          let promise2 = copyRequestPromise(1)


          Promise.all([promise1, promise2]).then(results => {
            assert.strictEqual(results.length, 2);
            assert.strictEqual(results[0].body, 'The platypus, sometimes referred to as the duck-billed platypus, is a semiaquatic, egg-laying mammal endemic to eastern Australia.');
            assert.strictEqual(results[1].body, 'The platypus, sometimes referred to as the duck-billed platypus, is a semiaquatic, egg-laying mammal endemic to eastern Australia.');
            assert.deepStrictEqual(storage.getConfig().activeStorage, 1);
            assert.strictEqual(firstNock.pendingMocks().length, 0);
            assert.strictEqual(secondNock.pendingMocks().length, 0);
            assert.strictEqual(thirdNock.pendingMocks().length, 0);
            resetDataStreams();
            done();
          }).catch(err => {
            assert.strictEqual(err, null);
            done();
          });
        });

        it('should request the object storage in parallel and fallback to SBG if the authentication of the main storage return an error', function (done) {

          let firstNock = nock(publicUrlGRA)
            .intercept('/templates/file.txt', "GET")
            .reply(401, 'Unauthorized')
            .intercept('/templates/file.txt', "GET")
            .reply(401, 'Unauthorized')
            .intercept('/templates/file.txt', "GET")
            .reply(401, 'Unauthorized')

          let secondNock = nock(authURL)
            .post('/auth/tokens')
            .reply(500, {})
            .post('/auth/tokens')
            .reply(500, {})
            .post('/auth/tokens')
            .reply(500, {})
            .post('/auth/tokens')
            .reply(200, connectionResultSuccessV3, { "X-Subject-Token": tokenAuth })
            .post('/auth/tokens')
            .reply(200, connectionResultSuccessV3, { "X-Subject-Token": tokenAuth })
            .post('/auth/tokens')
            .reply(200, connectionResultSuccessV3, { "X-Subject-Token": tokenAuth });

          let thirdNock = nock(publicUrlSBG)
            .intercept('/templates/file.txt', "GET")
            .reply(200, fileTxt)
            .intercept('/templates/file.txt', "GET")
            .reply(200, fileTxt)
            .intercept('/templates/file.txt', "GET")
            .reply(200, fileTxt)
            .intercept('/templates/file.txt', "GET")
            .reply(200, fileTxt)

          let promise1 = copyRequestPromise(0)
          let promise2 = copyRequestPromise(1)
          let promise3 = copyRequestPromise(2)

          Promise.all([promise1, promise2, promise3]).then(async results => {

            assert.strictEqual(results.length, 3);
            assert.strictEqual(results[0].body, 'The platypus, sometimes referred to as the duck-billed platypus, is a semiaquatic, egg-laying mammal endemic to eastern Australia.');
            assert.strictEqual(results[1].body, 'The platypus, sometimes referred to as the duck-billed platypus, is a semiaquatic, egg-laying mammal endemic to eastern Australia.');
            assert.strictEqual(results[2].body, 'The platypus, sometimes referred to as the duck-billed platypus, is a semiaquatic, egg-laying mammal endemic to eastern Australia.');


            let _result3 = await copyRequestPromise(3);
            assert.strictEqual(_result3.body, 'The platypus, sometimes referred to as the duck-billed platypus, is a semiaquatic, egg-laying mammal endemic to eastern Australia.');

            assert.deepStrictEqual(storage.getConfig().activeStorage, 1);
            assert.strictEqual(firstNock.pendingMocks().length, 0);
            assert.strictEqual(secondNock.pendingMocks().length, 0);
            assert.strictEqual(thirdNock.pendingMocks().length, 0);
            resetDataStreams();
            done();
          });
        });

        it('should request the object storage in parallel and fallback to SBG if the main storage timeout', function (done) {
          storage.setTimeout(10);

          let firstNock = nock(publicUrlGRA)
            .intercept('/templates/file.txt', "GET")
            .delayConnection(100)
            .reply(200)
            .intercept('/templates/file.txt', "GET")
            .delayConnection(100)
            .reply(200);

          let secondNock = nock(authURL)
            .post('/auth/tokens')
            .reply(200, connectionResultSuccessV3, { "X-Subject-Token": tokenAuth })
            .post('/auth/tokens')
            .reply(200, connectionResultSuccessV3, { "X-Subject-Token": tokenAuth });

          let thirdNock = nock(publicUrlSBG)
            .intercept('/templates/file.txt', "GET")
            .reply(200, fileTxt)
            .intercept('/templates/file.txt', "GET")
            .reply(200, fileTxt)


          let promise1 = copyRequestPromise(0)
          let promise2 = copyRequestPromise(1)


          Promise.all([promise1, promise2]).then(results => {
            assert.strictEqual(results.length, 2);
            assert.strictEqual(results[0].body, 'The platypus, sometimes referred to as the duck-billed platypus, is a semiaquatic, egg-laying mammal endemic to eastern Australia.');
            assert.strictEqual(results[1].body, 'The platypus, sometimes referred to as the duck-billed platypus, is a semiaquatic, egg-laying mammal endemic to eastern Australia.');
            assert.deepStrictEqual(storage.getConfig().activeStorage, 1);
            assert.strictEqual(firstNock.pendingMocks().length, 0);
            assert.strictEqual(secondNock.pendingMocks().length, 0);
            assert.strictEqual(thirdNock.pendingMocks().length, 0);
            resetDataStreams();
            done();
          }).catch(err => {
            assert.strictEqual(err, null);
            done();
          });
        });

        it('should request the object storage in parallel and fallback to SBG if the main storage return a 500 error', function (done) {

          let firstNock = nock(publicUrlGRA)
            .intercept('/templates/file.txt', "GET")
            .reply(500)
            .intercept('/templates/file.txt', "GET")
            .reply(500);

          let secondNock = nock(authURL)
            .post('/auth/tokens')
            .reply(200, connectionResultSuccessV3, { "X-Subject-Token": tokenAuth })
            .post('/auth/tokens')
            .reply(200, connectionResultSuccessV3, { "X-Subject-Token": tokenAuth });

          let thirdNock = nock(publicUrlSBG)
            .intercept('/templates/file.txt', "GET")
            .reply(200, fileTxt)
            .intercept('/templates/file.txt', "GET")
            .reply(200, fileTxt)

          let promise1 = copyRequestPromise(0)
          let promise2 = copyRequestPromise(1)


          Promise.all([promise1, promise2]).then(results => {
            assert.strictEqual(results.length, 2);
            assert.strictEqual(results[0].body, 'The platypus, sometimes referred to as the duck-billed platypus, is a semiaquatic, egg-laying mammal endemic to eastern Australia.');
            assert.strictEqual(results[1].body, 'The platypus, sometimes referred to as the duck-billed platypus, is a semiaquatic, egg-laying mammal endemic to eastern Australia.');

            assert.deepStrictEqual(storage.getConfig().activeStorage, 1);
            assert.strictEqual(firstNock.pendingMocks().length, 0);
            assert.strictEqual(secondNock.pendingMocks().length, 0);
            assert.strictEqual(thirdNock.pendingMocks().length, 0);
            resetDataStreams();
            done();
          }).catch(err => {
            assert.strictEqual(err, null);
            done();
          });
        });

      });
    });
  });
  describe('global.rockReqConf', function() {
    it("should set rock-req default values", function(done) {
      assert.strictEqual(storage.getRockReqDefaults().retryDelay, 200);
      done();
    })
  })
});

let connectionResultSuccessV3 = {
  "token": {
    "is_domain": false,
    "methods": [
      "password"
    ],
    "roles": [
      {
        "id": "9fe2ff9ee4384b1894a90878d3e92bab",
        "name": "_member_"
      },
      {
        "id": "9543e89aeb484aee8ec7d01e87223b16",
        "name": "objectstore_operator"
      }
    ],
    "is_admin_project": false,
    "project": {
      "domain": {
        "id": "default",
        "name": "Default"
      },
      "id": "ce3e510224d740a685cb0ae7bdb8ebc3",
      "name": "9865153001950111"
    },
    "catalog": [
      {
        "endpoints": [
          {
            "region_id": "UK1",
            "url": "https://network.compute.uk1.cloud.ovh.net/",
            "region": "UK1",
            "interface": "internal",
            "id": "14582a3f48f240bb855a641d085b48d3"
          },
          {
            "region_id": "WAW1",
            "url": "https://network.compute.waw1.cloud.ovh.net/",
            "region": "WAW1",
            "interface": "public",
            "id": "1736e066ec40430692670a2bb409d438"
          },
          {
            "region_id": "WAW1",
            "url": "https://network.compute.waw1.cloud.ovh.net/",
            "region": "WAW1",
            "interface": "admin",
            "id": "183ee921d5c7448ba692345f6befc905"
          },
          {
            "region_id": "BHS3",
            "url": "https://network.compute.bhs3.cloud.ovh.net/",
            "region": "BHS3",
            "interface": "internal",
            "id": "24c1bc0fe2f84d4e8810d9efe771e7cc"
          },
          {
            "region_id": "BHS3",
            "url": "https://network.compute.bhs3.cloud.ovh.net/",
            "region": "BHS3",
            "interface": "admin",
            "id": "26b02d41bef046cf8f4c1ad0b2f81e70"
          },
          {
            "region_id": "SBG5",
            "url": "https://network.compute.sbg5.cloud.ovh.net/",
            "region": "SBG5",
            "interface": "public",
            "id": "2731888667ab4c35a69cfa1cec458915"
          },
          {
            "region_id": "UK1",
            "url": "https://network.compute.uk1.cloud.ovh.net/",
            "region": "UK1",
            "interface": "admin",
            "id": "3f0a0e956fdf4e6bb2f54a20c2a4baad"
          },
          {
            "region_id": "SBG5",
            "url": "https://network.compute.sbg5.cloud.ovh.net/",
            "region": "SBG5",
            "interface": "internal",
            "id": "6119301b3e1d40049f9090cd4556f2a8"
          },
          {
            "region_id": "DE1",
            "url": "https://network.compute.de1.cloud.ovh.net/",
            "region": "DE1",
            "interface": "internal",
            "id": "6826ae22962446319d95f6b31c5be487"
          },
          {
            "region_id": "WAW1",
            "url": "https://network.compute.waw1.cloud.ovh.net/",
            "region": "WAW1",
            "interface": "internal",
            "id": "77346ed591814729862b0225414c620c"
          },
          {
            "region_id": "GRA5",
            "url": "https://network.compute.gra5.cloud.ovh.net/",
            "region": "GRA5",
            "interface": "internal",
            "id": "7ddeea0bb2fc409db636b386f3bcb2e5"
          },
          {
            "region_id": "GRA5",
            "url": "https://network.compute.gra5.cloud.ovh.net/",
            "region": "GRA5",
            "interface": "admin",
            "id": "8438311e7c3e4af59af8fbe3bb77117f"
          },
          {
            "region_id": "BHS3",
            "url": "https://network.compute.bhs3.cloud.ovh.net/",
            "region": "BHS3",
            "interface": "public",
            "id": "89c1127a01fe415aae8a211729f28479"
          },
          {
            "region_id": "UK1",
            "url": "https://network.compute.uk1.cloud.ovh.net/",
            "region": "UK1",
            "interface": "public",
            "id": "a1f919e87a984f8895fa6d20a01f4776"
          },
          {
            "region_id": "SYD1",
            "url": "https://network.compute.syd1.cloud.ovh.net/",
            "region": "SYD1",
            "interface": "public",
            "id": "bf10ea3746e142b8a87ed47a65da5191"
          },
          {
            "region_id": "SBG5",
            "url": "https://network.compute.sbg5.cloud.ovh.net/",
            "region": "SBG5",
            "interface": "admin",
            "id": "c6a65b0b86ee463c927a7827692725e0"
          },
          {
            "region_id": "DE1",
            "url": "https://network.compute.de1.cloud.ovh.net/",
            "region": "DE1",
            "interface": "public",
            "id": "c7106a5c768e4030bebc5348a91c5479"
          },
          {
            "region_id": "GRA5",
            "url": "https://network.compute.gra5.cloud.ovh.net/",
            "region": "GRA5",
            "interface": "public",
            "id": "cbaa436ce574446790d7c4d12899003b"
          },
          {
            "region_id": "SGP1",
            "url": "https://network.compute.sgp1.cloud.ovh.net/",
            "region": "SGP1",
            "interface": "public",
            "id": "e536ddff62f94dfebf62e4a77a917571"
          },
          {
            "region_id": "DE1",
            "url": "https://network.compute.de1.cloud.ovh.net/",
            "region": "DE1",
            "interface": "admin",
            "id": "ebaf7de30b2f401c81a4586ad0447b3a"
          }
        ],
        "type": "network",
        "id": "0be6ed3dce244b8295ff643739a86809",
        "name": "neutron"
      },
      {
        "endpoints": [
          {
            "region_id": "WAW1",
            "url": "https://cloudformation.waw1.cloud.ovh.net/v1",
            "region": "WAW1",
            "interface": "public",
            "id": "1e2c8272006e4ca886102b779901d3bc"
          },
          {
            "region_id": "UK1",
            "url": "https://cloudformation.uk1.cloud.ovh.net/v1",
            "region": "UK1",
            "interface": "internal",
            "id": "4f936f29ff63444db501db071e69fe9b"
          },
          {
            "region_id": "DE1",
            "url": "https://cloudformation.de1.cloud.ovh.net/v1",
            "region": "DE1",
            "interface": "public",
            "id": "5bf6ebe811c94d03b26434c68019e4bb"
          },
          {
            "region_id": "UK1",
            "url": "https://cloudformation.uk1.cloud.ovh.net/v1",
            "region": "UK1",
            "interface": "admin",
            "id": "61862d2db9514c8aa56131e4fae535e4"
          },
          {
            "region_id": "GRA5",
            "url": "https://cloudformation.gra5.cloud.ovh.net/v1",
            "region": "GRA5",
            "interface": "admin",
            "id": "66657fe6abb34c9cb2767d159f10558b"
          },
          {
            "region_id": "WAW1",
            "url": "https://cloudformation.waw1.cloud.ovh.net/v1",
            "region": "WAW1",
            "interface": "internal",
            "id": "705237f11e934046a8c9188033a5cf0b"
          },
          {
            "region_id": "SBG5",
            "url": "https://cloudformation.sbg5.cloud.ovh.net/v1",
            "region": "SBG5",
            "interface": "admin",
            "id": "76fd6ef076704f74bc7b0a9dbcdb5570"
          },
          {
            "region_id": "GRA5",
            "url": "https://cloudformation.gra5.cloud.ovh.net/v1",
            "region": "GRA5",
            "interface": "internal",
            "id": "824cf22ffb7941ee835c192564abf147"
          },
          {
            "region_id": "DE1",
            "url": "https://cloudformation.de1.cloud.ovh.net/v1",
            "region": "DE1",
            "interface": "admin",
            "id": "9f2a843e28124687aa78233890310b3f"
          },
          {
            "region_id": "UK1",
            "url": "https://cloudformation.uk1.cloud.ovh.net/v1",
            "region": "UK1",
            "interface": "public",
            "id": "be2637dc78914e0ea79b75d03d34d134"
          },
          {
            "region_id": "DE1",
            "url": "https://cloudformation.de1.cloud.ovh.net/v1",
            "region": "DE1",
            "interface": "internal",
            "id": "c518a58526a6419793061606efa23a18"
          },
          {
            "region_id": "GRA5",
            "url": "https://cloudformation.gra5.cloud.ovh.net/v1",
            "region": "GRA5",
            "interface": "public",
            "id": "cbf95c928b0149fbad36d38866c1ab59"
          },
          {
            "region_id": "WAW1",
            "url": "https://cloudformation.waw1.cloud.ovh.net/v1",
            "region": "WAW1",
            "interface": "admin",
            "id": "cd8a310c92c34941badaa5ae9648e9a9"
          },
          {
            "region_id": "SBG5",
            "url": "https://cloudformation.sbg5.cloud.ovh.net/v1",
            "region": "SBG5",
            "interface": "internal",
            "id": "ce3503b6ea164f80b0347275b549e91b"
          },
          {
            "region_id": "SBG5",
            "url": "https://cloudformation.sbg5.cloud.ovh.net/v1",
            "region": "SBG5",
            "interface": "public",
            "id": "ffe7b704358e435883fd10707aa95c4f"
          }
        ],
        "type": "cloudformation",
        "id": "12890c0a1d2545dfb8706a7840ad6d8e",
        "name": "heat-cfn"
      },
      {
        "endpoints": [
          {
            "region_id": "SYD1",
            "url": "https://auth.cloud.ovh.net/",
            "region": "SYD1",
            "interface": "public",
            "id": "057ebb575b3542a7aa8f4a920efd4729"
          },
          {
            "region_id": "UK",
            "url": "https://auth.cloud.ovh.net:35357/",
            "region": "UK",
            "interface": "admin",
            "id": "0710f13f8cd0489aa2220e0d7db15838"
          },
          {
            "region_id": "WAW1",
            "url": "https://auth.cloud.ovh.net/",
            "region": "WAW1",
            "interface": "internal",
            "id": "0d633045a18847068feeee1bda60a683"
          },
          {
            "region_id": "SBG",
            "url": "https://auth.cloud.ovh.net/",
            "region": "SBG",
            "interface": "public",
            "id": "1f8d9b76a4cf4cf2b4b8dd5bb77bcf8b"
          },
          {
            "region_id": "SGP",
            "url": "https://auth.cloud.ovh.net:35357/",
            "region": "SGP",
            "interface": "admin",
            "id": "29093c43a8cf4587829a70f318cc0c93"
          },
          {
            "region_id": "UK1",
            "url": "https://auth.cloud.ovh.net/",
            "region": "UK1",
            "interface": "internal",
            "id": "365d0699d93541f68f2e59aca3a32dff"
          },
          {
            "region_id": "UK",
            "url": "https://auth.cloud.ovh.net/",
            "region": "UK",
            "interface": "internal",
            "id": "3b6beddedaad4392a3cd92ee4a89fa54"
          },
          {
            "region_id": "DE1",
            "url": "https://auth.cloud.ovh.net/",
            "region": "DE1",
            "interface": "internal",
            "id": "3d3ccce61f8b4c4a9c9cb45781cf327f"
          },
          {
            "region_id": "SGP",
            "url": "https://auth.cloud.ovh.net/",
            "region": "SGP",
            "interface": "public",
            "id": "43d3273400d64e418aceebf646851e5f"
          },
          {
            "region_id": "BHS",
            "url": "https://auth.cloud.ovh.net/",
            "region": "BHS",
            "interface": "public",
            "id": "4819cad2b73b4eb698ccad6ee5a379db"
          },
          {
            "region_id": "BHS3",
            "url": "https://auth.cloud.ovh.net/",
            "region": "BHS3",
            "interface": "internal",
            "id": "49df446fd99a4a7986faf411343aca39"
          },
          {
            "region_id": "UK1",
            "url": "https://auth.cloud.ovh.net/",
            "region": "UK1",
            "interface": "public",
            "id": "4b59a909855c4991afe2ff215082709c"
          },
          {
            "region_id": "DE1",
            "url": "https://auth.cloud.ovh.net:35357/",
            "region": "DE1",
            "interface": "admin",
            "id": "4c917e29d5c84f1cb33b028a6117de38"
          },
          {
            "region_id": "WAW",
            "url": "https://auth.cloud.ovh.net:35357/",
            "region": "WAW",
            "interface": "admin",
            "id": "4d1e7f9c29284a89b12bd753fe2408b2"
          },
          {
            "region_id": "WAW1",
            "url": "https://auth.cloud.ovh.net:35357/",
            "region": "WAW1",
            "interface": "admin",
            "id": "60cf5a2bfe15429395acd0489228f62d"
          },
          {
            "region_id": "SYD",
            "url": "https://auth.cloud.ovh.net/",
            "region": "SYD",
            "interface": "internal",
            "id": "631108f68ede460aacdc65f916f84c98"
          },
          {
            "region_id": "GRA5",
            "url": "https://auth.cloud.ovh.net/",
            "region": "GRA5",
            "interface": "public",
            "id": "676686de572945dd84b55959cdad0db5"
          },
          {
            "region_id": "SBG",
            "url": "https://auth.cloud.ovh.net:35357/",
            "region": "SBG",
            "interface": "admin",
            "id": "6c8d139ad5ee43b69c351555abec8e90"
          },
          {
            "region_id": "UK1",
            "url": "https://auth.cloud.ovh.net:35357/",
            "region": "UK1",
            "interface": "admin",
            "id": "6f0a0f827a2a4a45aa79be974cb45136"
          },
          {
            "region_id": "SBG5",
            "url": "https://auth.cloud.ovh.net/",
            "region": "SBG5",
            "interface": "internal",
            "id": "77d062ad8d2f476d8b66fc57694ff22d"
          },
          {
            "region_id": "SBG",
            "url": "https://auth.cloud.ovh.net/",
            "region": "SBG",
            "interface": "internal",
            "id": "7b0a8feb97ac439788cd4e50cb9012d7"
          },
          {
            "region_id": "BHS3",
            "url": "https://auth.cloud.ovh.net:35357/",
            "region": "BHS3",
            "interface": "admin",
            "id": "7ec72b3cafc64639a6403b5280484169"
          },
          {
            "region_id": "WAW",
            "url": "https://auth.cloud.ovh.net/",
            "region": "WAW",
            "interface": "public",
            "id": "806dce550d03462687f0e475d91a3927"
          },
          {
            "region_id": "DE",
            "url": "https://auth.cloud.ovh.net/",
            "region": "DE",
            "interface": "internal",
            "id": "833ecb3f40dd4b72b4710ad03bcbd172"
          },
          {
            "region_id": "GRA",
            "url": "https://auth.cloud.ovh.net/",
            "region": "GRA",
            "interface": "public",
            "id": "83a1c76b91db45309bfc32da7938b0c2"
          },
          {
            "region_id": "SBG5",
            "url": "https://auth.cloud.ovh.net/",
            "region": "SBG5",
            "interface": "public",
            "id": "878631de9d4e43cba1075d49f3600520"
          },
          {
            "region_id": "GRA5",
            "url": "https://auth.cloud.ovh.net:35357/",
            "region": "GRA5",
            "interface": "admin",
            "id": "9da3add06df346d189ca063dc1f3d47e"
          },
          {
            "region_id": "SGP",
            "url": "https://auth.cloud.ovh.net/",
            "region": "SGP",
            "interface": "internal",
            "id": "a12b1ff1455746909b690b5e65451639"
          },
          {
            "region_id": "DE1",
            "url": "https://auth.cloud.ovh.net/",
            "region": "DE1",
            "interface": "public",
            "id": "a7900ec0c9be4f3eb77498c05046635c"
          },
          {
            "region_id": "UK",
            "url": "https://auth.cloud.ovh.net/",
            "region": "UK",
            "interface": "public",
            "id": "af76d95b7c0b4b50af156dfb053327c0"
          },
          {
            "region_id": "WAW1",
            "url": "https://auth.cloud.ovh.net/",
            "region": "WAW1",
            "interface": "public",
            "id": "be916e977cda43de9618e7467ee8965f"
          },
          {
            "region_id": "GRA5",
            "url": "https://auth.cloud.ovh.net/",
            "region": "GRA5",
            "interface": "internal",
            "id": "c16d29cb80fc44c4b342cc51c39fe8f2"
          },
          {
            "region_id": "GRA",
            "url": "https://auth.cloud.ovh.net:35357/",
            "region": "GRA",
            "interface": "admin",
            "id": "c67abe278ca447eab1fa8e23bd877b4b"
          },
          {
            "region_id": "BHS3",
            "url": "https://auth.cloud.ovh.net/",
            "region": "BHS3",
            "interface": "public",
            "id": "c81af3ec2119460c8fe64922b4856e77"
          },
          {
            "region_id": "GRA",
            "url": "https://auth.cloud.ovh.net/",
            "region": "GRA",
            "interface": "internal",
            "id": "cc029b53907044a4945c7fcc70bca5f0"
          },
          {
            "region_id": "SYD",
            "url": "https://auth.cloud.ovh.net:35357/",
            "region": "SYD",
            "interface": "admin",
            "id": "cd866bab78cc41bfb7a7a17ef9e6c382"
          },
          {
            "region_id": "WAW",
            "url": "https://auth.cloud.ovh.net/",
            "region": "WAW",
            "interface": "internal",
            "id": "ce335347f180455686813990bbec027b"
          },
          {
            "region_id": "BHS",
            "url": "https://auth.cloud.ovh.net:35357/",
            "region": "BHS",
            "interface": "admin",
            "id": "d10d7ceb32f14bdf865884b24a8665a1"
          },
          {
            "region_id": "BHS",
            "url": "https://auth.cloud.ovh.net/",
            "region": "BHS",
            "interface": "internal",
            "id": "d13105bcc3054e1288eaf3b2f5f55807"
          },
          {
            "region_id": "SYD",
            "url": "https://auth.cloud.ovh.net/",
            "region": "SYD",
            "interface": "public",
            "id": "d6110412db8c4dec87ab26a1eda81a7e"
          },
          {
            "region_id": "SBG5",
            "url": "https://auth.cloud.ovh.net:35357/",
            "region": "SBG5",
            "interface": "admin",
            "id": "f451762b52be4b528618782693691de5"
          },
          {
            "region_id": "SGP1",
            "url": "https://auth.cloud.ovh.net/",
            "region": "SGP1",
            "interface": "public",
            "id": "f5d1436ed1394bd18c5732ca6e898f6b"
          },
          {
            "region_id": "DE",
            "url": "https://auth.cloud.ovh.net/",
            "region": "DE",
            "interface": "public",
            "id": "f809b23e4fd04303848cf14e7d882b33"
          },
          {
            "region_id": "DE",
            "url": "https://auth.cloud.ovh.net:35357/",
            "region": "DE",
            "interface": "admin",
            "id": "fbd68d5b798a4c5ab8c11a2e4abdc447"
          }
        ],
        "type": "identity",
        "id": "1736f92a0c9541c48d778df7f50b82ce",
        "name": "keystone"
      },
      {
        "endpoints": [
          {
            "region_id": "SYD1",
            "url": "https://compute.syd1.cloud.ovh.net/v2.1/ce3e510224d740a685cb0ae7bdb8ebc3",
            "region": "SYD1",
            "interface": "public",
            "id": "03f354efcb8b42318c18139124a3cc14"
          },
          {
            "region_id": "UK1",
            "url": "https://compute.uk1.cloud.ovh.net/v2.1/ce3e510224d740a685cb0ae7bdb8ebc3",
            "region": "UK1",
            "interface": "public",
            "id": "0cdd8515aab04536b48eba83d063149e"
          },
          {
            "region_id": "GRA5",
            "url": "https://compute.gra5.cloud.ovh.net/v2.1/ce3e510224d740a685cb0ae7bdb8ebc3",
            "region": "GRA5",
            "interface": "public",
            "id": "12fe27a87117482eb4961f8e53471cc3"
          },
          {
            "region_id": "BHS3",
            "url": "https://compute.bhs3.cloud.ovh.net/v2.1/ce3e510224d740a685cb0ae7bdb8ebc3",
            "region": "BHS3",
            "interface": "internal",
            "id": "13d041e77e1b4074b0cbce0d8a824d37"
          },
          {
            "region_id": "WAW1",
            "url": "https://compute.waw1.cloud.ovh.net/v2.1/ce3e510224d740a685cb0ae7bdb8ebc3",
            "region": "WAW1",
            "interface": "admin",
            "id": "2d0a54efa03244e4a416054bf92e0f2f"
          },
          {
            "region_id": "SGP1",
            "url": "https://compute.sgp1.cloud.ovh.net/v2.1/ce3e510224d740a685cb0ae7bdb8ebc3",
            "region": "SGP1",
            "interface": "public",
            "id": "38c3da31fef8491385ca78851d9a7220"
          },
          {
            "region_id": "WAW1",
            "url": "https://compute.waw1.cloud.ovh.net/v2.1/ce3e510224d740a685cb0ae7bdb8ebc3",
            "region": "WAW1",
            "interface": "internal",
            "id": "3960c67e8bf84635883edfeb0414e878"
          },
          {
            "region_id": "DE1",
            "url": "https://compute.de1.cloud.ovh.net/v2.1/ce3e510224d740a685cb0ae7bdb8ebc3",
            "region": "DE1",
            "interface": "public",
            "id": "4600007ec2a045b3a40529cd34791ffa"
          },
          {
            "region_id": "BHS3",
            "url": "https://compute.bhs3.cloud.ovh.net/v2.1/ce3e510224d740a685cb0ae7bdb8ebc3",
            "region": "BHS3",
            "interface": "public",
            "id": "4dc5ebfd88bb4f57ae92818d594aa6dd"
          },
          {
            "region_id": "GRA5",
            "url": "https://compute.gra5.cloud.ovh.net/v2.1/ce3e510224d740a685cb0ae7bdb8ebc3",
            "region": "GRA5",
            "interface": "internal",
            "id": "890ab2d0380a4efeb05b390a761235cb"
          },
          {
            "region_id": "BHS3",
            "url": "https://compute.bhs3.cloud.ovh.net/v2.1/ce3e510224d740a685cb0ae7bdb8ebc3",
            "region": "BHS3",
            "interface": "admin",
            "id": "a36fda4018804e7aa4296aa48a88a6ce"
          },
          {
            "region_id": "UK1",
            "url": "https://compute.uk1.cloud.ovh.net/v2.1/ce3e510224d740a685cb0ae7bdb8ebc3",
            "region": "UK1",
            "interface": "internal",
            "id": "ac71f50c37214b4d940752be3f3dca19"
          },
          {
            "region_id": "GRA5",
            "url": "https://compute.gra5.cloud.ovh.net/v2.1/ce3e510224d740a685cb0ae7bdb8ebc3",
            "region": "GRA5",
            "interface": "admin",
            "id": "b14e3fabd05240548068638dfca7b990"
          },
          {
            "region_id": "SBG5",
            "url": "https://compute.sbg5.cloud.ovh.net/v2.1/ce3e510224d740a685cb0ae7bdb8ebc3",
            "region": "SBG5",
            "interface": "admin",
            "id": "b20a72b1cb114a58982d811c5d174a54"
          },
          {
            "region_id": "UK1",
            "url": "https://compute.uk1.cloud.ovh.net/v2.1/ce3e510224d740a685cb0ae7bdb8ebc3",
            "region": "UK1",
            "interface": "admin",
            "id": "b9cd925c6d014390b44a98fe62422de6"
          },
          {
            "region_id": "SBG5",
            "url": "https://compute.sbg5.cloud.ovh.net/v2.1/ce3e510224d740a685cb0ae7bdb8ebc3",
            "region": "SBG5",
            "interface": "internal",
            "id": "cbd95261c3174a508022475cf8a9604d"
          },
          {
            "region_id": "DE1",
            "url": "https://compute.de1.cloud.ovh.net/v2.1/ce3e510224d740a685cb0ae7bdb8ebc3",
            "region": "DE1",
            "interface": "internal",
            "id": "eec6521e9b7743d69e70e87f5114749e"
          },
          {
            "region_id": "WAW1",
            "url": "https://compute.waw1.cloud.ovh.net/v2.1/ce3e510224d740a685cb0ae7bdb8ebc3",
            "region": "WAW1",
            "interface": "public",
            "id": "f44cd8bba9f44162a22d387ec9adfb53"
          },
          {
            "region_id": "SBG5",
            "url": "https://compute.sbg5.cloud.ovh.net/v2.1/ce3e510224d740a685cb0ae7bdb8ebc3",
            "region": "SBG5",
            "interface": "public",
            "id": "f89e726d632c47c5bfe7834e33c42a03"
          },
          {
            "region_id": "DE1",
            "url": "https://compute.de1.cloud.ovh.net/v2.1/ce3e510224d740a685cb0ae7bdb8ebc3",
            "region": "DE1",
            "interface": "admin",
            "id": "fa1367f3cd5b469ba028e26ce9cdd82f"
          }
        ],
        "type": "compute",
        "id": "292dc0f1cc134cb8b363d4a4f74630b4",
        "name": "nova"
      },
      {
        "endpoints": [
          {
            "region_id": "WAW1",
            "url": "https://workflow.waw1.cloud.ovh.net/v2",
            "region": "WAW1",
            "interface": "admin",
            "id": "063dfe32effa486abe4b271a9572d4c6"
          },
          {
            "region_id": "DE1",
            "url": "https://workflow.de1.cloud.ovh.net/v2",
            "region": "DE1",
            "interface": "internal",
            "id": "197a220b53404b96879b0f98af724dd7"
          },
          {
            "region_id": "SYD1",
            "url": "https://workflow.syd1.cloud.ovh.net/v2",
            "region": "SYD1",
            "interface": "public",
            "id": "3880c1e134ab4311962a68133fae55ee"
          },
          {
            "region_id": "SBG5",
            "url": "https://workflow.sbg5.cloud.ovh.net/v2",
            "region": "SBG5",
            "interface": "public",
            "id": "3dfb00ff613e4ce894263b9934a88cf0"
          },
          {
            "region_id": "BHS3",
            "url": "https://workflow.bhs3.cloud.ovh.net/v2",
            "region": "BHS3",
            "interface": "admin",
            "id": "4c4ea77c1e38402dbc48006135867208"
          },
          {
            "region_id": "WAW1",
            "url": "https://workflow.waw1.cloud.ovh.net/v2",
            "region": "WAW1",
            "interface": "internal",
            "id": "4fcd95d1239f4830a88c5936669e7b95"
          },
          {
            "region_id": "SBG5",
            "url": "https://workflow.sbg5.cloud.ovh.net/v2",
            "region": "SBG5",
            "interface": "internal",
            "id": "67f997676d5441c9b5a3105c3fac28a3"
          },
          {
            "region_id": "UK1",
            "url": "https://workflow.uk1.cloud.ovh.net/v2",
            "region": "UK1",
            "interface": "internal",
            "id": "6bc970fa74c34f2a9fcd67d289427d0c"
          },
          {
            "region_id": "SYD1",
            "url": "https://workflow.syd1.cloud.ovh.net/v2",
            "region": "SYD1",
            "interface": "admin",
            "id": "6c0e1da97c394140ac432352aa04ac03"
          },
          {
            "region_id": "UK1",
            "url": "https://workflow.uk1.cloud.ovh.net/v2",
            "region": "UK1",
            "interface": "admin",
            "id": "764c8322f05b421881904a8ffadcc703"
          },
          {
            "region_id": "BHS3",
            "url": "https://workflow.bhs3.cloud.ovh.net/v2",
            "region": "BHS3",
            "interface": "public",
            "id": "78cb40f6a5ad4decb31393e3ea2672a9"
          },
          {
            "region_id": "SGP1",
            "url": "https://workflow.sgp1.cloud.ovh.net/v2",
            "region": "SGP1",
            "interface": "internal",
            "id": "938b98249e224681be5e73a2d5dea5a0"
          },
          {
            "region_id": "WAW1",
            "url": "https://workflow.waw1.cloud.ovh.net/v2",
            "region": "WAW1",
            "interface": "public",
            "id": "960a10c7423e44a28ee72febcfca389d"
          },
          {
            "region_id": "GRA5",
            "url": "https://workflow.gra5.cloud.ovh.net/v2",
            "region": "GRA5",
            "interface": "public",
            "id": "9ea587c0802443acb1005587b1c424cf"
          },
          {
            "region_id": "DE1",
            "url": "https://workflow.de1.cloud.ovh.net/v2",
            "region": "DE1",
            "interface": "public",
            "id": "ac4af8cb7c92480bbfdb7fe9e21bf782"
          },
          {
            "region_id": "SGP1",
            "url": "https://workflow.sgp1.cloud.ovh.net/v2",
            "region": "SGP1",
            "interface": "admin",
            "id": "b6fe2d2def5b4b86943755125d2ada22"
          },
          {
            "region_id": "SYD1",
            "url": "https://workflow.syd1.cloud.ovh.net/v2",
            "region": "SYD1",
            "interface": "internal",
            "id": "bf1bc08e819245a7ada23c6b8e7fa1eb"
          },
          {
            "region_id": "DE1",
            "url": "https://workflow.de1.cloud.ovh.net/v2",
            "region": "DE1",
            "interface": "admin",
            "id": "c9298908413147138a53011c2cff9680"
          },
          {
            "region_id": "UK1",
            "url": "https://workflow.uk1.cloud.ovh.net/v2",
            "region": "UK1",
            "interface": "public",
            "id": "cfcfc4da63ca47ec869d77c808435c54"
          },
          {
            "region_id": "SBG5",
            "url": "https://workflow.sbg5.cloud.ovh.net/v2",
            "region": "SBG5",
            "interface": "admin",
            "id": "d12fa6ce369344d58ca8bd73db39f7ff"
          },
          {
            "region_id": "BHS3",
            "url": "https://workflow.bhs3.cloud.ovh.net/v2",
            "region": "BHS3",
            "interface": "internal",
            "id": "d36cdf530c0d4838a338f657c5351f60"
          },
          {
            "region_id": "GRA5",
            "url": "https://workflow.gra5.cloud.ovh.net/v2",
            "region": "GRA5",
            "interface": "internal",
            "id": "ddd270721ddb47c7822ebcf18432896f"
          },
          {
            "region_id": "SGP1",
            "url": "https://workflow.sgp1.cloud.ovh.net/v2",
            "region": "SGP1",
            "interface": "public",
            "id": "e196769150c54d8b8053ee18b51e221b"
          },
          {
            "region_id": "GRA5",
            "url": "https://workflow.gra5.cloud.ovh.net/v2",
            "region": "GRA5",
            "interface": "admin",
            "id": "f3b3d19fd43a40e7959994ceaea11c87"
          }
        ],
        "type": "workflowv2",
        "id": "3f096a7197fb4525a9229b703a43b393",
        "name": "mistral"
      },
      {
        "endpoints": [
          {
            "region_id": "SBG5",
            "url": "https://volume.compute.sbg5.cloud.ovh.net/v3/ce3e510224d740a685cb0ae7bdb8ebc3",
            "region": "SBG5",
            "interface": "admin",
            "id": "07fb626e965f4a89afb9ca68bd17a389"
          },
          {
            "region_id": "BHS3",
            "url": "https://volume.compute.bhs3.cloud.ovh.net/v3/ce3e510224d740a685cb0ae7bdb8ebc3",
            "region": "BHS3",
            "interface": "public",
            "id": "1e07aa7121ec495c9fd99e365a71dd6f"
          },
          {
            "region_id": "BHS3",
            "url": "https://volume.compute.bhs3.cloud.ovh.net/v3/ce3e510224d740a685cb0ae7bdb8ebc3",
            "region": "BHS3",
            "interface": "admin",
            "id": "263728a1c2c6493fa754c2382243e120"
          },
          {
            "region_id": "GRA5",
            "url": "https://volume.compute.gra5.cloud.ovh.net/v3/ce3e510224d740a685cb0ae7bdb8ebc3",
            "region": "GRA5",
            "interface": "internal",
            "id": "435ffae4abf34441837cd0b3b0eea86c"
          },
          {
            "region_id": "UK1",
            "url": "https://volume.compute.uk1.cloud.ovh.net/v3/ce3e510224d740a685cb0ae7bdb8ebc3",
            "region": "UK1",
            "interface": "admin",
            "id": "56bda64c5dcd4a9d8d15119c3a58b244"
          },
          {
            "region_id": "WAW1",
            "url": "https://volume.compute.waw1.cloud.ovh.net/v3/ce3e510224d740a685cb0ae7bdb8ebc3",
            "region": "WAW1",
            "interface": "public",
            "id": "7986bac7f1c2421890ac0ebde13fbe3f"
          },
          {
            "region_id": "WAW1",
            "url": "https://volume.compute.waw1.cloud.ovh.net/v3/ce3e510224d740a685cb0ae7bdb8ebc3",
            "region": "WAW1",
            "interface": "admin",
            "id": "82ea923906914309a12f14307eacaf41"
          },
          {
            "region_id": "WAW1",
            "url": "https://volume.compute.waw1.cloud.ovh.net/v3/ce3e510224d740a685cb0ae7bdb8ebc3",
            "region": "WAW1",
            "interface": "internal",
            "id": "89d0fb4324d04e76b4f5cc01cb1dba13"
          },
          {
            "region_id": "BHS3",
            "url": "https://volume.compute.bhs3.cloud.ovh.net/v3/ce3e510224d740a685cb0ae7bdb8ebc3",
            "region": "BHS3",
            "interface": "internal",
            "id": "8b419efc751a4033938abe7cd17a69a1"
          },
          {
            "region_id": "UK1",
            "url": "https://volume.compute.uk1.cloud.ovh.net/v3/ce3e510224d740a685cb0ae7bdb8ebc3",
            "region": "UK1",
            "interface": "internal",
            "id": "a105b222c07b4827ae0ac82804c3cf70"
          },
          {
            "region_id": "SYD1",
            "url": "https://volume.compute.syd1.cloud.ovh.net/v3/ce3e510224d740a685cb0ae7bdb8ebc3",
            "region": "SYD1",
            "interface": "public",
            "id": "a72adc220b314b49b94efee01a50ea73"
          },
          {
            "region_id": "DE1",
            "url": "https://volume.compute.de1.cloud.ovh.net/v3/ce3e510224d740a685cb0ae7bdb8ebc3",
            "region": "DE1",
            "interface": "admin",
            "id": "b86eeb32a33649f9b3ad80276005429a"
          },
          {
            "region_id": "SBG5",
            "url": "https://volume.compute.sbg5.cloud.ovh.net/v3/ce3e510224d740a685cb0ae7bdb8ebc3",
            "region": "SBG5",
            "interface": "public",
            "id": "c08df05b1e304a1384a87755934c1a52"
          },
          {
            "region_id": "SBG5",
            "url": "https://volume.compute.sbg5.cloud.ovh.net/v3/ce3e510224d740a685cb0ae7bdb8ebc3",
            "region": "SBG5",
            "interface": "internal",
            "id": "c94834e2f0594cffb6434997c4fc934c"
          },
          {
            "region_id": "SGP1",
            "url": "https://volume.compute.sgp1.cloud.ovh.net/v3/ce3e510224d740a685cb0ae7bdb8ebc3",
            "region": "SGP1",
            "interface": "public",
            "id": "d8558c4011174d6db54da9f5bb324fd7"
          },
          {
            "region_id": "GRA5",
            "url": "https://volume.compute.gra5.cloud.ovh.net/v3/ce3e510224d740a685cb0ae7bdb8ebc3",
            "region": "GRA5",
            "interface": "admin",
            "id": "d8df1e67e7df4ff191dba47fc97774c0"
          },
          {
            "region_id": "DE1",
            "url": "https://volume.compute.de1.cloud.ovh.net/v3/ce3e510224d740a685cb0ae7bdb8ebc3",
            "region": "DE1",
            "interface": "internal",
            "id": "e388d8576ba24230986eb73c14fa1e0d"
          },
          {
            "region_id": "GRA5",
            "url": "https://volume.compute.gra5.cloud.ovh.net/v3/ce3e510224d740a685cb0ae7bdb8ebc3",
            "region": "GRA5",
            "interface": "public",
            "id": "eecb3498032747bfb29403217febdcb0"
          },
          {
            "region_id": "DE1",
            "url": "https://volume.compute.de1.cloud.ovh.net/v3/ce3e510224d740a685cb0ae7bdb8ebc3",
            "region": "DE1",
            "interface": "public",
            "id": "f5f796746d434f0cb3029198791296cf"
          },
          {
            "region_id": "UK1",
            "url": "https://volume.compute.uk1.cloud.ovh.net/v3/ce3e510224d740a685cb0ae7bdb8ebc3",
            "region": "UK1",
            "interface": "public",
            "id": "fb47bccc7dca4267a96dd586a7887a19"
          }
        ],
        "type": "volumev3",
        "id": "4511dc5a688542b99d503eeae8c55ed1",
        "name": "cinderv3"
      },
      {
        "endpoints": [
          {
            "region_id": "BHS3",
            "url": "https://image.compute.bhs3.cloud.ovh.net/",
            "region": "BHS3",
            "interface": "admin",
            "id": "01253b0c991645a89c0485261b5b72b9"
          },
          {
            "region_id": "DE1",
            "url": "https://image.compute.de1.cloud.ovh.net/",
            "region": "DE1",
            "interface": "public",
            "id": "0a8c228bc1734884b6fcc090ab83ef37"
          },
          {
            "region_id": "UK1",
            "url": "https://image.compute.uk1.cloud.ovh.net/",
            "region": "UK1",
            "interface": "admin",
            "id": "2ddad5ba306a431bb4940f05bd8754dd"
          },
          {
            "region_id": "GRA5",
            "url": "https://image.compute.gra5.cloud.ovh.net/",
            "region": "GRA5",
            "interface": "admin",
            "id": "422a4e72582a49b1af4f0e160f2fea9a"
          },
          {
            "region_id": "WAW1",
            "url": "https://image.compute.waw1.cloud.ovh.net/",
            "region": "WAW1",
            "interface": "internal",
            "id": "5d0a1886393a4a2ab0cb6d20a477e794"
          },
          {
            "region_id": "UK1",
            "url": "https://image.compute.uk1.cloud.ovh.net/",
            "region": "UK1",
            "interface": "public",
            "id": "63d1668e9057476083db0330da7a22cc"
          },
          {
            "region_id": "UK1",
            "url": "https://image.compute.uk1.cloud.ovh.net/",
            "region": "UK1",
            "interface": "internal",
            "id": "72469022d26d4843a76a25499b7bb373"
          },
          {
            "region_id": "SYD1",
            "url": "https://image.compute.syd1.cloud.ovh.net/",
            "region": "SYD1",
            "interface": "public",
            "id": "860c3bfa1d1b4a0f8b41c7d7728be99b"
          },
          {
            "region_id": "SBG5",
            "url": "https://image.compute.sbg5.cloud.ovh.net/",
            "region": "SBG5",
            "interface": "admin",
            "id": "a047b52213a240c094e4113ba3fbd21b"
          },
          {
            "region_id": "SBG5",
            "url": "https://image.compute.sbg5.cloud.ovh.net/",
            "region": "SBG5",
            "interface": "public",
            "id": "a918890d4e3940e4b5a7655b1aec5a70"
          },
          {
            "region_id": "WAW1",
            "url": "https://image.compute.waw1.cloud.ovh.net/",
            "region": "WAW1",
            "interface": "admin",
            "id": "aad037e9fd3c4ffd9d748f577b06c31d"
          },
          {
            "region_id": "BHS3",
            "url": "https://image.compute.bhs3.cloud.ovh.net/",
            "region": "BHS3",
            "interface": "public",
            "id": "abc7bbd125344ee48ba1c71660ae5d78"
          },
          {
            "region_id": "GRA5",
            "url": "https://image.compute.gra5.cloud.ovh.net/",
            "region": "GRA5",
            "interface": "public",
            "id": "ccf3c834d87746faa6593d1d928a72ea"
          },
          {
            "region_id": "DE1",
            "url": "https://image.compute.de1.cloud.ovh.net/",
            "region": "DE1",
            "interface": "admin",
            "id": "d531c6790381490cbfd2f8c9b8e17cd1"
          },
          {
            "region_id": "WAW1",
            "url": "https://image.compute.waw1.cloud.ovh.net/",
            "region": "WAW1",
            "interface": "public",
            "id": "dbb869f1b4764612bc47005e6a5e2f63"
          },
          {
            "region_id": "SBG5",
            "url": "https://image.compute.sbg5.cloud.ovh.net/",
            "region": "SBG5",
            "interface": "internal",
            "id": "dec56425500945a6b9f43908bc2080d3"
          },
          {
            "region_id": "BHS3",
            "url": "https://image.compute.bhs3.cloud.ovh.net/",
            "region": "BHS3",
            "interface": "internal",
            "id": "e42735da5bc441f9a8e3e0bae15b04fe"
          },
          {
            "region_id": "DE1",
            "url": "https://image.compute.de1.cloud.ovh.net/",
            "region": "DE1",
            "interface": "internal",
            "id": "f4cb67c33bea4a0dbc08225dbed08df7"
          },
          {
            "region_id": "SGP1",
            "url": "https://image.compute.sgp1.cloud.ovh.net/",
            "region": "SGP1",
            "interface": "public",
            "id": "f66b0a27b77246939ed57614152a39b0"
          },
          {
            "region_id": "GRA5",
            "url": "https://image.compute.gra5.cloud.ovh.net/",
            "region": "GRA5",
            "interface": "internal",
            "id": "fa768bc0e1844f0fbe40004c31092bf1"
          }
        ],
        "type": "image",
        "id": "480216e24c6e4970b77ff352384548c3",
        "name": "glance"
      },
      {
        "endpoints": [
          {
            "region_id": "WAW1",
            "url": "https://volume.compute.waw1.cloud.ovh.net/v2/ce3e510224d740a685cb0ae7bdb8ebc3",
            "region": "WAW1",
            "interface": "internal",
            "id": "00fbb01d92b2469e81bc1272547cb805"
          },
          {
            "region_id": "SBG5",
            "url": "https://volume.compute.sbg5.cloud.ovh.net/v2/ce3e510224d740a685cb0ae7bdb8ebc3",
            "region": "SBG5",
            "interface": "public",
            "id": "145eb20b666c4e22a2caf778bd651820"
          },
          {
            "region_id": "SGP1",
            "url": "https://volume.compute.sgp1.cloud.ovh.net/v2/ce3e510224d740a685cb0ae7bdb8ebc3",
            "region": "SGP1",
            "interface": "public",
            "id": "28303577a4f24404adc79144f94d9a7b"
          },
          {
            "region_id": "SYD1",
            "url": "https://volume.compute.syd1.cloud.ovh.net/v2/ce3e510224d740a685cb0ae7bdb8ebc3",
            "region": "SYD1",
            "interface": "public",
            "id": "37d2f593a3c24a849263a43a0c0e947c"
          },
          {
            "region_id": "BHS3",
            "url": "https://volume.compute.bhs3.cloud.ovh.net/v2/ce3e510224d740a685cb0ae7bdb8ebc3",
            "region": "BHS3",
            "interface": "public",
            "id": "3972eee7dcde4dad8259361aca1f87fb"
          },
          {
            "region_id": "BHS3",
            "url": "https://volume.compute.bhs3.cloud.ovh.net/v2/ce3e510224d740a685cb0ae7bdb8ebc3",
            "region": "BHS3",
            "interface": "internal",
            "id": "57f78bde577b42debb612e20e636dcd4"
          },
          {
            "region_id": "WAW1",
            "url": "https://volume.compute.waw1.cloud.ovh.net/v2/ce3e510224d740a685cb0ae7bdb8ebc3",
            "region": "WAW1",
            "interface": "admin",
            "id": "64cee1c0383446099cbd2e13cb880e76"
          },
          {
            "region_id": "WAW1",
            "url": "https://volume.compute.waw1.cloud.ovh.net/v2/ce3e510224d740a685cb0ae7bdb8ebc3",
            "region": "WAW1",
            "interface": "public",
            "id": "77fa2119725e40a59133db952552d362"
          },
          {
            "region_id": "SBG5",
            "url": "https://volume.compute.sbg5.cloud.ovh.net/v2/ce3e510224d740a685cb0ae7bdb8ebc3",
            "region": "SBG5",
            "interface": "internal",
            "id": "82b6763e212849fb9d07ce4208931c3f"
          },
          {
            "region_id": "BHS3",
            "url": "https://volume.compute.bhs3.cloud.ovh.net/v2/ce3e510224d740a685cb0ae7bdb8ebc3",
            "region": "BHS3",
            "interface": "admin",
            "id": "8769f0d2fa834458bcceb96c9b01c5f6"
          },
          {
            "region_id": "DE1",
            "url": "https://volume.compute.de1.cloud.ovh.net/v2/ce3e510224d740a685cb0ae7bdb8ebc3",
            "region": "DE1",
            "interface": "internal",
            "id": "8c1100f929bf46f886d05b8f32c25b93"
          },
          {
            "region_id": "UK1",
            "url": "https://volume.compute.uk1.cloud.ovh.net/v2/ce3e510224d740a685cb0ae7bdb8ebc3",
            "region": "UK1",
            "interface": "internal",
            "id": "ae06259fccf2406cb70fe359eeb26a4c"
          },
          {
            "region_id": "GRA5",
            "url": "https://volume.compute.gra5.cloud.ovh.net/v2/ce3e510224d740a685cb0ae7bdb8ebc3",
            "region": "GRA5",
            "interface": "internal",
            "id": "b1bfb55bdf5d402cbd256ea69f7f430e"
          },
          {
            "region_id": "GRA5",
            "url": "https://volume.compute.gra5.cloud.ovh.net/v2/ce3e510224d740a685cb0ae7bdb8ebc3",
            "region": "GRA5",
            "interface": "admin",
            "id": "b99ca9078f7e46e799b0c439252108a6"
          },
          {
            "region_id": "DE1",
            "url": "https://volume.compute.de1.cloud.ovh.net/v2/ce3e510224d740a685cb0ae7bdb8ebc3",
            "region": "DE1",
            "interface": "public",
            "id": "bc9ada75f6e046c7a387357e44ed06b5"
          },
          {
            "region_id": "SBG5",
            "url": "https://volume.compute.sbg5.cloud.ovh.net/v2/ce3e510224d740a685cb0ae7bdb8ebc3",
            "region": "SBG5",
            "interface": "admin",
            "id": "c02c499e63f244cc8bdec2a60124e472"
          },
          {
            "region_id": "DE1",
            "url": "https://volume.compute.de1.cloud.ovh.net/v2/ce3e510224d740a685cb0ae7bdb8ebc3",
            "region": "DE1",
            "interface": "admin",
            "id": "c10da14a54d742dea6a4ca9442fd3b57"
          },
          {
            "region_id": "UK1",
            "url": "https://volume.compute.uk1.cloud.ovh.net/v2/ce3e510224d740a685cb0ae7bdb8ebc3",
            "region": "UK1",
            "interface": "public",
            "id": "cb96c35a114e4973b25e4fdc53032bc3"
          },
          {
            "region_id": "UK1",
            "url": "https://volume.compute.uk1.cloud.ovh.net/v2/ce3e510224d740a685cb0ae7bdb8ebc3",
            "region": "UK1",
            "interface": "admin",
            "id": "cbb473c12ea048a6b886b1cf3753d65f"
          },
          {
            "region_id": "GRA5",
            "url": "https://volume.compute.gra5.cloud.ovh.net/v2/ce3e510224d740a685cb0ae7bdb8ebc3",
            "region": "GRA5",
            "interface": "public",
            "id": "e569574b7ae140a1a3bbbf9b40946a3d"
          }
        ],
        "type": "volumev2",
        "id": "7ad83a788bcc4be7bf2087ca41846b35",
        "name": "cinderv2"
      },
      {
        "endpoints": [
          {
            "region_id": "GRA5",
            "url": "https://orchestration.gra5.cloud.ovh.net/v1/ce3e510224d740a685cb0ae7bdb8ebc3",
            "region": "GRA5",
            "interface": "internal",
            "id": "09dbe43a5d6c4fcc80aa403d50005c50"
          },
          {
            "region_id": "SBG5",
            "url": "https://orchestration.sbg5.cloud.ovh.net/v1/ce3e510224d740a685cb0ae7bdb8ebc3",
            "region": "SBG5",
            "interface": "admin",
            "id": "249dc944f85147939b1572af7954bdc0"
          },
          {
            "region_id": "DE1",
            "url": "https://orchestration.de1.cloud.ovh.net/v1/ce3e510224d740a685cb0ae7bdb8ebc3",
            "region": "DE1",
            "interface": "internal",
            "id": "336ccf59cf32417db3df23ad8965bbb3"
          },
          {
            "region_id": "UK1",
            "url": "https://orchestration.uk1.cloud.ovh.net/v1/ce3e510224d740a685cb0ae7bdb8ebc3",
            "region": "UK1",
            "interface": "admin",
            "id": "4c2057b2302a4027a458e5fdc1ed31b4"
          },
          {
            "region_id": "GRA5",
            "url": "https://orchestration.gra5.cloud.ovh.net/v1/ce3e510224d740a685cb0ae7bdb8ebc3",
            "region": "GRA5",
            "interface": "admin",
            "id": "4dbdb5cb5ad14acc925231a2a15ea70d"
          },
          {
            "region_id": "WAW1",
            "url": "https://orchestration.waw1.cloud.ovh.net/v1/ce3e510224d740a685cb0ae7bdb8ebc3",
            "region": "WAW1",
            "interface": "admin",
            "id": "7c068ae1042a478c9738db002d63b25b"
          },
          {
            "region_id": "UK1",
            "url": "https://orchestration.uk1.cloud.ovh.net/v1/ce3e510224d740a685cb0ae7bdb8ebc3",
            "region": "UK1",
            "interface": "public",
            "id": "7ecf41c197a5431dada57ae6d75da80d"
          },
          {
            "region_id": "DE1",
            "url": "https://orchestration.de1.cloud.ovh.net/v1/ce3e510224d740a685cb0ae7bdb8ebc3",
            "region": "DE1",
            "interface": "public",
            "id": "90fe699cc7a44a35a9bcbaa9aa198501"
          },
          {
            "region_id": "GRA5",
            "url": "https://orchestration.gra5.cloud.ovh.net/v1/ce3e510224d740a685cb0ae7bdb8ebc3",
            "region": "GRA5",
            "interface": "public",
            "id": "924025ccc161461d8714cd868660a6db"
          },
          {
            "region_id": "UK1",
            "url": "https://orchestration.uk1.cloud.ovh.net/v1/ce3e510224d740a685cb0ae7bdb8ebc3",
            "region": "UK1",
            "interface": "internal",
            "id": "93ea11d2dfbf4f4e9deb4ffb4aeceff6"
          },
          {
            "region_id": "WAW1",
            "url": "https://orchestration.waw1.cloud.ovh.net/v1/ce3e510224d740a685cb0ae7bdb8ebc3",
            "region": "WAW1",
            "interface": "internal",
            "id": "987a79503b4844a2bf0d79a46f9cdb4f"
          },
          {
            "region_id": "DE1",
            "url": "https://orchestration.de1.cloud.ovh.net/v1/ce3e510224d740a685cb0ae7bdb8ebc3",
            "region": "DE1",
            "interface": "admin",
            "id": "cae81c8a8c564c01a4b4b90ee54a9a7d"
          },
          {
            "region_id": "WAW1",
            "url": "https://orchestration.waw1.cloud.ovh.net/v1/ce3e510224d740a685cb0ae7bdb8ebc3",
            "region": "WAW1",
            "interface": "public",
            "id": "d57861d95770458d831d3e8f9c3d11f9"
          },
          {
            "region_id": "SBG5",
            "url": "https://orchestration.sbg5.cloud.ovh.net/v1/ce3e510224d740a685cb0ae7bdb8ebc3",
            "region": "SBG5",
            "interface": "public",
            "id": "f3e18a3eb534441ab77b405ce1351dff"
          },
          {
            "region_id": "SBG5",
            "url": "https://orchestration.sbg5.cloud.ovh.net/v1/ce3e510224d740a685cb0ae7bdb8ebc3",
            "region": "SBG5",
            "interface": "internal",
            "id": "f891630d510f43dd9371d57f38e3ddc1"
          }
        ],
        "type": "orchestration",
        "id": "8deed687a32a491693996e47905edac5",
        "name": "heat"
      },
      {
        "endpoints": [
          {
            "region_id": "UK",
            "url": "https://storage.uk.cloud.ovh.net/v1/AUTH_ce3e510224d740a685cb0ae7bdb8ebc3",
            "region": "UK",
            "interface": "internal",
            "id": "06d5ef6eeef840fe9918965fb4290ea7"
          },
          {
            "region_id": "GRA",
            "url": "https://storage.gra.cloud.ovh.net/v1/AUTH_ce3e510224d740a685cb0ae7bdb8ebc3",
            "region": "GRA",
            "interface": "admin",
            "id": "1368e887740b4cd395191fccd32aebc5"
          },
          {
            "region_id": "SYD",
            "url": "https://storage.syd.cloud.ovh.net/v1/AUTH_ce3e510224d740a685cb0ae7bdb8ebc3",
            "region": "SYD",
            "interface": "admin",
            "id": "172a1fada58640158166e671dc61bb70"
          },
          {
            "region_id": "DE",
            "url": "https://storage.de.cloud.ovh.net/v1/AUTH_ce3e510224d740a685cb0ae7bdb8ebc3",
            "region": "DE",
            "interface": "admin",
            "id": "28c0d13e05b4405dab258dfb1c3bb6ec"
          },
          {
            "region_id": "SBG",
            "url": "https://storage.sbg.cloud.ovh.net/v1/AUTH_ce3e510224d740a685cb0ae7bdb8ebc3",
            "region": "SBG",
            "interface": "internal",
            "id": "3b0c44ee1f8d460ba17756fc2a1ccda4"
          },
          {
            "region_id": "SGP",
            "url": "https://storage.sgp.cloud.ovh.net/v1/AUTH_ce3e510224d740a685cb0ae7bdb8ebc3",
            "region": "SGP",
            "interface": "public",
            "id": "3e17a55392014c1797eac8127c7a662a"
          },
          {
            "region_id": "BHS",
            "url": "https://storage.bhs.cloud.ovh.net/v1/AUTH_ce3e510224d740a685cb0ae7bdb8ebc3",
            "region": "BHS",
            "interface": "admin",
            "id": "42c0f2d06c734eaaa810a5d776dd03a8"
          },
          {
            "region_id": "UK",
            "url": "https://storage.uk.cloud.ovh.net/v1/AUTH_ce3e510224d740a685cb0ae7bdb8ebc3",
            "region": "UK",
            "interface": "public",
            "id": "4cafe3b7ab41494bb11b2f63230e9b35"
          },
          {
            "region_id": "BHS",
            "url": "https://storage.bhs.cloud.ovh.net/v1/AUTH_ce3e510224d740a685cb0ae7bdb8ebc3",
            "region": "BHS",
            "interface": "internal",
            "id": "4f2b6028116444eb8daaefba3d426b2c"
          },
          {
            "region_id": "WAW",
            "url": "https://storage.waw.cloud.ovh.net/v1/AUTH_ce3e510224d740a685cb0ae7bdb8ebc3",
            "region": "WAW",
            "interface": "public",
            "id": "5a04e8661de9488eb456240fc5f4112d"
          },
          {
            "region_id": "DE",
            "url": "https://storage.de.cloud.ovh.net/v1/AUTH_ce3e510224d740a685cb0ae7bdb8ebc3",
            "region": "DE",
            "interface": "public",
            "id": "5a503d582fa54b11bdb53e207ea3e899"
          },
          {
            "region_id": "SYD",
            "url": "https://storage.syd.cloud.ovh.net/v1/AUTH_ce3e510224d740a685cb0ae7bdb8ebc3",
            "region": "SYD",
            "interface": "public",
            "id": "605c4bee47f4447586a5b9b2d3a00c49"
          },
          {
            "region_id": "UK",
            "url": "https://storage.uk.cloud.ovh.net/v1/AUTH_ce3e510224d740a685cb0ae7bdb8ebc3",
            "region": "UK",
            "interface": "admin",
            "id": "7b72f5b3b6ce4bbe92369dca6c5309cb"
          },
          {
            "region_id": "SGP",
            "url": "https://storage.sgp.cloud.ovh.net/v1/AUTH_ce3e510224d740a685cb0ae7bdb8ebc3",
            "region": "SGP",
            "interface": "internal",
            "id": "7f420f4b21d14e82b839332ff2575ef8"
          },
          {
            "region_id": "BHS",
            "url": "https://storage.bhs.cloud.ovh.net/v1/AUTH_ce3e510224d740a685cb0ae7bdb8ebc3",
            "region": "BHS",
            "interface": "public",
            "id": "83b5563929c8431a867aef807268eb9e"
          },
          {
            "region_id": "WAW",
            "url": "https://storage.waw.cloud.ovh.net/v1/AUTH_ce3e510224d740a685cb0ae7bdb8ebc3",
            "region": "WAW",
            "interface": "admin",
            "id": "87b37e4bf175442badb9bcf4202981dc"
          },
          {
            "region_id": "SYD",
            "url": "https://storage.syd.cloud.ovh.net/v1/AUTH_ce3e510224d740a685cb0ae7bdb8ebc3",
            "region": "SYD",
            "interface": "internal",
            "id": "993fa6bc95154f39b404e9a3f4f1affa"
          },
          {
            "region_id": "WAW",
            "url": "https://storage.waw.cloud.ovh.net/v1/AUTH_ce3e510224d740a685cb0ae7bdb8ebc3",
            "region": "WAW",
            "interface": "internal",
            "id": "a7ea4271c8494f93b4402490d4f6b0c9"
          },
          {
            "region_id": "GRA",
            "url": "https://storage.gra.cloud.ovh.net/v1/AUTH_ce3e510224d740a685cb0ae7bdb8ebc3",
            "region": "GRA",
            "interface": "internal",
            "id": "b970d71613a84eed895142154e57a337"
          },
          {
            "region_id": "SBG",
            "url": "https://storage.sbg.cloud.ovh.net/v1/AUTH_ce3e510224d740a685cb0ae7bdb8ebc3",
            "region": "SBG",
            "interface": "public",
            "id": "bc5154badb89400b8bb092bc56a2e396"
          },
          {
            "region_id": "GRA",
            "url": "https://storage.gra.cloud.ovh.net/v1/AUTH_ce3e510224d740a685cb0ae7bdb8ebc3",
            "region": "GRA",
            "interface": "public",
            "id": "bd0c883d95b246d9b6a2a9d34fa652ba"
          },
          {
            "region_id": "SBG",
            "url": "https://storage.sbg.cloud.ovh.net/v1/AUTH_ce3e510224d740a685cb0ae7bdb8ebc3",
            "region": "SBG",
            "interface": "admin",
            "id": "c903e1c68c1649d0a613aba40c2d7982"
          },
          {
            "region_id": "SGP",
            "url": "https://storage.sgp.cloud.ovh.net/v1/AUTH_ce3e510224d740a685cb0ae7bdb8ebc3",
            "region": "SGP",
            "interface": "admin",
            "id": "e916f9929ca84d4798a81541519f6f29"
          },
          {
            "region_id": "DE",
            "url": "https://storage.de.cloud.ovh.net/v1/AUTH_ce3e510224d740a685cb0ae7bdb8ebc3",
            "region": "DE",
            "interface": "internal",
            "id": "f44fe812408c412586de0cd95c748a09"
          }
        ],
        "type": "object-store",
        "id": "9afff7a684eb4830b08366fce2b94c57",
        "name": "swift"
      },
      {
        "endpoints": [
          {
            "region_id": "BHS3",
            "url": "https://volume.compute.bhs3.cloud.ovh.net/v1/ce3e510224d740a685cb0ae7bdb8ebc3",
            "region": "BHS3",
            "interface": "public",
            "id": "0914e59707894620b24e62faee393074"
          },
          {
            "region_id": "SBG5",
            "url": "https://volume.compute.sbg5.cloud.ovh.net/v1/ce3e510224d740a685cb0ae7bdb8ebc3",
            "region": "SBG5",
            "interface": "admin",
            "id": "2068bac767524a1ca6fc3981183f0c12"
          },
          {
            "region_id": "BHS3",
            "url": "https://volume.compute.bhs3.cloud.ovh.net/v1/ce3e510224d740a685cb0ae7bdb8ebc3",
            "region": "BHS3",
            "interface": "internal",
            "id": "36700d41fe8146059b2c5a5583558c5a"
          },
          {
            "region_id": "BHS3",
            "url": "https://volume.compute.bhs3.cloud.ovh.net/v1/ce3e510224d740a685cb0ae7bdb8ebc3",
            "region": "BHS3",
            "interface": "admin",
            "id": "3b8ac36338f74e3597d5ab5bf28f222e"
          },
          {
            "region_id": "GRA5",
            "url": "https://volume.compute.gra5.cloud.ovh.net/v1/ce3e510224d740a685cb0ae7bdb8ebc3",
            "region": "GRA5",
            "interface": "admin",
            "id": "424718aec39b4023a50e5936adcd4a96"
          },
          {
            "region_id": "UK1",
            "url": "https://volume.compute.uk1.cloud.ovh.net/v1/ce3e510224d740a685cb0ae7bdb8ebc3",
            "region": "UK1",
            "interface": "admin",
            "id": "49b544905f134a80a397f8fb70367d4f"
          },
          {
            "region_id": "GRA5",
            "url": "https://volume.compute.gra5.cloud.ovh.net/v1/ce3e510224d740a685cb0ae7bdb8ebc3",
            "region": "GRA5",
            "interface": "public",
            "id": "4a074d9648294ab8b08cf7911d7ac2ed"
          },
          {
            "region_id": "DE1",
            "url": "https://volume.compute.de1.cloud.ovh.net/v1/ce3e510224d740a685cb0ae7bdb8ebc3",
            "region": "DE1",
            "interface": "admin",
            "id": "6bf5ed80d8bd43e5b957b5f755379583"
          },
          {
            "region_id": "WAW1",
            "url": "https://volume.compute.waw1.cloud.ovh.net/v1/ce3e510224d740a685cb0ae7bdb8ebc3",
            "region": "WAW1",
            "interface": "public",
            "id": "738e8d493217409ab6a8d0b67aba9e38"
          },
          {
            "region_id": "DE1",
            "url": "https://volume.compute.de1.cloud.ovh.net/v1/ce3e510224d740a685cb0ae7bdb8ebc3",
            "region": "DE1",
            "interface": "internal",
            "id": "79ab58093c504afa8b6afa45384ca469"
          },
          {
            "region_id": "WAW1",
            "url": "https://volume.compute.waw1.cloud.ovh.net/v1/ce3e510224d740a685cb0ae7bdb8ebc3",
            "region": "WAW1",
            "interface": "internal",
            "id": "79d10546a4134193a865e088a9d75a9e"
          },
          {
            "region_id": "WAW1",
            "url": "https://volume.compute.waw1.cloud.ovh.net/v1/ce3e510224d740a685cb0ae7bdb8ebc3",
            "region": "WAW1",
            "interface": "admin",
            "id": "84b0ee27e3614518aa5b97c87539f15e"
          },
          {
            "region_id": "SBG5",
            "url": "https://volume.compute.sbg5.cloud.ovh.net/v1/ce3e510224d740a685cb0ae7bdb8ebc3",
            "region": "SBG5",
            "interface": "internal",
            "id": "a0efca62bb3a4d24af63d50119dc214e"
          },
          {
            "region_id": "SGP1",
            "url": "https://volume.compute.sgp1.cloud.ovh.net/v1/ce3e510224d740a685cb0ae7bdb8ebc3",
            "region": "SGP1",
            "interface": "public",
            "id": "a109ae20a3634616882a22ad5f1813d1"
          },
          {
            "region_id": "GRA5",
            "url": "https://volume.compute.gra5.cloud.ovh.net/v1/ce3e510224d740a685cb0ae7bdb8ebc3",
            "region": "GRA5",
            "interface": "internal",
            "id": "ba89044332d54654afb2eb6ec6209c19"
          },
          {
            "region_id": "UK1",
            "url": "https://volume.compute.uk1.cloud.ovh.net/v1/ce3e510224d740a685cb0ae7bdb8ebc3",
            "region": "UK1",
            "interface": "public",
            "id": "c8073db3b84d4ab987cc84fe6965a1da"
          },
          {
            "region_id": "SBG5",
            "url": "https://volume.compute.sbg5.cloud.ovh.net/v1/ce3e510224d740a685cb0ae7bdb8ebc3",
            "region": "SBG5",
            "interface": "public",
            "id": "d07d3720450e468fa5a7e69c67d23753"
          },
          {
            "region_id": "SYD1",
            "url": "https://volume.compute.syd1.cloud.ovh.net/v1/ce3e510224d740a685cb0ae7bdb8ebc3",
            "region": "SYD1",
            "interface": "public",
            "id": "d10f3ea7b9864e3e91116292eb6cc64b"
          },
          {
            "region_id": "DE1",
            "url": "https://volume.compute.de1.cloud.ovh.net/v1/ce3e510224d740a685cb0ae7bdb8ebc3",
            "region": "DE1",
            "interface": "public",
            "id": "dacd79e854bb4630b5a037db3bd18658"
          },
          {
            "region_id": "UK1",
            "url": "https://volume.compute.uk1.cloud.ovh.net/v1/ce3e510224d740a685cb0ae7bdb8ebc3",
            "region": "UK1",
            "interface": "internal",
            "id": "ed491d99c01d41c5ae2b039c1d4d1dc7"
          }
        ],
        "type": "volume",
        "id": "f9cfa350a3e2452c9ae64f3846d9d213",
        "name": "cinder"
      }
    ],
    "expires_at": "2020-06-23T11:43:00.000000Z",
    "user": {
      "password_expires_at": null,
      "domain": {
        "id": "default",
        "name": "Default"
      },
      "id": "d3b045de01924c00ba808787b1c1b707",
      "name": "Tf3Sbge2n2Zd"
    },
    "audit_ids": [
      "5eL9dPleTnudEcuW9BV3Ow"
    ],
    "issued_at": "2020-06-22T11:43:00.000000Z"
  }
}

let connectionResultSuccessV3WithoutObjectStore = {
  "token": {
    "is_domain": false,
    "methods": [
      "password"
    ],
    "roles": [
      {
        "id": "9fe2ff9ee4384b1894a90878d3e92bab",
        "name": "_member_"
      },
      {
        "id": "9543e89aeb484aee8ec7d01e87223b16",
        "name": "objectstore_operator"
      }
    ],
    "is_admin_project": false,
    "project": {
      "domain": {
        "id": "default",
        "name": "Default"
      },
      "id": "ce3e510224d740a685cb0ae7bdb8ebc3",
      "name": "9865153001950111"
    },
    "catalog": [],
    "expires_at": "2020-06-23T11:43:00.000000Z",
    "user": {
      "password_expires_at": null,
      "domain": {
        "id": "default",
        "name": "Default"
      },
      "id": "d3b045de01924c00ba808787b1c1b707",
      "name": "Tf3Sbge2n2Zd"
    },
    "audit_ids": [
      "5eL9dPleTnudEcuW9BV3Ow"
    ],
    "issued_at": "2020-06-22T11:43:00.000000Z"
  }
}

let connectionResultSuccessV3WithoutRegion = {
  "token": {
    "is_domain": false,
    "methods": [
      "password"
    ],
    "roles": [
      {
        "id": "9fe2ff9ee4384b1894a90878d3e92bab",
        "name": "_member_"
      },
      {
        "id": "9543e89aeb484aee8ec7d01e87223b16",
        "name": "objectstore_operator"
      }
    ],
    "is_admin_project": false,
    "project": {
      "domain": {
        "id": "default",
        "name": "Default"
      },
      "id": "ce3e510224d740a685cb0ae7bdb8ebc3",
      "name": "9865153001950111"
    },
    "catalog": [
      {
        "endpoints": [
          {
            "region_id": "BHS",
            "url": "https://storage.bhs.cloud.ovh.net/v1/AUTH_ce3e510224d740a685cb0ae7bdb8ebc3",
            "region": "BHS",
            "interface": "internal",
            "id": "4f2b6028116444eb8daaefba3d426b2c"
          },
        ],
        "type": "object-store",
        "id": "9afff7a684eb4830b08366fce2b94c57",
        "name": "swift"
      }
    ],
    "expires_at": "2020-06-23T11:43:00.000000Z",
    "user": {
      "password_expires_at": null,
      "domain": {
        "id": "default",
        "name": "Default"
      },
      "id": "d3b045de01924c00ba808787b1c1b707",
      "name": "Tf3Sbge2n2Zd"
    },
    "audit_ids": [
      "5eL9dPleTnudEcuW9BV3Ow"
    ],
    "issued_at": "2020-06-22T11:43:00.000000Z"
  }
}