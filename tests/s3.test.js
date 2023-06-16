/** Init retry delay for "Rock-req" tests */
const rock   = require('rock-req');
const _rockDefaults = { ...rock.defaults };
_rockDefaults.retryDelay = 200
global.rockReqConf = _rockDefaults;

const s3 = require('../index')
const assert = require('assert');
const nock   = require('nock');
const fs     = require('fs');
const path   = require('path');
var stream = require('stream');


let storage = {};
const url1S3 = 'https://s3.gra.first.cloud.test';
const url2S3 = 'https://s3.de.first.cloud.test';

let dataStream = ''
const outputStreamFunction = function () {
  dataStream = '';
  let outputStream = new stream.Writable();
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

/** ASSETS for download/upload */
const fileTxtPath = path.join(__dirname, 'assets', 'file.txt');
const fileTxt = fs.readFileSync(fileTxtPath).toString();
const fileXmlPath = path.join(__dirname, 'assets', 'files.xml');
const fileXml = fs.readFileSync(fileXmlPath).toString();
/** ASSETS for List objects Requests */
const _listObjectsResponseXML = fs.readFileSync(path.join(__dirname, "./assets", 'listObjects.response.xml'));
const _listObjectsResponseJSON = require('./assets/listObjects.response.json');

describe('S3 SDK', function () {

  beforeEach(function() {
    storage = s3([{
      accessKeyId    : '2371bebbe7ac4b2db39c09eadf011661',
      secretAccessKey: '9978f6abf7f445566a2d316424aeef2',
      url            : url1S3.replace('https://', ''),
      region         : 'gra',
      buckets        : {
        invoices : "invoices-gra-1234"
      }
    },
    {
      accessKeyId    : '2371bebbe7ac4b2db39c09eadf011661',
      secretAccessKey: '9978f6abf7f445566a2d316424aeef2',
      url            : url2S3.replace('https://', ''),
      region         : 'de',
      buckets        : {
        invoices : "invoices-de-8888"
      }
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

    it("should create a new instance", function () {
      const _storage = s3({ accessKeyId: '1234', secretAccessKey: '4567', region: 'gra', url: 'url.gra.s3.ovh.io' });
      const _storage2 = s3({ accessKeyId: 'abcd', secretAccessKey: 'efgh', region: 'sbg', url: 'url.sbg.s3.ovh.io' });
      assert.strictEqual(_storage.getConfig().storages.length, 1);
      assert.strictEqual(_storage2.getConfig().storages.length, 1);
      assert.strictEqual(_storage.getConfig().storages[0].accessKeyId, '1234')
      assert.strictEqual(_storage.getConfig().storages[0].secretAccessKey, '4567')
      assert.strictEqual(_storage.getConfig().storages[0].region, 'gra')
      assert.strictEqual(_storage.getConfig().storages[0].url, 'url.gra.s3.ovh.io')
      assert.strictEqual(_storage2.getConfig().storages[0].accessKeyId, 'abcd')
      assert.strictEqual(_storage2.getConfig().storages[0].secretAccessKey, 'efgh')
      assert.strictEqual(_storage2.getConfig().storages[0].region, 'sbg')
      assert.strictEqual(_storage2.getConfig().storages[0].url, 'url.sbg.s3.ovh.io')
    })

    it("should set a new timeout value", function() {
      const _storage = s3({ accessKeyId: '-', secretAccessKey: '-', region: '-', url: '-' });
      assert.strictEqual(_storage.getConfig().timeout, 5000);
      _storage.setTimeout(10000);
      assert.strictEqual(_storage.getConfig().timeout, 10000);
    });
  })

  describe('headBucket', function() {
    describe("REQUEST MAIN STORAGE", function () {

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

      it('should return code 200 and request a bucket as ALIAS', function (done) {
        const nockRequest = nock(url1S3,
          {
            reqheaders: {
              'x-amz-content-sha256': () => true,
              'x-amz-date': () => true,
              'authorization': () => true,
              'host': () => true
            }
          }).intercept("/invoices-gra-1234", "HEAD").reply(200, '');

        storage.headBucket('invoices', function(err, resp) {
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

    describe("SWITCH TO CHILD STORAGE", function () {
      it('should switch to the child storage and return code 200 with bucket as ALIAS', function (done) {
        const nockRequestS1 = nock(url1S3).intercept("/invoices-gra-1234", "HEAD").reply(500, '');
        const nockRequestS2 = nock(url2S3).intercept("/invoices-de-8888", "HEAD").reply(200, '');
        const nockRequestS3 = nock(url1S3).get('/').reply(500);

        storage.headBucket('invoices', function(err, resp) {
          assert.strictEqual(err, null);
          assert.strictEqual(resp.statusCode, 200);
          assert.strictEqual(resp.body.toString(), '');
          assert.strictEqual(nockRequestS1.pendingMocks().length, 0);
          assert.strictEqual(nockRequestS2.pendingMocks().length, 0);
          assert.strictEqual(nockRequestS3.pendingMocks().length, 0);
          done();
        });
      });
    })
  });

  describe('listBuckets', function() {

    describe("REQUEST MAIN STORAGE", function () {
      it('should fetch a list of buckets', function (done) {
        const _header = {
          'content-type': 'application/xml',
          'content-length': '366',
          'x-amz-id-2': 'tx606add09487142fa88e67-00641aacf4',
          'x-amz-request-id': 'tx606add09487142fa88e67-00641aacf4',
          'x-trans-id': 'tx606add09487142fa88e67-00641aacf4',
          'x-openstack-request-id': 'tx606add09487142fa88e67-00641aacf4',
          date: 'Wed, 22 Mar 2023 07:23:32 GMT',
          connection: 'close'
        }

        const nockRequest = nock(url1S3)
          .defaultReplyHeaders(_header)
          .get('/')
          .reply(200, () => {
            return "<?xml version=\"1.0\" encoding=\"UTF-8\"?><ListAllMyBucketsResult xmlns=\"http://s3.amazonaws.com/doc/2006-03-01/\"><Owner><ID>89123456:user-feiowjfOEIJW</ID><DisplayName>12345678:user-feiowjfOEIJW</DisplayName></Owner><Buckets><Bucket><Name>invoices</Name><CreationDate>2023-02-27T11:46:24.000Z</CreationDate></Bucket><Bucket><Name>www</Name><CreationDate>2023-02-27T11:46:24.000Z</CreationDate></Bucket></Buckets></ListAllMyBucketsResult>";
          });

        storage.listBuckets((err, resp) => {
          assert.strictEqual(err, null);
          assert.strictEqual(resp.statusCode, 200);
          assert.strictEqual(JSON.stringify(resp.body), JSON.stringify({
            "bucket": [
              { "name": "invoices", "creationdate": "2023-02-27T11:46:24.000Z" },
              { "name": "www",      "creationdate": "2023-02-27T11:46:24.000Z" }
            ]
          }));
          assert.strictEqual(JSON.stringify(resp.headers), JSON.stringify(_header))
          assert.strictEqual(nockRequest.pendingMocks().length, 0);
          done();
        })
      })

      it('should return an error if credentials are not correct', function (done) {
        const _header = {
          'x-amz-request-id': 'BEFVPYB9PM889VMS',
          'x-amz-id-2': 'Pnby9XcoK7X/GBpwr+vVV/X3XyadxsUkTzGdSJS5zRMhs2RvZDGroWleytOYGmYRSszFbsaZWUo=',
          'content-type': 'application/xml',
          'transfer-encoding': 'chunked',
          date: 'Wed, 22 Mar 2023 07:37:22 GMT',
          server: 'AmazonS3',
          connection: 'close'
        }

        const nockRequest = nock(url1S3)
          .defaultReplyHeaders(_header)
          .get('/')
          .reply(403, () => {
            return "<?xml version=\"1.0\" encoding=\"UTF-8\"?><Error><Code>InvalidAccessKeyId</Code><Message>The AWS Access Key Id you provided does not exist in our records.</Message><AWSAccessKeyId>AKIAUO7WHYLVFADDFL57e</AWSAccessKeyId><RequestId>BSTT951V1FREKS2X</RequestId><HostId>zWFC8ZOiZvyxTUgcYjHDD9rmPDG81TCJHkZhAv4zgguuR5I9aeqSFA9Ns4r5PdKy9+9o+xDLpOk=</HostId></Error>";
          });

        storage.listBuckets((err, resp) => {
          assert.strictEqual(err, null);
          assert.strictEqual(resp.statusCode, 403);
          assert.strictEqual(JSON.stringify(resp.body), JSON.stringify({
            error: {
              code: 'InvalidAccessKeyId',
              message: 'The AWS Access Key Id you provided does not exist in our records.',
              awsaccesskeyid: 'AKIAUO7WHYLVFADDFL57e',
              requestid: 'BSTT951V1FREKS2X',
              hostid: 'zWFC8ZOiZvyxTUgcYjHDD9rmPDG81TCJHkZhAv4zgguuR5I9aeqSFA9Ns4r5PdKy9+9o+xDLpOk='
            }
          }));
          assert.strictEqual(JSON.stringify(resp.headers), JSON.stringify(_header))
          assert.strictEqual(nockRequest.pendingMocks().length, 0);
          done();
        })
      })
    });

    describe("SWITCH TO CHILD STORAGE", function () {
      it('should fetch a list of buckets', function (done) {
        const nockRequestS1 = nock(url1S3)
          .get('/')
          .reply(500, '');

        const nockRequestS2 = nock(url2S3)
          .get('/')
          .reply(200, () => {
            return "<?xml version=\"1.0\" encoding=\"UTF-8\"?><ListAllMyBucketsResult xmlns=\"http://s3.amazonaws.com/doc/2006-03-01/\"><Owner><ID>89123456:user-feiowjfOEIJW</ID><DisplayName>12345678:user-feiowjfOEIJW</DisplayName></Owner><Buckets><Bucket><Name>invoices</Name><CreationDate>2023-02-27T11:46:24.000Z</CreationDate></Bucket><Bucket><Name>www</Name><CreationDate>2023-02-27T11:46:24.000Z</CreationDate></Bucket></Buckets></ListAllMyBucketsResult>";
          });

        const nockRequestS3 = nock(url1S3)
          .get('/')
          .reply(500);

        storage.listBuckets((err, resp) => {
          assert.strictEqual(err, null);
          assert.strictEqual(resp.statusCode, 200);
          assert.strictEqual(JSON.stringify(resp.body), JSON.stringify({
            "bucket": [
              { "name": "invoices", "creationdate": "2023-02-27T11:46:24.000Z" },
              { "name": "www",      "creationdate": "2023-02-27T11:46:24.000Z" }
            ]
          }));
          assert.strictEqual(JSON.stringify(resp.headers), JSON.stringify({}))
          assert.strictEqual(nockRequestS1.pendingMocks().length, 0);
          assert.strictEqual(nockRequestS2.pendingMocks().length, 0);
          assert.strictEqual(nockRequestS3.pendingMocks().length, 0);
          done();
        })
      })
    });

    describe("Options 'requestStorageIndex'", function() {

      it("should request the first storage and should return an error if the first storage is not available", function(done) {
        const nockRequestS1 = nock(url1S3)
          .get('/')
          .reply(500, '');

        storage.listBuckets({ requestStorageIndex: 0 }, (err, resp) => {
          assert.strictEqual(err, null);
          assert.strictEqual(resp.statusCode, 500);
          assert.strictEqual(resp.body.toString(), '');
          assert.strictEqual(JSON.stringify(resp.headers), JSON.stringify({}))
          assert.strictEqual(nockRequestS1.pendingMocks().length, 0);
          done();
        })
      })

      it("should request the second storage and should return an error if the second storage is not available", function(done) {
        const nockRequestS1 = nock(url2S3)
          .get('/')
          .reply(500, '');

        storage.listBuckets({ requestStorageIndex: 1 }, (err, resp) => {
          assert.strictEqual(err, null);
          assert.strictEqual(resp.statusCode, 500);
          assert.strictEqual(resp.body.toString(), '');
          assert.strictEqual(JSON.stringify(resp.headers), JSON.stringify({}))
          assert.strictEqual(nockRequestS1.pendingMocks().length, 0);
          done();
        })
      })

      it("should request the second storage and get a list of buckets", function(done) {
        const nockRequestS1 = nock(url2S3)
          .get('/')
          .reply(200, () => {
            return "<?xml version=\"1.0\" encoding=\"UTF-8\"?><ListAllMyBucketsResult xmlns=\"http://s3.amazonaws.com/doc/2006-03-01/\"><Owner><ID>89123456:user-feiowjfOEIJW</ID><DisplayName>12345678:user-feiowjfOEIJW</DisplayName></Owner><Buckets><Bucket><Name>invoices</Name><CreationDate>2023-02-27T11:46:24.000Z</CreationDate></Bucket><Bucket><Name>www</Name><CreationDate>2023-02-27T11:46:24.000Z</CreationDate></Bucket></Buckets></ListAllMyBucketsResult>";
          });

        storage.listBuckets({ requestStorageIndex: 1 }, (err, resp) => {
          assert.strictEqual(err, null);
          assert.strictEqual(resp.statusCode, 200);
          assert.strictEqual(JSON.stringify(resp.body), JSON.stringify({
            "bucket": [
              { "name": "invoices", "creationdate": "2023-02-27T11:46:24.000Z" },
              { "name": "www",      "creationdate": "2023-02-27T11:46:24.000Z" }
            ]
          }));
          assert.strictEqual(JSON.stringify(resp.headers), JSON.stringify({}))
          assert.strictEqual(nockRequestS1.pendingMocks().length, 0);
          done();
        })
      })
    })

  });

  describe('listFiles', function() {

    describe("REQUEST MAIN STORAGE", function () {
      it('should fetch a list of objects', function (done) {
        const _header = {
          'content-type': 'application/xml',
          'content-length': '1887',
          'x-amz-id-2': 'txf0b438dfd25b444ba3f60-00641807d7',
          'x-amz-request-id': 'txf0b438dfd25b444ba3f60-00641807d7',
          'x-trans-id': 'txf0b438dfd25b444ba3f60-00641807d7',
          'x-openstack-request-id': 'txf0b438dfd25b444ba3f60-00641807d7',
          date: 'Mon, 20 Mar 2023 07:14:31 GMT',
          connection: 'close'
        }

        const nockRequest = nock(url1S3)
          .defaultReplyHeaders(_header)
          .get('/bucket')
          .query({ 'list-type' : 2 })
          .reply(200, () => {
            return _listObjectsResponseXML;
          });

        storage.listFiles('bucket', (err, resp) => {
          assert.strictEqual(err, null);
          assert.strictEqual(resp.statusCode, 200);
          assert.strictEqual(JSON.stringify(resp.body), JSON.stringify(_listObjectsResponseJSON));
          assert.strictEqual(JSON.stringify(resp.headers), JSON.stringify(_header))
          assert.strictEqual(nockRequest.pendingMocks().length, 0);
          done();
        })
      })

      it('should fetch a list of objects from a bucket as ALIAS', function (done) {
        const _header = {
          'content-type': 'application/xml',
          'content-length': '1887',
          'x-amz-id-2': 'txf0b438dfd25b444ba3f60-00641807d7',
          'x-amz-request-id': 'txf0b438dfd25b444ba3f60-00641807d7',
          'x-trans-id': 'txf0b438dfd25b444ba3f60-00641807d7',
          'x-openstack-request-id': 'txf0b438dfd25b444ba3f60-00641807d7',
          date: 'Mon, 20 Mar 2023 07:14:31 GMT',
          connection: 'close'
        }

        const nockRequest = nock(url1S3)
          .defaultReplyHeaders(_header)
          .get('/invoices-gra-1234')
          .query({ 'list-type' : 2 })
          .reply(200, () => {
            return _listObjectsResponseXML;
          });

        storage.listFiles('invoices', (err, resp) => {
          assert.strictEqual(err, null);
          assert.strictEqual(resp.statusCode, 200);
          assert.strictEqual(JSON.stringify(resp.body), JSON.stringify(_listObjectsResponseJSON));
          assert.strictEqual(JSON.stringify(resp.headers), JSON.stringify(_header))
          assert.strictEqual(nockRequest.pendingMocks().length, 0);
          done();
        })
      })

      it('should fetch a list of objects with query parameters (prefix & limit)', function (done) {
        const _header = {
          'content-type': 'application/xml',
          'content-length': '1887',
          'x-amz-id-2': 'txf0b438dfd25b444ba3f60-00641807d7',
          'x-amz-request-id': 'txf0b438dfd25b444ba3f60-00641807d7',
          'x-trans-id': 'txf0b438dfd25b444ba3f60-00641807d7',
          'x-openstack-request-id': 'txf0b438dfd25b444ba3f60-00641807d7',
          date: 'Mon, 20 Mar 2023 07:14:31 GMT',
          connection: 'close'
        }

        const nockRequest = nock(url1S3)
          .defaultReplyHeaders(_header)
          .get('/bucket')
          .query({
            "list-type" : 2,
            "prefix"    : "document",
            "max-keys"  : 2
          })
          .reply(200, () => {
            return _listObjectsResponseXML;
          });

        storage.listFiles('bucket', { queries: { "prefix": "document", "max-keys": 2 } }, (err, resp) => {
          assert.strictEqual(err, null);
          assert.strictEqual(resp.statusCode, 200);
          assert.strictEqual(JSON.stringify(resp.body), JSON.stringify(_listObjectsResponseJSON));
          assert.strictEqual(JSON.stringify(resp.headers), JSON.stringify(_header))
          assert.strictEqual(nockRequest.pendingMocks().length, 0);
          done();
        })
      })

      it("should return an error if the bucket does not exist", function (done) {
        const _headers = {
          'content-type': 'application/xml',
          'x-amz-id-2': 'tx8fa5f00b19af4756b9ef3-0064184d77',
          'x-amz-request-id': 'tx8fa5f00b19af4756b9ef3-0064184d77',
          'x-trans-id': 'tx8fa5f00b19af4756b9ef3-0064184d77',
          'x-openstack-request-id': 'tx8fa5f00b19af4756b9ef3-0064184d77',
          date: 'Mon, 20 Mar 2023 12:11:35 GMT',
          'transfer-encoding': 'chunked',
          connection: 'close'
        }
        const _expectedBody = {
          error: {
            code: 'NoSuchBucket',
            message: 'The specified bucket does not exist.',
            requestid: 'txe285e692106542e88a2f5-0064184e80',
            bucketname: 'buckeeeet'
          }
        }
        const nockRequest = nock(url1S3)
          .defaultReplyHeaders(_headers)
          .get('/buckeeeet')
          .query({
            "list-type" : 2
          })
          .reply(404, () => {
            return "<?xml version=\"1.0\" encoding=\"UTF-8\"?><Error><Code>NoSuchBucket</Code><Message>The specified bucket does not exist.</Message><RequestId>txe285e692106542e88a2f5-0064184e80</RequestId><BucketName>buckeeeet</BucketName></Error>";
          });
        storage.listFiles('buckeeeet', (err, resp) => {
          assert.strictEqual(err, null);
          assert.strictEqual(resp.statusCode, 404);
          assert.strictEqual(JSON.stringify(resp.body), JSON.stringify(_expectedBody));
          assert.strictEqual(JSON.stringify(resp.headers), JSON.stringify(_headers))
          assert.strictEqual(nockRequest.pendingMocks().length, 0);
          done();
        })
      })
    })

    describe("SWITCH TO CHILD STORAGE", function () {
      it('should fetch a list of objects', function (done) {
        const nockRequestS1 = nock(url1S3)
          .get('/bucket')
          .query({ 'list-type' : 2 })
          .reply(500, '');

        const nockRequestS2 = nock(url2S3)
          .get('/bucket')
          .query({ 'list-type' : 2 })
          .reply(200, () => {
            return _listObjectsResponseXML;
          });

        const nockRequestS3 = nock(url1S3)
          .get('/')
          .reply(500);

        storage.listFiles('bucket', (err, resp) => {
          assert.strictEqual(err, null);
          assert.strictEqual(resp.statusCode, 200);
          assert.strictEqual(JSON.stringify(resp.body), JSON.stringify(_listObjectsResponseJSON));
          assert.strictEqual(JSON.stringify(resp.headers), JSON.stringify({}))
          assert.strictEqual(nockRequestS1.pendingMocks().length, 0);
          assert.strictEqual(nockRequestS2.pendingMocks().length, 0);
          assert.strictEqual(nockRequestS3.pendingMocks().length, 0);
          done();
        })
      })
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

      it('should download a file as STREAM', function(done) {
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

        storage.downloadFile('bucket', 'file.docx', { output: outputStreamFunction }, function (err, resp) {
          assert.strictEqual(err, null);
          assert.strictEqual(resp.statusCode, 200);

          assert.strictEqual(dataStream, fileTxt)
          assert.strictEqual(nockRequest.pendingMocks().length, 0);
          assert.strictEqual(JSON.stringify(resp.headers), JSON.stringify(_header))
          done();
        })
      })

      it('should download a file from an alias', function(done) {
        const _header = {
          'content-length': '1492',
          'last-modified': 'Wed, 03 Nov 2021 13:02:39 GMT',
          date: 'Wed, 03 Nov 2021 14:28:48 GMT',
          etag: 'a30776a059eaf26eebf27756a849097d',
          'x-amz-request-id': '318BC8BC148832E5',
          'x-amz-id-2': 'eftixk72aD6Ap51TnqcoF8eFidJG9Z/2mkiDFu8yU9AS1ed4OpIszj7UDNEHGran'
        }
        const nockRequest = nock(url1S3, {
            reqheaders: {
              'x-amz-content-sha256': () => true,
              'x-amz-date': () => true,
              'authorization': () => true,
              'host': () => true
            }
          })
          .defaultReplyHeaders(_header)
          .get('/invoices-gra-1234/file.docx')
          .reply(200, () => {
            return fileTxt;
          });
        storage.downloadFile('invoices', 'file.docx', function (err, resp) {
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


      it('[STREAM] should return code 404 if the file does not exist and should convert the XML as JSON', function(done) {
        const _header = {'content-type': 'application/xml'}
        const nockRequest = nock(url1S3)
          .defaultReplyHeaders(_header)
          .get('/bucket/file.docx')
          .reply(404, "<?xml version='1.0' encoding='UTF-8'?><Error><Code>NoSuchKey</Code><Message>The specified key does not exist.</Message><RequestId>txc03d49a36c324653854de-006408d963</RequestId><Key>template222.odt</Key></Error>");

        storage.downloadFile('bucket', 'file.docx', { output: outputStreamFunction }, function (err, resp) {
          assert.strictEqual(err, null);
          assert.strictEqual(resp.statusCode, 404);
          assert.strictEqual(JSON.stringify(storage.xmlToJson(dataStream)), JSON.stringify({
            error: {
              code: 'NoSuchKey',
              message: 'The specified key does not exist.',
              requestid: 'txc03d49a36c324653854de-006408d963',
              key: 'template222.odt'
            }
          }))
          assert.strictEqual(nockRequest.pendingMocks().length, 0);
          assert.strictEqual(JSON.stringify(resp.headers), JSON.stringify(_header))
          done();
        })
      })

      it("should return an error if the bucket does not exist", function (done) {
        const _header = {
          'content-type': 'application/xml',
          'x-amz-id-2': 'txfa644d038be848a9938e3-00641850f0',
          'x-amz-request-id': 'txfa644d038be848a9938e3-00641850f0',
          'x-trans-id': 'txfa644d038be848a9938e3-00641850f0',
          'x-openstack-request-id': 'txfa644d038be848a9938e3-00641850f0',
          date: 'Mon, 20 Mar 2023 12:26:24 GMT',
          'transfer-encoding': 'chunked',
          connection: 'close'
        }
        const nockRequest = nock(url1S3)
          .defaultReplyHeaders(_header)
          .get('/buckeeeet/file.docx')
          .reply(404, () => {
            return "<?xml version='1.0' encoding='UTF-8'?><Error><Code>NoSuchBucket</Code><Message>The specified bucket does not exist.</Message><RequestId>txfa644d038be848a9938e3-00641850f0</RequestId><BucketName>buckeeeet</BucketName></Error>";
          });
        storage.downloadFile('buckeeeet', 'file.docx', function (err, resp) {
          assert.strictEqual(err, null);
          assert.strictEqual(resp.statusCode, 404);
          assert.strictEqual(JSON.stringify(resp.body), JSON.stringify({
            error: {
              code: 'NoSuchBucket',
              message: 'The specified bucket does not exist.',
              requestid: 'txfa644d038be848a9938e3-00641850f0',
              bucketname: 'buckeeeet'
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

      it('should download a file from the second storage if the main storage returns a 500 error and the container is an ALIAS', function(done) {
        const nockRequestS1 = nock(url1S3)
          .get('/invoices-gra-1234/file.docx')
          .reply(500);
        const nockRequestS2 = nock(url2S3)
          .get('/invoices-de-8888/file.docx')
          .reply(200, () => {
            return fileTxt
          });
        const nockRequestS3 = nock(url1S3)
          .get('/')
          .reply(500);

        storage.downloadFile('invoices', 'file.docx', function (err, resp) {
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

      it('should download a file as Stream from the second storage if the authentication on the main storage is not allowed', function(done) {
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

        storage.downloadFile('bucket', 'file.docx', { output: outputStreamFunction }, function (err, resp) {
          assert.strictEqual(err, null);
          assert.strictEqual(resp.statusCode, 200);
          assert.strictEqual(dataStream, fileTxt);
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

      it("should upload a file provided as buffer to a bucket alias", function() {

        const nockRequestS1 = nock(url1S3)
          .defaultReplyHeaders(_header)
          .put('/invoices-gra-1234/file.pdf')
          .reply(200, (uri, requestBody) => {
            assert.strictEqual(requestBody, fileXml);
            return '';
          });

        storage.uploadFile('invoices', 'file.pdf', Buffer.from(fileXml), function(err, resp) {
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

      it("should upload a file provided as buffer and pass requests options", function() {
        const expectedValue = "code-1235";
        const nockRequestS1 = nock(url1S3, {
            reqheaders: {
              'custom-option': (value) => {
                assert.strictEqual(value, expectedValue);
                return true;
              },
            }
          })
          .defaultReplyHeaders(_header)
          .put('/bucket/file.pdf')
          .reply(200, (uri, requestBody) => {
            assert.strictEqual(requestBody, fileXml);
            return '';
          });

        storage.uploadFile('bucket', 'file.pdf', Buffer.from(fileXml), { requestOptions: { headers: { "custom-option" : expectedValue } } }, function(err, resp) {
          assert.strictEqual(err, null);
          assert.strictEqual(resp.statusCode, 200);
          assert.strictEqual(JSON.stringify(resp.headers), JSON.stringify(_header));
          assert.strictEqual(resp.body.toString(), '');
          assert.strictEqual(nockRequestS1.pendingMocks().length, 0);
        })
      })

      it("should return an error if the file provided as local path does not exist", function() {
        storage.uploadFile('bucket', 'file.pdf', '/var/random/path/file.pdf', function(err, resp) {
          assert.strictEqual(err.toString(), "Error: ENOENT: no such file or directory, open '/var/random/path/file.pdf'");
          assert.strictEqual(resp, undefined);
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

      it("should return an error if the bucket does not exist", function (done) {

        const _headers = {
          'content-type': 'application/xml',
          'x-amz-id-2': 'tx33e4496c9d8746ad9cfcb-006418540f',
          'x-amz-request-id': 'tx33e4496c9d8746ad9cfcb-006418540f',
          'x-trans-id': 'tx33e4496c9d8746ad9cfcb-006418540f',
          'x-openstack-request-id': 'tx33e4496c9d8746ad9cfcb-006418540f',
          date: 'Mon, 20 Mar 2023 12:39:43 GMT',
          'transfer-encoding': 'chunked',
          connection: 'close'
        }

        const nockRequestS1 = nock(url1S3)
          .defaultReplyHeaders(_headers)
          .put('/buckeeeet/file.pdf')
          .reply(404, (uri, requestBody) => {
            assert.strictEqual(requestBody, fileXml);
            return Buffer.from("<?xml version='1.0' encoding='UTF-8'?><Error><Code>NoSuchBucket</Code><Message>The specified bucket does not exist.</Message><RequestId>tx9d1553e8d8de401bb8949-00641851bd</RequestId><BucketName>buckeeeet</BucketName></Error>");
          });

        storage.uploadFile('buckeeeet', 'file.pdf', fileXmlPath, function(err, resp) {
          assert.strictEqual(err, null);
          assert.strictEqual(resp.statusCode, 404);
          assert.strictEqual(JSON.stringify(resp.headers), JSON.stringify(_headers));
          assert.strictEqual(JSON.stringify(resp.body), JSON.stringify({
            error: {
              code: 'NoSuchBucket',
              message: 'The specified bucket does not exist.',
              requestid: 'tx9d1553e8d8de401bb8949-00641851bd',
              bucketname: 'buckeeeet'
            }
          }));
          assert.strictEqual(nockRequestS1.pendingMocks().length, 0);
          done();
        })
      })

    });

    describe("SWITCH TO CHILD STORAGE", function () {

      it("should upload a file into a child storage", function(done) {
        const _header = {
          'content-type': 'application/xml',
          'x-amz-id-2': 'txd14fbe8bc05341c0b548a-00640b2752',
          'x-amz-request-id': 'txd14fbe8bc05341c0b548a-00640b2752',
          'x-trans-id': 'txd14fbe8bc05341c0b548a-00640b2752',
          'x-openstack-request-id': 'txd14fbe8bc05341c0b548a-00640b2752',
          date: 'Fri, 10 Mar 2023 12:49:22 GMT',
          'transfer-encoding': 'chunked',
          connection: 'close'
        }

        const nockRequestS1 = nock(url1S3)
          .defaultReplyHeaders(_header)
          .put('/bucket/file.pdf')
          .reply(500, '');

        const nockRequestS2 = nock(url2S3)
          .defaultReplyHeaders(_header)
          .put('/bucket/file.pdf')
          .reply(200, (uri, requestBody) => {
            assert.strictEqual(requestBody, fileXml);
            return '';
          });
        const nockRequestS3 = nock(url1S3)
          .get('/')
          .reply(500);

        storage.uploadFile('bucket', 'file.pdf', Buffer.from(fileXml), function(err, resp) {
          assert.strictEqual(err, null);
          assert.strictEqual(resp.statusCode, 200);
          assert.strictEqual(resp.body.toString(), '');
          assert.strictEqual(JSON.stringify(resp.headers), JSON.stringify(_header));
          assert.strictEqual(nockRequestS1.pendingMocks().length, 0);
          assert.strictEqual(nockRequestS2.pendingMocks().length, 0);
          assert.strictEqual(nockRequestS3.pendingMocks().length, 0);
          done();
        })
      })

      it("should upload a file into a child storage into a bucket as ALIAS", function(done) {
        const _header = {
          'content-type': 'application/xml',
          'x-amz-id-2': 'txd14fbe8bc05341c0b548a-00640b2752',
          'x-amz-request-id': 'txd14fbe8bc05341c0b548a-00640b2752',
          'x-trans-id': 'txd14fbe8bc05341c0b548a-00640b2752',
          'x-openstack-request-id': 'txd14fbe8bc05341c0b548a-00640b2752',
          date: 'Fri, 10 Mar 2023 12:49:22 GMT',
          'transfer-encoding': 'chunked',
          connection: 'close'
        }

        const nockRequestS1 = nock(url1S3)
          .defaultReplyHeaders(_header)
          .put('/invoices-gra-1234/file.pdf')
          .reply(500, '');

        const nockRequestS2 = nock(url2S3)
          .defaultReplyHeaders(_header)
          .put('/invoices-de-8888/file.pdf')
          .reply(200, (uri, requestBody) => {
            assert.strictEqual(requestBody, fileXml);
            return '';
          });
        const nockRequestS3 = nock(url1S3)
          .get('/')
          .reply(500);

        storage.uploadFile('invoices', 'file.pdf', Buffer.from(fileXml), function(err, resp) {
          assert.strictEqual(err, null);
          assert.strictEqual(resp.statusCode, 200);
          assert.strictEqual(resp.body.toString(), '');
          assert.strictEqual(JSON.stringify(resp.headers), JSON.stringify(_header));
          assert.strictEqual(nockRequestS1.pendingMocks().length, 0);
          assert.strictEqual(nockRequestS2.pendingMocks().length, 0);
          assert.strictEqual(nockRequestS3.pendingMocks().length, 0);
          done();
        })
      })

      it("should not be able to upload a file into a child storage if the write access is denied.", function(done) {
        const _header = {
          'content-type': 'application/xml',
          'x-amz-id-2': 'txd14fbe8bc05341c0b548a-00640b2752',
          'x-amz-request-id': 'txd14fbe8bc05341c0b548a-00640b2752',
          'x-trans-id': 'txd14fbe8bc05341c0b548a-00640b2752',
          'x-openstack-request-id': 'txd14fbe8bc05341c0b548a-00640b2752',
          date: 'Fri, 10 Mar 2023 12:49:22 GMT',
          'transfer-encoding': 'chunked',
          connection: 'close'
        }

        const nockRequestS1 = nock(url1S3)
          .defaultReplyHeaders(_header)
          .put('/bucket/file.pdf')
          .reply(500, '');

        const nockRequestS2 = nock(url2S3)
          .defaultReplyHeaders(_header)
          .put('/bucket/file.pdf')
          .reply(403, () => {
            return "<?xml version='1.0' encoding='UTF-8'?><Error><Code>AccessDenied</Code><Message>Access Denied.</Message><RequestId>txd14fbe8bc05341c0b548a-00640b2752</RequestId></Error>";
          })
        const nockRequestS3 = nock(url1S3)
          .get('/')
          .reply(500);

        const _expectedBody = {
          error: {
            code: 'AccessDenied',
            message: 'Access Denied.',
            requestid: 'txd14fbe8bc05341c0b548a-00640b2752'
          }
        }

        storage.uploadFile('bucket', 'file.pdf', Buffer.from(fileXml), function(err, resp) {
          assert.strictEqual(err, null);
          assert.strictEqual(resp.statusCode, 403);
          assert.strictEqual(JSON.stringify(resp.body), JSON.stringify(_expectedBody));
          assert.strictEqual(JSON.stringify(resp.headers), JSON.stringify(_header));
          assert.strictEqual(nockRequestS1.pendingMocks().length, 0);
          assert.strictEqual(nockRequestS2.pendingMocks().length, 0);
          assert.strictEqual(nockRequestS3.pendingMocks().length, 0);
          done();
        })
      })

    });

  });

  describe('deleteFile', function() {

    describe("REQUEST MAIN STORAGE", function () {

      it('should delete an object (return the same response if the object does not exist)', function(done) {
        const _headers = {
          'content-type': 'text/html; charset=UTF-8',
          'content-length': '0',
          'x-amz-id-2': 'txf010ba580ff0471ba3a0b-0064181698',
          'x-amz-request-id': 'txf010ba580ff0471ba3a0b-0064181698',
          'x-trans-id': 'txf010ba580ff0471ba3a0b-0064181698',
          'x-openstack-request-id': 'txf010ba580ff0471ba3a0b-0064181698',
          date: 'Mon, 20 Mar 2023 08:17:29 GMT',
          connection: 'close'
        }

        const nockRequestS1 = nock(url1S3)
          .defaultReplyHeaders(_headers)
          .delete('/www/file.pdf')
          .reply(204, '');

        storage.deleteFile('www', 'file.pdf', (err, resp) => {
          assert.strictEqual(err, null);
          assert.strictEqual(resp.statusCode, 204);
          assert.strictEqual(resp.body.toString(), '');
          assert.strictEqual(JSON.stringify(resp.headers), JSON.stringify(_headers));
          assert.strictEqual(nockRequestS1.pendingMocks().length, 0);
          done();
        })
      })

      it('should delete an object into a bucket as ALIAS', function(done) {
        const _headers = {
          'content-type': 'text/html; charset=UTF-8',
          'content-length': '0',
          'x-amz-id-2': 'txf010ba580ff0471ba3a0b-0064181698',
          'x-amz-request-id': 'txf010ba580ff0471ba3a0b-0064181698',
          'x-trans-id': 'txf010ba580ff0471ba3a0b-0064181698',
          'x-openstack-request-id': 'txf010ba580ff0471ba3a0b-0064181698',
          date: 'Mon, 20 Mar 2023 08:17:29 GMT',
          connection: 'close'
        }

        const nockRequestS1 = nock(url1S3)
          .defaultReplyHeaders(_headers)
          .delete('/invoices-gra-1234/file.pdf')
          .reply(204, '');

        storage.deleteFile('invoices', 'file.pdf', (err, resp) => {
          assert.strictEqual(err, null);
          assert.strictEqual(resp.statusCode, 204);
          assert.strictEqual(resp.body.toString(), '');
          assert.strictEqual(JSON.stringify(resp.headers), JSON.stringify(_headers));
          assert.strictEqual(nockRequestS1.pendingMocks().length, 0);
          done();
        })
      })

      it("should return an error if the bucket does not exist", function (done) {
        const _headers = {
          'content-type': 'application/xml',
          'x-amz-id-2': 'tx424f2a5a6e684da581e77-0064185482',
          'x-amz-request-id': 'tx424f2a5a6e684da581e77-0064185482',
          'x-trans-id': 'tx424f2a5a6e684da581e77-0064185482',
          'x-openstack-request-id': 'tx424f2a5a6e684da581e77-0064185482',
          date: 'Mon, 20 Mar 2023 12:41:38 GMT',
          'transfer-encoding': 'chunked',
          connection: 'close'
        }

        const nockRequestS1 = nock(url1S3)
          .defaultReplyHeaders(_headers)
          .delete('/buckeeet/file.pdf')
          .reply(404, "<?xml version='1.0' encoding='UTF-8'?><Error><Code>NoSuchBucket</Code><Message>The specified bucket does not exist.</Message><RequestId>tx424f2a5a6e684da581e77-0064185482</RequestId><BucketName>buckeeet</BucketName></Error>");

        storage.deleteFile('buckeeet', 'file.pdf', (err, resp) => {
          assert.strictEqual(err, null);
          assert.strictEqual(resp.statusCode, 404);
          assert.strictEqual(JSON.stringify(resp.body), JSON.stringify({
            error: {
              code: 'NoSuchBucket',
              message: 'The specified bucket does not exist.',
              requestid: 'tx424f2a5a6e684da581e77-0064185482',
              bucketname: 'buckeeet'
            }
          }));
          assert.strictEqual(JSON.stringify(resp.headers), JSON.stringify(_headers));
          assert.strictEqual(nockRequestS1.pendingMocks().length, 0);
          done();
        })
      })

    });

    describe("SWITCH TO CHILD STORAGE", function () {

      it('should delete an object from the second bucket', function(done) {
        const _headers = {
          'content-type': 'text/html; charset=UTF-8',
          'content-length': '0',
          'x-amz-id-2': 'txf010ba580ff0471ba3a0b-0064181698',
          'x-amz-request-id': 'txf010ba580ff0471ba3a0b-0064181698',
          'x-trans-id': 'txf010ba580ff0471ba3a0b-0064181698',
          'x-openstack-request-id': 'txf010ba580ff0471ba3a0b-0064181698',
          date: 'Mon, 20 Mar 2023 08:17:29 GMT',
          connection: 'close'
        }

        const nockRequestS1 = nock(url1S3)
          .delete('/www/file.pdf')
          .reply(500, '');

        const nockRequestS2 = nock(url2S3)
          .defaultReplyHeaders(_headers)
          .delete('/www/file.pdf')
          .reply(204, '');

        const nockRequestS3 = nock(url1S3)
          .get('/')
          .reply(500, '');

        storage.deleteFile('www', 'file.pdf', (err, resp) => {
          assert.strictEqual(err, null);
          assert.strictEqual(resp.statusCode, 204);
          assert.strictEqual(resp.body.toString(), '');
          assert.strictEqual(JSON.stringify(resp.headers), JSON.stringify(_headers));
          assert.strictEqual(nockRequestS1.pendingMocks().length, 0);
          assert.strictEqual(nockRequestS2.pendingMocks().length, 0);
          assert.strictEqual(nockRequestS3.pendingMocks().length, 0);
          done();
        })
      })

      it('should delete an object from the second bucket as ALIAS', function(done) {
        const _headers = {
          'content-type': 'text/html; charset=UTF-8',
          'content-length': '0',
          'x-amz-id-2': 'txf010ba580ff0471ba3a0b-0064181698',
          'x-amz-request-id': 'txf010ba580ff0471ba3a0b-0064181698',
          'x-trans-id': 'txf010ba580ff0471ba3a0b-0064181698',
          'x-openstack-request-id': 'txf010ba580ff0471ba3a0b-0064181698',
          date: 'Mon, 20 Mar 2023 08:17:29 GMT',
          connection: 'close'
        }

        const nockRequestS1 = nock(url1S3)
          .delete('/invoices-gra-1234/file.pdf')
          .reply(500, '');

        const nockRequestS2 = nock(url2S3)
          .defaultReplyHeaders(_headers)
          .delete('/invoices-de-8888/file.pdf')
          .reply(204, '');

        const nockRequestS3 = nock(url1S3)
          .get('/')
          .reply(500, '');

        storage.deleteFile('invoices', 'file.pdf', (err, resp) => {
          assert.strictEqual(err, null);
          assert.strictEqual(resp.statusCode, 204);
          assert.strictEqual(resp.body.toString(), '');
          assert.strictEqual(JSON.stringify(resp.headers), JSON.stringify(_headers));
          assert.strictEqual(nockRequestS1.pendingMocks().length, 0);
          assert.strictEqual(nockRequestS2.pendingMocks().length, 0);
          assert.strictEqual(nockRequestS3.pendingMocks().length, 0);
          done();
        })
      })

      it("should not be able to delete a file of a child storage if the write permission is disallowed", function(done) {
        const _bodyErrorAccessDenied = "<?xml version='1.0' encoding='UTF-8'?><Error><Code>AccessDenied</Code><Message>Access Denied.</Message><RequestId>txb40580debedc4ff9b36dc-00641818cb</RequestId></Error>"
        const _bodyJson = {
          error: {
            code: 'AccessDenied',
            message: 'Access Denied.',
            requestid: 'txb40580debedc4ff9b36dc-00641818cb'
          }
        }

        const _headers = {
          'content-type': 'application/xml',
          'x-amz-id-2': 'txb40580debedc4ff9b36dc-00641818cb',
          'x-amz-request-id': 'txb40580debedc4ff9b36dc-00641818cb',
          'x-trans-id': 'txb40580debedc4ff9b36dc-00641818cb',
          'x-openstack-request-id': 'txb40580debedc4ff9b36dc-00641818cb',
          date: 'Mon, 20 Mar 2023 08:26:51 GMT',
          'transfer-encoding': 'chunked',
          connection: 'close'
        }

        const nockRequestS1 = nock(url1S3)
          .delete('/www/file.pdf')
          .reply(500, '');

        const nockRequestS2 = nock(url2S3)
          .defaultReplyHeaders(_headers)
          .delete('/www/file.pdf')
          .reply(403, _bodyErrorAccessDenied);

        const nockRequestS3 = nock(url1S3)
          .get('/')
          .reply(500, '');

        storage.deleteFile('www', 'file.pdf', (err, resp) => {
          assert.strictEqual(err, null);
          assert.strictEqual(resp.statusCode, 403);
          assert.strictEqual(JSON.stringify(resp.body), JSON.stringify(_bodyJson));
          assert.strictEqual(JSON.stringify(resp.headers), JSON.stringify(_headers));
          assert.strictEqual(nockRequestS1.pendingMocks().length, 0);
          assert.strictEqual(nockRequestS2.pendingMocks().length, 0);
          assert.strictEqual(nockRequestS3.pendingMocks().length, 0);
          done();
        })
      })

    });

  });

  describe('deleteFiles', function() {

    describe("REQUEST MAIN STORAGE", function () {

      it('should delete a list of objects', function(done) {
        const _headers = {
          'content-type': 'text/html; charset=UTF-8',
          'content-length': '269',
          'x-amz-id-2': 'txb383f29c0dad46f9919b5-00641844ba',
          'x-amz-request-id': 'txb383f29c0dad46f9919b5-00641844ba',
          'x-trans-id': 'txb383f29c0dad46f9919b5-00641844ba',
          'x-openstack-request-id': 'txb383f29c0dad46f9919b5-00641844ba',
          date: 'Mon, 20 Mar 2023 11:34:18 GMT',
          connection: 'close'
        }

        const _filesToDelete = [
          { key: 'invoice 2023.pdf' },
          { key: 'carbone(1).png' },
          { key: 'file.txt' }
        ]

        const _expectedBody = {
          deleted: _filesToDelete.map((value) => {
            return {
              key: value.key
            }
          })
        }

        const nockRequestS1 = nock(url1S3)
          .defaultReplyHeaders(_headers)
          .post('/www/')
          .query((actualQueryObject) => {
            assert.strictEqual(actualQueryObject.delete !== undefined, true);
            return true;
          })
          .reply(200, function(uri, body) {
            assert.strictEqual(body, '<Delete><Object><Key>invoice 2023.pdf</Key></Object><Object><Key>carbone(1).png</Key></Object><Object><Key>file.txt</Key></Object><Quiet>false</Quiet></Delete>');
            return "<?xml version=\"1.0\" encoding=\"UTF-8\"?><DeleteResult xmlns=\"http://s3.amazonaws.com/doc/2006-03-01/\"><Deleted><Key>invoice 2023.pdf</Key></Deleted><Deleted><Key>carbone(1).png</Key></Deleted><Deleted><Key>file.txt</Key></Deleted></DeleteResult>";
          })

        storage.deleteFiles('www', _filesToDelete, (err, resp) => {
          assert.strictEqual(err, null);
          assert.strictEqual(resp.statusCode, 200);
          assert.strictEqual(JSON.stringify(resp.body), JSON.stringify(_expectedBody));
          assert.strictEqual(JSON.stringify(resp.headers), JSON.stringify(_headers));
          assert.strictEqual(nockRequestS1.pendingMocks().length, 0);
          done();
        })
      })

      it('should delete a list of objects with Bucket as ALIAS', function(done) {
        const _headers = {
          'content-type': 'text/html; charset=UTF-8',
          'content-length': '269',
          'x-amz-id-2': 'txb383f29c0dad46f9919b5-00641844ba',
          'x-amz-request-id': 'txb383f29c0dad46f9919b5-00641844ba',
          'x-trans-id': 'txb383f29c0dad46f9919b5-00641844ba',
          'x-openstack-request-id': 'txb383f29c0dad46f9919b5-00641844ba',
          date: 'Mon, 20 Mar 2023 11:34:18 GMT',
          connection: 'close'
        }

        const _filesToDelete = [
          { key: 'invoice 2023.pdf' },
          { key: 'carbone(1).png' },
          { key: 'file.txt' }
        ]

        const _expectedBody = {
          deleted: _filesToDelete.map((value) => {
            return {
              key: value.key
            }
          })
        }

        const nockRequestS1 = nock(url1S3)
          .defaultReplyHeaders(_headers)
          .post('/invoices-gra-1234/')
          .query((actualQueryObject) => {
            assert.strictEqual(actualQueryObject.delete !== undefined, true);
            return true;
          })
          .reply(200, function(res, body) {
            assert.strictEqual(body, '<Delete><Object><Key>invoice 2023.pdf</Key></Object><Object><Key>carbone(1).png</Key></Object><Object><Key>file.txt</Key></Object><Quiet>false</Quiet></Delete>');
            return "<?xml version=\"1.0\" encoding=\"UTF-8\"?><DeleteResult xmlns=\"http://s3.amazonaws.com/doc/2006-03-01/\"><Deleted><Key>invoice 2023.pdf</Key></Deleted><Deleted><Key>carbone(1).png</Key></Deleted><Deleted><Key>file.txt</Key></Deleted></DeleteResult>";
          })

        storage.deleteFiles('invoices', _filesToDelete, (err, resp) => {
          assert.strictEqual(err, null);
          assert.strictEqual(resp.statusCode, 200);
          assert.strictEqual(JSON.stringify(resp.body), JSON.stringify(_expectedBody));
          assert.strictEqual(JSON.stringify(resp.headers), JSON.stringify(_headers));
          assert.strictEqual(nockRequestS1.pendingMocks().length, 0);
          done();
        })
      })

      it('should delete a list of objects with mix success/errors (access denied)', function(done) {
        const _headers = {
          'content-type': 'text/html; charset=UTF-8',
          'content-length': '269',
          'x-amz-id-2': 'tx3cf216266bf24a888354a-0064184a78',
          'x-amz-request-id': 'tx3cf216266bf24a888354a-0064184a78',
          'x-trans-id': 'tx3cf216266bf24a888354a-0064184a78',
          'x-openstack-request-id': 'tx3cf216266bf24a888354a-0064184a78',
          date: 'Mon, 20 Mar 2023 11:58:49 GMT',
          connection: 'close'
        }

        const _filesToDelete = [
          { key: 'sample1.txt' },
          { key: 'sample2.txt' }
        ]

        const _expectedBody = {
          deleted: [
            { key: 'sample1.txt' }
          ],
          error: [
            {
              key    : 'sample2.txt',
              code   : 'AccessDenied',
              message: 'Access Denied'
            }
          ]
        }

        const nockRequestS1 = nock(url1S3)
          .defaultReplyHeaders(_headers)
          .post('/www/')
          .query((actualQueryObject) => {
            assert.strictEqual(actualQueryObject.delete !== undefined, true);
            return true;
          })
          .reply(200, function(uri, body) {
            assert.strictEqual(body, '<Delete><Object><Key>sample1.txt</Key></Object><Object><Key>sample2.txt</Key></Object><Quiet>false</Quiet></Delete>');
            return "<?xml version=\"1.0\" encoding=\"UTF-8\"?><DeleteResult xmlns=\"http://s3.amazonaws.com/doc/2006-03-01/\"><Deleted><Key>sample1.txt</Key></Deleted><Error><Key>sample2.txt</Key><Code>AccessDenied</Code><Message>Access Denied</Message></Error></DeleteResult>";
          })

        storage.deleteFiles('www', _filesToDelete, (err, resp) => {
          assert.strictEqual(err, null);
          assert.strictEqual(resp.statusCode, 200);
          assert.strictEqual(JSON.stringify(resp.body), JSON.stringify(_expectedBody));
          assert.strictEqual(JSON.stringify(resp.headers), JSON.stringify(_headers));
          assert.strictEqual(nockRequestS1.pendingMocks().length, 0);
          done();
        })
      })

      it("should return an error if the bucket does not exist", function (done) {
        const _headers = {
          'content-type': 'application/xml',
          'x-amz-id-2': 'tx84736ac6d5544b44ba91a-0064185021',
          'x-amz-request-id': 'tx84736ac6d5544b44ba91a-0064185021',
          'x-trans-id': 'tx84736ac6d5544b44ba91a-0064185021',
          'x-openstack-request-id': 'tx84736ac6d5544b44ba91a-0064185021',
          date: 'Mon, 20 Mar 2023 12:22:57 GMT',
          'transfer-encoding': 'chunked',
          connection: 'close'
        }

        const _filesToDelete = [
          { key: 'invoice 2023.pdf' },
          { key: 'carbone(1).png' },
          { key: 'file.txt' }
        ]

        const _expectedBody = {
          error: {
            code: 'NoSuchBucket',
            message: 'The specified bucket does not exist.',
            requestid: 'tx84736ac6d5544b44ba91a-0064185021',
            bucketname: 'buckeeeet'
          }
        }

        const nockRequestS1 = nock(url1S3)
          .defaultReplyHeaders(_headers)
          .post('/buckeeeet/')
          .query((actualQueryObject) => {
            assert.strictEqual(actualQueryObject.delete !== undefined, true);
            return true;
          })
          .reply(404, function(url, body) {
            assert.strictEqual(body, '<Delete><Object><Key>invoice 2023.pdf</Key></Object><Object><Key>carbone(1).png</Key></Object><Object><Key>file.txt</Key></Object><Quiet>false</Quiet></Delete>');
            return "<?xml version=\"1.0\" encoding=\"UTF-8\"?><Error><Code>NoSuchBucket</Code><Message>The specified bucket does not exist.</Message><RequestId>tx84736ac6d5544b44ba91a-0064185021</RequestId><BucketName>buckeeeet</BucketName></Error>";
          })

        storage.deleteFiles('buckeeeet', _filesToDelete, (err, resp) => {
          assert.strictEqual(err, null);
          assert.strictEqual(resp.statusCode, 404);
          assert.strictEqual(JSON.stringify(resp.body), JSON.stringify(_expectedBody));
          assert.strictEqual(JSON.stringify(resp.headers), JSON.stringify(_headers));
          assert.strictEqual(nockRequestS1.pendingMocks().length, 0);
          done();
        })
      })


    });

    describe("SWITCH TO CHILD STORAGE", function () {

      it("should not be able to delete a file of a child storage if the write permission is disallowed (access denied)", function(done) {
        const _headers = {
          'content-type': 'text/html; charset=UTF-8',
          'content-length': '431',
          'x-amz-id-2': 'txe69b17ed1cf04260b9090-0064184b17',
          'x-amz-request-id': 'txe69b17ed1cf04260b9090-0064184b17',
          'x-trans-id': 'txe69b17ed1cf04260b9090-0064184b17',
          'x-openstack-request-id': 'txe69b17ed1cf04260b9090-0064184b17',
          date: 'Mon, 20 Mar 2023 12:01:28 GMT',
          connection: 'close'
        }

        const _filesToDelete = [
          { key: 'invoice 2023.pdf' },
          { key: 'carbone(1).png' },
          { key: 'file.txt' }
        ]

        const _expectedBody = {
          error: _filesToDelete.map((value) => {
            return {
              key    : encodeURIComponent(value.key),
              code   : 'AccessDenied',
              message: 'Access Denied'
            }
          })
        }

        const nockRequestS1 = nock(url1S3)
          .post('/www/')
          .query((actualQueryObject) => {
            assert.strictEqual(actualQueryObject.delete !== undefined, true);
            return true;
          })
          .reply(500, '')

        const nockRequestS2 = nock(url2S3)
          .defaultReplyHeaders(_headers)
          .post('/www/')
          .query((actualQueryObject) => {
            assert.strictEqual(actualQueryObject.delete !== undefined, true);
            return true;
          })
          .reply(200, function() {
            return "<?xml version=\"1.0\" encoding=\"UTF-8\"?><DeleteResult xmlns=\"http://s3.amazonaws.com/doc/2006-03-01/\"><Error><Key>invoice%202023.pdf</Key><Code>AccessDenied</Code><Message>Access Denied</Message></Error><Error><Key>carbone(1).png</Key><Code>AccessDenied</Code><Message>Access Denied</Message></Error><Error><Key>file.txt</Key><Code>AccessDenied</Code><Message>Access Denied</Message></Error></DeleteResult>";
          })
        const nockRequestS3 = nock(url1S3)
          .get('/')
          .reply(500, '');

        storage.deleteFiles('www', _filesToDelete, (err, resp) => {
          assert.strictEqual(err, null);
          assert.strictEqual(resp.statusCode, 200);
          assert.strictEqual(JSON.stringify(resp.body), JSON.stringify(_expectedBody));
          assert.strictEqual(JSON.stringify(resp.headers), JSON.stringify(_headers));
          assert.strictEqual(nockRequestS1.pendingMocks().length, 0);
          assert.strictEqual(nockRequestS2.pendingMocks().length, 0);
          assert.strictEqual(nockRequestS3.pendingMocks().length, 0);
          done();
        })
      })

    });

  });

  describe('getFileMetadata', function() {

    describe("REQUEST MAIN STORAGE", function () {

      it('should get file metadata', function(done){
        const _headers = {
          'content-type': 'application/x-www-form-urlencoded; charset=utf-8',
          'content-length': '11822',
          'x-amz-storage-class': 'STANDARD',
          'x-amz-meta-name': 'Carbone.io',
          'x-amz-meta-version': '858585',
          etag: '"fde6d729123cee4db6bfa3606306bc8c"',
          'x-amz-version-id': '1679316796.606606',
          'last-modified': 'Mon, 20 Mar 2023 12:53:16 GMT',
          'x-amz-id-2': 'txd2aa2b0a02554657b5efe-0064185752',
          'x-amz-request-id': 'txd2aa2b0a02554657b5efe-0064185752',
          'x-trans-id': 'txd2aa2b0a02554657b5efe-0064185752',
          'x-openstack-request-id': 'txd2aa2b0a02554657b5efe-0064185752',
          date: 'Mon, 20 Mar 2023 12:53:38 GMT',
          connection: 'close'
        }

        const nockRequestS1 = nock(url1S3)
          .defaultReplyHeaders(_headers)
          .intercept("/bucket/file.pdf", "HEAD")
          .reply(200, "");

        storage.getFileMetadata('bucket', 'file.pdf', function(err, resp) {
          assert.strictEqual(err, null);
          assert.strictEqual(resp.statusCode, 200);
          assert.strictEqual(resp.body.toString(), '');
          assert.strictEqual(JSON.stringify(resp.headers), JSON.stringify(_headers));
          assert.strictEqual(nockRequestS1.pendingMocks().length, 0);
          done();
        });
      })

      it('should get file metadata from a bucket as ALIAS', function(done){
        const _headers = {
          'content-type': 'application/x-www-form-urlencoded; charset=utf-8',
          'content-length': '11822',
          'x-amz-storage-class': 'STANDARD',
          'x-amz-meta-name': 'Carbone.io',
          'x-amz-meta-version': '858585',
          etag: '"fde6d729123cee4db6bfa3606306bc8c"',
          'x-amz-version-id': '1679316796.606606',
          'last-modified': 'Mon, 20 Mar 2023 12:53:16 GMT',
          'x-amz-id-2': 'txd2aa2b0a02554657b5efe-0064185752',
          'x-amz-request-id': 'txd2aa2b0a02554657b5efe-0064185752',
          'x-trans-id': 'txd2aa2b0a02554657b5efe-0064185752',
          'x-openstack-request-id': 'txd2aa2b0a02554657b5efe-0064185752',
          date: 'Mon, 20 Mar 2023 12:53:38 GMT',
          connection: 'close'
        }

        const nockRequestS1 = nock(url1S3)
          .defaultReplyHeaders(_headers)
          .intercept("/invoices-gra-1234/file.pdf", "HEAD")
          .reply(200, "");

        storage.getFileMetadata('invoices', 'file.pdf', function(err, resp) {
          assert.strictEqual(err, null);
          assert.strictEqual(resp.statusCode, 200);
          assert.strictEqual(resp.body.toString(), '');
          assert.strictEqual(JSON.stringify(resp.headers), JSON.stringify(_headers));
          assert.strictEqual(nockRequestS1.pendingMocks().length, 0);
          done();
        });
      })

      it('should return an error if the object or bucket don\'t exist', function(done){
        const _headers = {
          'content-type': 'application/xml',
          'x-amz-id-2': 'tx10b87fee8896442cb93ce-00641855ea',
          'x-amz-request-id': 'tx10b87fee8896442cb93ce-00641855ea',
          'x-trans-id': 'tx10b87fee8896442cb93ce-00641855ea',
          'x-openstack-request-id': 'tx10b87fee8896442cb93ce-00641855ea',
          date: 'Mon, 20 Mar 2023 12:47:38 GMT',
          connection: 'close'
        }

        const nockRequestS1 = nock(url1S3)
          .defaultReplyHeaders(_headers)
          .intercept("/bucket/file.pdf", "HEAD")
          .reply(404, "");

        storage.getFileMetadata('bucket', 'file.pdf', function(err, resp) {
          assert.strictEqual(err, null);
          assert.strictEqual(resp.statusCode, 404);
          assert.strictEqual(JSON.stringify(resp.body), JSON.stringify({}));
          assert.strictEqual(JSON.stringify(resp.headers), JSON.stringify(_headers));
          assert.strictEqual(nockRequestS1.pendingMocks().length, 0);
          done();
        });
      })
    });

    describe("SWITCH TO CHILD STORAGE", function () {

      it('should get file metadata in the second storage', function(done){
        const _headers = {
          'content-type': 'application/x-www-form-urlencoded; charset=utf-8',
          'content-length': '11822',
          'x-amz-storage-class': 'STANDARD',
          'x-amz-meta-name': 'Carbone.io',
          'x-amz-meta-version': '858585',
          etag: '"fde6d729123cee4db6bfa3606306bc8c"',
          'x-amz-version-id': '1679316796.606606',
          'last-modified': 'Mon, 20 Mar 2023 12:53:16 GMT',
          'x-amz-id-2': 'txd2aa2b0a02554657b5efe-0064185752',
          'x-amz-request-id': 'txd2aa2b0a02554657b5efe-0064185752',
          'x-trans-id': 'txd2aa2b0a02554657b5efe-0064185752',
          'x-openstack-request-id': 'txd2aa2b0a02554657b5efe-0064185752',
          date: 'Mon, 20 Mar 2023 12:53:38 GMT',
          connection: 'close'
        }

        const nockRequestS1 = nock(url1S3)
          .intercept("/bucket/file.pdf", "HEAD")
          .reply(500, "");

        const nockRequestS2 = nock(url2S3)
          .defaultReplyHeaders(_headers)
          .intercept("/bucket/file.pdf", "HEAD")
          .reply(200, "");

        const nockRequestS3 = nock(url1S3)
          .get('/')
          .reply(500, '');

        storage.getFileMetadata('bucket', 'file.pdf', function(err, resp) {
          assert.strictEqual(err, null);
          assert.strictEqual(resp.statusCode, 200);
          assert.strictEqual(resp.body.toString(), '');
          assert.strictEqual(JSON.stringify(resp.headers), JSON.stringify(_headers));
          assert.strictEqual(nockRequestS1.pendingMocks().length, 0);
          assert.strictEqual(nockRequestS2.pendingMocks().length, 0);
          assert.strictEqual(nockRequestS3.pendingMocks().length, 0);
          done();
        });
      })

      it('should get file metadata in the second storage with a bucket as ALIAS', function(done){
        const _headers = {
          'content-type': 'application/x-www-form-urlencoded; charset=utf-8',
          'content-length': '11822',
          'x-amz-storage-class': 'STANDARD',
          'x-amz-meta-name': 'Carbone.io',
          'x-amz-meta-version': '858585',
          etag: '"fde6d729123cee4db6bfa3606306bc8c"',
          'x-amz-version-id': '1679316796.606606',
          'last-modified': 'Mon, 20 Mar 2023 12:53:16 GMT',
          'x-amz-id-2': 'txd2aa2b0a02554657b5efe-0064185752',
          'x-amz-request-id': 'txd2aa2b0a02554657b5efe-0064185752',
          'x-trans-id': 'txd2aa2b0a02554657b5efe-0064185752',
          'x-openstack-request-id': 'txd2aa2b0a02554657b5efe-0064185752',
          date: 'Mon, 20 Mar 2023 12:53:38 GMT',
          connection: 'close'
        }

        const nockRequestS1 = nock(url1S3)
          .intercept("/invoices-gra-1234/file.pdf", "HEAD")
          .reply(500, "");

        const nockRequestS2 = nock(url2S3)
          .defaultReplyHeaders(_headers)
          .intercept("/invoices-de-8888/file.pdf", "HEAD")
          .reply(200, "");

        const nockRequestS3 = nock(url1S3)
          .get('/')
          .reply(500, '');

        storage.getFileMetadata('invoices', 'file.pdf', function(err, resp) {
          assert.strictEqual(err, null);
          assert.strictEqual(resp.statusCode, 200);
          assert.strictEqual(resp.body.toString(), '');
          assert.strictEqual(JSON.stringify(resp.headers), JSON.stringify(_headers));
          assert.strictEqual(nockRequestS1.pendingMocks().length, 0);
          assert.strictEqual(nockRequestS2.pendingMocks().length, 0);
          assert.strictEqual(nockRequestS3.pendingMocks().length, 0);
          done();
        });
      })


    });

  });


  describe('setFileMetadata', function() {

    describe("REQUEST MAIN STORAGE", function () {

      it('should set file metadata', function(done){

        const _headers2 = {
          'content-type': 'application/xml',
          'content-length': '224',
          'x-amz-version-id': '1679317926.773804',
          'last-modified': 'Mon, 20 Mar 2023 13:13:06 GMT',
          'x-amz-copy-source-version-id': '1679317926.773804',
          'x-amz-storage-class': 'STANDARD',
          'x-amz-id-2': 'tx1cbdc88e9f104c038aa3d-0064185be2',
          'x-amz-request-id': 'tx1cbdc88e9f104c038aa3d-0064185be2',
          'x-trans-id': 'tx1cbdc88e9f104c038aa3d-0064185be2',
          'x-openstack-request-id': 'tx1cbdc88e9f104c038aa3d-0064185be2',
          date: 'Mon, 20 Mar 2023 13:13:06 GMT',
          connection: 'close'
        }

        const nockRequestS2 = nock(url1S3, {
            reqheaders: {
              'x-amz-copy-source': () => true,
              'x-amz-metadata-directive': () => true
            }
          })
          .defaultReplyHeaders(_headers2)
          .put('/bucket/file.pdf')
          .reply(200, "<?xml version=\"1.0\" encoding=\"UTF-8\"?><CopyObjectResult xmlns=\"http://s3.amazonaws.com/doc/2006-03-01/\"><LastModified>2023-03-20T13:13:06.000Z</LastModified><ETag>\"fde6d729123cee4db6bfa3606306bc8c\"</ETag></CopyObjectResult>");

        storage.setFileMetadata('bucket', 'file.pdf', { headers: { "x-amz-meta-name": "Invoice 2023", "x-amz-meta-version": "1.2.3"  } }, (err, resp) => {
          assert.strictEqual(err, null);
          assert.strictEqual(resp.statusCode, 200);
          assert.strictEqual(JSON.stringify(resp.body), JSON.stringify({
            lastmodified: '2023-03-20T13:13:06.000Z',
            etag: 'fde6d729123cee4db6bfa3606306bc8c'
          }));
          assert.strictEqual(JSON.stringify(resp.headers), JSON.stringify(_headers2));
          assert.strictEqual(nockRequestS2.pendingMocks().length, 0);
          done();
        })
      })

      it('should set file metadata with a bucket as ALIAS', function(done){

        const _headers2 = {
          'content-type': 'application/xml',
          'content-length': '224',
          'x-amz-version-id': '1679317926.773804',
          'last-modified': 'Mon, 20 Mar 2023 13:13:06 GMT',
          'x-amz-copy-source-version-id': '1679317926.773804',
          'x-amz-storage-class': 'STANDARD',
          'x-amz-id-2': 'tx1cbdc88e9f104c038aa3d-0064185be2',
          'x-amz-request-id': 'tx1cbdc88e9f104c038aa3d-0064185be2',
          'x-trans-id': 'tx1cbdc88e9f104c038aa3d-0064185be2',
          'x-openstack-request-id': 'tx1cbdc88e9f104c038aa3d-0064185be2',
          date: 'Mon, 20 Mar 2023 13:13:06 GMT',
          connection: 'close'
        }

        const nockRequestS2 = nock(url1S3, {
            reqheaders: {
              'x-amz-copy-source': (value) => {
                assert.strictEqual(value, '/invoices-gra-1234/file.pdf');
                return true
              },
              'x-amz-metadata-directive': (value) => {
                assert.strictEqual(value, "REPLACE");
                return true
              }
            }
          })
          .defaultReplyHeaders(_headers2)
          .put('/invoices-gra-1234/file.pdf')
          .reply(200, "<?xml version=\"1.0\" encoding=\"UTF-8\"?><CopyObjectResult xmlns=\"http://s3.amazonaws.com/doc/2006-03-01/\"><LastModified>2023-03-20T13:13:06.000Z</LastModified><ETag>\"fde6d729123cee4db6bfa3606306bc8c\"</ETag></CopyObjectResult>");

        storage.setFileMetadata('invoices', 'file.pdf', { headers: { "x-amz-meta-name": "Invoice 2023", "x-amz-meta-version": "1.2.3"  } }, (err, resp) => {
          assert.strictEqual(err, null);
          assert.strictEqual(resp.statusCode, 200);
          assert.strictEqual(JSON.stringify(resp.body), JSON.stringify({
            lastmodified: '2023-03-20T13:13:06.000Z',
            etag: 'fde6d729123cee4db6bfa3606306bc8c'
          }));
          assert.strictEqual(JSON.stringify(resp.headers), JSON.stringify(_headers2));
          assert.strictEqual(nockRequestS2.pendingMocks().length, 0);
          done();
        })
      })

      it('should return an error if the object does not exist', function(done){
        const _headers = {
          'content-type': 'application/xml',
          'x-amz-id-2': 'txb4919778632448bbac785-0064185d71',
          'x-amz-request-id': 'txb4919778632448bbac785-0064185d71',
          'x-trans-id': 'txb4919778632448bbac785-0064185d71',
          'x-openstack-request-id': 'txb4919778632448bbac785-0064185d71',
          date: 'Mon, 20 Mar 2023 13:19:45 GMT',
          'transfer-encoding': 'chunked',
          connection: 'close'
        }

        const nockRequestS2 = nock(url1S3, {
            reqheaders: {
              'x-amz-copy-source': () => true,
              'x-amz-metadata-directive': () => true
            }
          })
          .defaultReplyHeaders(_headers)
          .put('/bucket/fiiile.pdf')
          .reply(404, "<?xml version='1.0' encoding='UTF-8'?><Error><Code>NoSuchKey</Code><Message>The specified key does not exist.</Message><RequestId>txb4919778632448bbac785-0064185d71</RequestId><Key>fiiile.pdf</Key></Error>");

        storage.setFileMetadata('bucket', 'fiiile.pdf', { headers: { "x-amz-meta-name": "Invoice 2023", "x-amz-meta-version": "1.2.3"  } }, (err, resp) => {
          assert.strictEqual(err, null);
          assert.strictEqual(resp.statusCode, 404);
          assert.strictEqual(JSON.stringify(resp.body), JSON.stringify({
            error: {
              code: 'NoSuchKey',
              message: 'The specified key does not exist.',
              requestid: 'txb4919778632448bbac785-0064185d71',
              key: 'fiiile.pdf'
            }
          }));
          assert.strictEqual(JSON.stringify(resp.headers), JSON.stringify(_headers));
          assert.strictEqual(nockRequestS2.pendingMocks().length, 0);
          done();
        })
      })

      it('should return an error if the bucket does not exist', function(done){
        const _headers = {
          'content-type': 'application/xml',
          'x-amz-id-2': 'txb63fe612d3364257bec19-0064185fcf',
          'x-amz-request-id': 'txb63fe612d3364257bec19-0064185fcf',
          'x-trans-id': 'txb63fe612d3364257bec19-0064185fcf',
          'x-openstack-request-id': 'txb63fe612d3364257bec19-0064185fcf',
          date: 'Mon, 20 Mar 2023 13:29:51 GMT',
          'transfer-encoding': 'chunked',
          connection: 'close'
        }

        const nockRequestS2 = nock(url1S3, {
            reqheaders: {
              'x-amz-copy-source': () => true,
              'x-amz-metadata-directive': () => true
            }
          })
          .defaultReplyHeaders(_headers)
          .put('/buckeeet/file.pdf')
          .reply(404, "<?xml version='1.0' encoding='UTF-8'?><Error><Code>NoSuchBucket</Code><Message>The specified bucket does not exist.</Message><RequestId>txb63fe612d3364257bec19-0064185fcf</RequestId><BucketName>buckeeet</BucketName></Error>");

        storage.setFileMetadata('buckeeet', 'file.pdf', { headers: { "x-amz-meta-name": "Invoice 2023", "x-amz-meta-version": "1.2.3"  } }, (err, resp) => {
          assert.strictEqual(err, null);
          assert.strictEqual(resp.statusCode, 404);
          assert.strictEqual(JSON.stringify(resp.body), JSON.stringify({
            error: {
              code: 'NoSuchBucket',
              message: 'The specified bucket does not exist.',
              requestid: 'txb63fe612d3364257bec19-0064185fcf',
              bucketname: 'buckeeet'
            }
          }));
          assert.strictEqual(JSON.stringify(resp.headers), JSON.stringify(_headers));
          assert.strictEqual(nockRequestS2.pendingMocks().length, 0);
          done();
        })
      })

      it('should return an error if metadata headers aceed the maximum allowed metadata size (2048 Bytes)', function(done){
        const _headers = {
          'content-type': 'application/xml',
          'x-amz-id-2': 'txb63fe612d3364257bec19-0064185fcf',
          'x-amz-request-id': 'txb63fe612d3364257bec19-0064185fcf',
          'x-trans-id': 'txb63fe612d3364257bec19-0064185fcf',
          'x-openstack-request-id': 'txb63fe612d3364257bec19-0064185fcf',
          date: 'Mon, 20 Mar 2023 13:29:51 GMT',
          'transfer-encoding': 'chunked',
          connection: 'close'
        }

        const nockRequestS2 = nock(url1S3, {
            reqheaders: {
              'x-amz-copy-source': () => true,
              'x-amz-metadata-directive': () => true
            }
          })
          .defaultReplyHeaders(_headers)
          .put('/bucket/file.pdf')
          .reply(400, "<Error><Code>MetadataTooLarge</Code><Message>Your metadata headers exceed the maximum allowed metadata size</Message><Size>3072</Size><MaxSizeAllowed>2048</MaxSizeAllowed><RequestId>4SJA4PV72M8WXZ46</RequestId><HostId>GHxUyWQsQrv4DNU+X6K2YYqBN65twd+IZH0g3yRz7HQ7EXcVlfE8e81eJ559/3SyY0FscUdsyWY=</HostId></Error>");

        storage.setFileMetadata('bucket', 'file.pdf', { headers: { "x-amz-meta-name": "Invoice 2023", "x-amz-meta-version": "1.2.3"  } }, (err, resp) => {
          assert.strictEqual(err, null);
          assert.strictEqual(resp.statusCode, 400);
          assert.strictEqual(JSON.stringify(resp.body), JSON.stringify({
            error: {
              code: 'MetadataTooLarge',
              message: 'Your metadata headers exceed the maximum allowed metadata size',
              size: 3072,
              maxsizeallowed: 2048,
              requestid: '4SJA4PV72M8WXZ46',
              hostid: 'GHxUyWQsQrv4DNU+X6K2YYqBN65twd+IZH0g3yRz7HQ7EXcVlfE8e81eJ559/3SyY0FscUdsyWY='
            }
          }));
          assert.strictEqual(JSON.stringify(resp.headers), JSON.stringify(_headers));
          assert.strictEqual(nockRequestS2.pendingMocks().length, 0);
          done();
        })
      })

    });

    describe("SWITCH TO CHILD STORAGE", function () {

      it('should set file metadata in the child storage', function(done){

        const _headers2 = {
          'content-type': 'application/xml',
          'content-length': '224',
          'x-amz-version-id': '1679317926.773804',
          'last-modified': 'Mon, 20 Mar 2023 13:13:06 GMT',
          'x-amz-copy-source-version-id': '1679317926.773804',
          'x-amz-storage-class': 'STANDARD',
          'x-amz-id-2': 'tx1cbdc88e9f104c038aa3d-0064185be2',
          'x-amz-request-id': 'tx1cbdc88e9f104c038aa3d-0064185be2',
          'x-trans-id': 'tx1cbdc88e9f104c038aa3d-0064185be2',
          'x-openstack-request-id': 'tx1cbdc88e9f104c038aa3d-0064185be2',
          date: 'Mon, 20 Mar 2023 13:13:06 GMT',
          connection: 'close'
        }


        const nockRequestS1 = nock(url1S3, {
            reqheaders: {
              'x-amz-copy-source': () => true,
              'x-amz-metadata-directive': () => true
            }
          })
          .put('/bucket/file.pdf')
          .reply(500, "");

        const nockRequestS2 = nock(url2S3, {
            reqheaders: {
              'x-amz-copy-source': () => true,
              'x-amz-metadata-directive': () => true
            }
          })
          .defaultReplyHeaders(_headers2)
          .put('/bucket/file.pdf')
          .reply(200, "<?xml version=\"1.0\" encoding=\"UTF-8\"?><CopyObjectResult xmlns=\"http://s3.amazonaws.com/doc/2006-03-01/\"><LastModified>2023-03-20T13:13:06.000Z</LastModified><ETag>\"fde6d729123cee4db6bfa3606306bc8c\"</ETag></CopyObjectResult>");

        const nockRequestS3 = nock(url1S3)
          .get('/')
          .reply(500, "");


        storage.setFileMetadata('bucket', 'file.pdf', { headers: { "x-amz-meta-name": "Invoice 2023", "x-amz-meta-version": "1.2.3"  } }, (err, resp) => {
          assert.strictEqual(err, null);
          assert.strictEqual(resp.statusCode, 200);
          assert.strictEqual(JSON.stringify(resp.body), JSON.stringify({
            lastmodified: '2023-03-20T13:13:06.000Z',
            etag: 'fde6d729123cee4db6bfa3606306bc8c'
          }));
          assert.strictEqual(JSON.stringify(resp.headers), JSON.stringify(_headers2));
          assert.strictEqual(nockRequestS1.pendingMocks().length, 0);
          assert.strictEqual(nockRequestS2.pendingMocks().length, 0);
          assert.strictEqual(nockRequestS3.pendingMocks().length, 0);
          done();
        })
      })

      it('should set file metadata in the child storage with a bucket as ALIAS', function(done){

        const _headers2 = {
          'content-type': 'application/xml',
          'content-length': '224',
          'x-amz-version-id': '1679317926.773804',
          'last-modified': 'Mon, 20 Mar 2023 13:13:06 GMT',
          'x-amz-copy-source-version-id': '1679317926.773804',
          'x-amz-storage-class': 'STANDARD',
          'x-amz-id-2': 'tx1cbdc88e9f104c038aa3d-0064185be2',
          'x-amz-request-id': 'tx1cbdc88e9f104c038aa3d-0064185be2',
          'x-trans-id': 'tx1cbdc88e9f104c038aa3d-0064185be2',
          'x-openstack-request-id': 'tx1cbdc88e9f104c038aa3d-0064185be2',
          date: 'Mon, 20 Mar 2023 13:13:06 GMT',
          connection: 'close'
        }


        const nockRequestS1 = nock(url1S3, {
            reqheaders: {
              'x-amz-copy-source': () => true,
              'x-amz-metadata-directive': () => true
            }
          })
          .put('/invoices-gra-1234/file.pdf')
          .reply(500, "");

        const nockRequestS2 = nock(url2S3, {
            reqheaders: {
              'x-amz-copy-source': () => true,
              'x-amz-metadata-directive': () => true
            }
          })
          .defaultReplyHeaders(_headers2)
          .put('/invoices-de-8888/file.pdf')
          .reply(200, "<?xml version=\"1.0\" encoding=\"UTF-8\"?><CopyObjectResult xmlns=\"http://s3.amazonaws.com/doc/2006-03-01/\"><LastModified>2023-03-20T13:13:06.000Z</LastModified><ETag>\"fde6d729123cee4db6bfa3606306bc8c\"</ETag></CopyObjectResult>");

        const nockRequestS3 = nock(url1S3)
          .get('/')
          .reply(500, "");


        storage.setFileMetadata('invoices', 'file.pdf', { headers: { "x-amz-meta-name": "Invoice 2023", "x-amz-meta-version": "1.2.3"  } }, (err, resp) => {
          assert.strictEqual(err, null);
          assert.strictEqual(resp.statusCode, 200);
          assert.strictEqual(JSON.stringify(resp.body), JSON.stringify({
            lastmodified: '2023-03-20T13:13:06.000Z',
            etag: 'fde6d729123cee4db6bfa3606306bc8c'
          }));
          assert.strictEqual(JSON.stringify(resp.headers), JSON.stringify(_headers2));
          assert.strictEqual(nockRequestS1.pendingMocks().length, 0);
          assert.strictEqual(nockRequestS2.pendingMocks().length, 0);
          assert.strictEqual(nockRequestS3.pendingMocks().length, 0);
          done();
        })
      })

      it("should not be able to write file metadata of a child storage if the write permission is disallowed", function(done) {

        const _headers2 = {
          'content-type': 'application/xml',
          'x-amz-id-2': 'tx439620795cdd41b08c58c-0064186222',
          'x-amz-request-id': 'tx439620795cdd41b08c58c-0064186222',
          'x-trans-id': 'tx439620795cdd41b08c58c-0064186222',
          'x-openstack-request-id': 'tx439620795cdd41b08c58c-0064186222',
          date: 'Mon, 20 Mar 2023 13:39:46 GMT',
          'transfer-encoding': 'chunked',
          connection: 'close'
        }

        const nockRequestS1 = nock(url1S3)
          .put('/bucket/file.pdf')
          .reply(500, "");


        const nockRequestS2 = nock(url2S3, {
            reqheaders: {
              'x-amz-copy-source': () => true,
              'x-amz-metadata-directive': () => true
            }
          })
          .defaultReplyHeaders(_headers2)
          .put('/bucket/file.pdf')
          .reply(403, "<?xml version=\"1.0\" encoding=\"UTF-8\"?><Error><Code>AccessDenied</Code><Message>Access Denied.</Message><RequestId>tx439620795cdd41b08c58c-0064186222</RequestId></Error>");

        const nockRequestS3 = nock(url1S3)
          .get('/')
          .reply(500, "");

        storage.setFileMetadata('bucket', 'file.pdf', { headers: { "x-amz-meta-name": "Invoice 2023", "x-amz-meta-version": "1.2.3"  } }, (err, resp) => {
          assert.strictEqual(err, null);
          assert.strictEqual(resp.statusCode, 403);
          assert.strictEqual(JSON.stringify(resp.body), JSON.stringify({
            error: {
              code: 'AccessDenied',
              message: 'Access Denied.',
              requestid: 'tx439620795cdd41b08c58c-0064186222'
            }
          }));
          assert.strictEqual(JSON.stringify(resp.headers), JSON.stringify(_headers2));
          assert.strictEqual(nockRequestS1.pendingMocks().length, 0);
          assert.strictEqual(nockRequestS2.pendingMocks().length, 0);
          assert.strictEqual(nockRequestS3.pendingMocks().length, 0);
          done();
        })
      })

    });

  });

  describe('getMetadataTotalBytes', function() {

    it('should count headers metadata size', function(done) {
      /** value + "name-1" */
      assert.strictEqual(storage.getMetadataTotalBytes({
        "x-amz-meta-name-1": "ehseedwosyevblphjjeqfwhfiuojgznptwtpogzyiqiakqpyfsehfoafciyzjuugmjmtvrwjfgfdhbiocoowyggqpzwmfcogmqvaebcfchaxwkllqspdxdisbaxqnbgexpzkllonbkjjmmtccbosocwjgatjeokarbklcagejpzyypjbrinqzqdbxjgeswyhcmgiuifnwrgqhkpthtfuehseedwosyevblphjjeqfwhfiuojgznptwtpogzyiqiakqpyfsehfoafciyzjuugmjmtvrwjfgfdhbiocoowyggqpzwmfcogmqvaebcfchaxwkllqspdxdisbaxqnbgexpzkllonbkjjmmtccbosocwjgatjeokarbklcagejpzyypjbrinqzqdbxjgeswyhcmgiuifnwrgqhkpthtfuehseedwosyevblphjjeqfwhfiuojgznptwtpogzyiqiakqpyfsehfoafciyzjuugmjmtvrwjfgfdhbiocoowyggqpzwmfcogmqvaebcfchaxwkllqspdxdisbaxqnbgexpzkllonbkjjmmtccbosocwjgatjeokarbklcagejpzyypjbrinqzqdbxjgeswyhcmgiuifnwrgqhkpthtfu"
      }), 642)
      /** values + "name-1" + "name-2" and ignore "x-amz-metadata" */
      assert.strictEqual(storage.getMetadataTotalBytes({
        "x-amz-metadata": "should not count",
        "x-amz-meta-name-1": "123456",
        "x-amz-meta-name-2": "789",
      }), 21)
      /** should ignore if none start with x-amz-meta- */
      assert.strictEqual(storage.getMetadataTotalBytes({
        "x-amz-metadata": "should not count",
        "name-1": "123456",
        "name-2": "789",
      }), 0)
      done();
    })
  })

  describe('setLogFunction', function () {
    it('should overload the log function', function (done) {
      let i = 0;

      storage.setLogFunction(function (message, level) {
        assert.strictEqual(message.length > 0, true)
        assert.strictEqual(level.length > 0, true)
        i++;
      })

      const nockRequestS1 = nock(url1S3)
        .intercept("/bucket", "HEAD")
        .reply(500, "");
      const nockRequestS2 = nock(url2S3)
        .intercept("/bucket", "HEAD")
        .reply(200, "");

      storage.headBucket('bucket', (err) => {
        assert.strictEqual(err, null);
        assert.strictEqual(i > 0, true);
        assert.strictEqual(nockRequestS1.pendingMocks().length, 0);
        assert.strictEqual(nockRequestS2.pendingMocks().length, 0);
        done();
      });
    });
  });

  describe('set rock-req defaults', function() {
    describe('setRockReqDefaults function', function() {
      it("should set rock-req default values", function(done) {
        const _newOptions = {
          ...storage.getRockReqDefaults(),
          newOption: 1234
        }
        storage.setRockReqDefaults(_newOptions);
        assert.strictEqual(storage.getRockReqDefaults().newOption, 1234);
        done();
      })

      it("should not set rock-req default values if the value is undefined", function(done) {
        storage.setRockReqDefaults(null);
        storage.setRockReqDefaults(undefined);
        storage.setRockReqDefaults("string");
        assert.strictEqual(typeof storage.getRockReqDefaults(), 'object');
        done();
      })
    });

    describe('global.rockReqConf', function() {
      it("should set rock-req default values", function(done) {
        assert.strictEqual(storage.getRockReqDefaults().retryDelay, 200);
        done();
      })
    })

  });

});