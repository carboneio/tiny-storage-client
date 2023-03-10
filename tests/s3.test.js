const s3 = require('../s3.js');
const assert = require('assert');
const nock   = require('nock');
const fs     = require('fs');
const path   = require('path');

let storage = {};
const url1S3 = 'https://s3.gra.first.cloud.test';
const url2S3 = 'https://s3.de.first.cloud.test';

const fileTxtPath = path.join(__dirname, 'assets', 'file.txt');
const fileTxt = fs.readFileSync(fileTxtPath).toString();
const fileXmlPath = path.join(__dirname, 'assets', 'files.xml');
const fileXml = fs.readFileSync(fileXmlPath).toString();

describe.only('S3 SDK', function () {

  beforeEach(function() {
    storage = s3([{
      accessKeyId    : '2371bebbe7ac4b2db39c09eadf011661',
      secretAccessKey: '9978f6abf7f445566a2d316424aeef2',
      url            : url1S3.replace('https://', ''),
      region         : 'gra'
    },
    {
      accessKeyId    : '2371bebbe7ac4b2db39c09eadf011661',
      secretAccessKey: '9978f6abf7f445566a2d316424aeef2',
      url            : url2S3.replace('https://', ''),
      region         : 'de'
    }]);
  })

  describe('constructor/getConfig/setConfig/setTimeout', function () {
    it("should create a new s3 instance if the authentication is provided as Object", function () {
      const _authS3 = { accessKeyId: '-', secretAccessKey: '-', region: '-', url: '-' }
      const _storage = s3(_authS3);
      const _config = _storage.getConfig()
      assert.strictEqual(_config.timeout, 5000);
      assert.strictEqual(_config.activeStorage, 0);
      assert.strictEqual(_config.storages.length, 1);
      assert.strictEqual(JSON.stringify(_config.storages[0]), JSON.stringify(_authS3))
    })

    it("should create a new s3 instance if the authentication is provided as List of objects", function () {
      const _authS3 = [{ accessKeyId: 1, secretAccessKey: 2, region: 3, url: 4 }, { accessKeyId: 5, secretAccessKey: 6, region: 7, url: 8 }, { accessKeyId: 9, secretAccessKey: 10, region: 11, url: 12 }]
      const _storage = s3(_authS3);
      const _config = _storage.getConfig()
      assert.strictEqual(_config.timeout, 5000);
      assert.strictEqual(_config.activeStorage, 0);
      assert.strictEqual(_config.storages.length, 3);
      assert.strictEqual(JSON.stringify(_config.storages), JSON.stringify(_authS3))
    })

    it("should throw an error if authentication values are missing", function() {
      assert.throws(function(){ s3({}) }, Error);
      /** As object */
      assert.throws(function(){ s3({accessKeyId: '', secretAccessKey: '', url: ''}) }, Error); // missing region
      assert.throws(function(){ s3({accessKeyId: '', secretAccessKey: '', region: ''}) }, Error); // missing url
      assert.throws(function(){ s3({accessKeyId: '', url: '', region: ''}) }, Error); // missing secretAccessKey
      assert.throws(function(){ s3({secretAccessKey: '', url: '', region: ''}) }, Error); // missing accessKeyId
      /** As array */
      assert.throws(function(){ s3([{ accessKeyId: 1, secretAccessKey: 2, region: 3, url: 4 }, { accessKeyId: 5, secretAccessKey: 6, url: 8 }]) }, Error); // missing region
      assert.throws(function(){ s3([{ accessKeyId: 1, secretAccessKey: 2, region: 3, url: 4 }, { accessKeyId: 5, secretAccessKey: 6, region: 8 }]) }, Error); // missing url
      assert.throws(function(){ s3([{ accessKeyId: 1, secretAccessKey: 2, region: 3, url: 4 }, { accessKeyId: 5, region: 6, url: 8 }]) }, Error); // missing secretAccessKey
      assert.throws(function(){ s3([{ accessKeyId: 1, secretAccessKey: 2, region: 3, url: 4 }, { secretAccessKey: 5, region: 6, url: 8 }]) }, Error); // missing accessKeyId
    });

    it("should set a new config", function () {
      const _storage = s3({ accessKeyId: '-', secretAccessKey: '-', region: '-', url: '-' });
      const _authS3 = [{ accessKeyId: 1, secretAccessKey: 2, region: 3, url: 4 }, { accessKeyId: 5, secretAccessKey: 6, region: 7, url: 8 }]
      _storage.setConfig(_authS3)
      const _config = _storage.getConfig()
      assert.strictEqual(_config.timeout, 5000);
      assert.strictEqual(_config.activeStorage, 0);
      assert.strictEqual(_config.storages.length, 2);
      assert.strictEqual(JSON.stringify(_config.storages), JSON.stringify(_authS3))
    })

    it("should set a new timeout value", function() {
      const _storage = s3({ accessKeyId: '-', secretAccessKey: '-', region: '-', url: '-' });
      assert.strictEqual(_storage.getConfig().timeout, 5000);
      _storage.setTimeout(10000);
      assert.strictEqual(_storage.getConfig().timeout, 10000);
    });
  })

  describe('request - CALLBACK', function() {

    describe("REQUEST MAIN STORAGE", function () {

    });

    describe("SWITCH TO CHILD STORAGE", function () {
    });

  });

  describe('request - STREAM', function() {

    describe("REQUEST MAIN STORAGE", function () {
    });

    describe("SWITCH TO CHILD STORAGE", function () {
    });

  });

  describe('headBucket', function() {
    it('should return code 200, and request signed with AWS4', function (done) {
      const nockRequest = nock(url1S3,
        {
          reqheaders: {
            'x-amz-content-sha256': () => true,
            'x-amz-date': () => true,
            'authorization': () => true,
            'host': () => true
          }
        }).intercept("/customBucket", "HEAD").reply(200, '');

      storage.headBucket('customBucket', function(err, resp) {
        assert.strictEqual(err, null);
        assert.strictEqual(resp.statusCode, 200);
        assert.strictEqual(resp.body.toString(), '');
        assert.strictEqual(nockRequest.pendingMocks().length, 0);
        done();
      });
    });

    it('should return code 403 Forbidden', function (done) {
      const nockRequest = nock(url1S3).intercept("/customBucket", "HEAD").reply(403, '');

      storage.headBucket('customBucket', function(err, resp) {
        assert.strictEqual(err, null);
        assert.strictEqual(resp.statusCode, 403);
        assert.strictEqual(resp.body.toString(), '');
        assert.strictEqual(nockRequest.pendingMocks().length, 0);
        done();
      });
    });
  });

  describe('listFiles', function() {

    describe("REQUEST MAIN STORAGE", function () {
    });

    describe("SWITCH TO CHILD STORAGE", function () {
    });

  });

  describe('downloadFile', function() {

    describe("REQUEST MAIN STORAGE", function () {
      it('should download a file', function(done) {
        const _header = {
          'content-length': '1492',
          'last-modified': 'Wed, 03 Nov 2021 13:02:39 GMT',
          date: 'Wed, 03 Nov 2021 14:28:48 GMT',
          etag: 'a30776a059eaf26eebf27756a849097d',
          'x-amz-request-id': '318BC8BC148832E5',
          'x-amz-id-2': 'eftixk72aD6Ap51TnqcoF8eFidJG9Z/2mkiDFu8yU9AS1ed4OpIszj7UDNEHGran'
        }
        const nockRequest = nock(url1S3)
          .defaultReplyHeaders(_header)
          .get('/bucket/file.docx')
          .reply(200, () => {
            return fileTxt;
          });
        storage.downloadFile('bucket', 'file.docx', function (err, resp) {
          assert.strictEqual(err, null);
          assert.strictEqual(resp.statusCode, 200);
          assert.strictEqual(resp.body.toString(), fileTxt);
          assert.strictEqual(JSON.stringify(resp.headers), JSON.stringify(_header))
          assert.strictEqual(nockRequest.pendingMocks().length, 0);
          done();
        })
      })

      it('should download a file with options', function(done) {
        const _header = {
          'content-length': '1492',
          'last-modified': 'Wed, 03 Nov 2021 13:02:39 GMT',
          date: 'Wed, 03 Nov 2021 14:28:48 GMT',
          etag: 'a30776a059eaf26eebf27756a849097d',
          'x-amz-request-id': '318BC8BC148832E5',
          'x-amz-id-2': 'eftixk72aD6Ap51TnqcoF8eFidJG9Z/2mkiDFu8yU9AS1ed4OpIszj7UDNEHGran'
        }
        const _options = {
          headers: {
            "x-amz-server-side-encryption-customer-key-MD5": "SSECustomerKeyMD5",
            "x-amz-checksum-mode": "ChecksumMode"
          },
          queries: {
            test       : "2",
            partNumber : "PartNumber"
          }
        }
        const nockRequest = nock(url1S3, {
            reqheaders: {
              'x-amz-server-side-encryption-customer-key-MD5': () => true,
              'x-amz-checksum-mode': () => true
            }
          })
          .defaultReplyHeaders(_header)
          .get('/bucket/file.docx')
          .query(_options.queries)
          .reply(200, () => {
            return fileTxt;
          });
        storage.downloadFile('bucket', 'file.docx', _options, function (err, resp) {
          assert.strictEqual(err, null);
          assert.strictEqual(resp.statusCode, 200);
          assert.strictEqual(resp.body.toString(), fileTxt);
          assert.strictEqual(JSON.stringify(resp.headers), JSON.stringify(_header))
          assert.strictEqual(nockRequest.pendingMocks().length, 0);
          done();
        })
      })

      it('should return code 404 if the file does not exist', function(done) {
        const _header = {'content-type': 'application/xml'}
        const nockRequest = nock(url1S3)
          .defaultReplyHeaders(_header)
          .get('/bucket/file.docx')
          .reply(404, "<?xml version='1.0' encoding='UTF-8'?><Error><Code>NoSuchKey</Code><Message>The specified key does not exist.</Message><RequestId>txc03d49a36c324653854de-006408d963</RequestId><Key>template222.odt</Key></Error>");
        storage.downloadFile('bucket', 'file.docx', function (err, resp) {
          assert.strictEqual(err, null);
          assert.strictEqual(resp.statusCode, 404);
          assert.strictEqual(JSON.stringify(resp.body), JSON.stringify({
            error: {
              code: 'NoSuchKey',
              message: 'The specified key does not exist.',
              requestid: 'txc03d49a36c324653854de-006408d963',
              key: 'template222.odt'
            }
          }));
          assert.strictEqual(JSON.stringify(resp.headers), JSON.stringify(_header))
          assert.strictEqual(nockRequest.pendingMocks().length, 0);
          done();
        })
      })
    });

    describe("SWITCH TO CHILD STORAGE", function () {
      it('should download a file from the second storage if the main storage returns a 500 error', function(done) {
        const nockRequestS1 = nock(url1S3)
          .get('/bucket/file.docx')
          .reply(500);
        const nockRequestS2 = nock(url2S3)
          .get('/bucket/file.docx')
          .reply(200, () => {
            return fileTxt
          });
        const nockRequestS3 = nock(url1S3)
          .get('/')
          .reply(500);

        storage.downloadFile('bucket', 'file.docx', function (err, resp) {
          assert.strictEqual(err, null);
          assert.strictEqual(resp.statusCode, 200);
          assert.strictEqual(resp.body.toString(), fileTxt);
          const _config = storage.getConfig();
          assert.strictEqual(_config.activeStorage, 1);
          assert.strictEqual(nockRequestS1.pendingMocks().length, 0);
          assert.strictEqual(nockRequestS2.pendingMocks().length, 0);
          assert.strictEqual(nockRequestS3.pendingMocks().length, 0);
          done();
        })
      })

      it('should download a file from the second storage if the main storage returns a 500 error, then should RECONNECT to the main storage', function(done) {
        const nockRequestS1 = nock(url1S3)
          .get('/bucket/file.docx')
          .reply(500)
        const nockRequestS2 = nock(url2S3)
          .get('/bucket/file.docx')
          .reply(200, () => {
            return fileTxt
          });
        const nockRequestS3 = nock(url1S3)
          .get('/')
          .reply(200);

        storage.downloadFile('bucket', 'file.docx', function (err, resp) {
          assert.strictEqual(err, null);
          assert.strictEqual(resp.statusCode, 200);
          assert.strictEqual(resp.body.toString(), fileTxt);
          const _config = storage.getConfig();
          assert.strictEqual(_config.activeStorage, 0);
          assert.strictEqual(nockRequestS1.pendingMocks().length, 0);
          assert.strictEqual(nockRequestS2.pendingMocks().length, 0);
          assert.strictEqual(nockRequestS3.pendingMocks().length, 0);
          done();
        })
      })

      it('should download a file from the second storage if the authentication on the main storage is not allowed', function(done) {
        let nockRequestS1 = nock(url1S3)
          .get('/bucket/file.docx')
          .reply(401, 'Unauthorized')

        const nockRequestS2 = nock(url2S3)
          .get('/bucket/file.docx')
          .reply(200, () => {
            return fileTxt
          });
        const nockRequestS3 = nock(url1S3)
          .get('/')
          .reply(401, 'Unauthorized')

        storage.downloadFile('bucket', 'file.docx', function (err, resp) {
          assert.strictEqual(err, null);
          assert.strictEqual(resp.statusCode, 200);
          assert.strictEqual(resp.body.toString(), fileTxt);
          const _config = storage.getConfig();
          assert.strictEqual(_config.activeStorage, 1);
          assert.strictEqual(nockRequestS1.pendingMocks().length, 0);
          assert.strictEqual(nockRequestS2.pendingMocks().length, 0);
          assert.strictEqual(nockRequestS3.pendingMocks().length, 0);
          done();
        })
      })

      it('should download a file from the second storage if the main storage timeout', function(done) {
        storage.setTimeout(200);
        let nockRequestS1 = nock(url1S3)
          .get('/bucket/file.docx')
          .delayConnection(500)
          .reply(200, {});
        const nockRequestS2 = nock(url2S3)
          .get('/bucket/file.docx')
          .reply(200, () => {
            return fileTxt
          });
        const nockRequestS3 = nock(url1S3)
          .get('/')
          .delayConnection(500)
          .reply(200, {});

        storage.downloadFile('bucket', 'file.docx', function (err, resp) {
          assert.strictEqual(err, null);
          assert.strictEqual(resp.statusCode, 200);
          assert.strictEqual(resp.body.toString(), fileTxt);
          const _config = storage.getConfig();
          assert.strictEqual(_config.activeStorage, 1);
          assert.strictEqual(nockRequestS1.pendingMocks().length, 0);
          assert.strictEqual(nockRequestS2.pendingMocks().length, 0);
          assert.strictEqual(nockRequestS3.pendingMocks().length, 0);
          done();
        })
      })

      it('should download a file from the second storage if the main storage returns any kind of error', function(done) {
        let nockRequestS1 = nock(url1S3)
          .get('/bucket/file.docx')
          .replyWithError('Error Message 1234');

        const nockRequestS2 = nock(url2S3)
          .get('/bucket/file.docx')
          .reply(200, () => {
            return fileTxt
          });
        const nockRequestS3 = nock(url1S3)
          .get('/')
          .replyWithError('Error Message 1234');

        storage.downloadFile('bucket', 'file.docx', function (err, resp) {
          assert.strictEqual(err, null);
          assert.strictEqual(resp.statusCode, 200);
          assert.strictEqual(resp.body.toString(), fileTxt);
          const _config = storage.getConfig();
          assert.strictEqual(_config.activeStorage, 1);
          assert.strictEqual(nockRequestS1.pendingMocks().length, 0);
          assert.strictEqual(nockRequestS2.pendingMocks().length, 0);
          assert.strictEqual(nockRequestS3.pendingMocks().length, 0);
          done();
        })
      })

      it('should return an error if all storage are not available, and reset the active storage to the main', function(done) {
        const nockRequestS1 = nock(url1S3)
          .get('/bucket/file.docx')
          .reply(500)
        const nockRequestS2 = nock(url2S3)
          .get('/bucket/file.docx')
          .reply(500, () => {
            return fileTxt
          });
        const nockRequestS3 = nock(url1S3)
          .get('/')
          .reply(500);

        storage.downloadFile('bucket', 'file.docx', function (err, resp) {
          assert.strictEqual(err.toString(), 'Error: All S3 storages are not available');
          assert.strictEqual(resp, undefined);
          const _config = storage.getConfig();
          assert.strictEqual(_config.activeStorage, 0);
          assert.strictEqual(nockRequestS1.pendingMocks().length, 0);
          assert.strictEqual(nockRequestS2.pendingMocks().length, 0);
          assert.strictEqual(nockRequestS3.pendingMocks().length, 0);
          done();
        })
      })
    });

    describe("PARALLEL REQUESTS", function () {

      function getDownloadFilePromise() {
        return new Promise((resolve, reject) => {
          try {
            storage.downloadFile('bucket', 'file.odt', function (err, resp) {
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

      it('should fallback to a child if the main storage return any kind of errors, then should reconnect to the main storage automatically', function (done) {
        const nockRequestS1 = nock(url1S3)
          .get('/bucket/file.odt')
          .reply(500)
          .get('/bucket/file.odt')
          .reply(500);
        const nockRequestS2 = nock(url2S3)
          .get('/bucket/file.odt')
          .reply(200, () => {
            return fileTxt
          })
          .get('/bucket/file.odt')
          .reply(200, () => {
            return fileTxt
          });
        const nockRequestS3 = nock(url1S3)
          .get('/')
          .reply(200);
        const nockRequestS4 = nock(url1S3)
          .get('/bucket/file.odt')
          .reply(200, () => {
            return fileTxt
          })

        let promise1 = getDownloadFilePromise()
        let promise2 = getDownloadFilePromise()

        Promise.all([promise1, promise2]).then(results => {
          assert.strictEqual(results.length, 2)
          assert.strictEqual(results[0].body.toString(), fileTxt);
          assert.strictEqual(results[0].statusCode, 200);
          assert.strictEqual(results[1].body.toString(), fileTxt);
          assert.strictEqual(results[1].statusCode, 200);
          assert.strictEqual(nockRequestS1.pendingMocks().length, 0);
          assert.strictEqual(nockRequestS2.pendingMocks().length, 0);
          assert.strictEqual(nockRequestS3.pendingMocks().length, 0);
          assert.deepStrictEqual(storage.getConfig().activeStorage, 0);
          /** Last batch requesting the main storage, everything is ok */
          storage.downloadFile('bucket', 'file.odt', function (err, resp) {
            assert.strictEqual(err, null);
            assert.strictEqual(resp.body.toString(), fileTxt);
            assert.strictEqual(resp.statusCode, 200);
            assert.strictEqual(nockRequestS4.pendingMocks().length, 0);
            assert.deepStrictEqual(storage.getConfig().activeStorage, 0);
            done();
          });
        }).catch(err => {
          assert.strictEqual(err, null);
          done();
        });
      })

      it('should fallback to a child if the main storage return any kind of errors, then should reconnect to the main storage after multiple try', function (done) {
        /** First Batch */
        const nockRequestS1 = nock(url1S3)
          .get('/bucket/file.odt')
          .reply(500)
          .get('/bucket/file.odt')
          .reply(500);
        const nockRequestS2 = nock(url2S3)
          .get('/bucket/file.odt')
          .reply(200, () => {
            return fileTxt
          })
          .get('/bucket/file.odt')
          .reply(200, () => {
            return fileTxt
          });
        const nockRequestS3 = nock(url1S3)
          .get('/')
          .reply(500);

        /** Second Batch */
        const nockRequestS4 = nock(url2S3)
          .get('/bucket/file.odt')
          .reply(200, () => {
            return fileTxt
          })
          .get('/bucket/file.odt')
          .reply(200, () => {
            return fileTxt
          });
        const nockRequestS5 = nock(url1S3)
          .get('/')
          .reply(500);

        /** Third Batch */
        const nockRequestS6 = nock(url2S3)
          .get('/bucket/file.odt')
          .reply(200, () => {
            return fileTxt
          })
        const nockRequestS7 = nock(url1S3)
          .get('/')
          .reply(200);
        /** Fourth Batch */
        const nockRequestS8 = nock(url1S3)
          .get('/bucket/file.odt')
          .reply(200, () => {
            return fileTxt
          })

        /** First batch of requests > S3 main return error > Child storage response ok */
        let promise1 = getDownloadFilePromise()
        let promise2 = getDownloadFilePromise()
        Promise.all([promise1, promise2]).then(function (results) {
          assert.strictEqual(results.length, 2)
          assert.strictEqual(results[0].body.toString(), fileTxt);
          assert.strictEqual(results[0].statusCode, 200);
          assert.strictEqual(results[1].body.toString(), fileTxt);
          assert.strictEqual(results[1].statusCode, 200);
          assert.strictEqual(nockRequestS1.pendingMocks().length, 0);
          assert.strictEqual(nockRequestS2.pendingMocks().length, 0);
          assert.strictEqual(nockRequestS3.pendingMocks().length, 0);
          assert.deepStrictEqual(storage.getConfig().activeStorage, 1);
          /** Second batch of requests > Still requesting the child storage, the main storage is still not available  */
          let promise3 = getDownloadFilePromise()
          let promise4 = getDownloadFilePromise()
          Promise.all([promise3, promise4]).then(function (results) {
            assert.strictEqual(results.length, 2)
            assert.strictEqual(results[0].body.toString(), fileTxt);
            assert.strictEqual(results[0].statusCode, 200);
            assert.strictEqual(results[1].body.toString(), fileTxt);
            assert.strictEqual(results[1].statusCode, 200);
            assert.strictEqual(nockRequestS4.pendingMocks().length, 0);
            assert.strictEqual(nockRequestS5.pendingMocks().length, 0);
            assert.deepStrictEqual(storage.getConfig().activeStorage, 1);
            /** Third batch of requests >  Still requesting the child storage, the main storage is now Available! Active storage is reset to the main storage  */
            storage.downloadFile('bucket', 'file.odt', function (err, resp) {
              assert.strictEqual(err, null);
              assert.strictEqual(resp.body.toString(), fileTxt);
              assert.strictEqual(resp.statusCode, 200);
              assert.strictEqual(nockRequestS6.pendingMocks().length, 0);
              assert.strictEqual(nockRequestS7.pendingMocks().length, 0);
              assert.deepStrictEqual(storage.getConfig().activeStorage, 0);
              /** Fourth batch requesting the main storage, everything is ok */
              storage.downloadFile('bucket', 'file.odt', function (err, resp) {
                assert.strictEqual(err, null);
                assert.strictEqual(resp.body.toString(), fileTxt);
                assert.strictEqual(resp.statusCode, 200);
                assert.strictEqual(nockRequestS8.pendingMocks().length, 0);
                assert.deepStrictEqual(storage.getConfig().activeStorage, 0);
                done();
              });
            });
          }).catch(function (err) {
            assert.strictEqual(err, null);
            done();
          });
        }).catch(function (err) {
          assert.strictEqual(err, null);
          done();
        });
      })

    });

  });

  describe('uploadFile', function() {

    describe("REQUEST MAIN STORAGE", function () {
      const _header = {
        'content-length': '0',
        'last-modified': 'Wed, 03 Nov 2021 13:02:39 GMT',
        date: 'Wed, 03 Nov 2021 14:28:48 GMT',
        etag: 'a30776a059eaf26eebf27756a849097d',
        'x-amz-request-id': '318BC8BC148832E5',
        'x-amz-id-2': 'eftixk72aD6Ap51TnqcoF8eFidJG9Z/2mkiDFu8yU9AS1ed4OpIszj7UDNEHGran'
      }

      it("should upload a file provided as buffer", function() {

        const nockRequestS1 = nock(url1S3)
          .defaultReplyHeaders(_header)
          .put('/bucket/file.pdf')
          .reply(200, (uri, requestBody) => {
            assert.strictEqual(requestBody, fileXml);
            return '';
          });

        storage.uploadFile('bucket', 'file.pdf', Buffer.from(fileXml), function(err, resp) {
          assert.strictEqual(err, null);
          assert.strictEqual(resp.statusCode, 200);
          assert.strictEqual(JSON.stringify(resp.headers), JSON.stringify(_header));
          assert.strictEqual(resp.body.toString(), '');
          assert.strictEqual(nockRequestS1.pendingMocks().length, 0);
        })
      })

      it("should upload a file provided as local path", function() {

        const nockRequestS1 = nock(url1S3)
          .defaultReplyHeaders(_header)
          .put('/bucket/file.pdf')
          .reply(200, (uri, requestBody) => {
            assert.strictEqual(requestBody, fileXml);
            return '';
          });

        storage.uploadFile('bucket', 'file.pdf', fileXmlPath, function(err, resp) {
          assert.strictEqual(err, null);
          assert.strictEqual(resp.statusCode, 200);
          assert.strictEqual(JSON.stringify(resp.headers), JSON.stringify(_header));
          assert.strictEqual(resp.body.toString(), '');
          assert.strictEqual(nockRequestS1.pendingMocks().length, 0);
        })
      })

      it("should upload a file provided as buffer with OPTIONS (like metadata)", function(done) {
        const _options = {
          headers: {
            "x-amz-meta-name": "carbone",
            "x-amz-checksum-sha256": "0ea4be78f6c3948588172edc6d8789ffe3cec461f385e0ac447e581731c429b5"
          },
          queries: {
            test : "2"
          }
        }

        const nockRequestS1 = nock(url1S3,  {
            reqheaders: {
              'x-amz-content-sha256': () => true,
              'x-amz-date': () => true,
              'authorization': () => true,
              'host': () => true,
              'x-amz-meta-name': () => true,
              'x-amz-checksum-sha256': () => true
            }
          })
          .defaultReplyHeaders(_header)
          .put('/bucket/file.pdf')
          .query(_options.queries)
          .reply(200, (uri, requestBody) => {
            assert.strictEqual(requestBody, fileXml);
            return '';
          });


        storage.uploadFile('bucket', 'file.pdf', Buffer.from(fileXml), _options, function(err, resp) {
          assert.strictEqual(err, null);
          assert.strictEqual(resp.statusCode, 200);
          assert.strictEqual(JSON.stringify(resp.headers), JSON.stringify(_header));
          assert.strictEqual(resp.body.toString(), '');
          assert.strictEqual(nockRequestS1.pendingMocks().length, 0);
          done();
        })
      })

    });

    describe("SWITCH TO CHILD STORAGE", function () {

      // it("should not be able to upload a file into a child storage if the write permission is disallowed", function() {

      // })

    });

  });

  describe('deleteFile', function() {

    describe("REQUEST MAIN STORAGE", function () {
    });

    describe("SWITCH TO CHILD STORAGE", function () {

      // it("should not be able to delete a file of a child storage if the write permission is disallowed", function() {

      // })

    });

  });

  describe('deleteFiles', function() {

    describe("REQUEST MAIN STORAGE", function () {
    });

    describe("SWITCH TO CHILD STORAGE", function () {

      // it("should not be able to delete a file of a child storage if the write permission is disallowed", function() {

      // })

    });

  });

  describe('getFileMetadata', function() {

    describe("REQUEST MAIN STORAGE", function () {
    });

    describe("SWITCH TO CHILD STORAGE", function () {
    });

  });


  describe('setFileMetadata', function() {

    describe("REQUEST MAIN STORAGE", function () {
    });

    describe("SWITCH TO CHILD STORAGE", function () {

      // it("should not be able to write file metadata of a child storage if the write permission is disallowed", function() {

      // })

    });

  });

});