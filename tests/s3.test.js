const s3 = require('../s3.js');
const assert = require('assert');
const nock   = require('nock');
const fs     = require('fs');
const path   = require('path');

let storage = {};
const url1S3 = 'https://s3.gra.first.cloud.test';
const url2S3 = 'https://s3.de.first.cloud.test';

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
    it('should return code 200, and request signed with AWS4', function () {
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
      });
    });

    it('should return code 403 Forbidden', function () {
      const nockRequest = nock(url1S3).intercept("/customBucket", "HEAD").reply(403, '');

      storage.headBucket('customBucket', function(err, resp) {
        assert.strictEqual(err, null);
        assert.strictEqual(resp.statusCode, 403);
        assert.strictEqual(resp.body.toString(), '');
        assert.strictEqual(nockRequest.pendingMocks().length, 0);
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
      it('should download a file', function() {
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
            return fs.createReadStream(path.join(__dirname, 'assets', 'file.txt'));
          });
        storage.downloadFile('bucket', 'file.docx', function (err, resp) {
          assert.strictEqual(err, null);
          assert.strictEqual(resp.statusCode, 200);
          assert.strictEqual(resp.body.toString(), 'The platypus, sometimes referred to as the duck-billed platypus, is a semiaquatic, egg-laying mammal endemic to eastern Australia.');
          assert.strictEqual(JSON.stringify(resp.headers), JSON.stringify(_header))
          assert.strictEqual(nockRequest.pendingMocks().length, 0);
        })
      })

      it('should return code 404 if the file does not exist', function() {
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
        })
      })
    });

    describe("SWITCH TO CHILD STORAGE", function () {
      it('should download a file from the second storage if the main storage returns a 500 error', function() {
        const nockRequestS1 = nock(url1S3)
          .get('/bucket/file.docx')
          .reply(500);
        const nockRequestS2 = nock(url2S3)
          .get('/bucket/file.docx')
          .reply(200, () => {
            return fs.createReadStream(path.join(__dirname, 'assets', 'file.txt'));
          });
        const nockRequestS3 = nock(url1S3)
          .get('/')
          .reply(500);
        storage.downloadFile('bucket', 'file.docx', function (err, resp) {
          assert.strictEqual(err, null);
          assert.strictEqual(resp.statusCode, 200);
          assert.strictEqual(resp.body.toString(), 'The platypus, sometimes referred to as the duck-billed platypus, is a semiaquatic, egg-laying mammal endemic to eastern Australia.');
          const _config = storage.getConfig();
          assert.strictEqual(_config.activeStorage, 1);
          assert.strictEqual(nockRequestS1.pendingMocks().length, 0);
          assert.strictEqual(nockRequestS2.pendingMocks().length, 0);
          assert.strictEqual(nockRequestS3.pendingMocks().length, 0);
        })
      })

      it('should download a file from the second storage if the main storage returns a 500 error, then should reconnect to the main storage', function() {
        const nockRequestS1 = nock(url1S3)
          .get('/bucket/file.docx')
          .reply(500)
        const nockRequestS2 = nock(url2S3)
          .get('/bucket/file.docx')
          .reply(200, () => {
            return fs.createReadStream(path.join(__dirname, 'assets', 'file.txt'));
          });
        const nockRequestS3 = nock(url1S3)
          .get('/')
          .reply(200);

        storage.downloadFile('bucket', 'file.docx', function (err, resp) {
          assert.strictEqual(err, null);
          assert.strictEqual(resp.statusCode, 200);
          assert.strictEqual(resp.body.toString(), 'The platypus, sometimes referred to as the duck-billed platypus, is a semiaquatic, egg-laying mammal endemic to eastern Australia.');
          const _config = storage.getConfig();
          assert.strictEqual(_config.activeStorage, 0);
          assert.strictEqual(nockRequestS1.pendingMocks().length, 0);
          assert.strictEqual(nockRequestS2.pendingMocks().length, 0);
          assert.strictEqual(nockRequestS3.pendingMocks().length, 0);
        })
      })

      it('should download a file from the second storage if the authentication on the main storage is not allowed', function() {

      })

      it('should download a file from the second storage if the main storage timeout', function() {

      })

      it('should download a file from the second storage if the main storage returns any kind of error', function() {

      })

      it('should return an error if all storage are not available', function() {

      })
    });

  });

  describe('uploadFile', function() {

    describe("REQUEST MAIN STORAGE", function () {

      // it("should upload a file provided as buffer", function() {

      // })

      // it("should upload a file provided as local path", function() {

      // })

    });

    describe("SWITCH TO CHILD STORAGE", function () {

      // it("should not be able to upload a file into a child storage", function() {

      // })

    });

  });

  describe('deleteFile', function() {

    describe("REQUEST MAIN STORAGE", function () {
    });

    describe("SWITCH TO CHILD STORAGE", function () {
    });

  });

  describe('deleteFiles', function() {

    describe("REQUEST MAIN STORAGE", function () {
    });

    describe("SWITCH TO CHILD STORAGE", function () {
    });

  });

  describe('deleteFiles', function() {

    describe("REQUEST MAIN STORAGE", function () {
    });

    describe("SWITCH TO CHILD STORAGE", function () {
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
    });

  });

});