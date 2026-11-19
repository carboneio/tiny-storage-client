# Tiny node client for distributed S3


## Highlight

* 🚀 Vanilla JS + Only 2 dependencies [rock-req](https://github.com/carboneio/rock-req) for HTTP requests and [aws4](https://github.com/mhart/aws4) for signing S3 requests.
* 🌎 Provide one or a list of S3 storages credentials: the SDK will switch storage if something goes wrong (Server/DNS not responding, timeout, error 500, too many redirects, authentication error, and more...). As soon as the main storage is available, the SDK returns to the main storage.
* ✨ File names and request parameters are automatically encoded.
* ⚡️ Use [Bucket alias](#bucket-alias) if you have synchronised buckets into multiple regions/datacenters
* 👉 XML responses from S3 are automatically converted as Javascript Objects (for `ListObjects`, `deleteFiles` and any `Errors`).
* 🚩 When initialising the Tiny SDK client, provide only a list of S3 or a list of Swift credentials, switching from one storage system to another is not supported.
* ✅ Production battle-tested against hundreds of TBs of file uploads & downloads

## Install

```bash
$ npm install tiny-storage-client
// or
$ yarn add tiny-storage-client
```

Requires **Node.js 20 or higher**.

## API Usage

### Setup

Initialise the SDK with one or multiple storage, if something goes wrong (Error 500 / Timeout), the next region/provider will take over automatically. If no storage is available, an error message is returned `Error: All S3 storages are not available`. The error carries the cause of the last failure:
- `err.storageStatusCode`: the last HTTP status code of the storage (5xx, 401), if the storage replied
- `err.code`: the network error code (`ETIMEDOUT`, `ECONNRESET`...), if any
- `err.cause`: the original network `Error`, if any

`err.statusCode` and `err.status` are never set: HTTP frameworks (Express...) reply with them, a storage `401` must not become the `401` of your API.

```js
storage.downloadFile('invoices', 'file.pdf', (err, resp) => {
  if (err) {
    // "All S3 storages are not available" 503 undefined
    return console.log(err.message, err.storageStatusCode, err.code);
  }
});
```

On the following example, the SDK is initialised with credentials of 2 cloud providers: a OVHCloud S3 storage and a AWS S3 storage.

```js
const storageClient = require('tiny-storage-client');

const s3storage = storageClient([{
  accessKeyId    : 'accessKeyId',
  secretAccessKey: 'secretAccessKey',
  url            : 's3.gra.io.cloud.ovh.net',
  region         : 'gra'
},
{
  accessKeyId    : 'accessKeyId',
  secretAccessKey: 'secretAccessKey',
  url            : 's3.eu-west-3.amazonaws.com',
  region         : 'eu-west-3'
}])
```

### Security notes

- `uploadFile` reads any local path it is given: never pass a path built from user input.
- Object names are encoded, but `..` segments are sent as is: validating names built from user input is the caller's responsibility.
- With a stream `output`, `resp` is the raw HTTP response: `console.log(resp)` or `util.inspect(resp)` prints the request headers, including the `Authorization` signature. Log `resp.statusCode` and `resp.headers` only.

### HTTP client options

`setRockReqDefaults()` (and `global.rockReqConf`) change the defaults of [rock-req](https://github.com/carboneio/rock-req) for every request, except `keepAliveTimeout` and `keepAliveDuration`: rock-req reads them once, when it creates its HTTP agents in `rock.extend()`, so they are silently ignored. To change them, pass your own agent: `setRockReqDefaults({ agent: new https.Agent({ keepAlive: true, keepAliveMsecs: 3000 }) })`.

### Upload a file

```js
const path = require('path');

/** SOLUTION 1: The file content can be passed by giving the file absolute path **/
s3storage.uploadFile('bucketName', 'file.pdf', path.join(__dirname, 'dir2', 'file.pdf'), (err, resp) => {
  if (err) {
    return console.log("Error on upload: ", err.toString());
  }
  /**
   * Request response:
   * - resp.body
   * - resp.headers
   * - resp.statusCode
   */
})

/** SOLUTION 2: A buffer can be passed for the file content **/
s3storage.uploadFile('bucketName', 'file.pdf', Buffer.from('file-buffer'), (err, resp) => {
  if (err) {
    return console.log("Error on upload: ", err.toString());
  }
  /**
   * Request response:
   * - resp.body
   * - resp.headers
   * - resp.statusCode
   */
})

/** SOLUTION 3: the function accepts an optional fourth argument `option` including query parameters and headers. List of query parameters and headers **/
s3storage.uploadFile('bucketName', 'file.pdf', Buffer.from('file-buffer'), {
  headers: {
    "x-amz-meta-name": "invoice-2023",
    "x-amz-meta-version": "1.85.2"
  }
}, (err, resp) => {
  if (err) {
    return console.log("Error on upload: ", err.toString());
  }
  /**
   * Request response:
   * - resp.body
   * - resp.headers
   * - resp.statusCode
   */
})

```

### Download a file

```js
/** Solution 1: Download the file as Buffer */
s3storage.downloadFile('bucketName', '2023-invoice.pdf', (err, resp) => {
  if (err) {
    return console.log("Error on download: ", err);
  }
  /**
   * Request response:
   * - resp.body => downloaded file as Buffer
   * - resp.headers
   * - resp.statusCode
   */
})

/** Solution 2: Download the file as Stream,  set the option `output` with a function returning the output Stream */
function createOutputStream(opts, res) {
  const writer = fs.createWriteStream('2023-invoice.pdf')
  writer.on('error', (e) => { /* clean up your stuff */ })
  return writer
}

s3storage.downloadFile('bucketName', '2023-invoice.pdf', { output: createOutputStream }, (err, resp) => {
  if (err) {
    return console.log("Error on download: ", err);
  }
  /**
   * Request response:
   * - resp.headers
   * - resp.statusCode
   *
   * When the callback is called, the stream is closed and the file created,
   * you don't have to pipe yourself!
   */
})
```

The file is returned exactly as stored, byte for byte: a file uploaded with a `Content-Encoding` metadata (`gzip`, `deflate`, `br`) is **not** decompressed, so `resp.body` matches the stored size and checksum, and can be copied to another storage as is. The header `resp.headers['content-encoding']` tells how to decode it. `downloadFile` sends `accept-encoding: identity` so a proxy or CDN does not compress the file on the fly, unless you set this header. To decompress it on download, pass the option `{ requestOptions: { decompress: true } }` on each call (`setRockReqDefaults` does not change it).

### Delete file

Removes an object. If the object does not exist, S3 storage will still respond that the command was successful.

```js
s3storage.deleteFile('bucketName', 'invoice-2023.pdf', (err, resp) => {
  if (err) {
    return console.log("Error on delete: ", err.toString());
  }
  /**
   * Request response:
   * - resp.body => empty body
   * - resp.headers
   * - resp.statusCode
   */
});
```

### Delete files

Bulk delete files (Maximum 1000 keys per request).

The list of files must be an `Array`, and must not exceed 1000 entries, otherwise an error is returned on the callback:
`Deleting files: the list of files must be an Array` / `Deleting files: 1000 files maximum per request`.

```js
/**
 * Provide a list of filenames as second argument, it can be:
 * - a list of string ["object1.pdf", "object2.docx", "object3.pptx"]
 * - a list of objects with `key` as attribute name [{ "key": "object1.pdf"}, { "key": "object2.docx" }, { "key": "object3.pptx" }]
 * - Or a list of objects with `name` as attribute for the filename: [{ "name" : "file1.png" }, { "name": "file2.docx" }]
 * - Or a list of objects with a custom Key for filenames, you must define `fileNameKey` as option (third argument). 
*/
const files = ["object1.pdf", "object2.docx", "object3.pptx"];

s3storage.deleteFiles('bucketName', files, (err, resp) => {
  if (err) {
    return console.log("Error on deleting files: ", err.toString());
  }
  /**
   * Request response:
   * - resp.headers
   * - resp.statusCode
   * - resp.body => body as JSON listing deleted files and errors:
   *  {
   *    deleted: [
   *      { key: 'object1.pdf' },
   *      { key: 'object2.docx' }
   *    ],
   *    error: [
   *      {
   *       key    : 'object3.pptx',
   *       code   : 'AccessDenied',
   *       message: 'Access Denied'
   *      }
   *    ]
   *  }
   */
});
```

### List files

```js
/** Solution 1: only provide the bucket name */
s3storage.listFiles('bucketName', function(err, resp) {
  if (err) {
    return console.log("Error on listing files: ", err.toString());
  }
   /**
   * Request response:
   * - resp.headers
   * - resp.statusCode
   * - resp.body => list of files as JSON format:
   *    {
   *      "name": "bucketName",
   *      "keycount": 1,
   *      "maxkeys": 1000,
   *      "istruncated": false,
   *      "contents": [
   *        {
   *          "key": "file-1.docx",
   *          "lastmodified": "2023-03-07T17:03:54.000Z",
   *          "etag": "7ad22b1297611d62ef4a4704c97afa6b",
   *          "size": 61396,
   *          "storageclass": "STANDARD"
   *        }
   *      ]
   *    }
   */
});

/** Solution 2: only provide the bucket name and query parameters for pagination*/
const _queries = {
  "max-keys": 100,
  "start-after": "2022-02-invoice-client.pdf"
}
s3storage.listFiles('bucketName', { queries: _queries }, function(err, resp) {
  if (err) {
    return console.log("Error on listing files: ", err.toString());
  }
   /**
   * Request response:
   * - resp.headers
   * - resp.statusCode
   * - resp.body => list of files as JSON format:
   *    {
   *      "name": "bucketName",
   *      "keycount": 1,
   *      "maxkeys": 100,
   *      "istruncated": false,
   *      "contents": [
   *        {
   *          "key": "file-1.docx",
   *          "lastmodified": "2023-03-07T17:03:54.000Z",
   *          "etag": "7ad22b1297611d62ef4a4704c97afa6b",
   *          "size": 61396,
   *          "storageclass": "STANDARD"
   *        }
   *      ]
   *    }
   */
});
```

### Get file metadata

```js
s3storage.getFileMetadata('bucketName', '2023-invoice.pdf', (err, resp) => {
  if (err) {
    return console.log("Error on fetching metadata: ", err.toString());
  }
  /**
   * Request response:
   * - resp.body => empty string
   * - resp.headers => all custom metadata and headers
   * - resp.statusCode
   */
});
```

### Set file metadata

Create custom metadatas by providing headers starting with "x-amz-meta-", followed by a name to create a custom key. By default, metadata are replaced with metadata provided in the request. Set the header `"x-amz-metadata-directive":"COPY"` to copy metadata from the source object.

Metadata can be as large as 2KB total (2048 Bytes). To calculate the total size of user-defined metadata sum the number of bytes in the UTF-8 encoding for each key and value. Both keys and their values must conform to US-ASCII standards.

```js

const _headers = {
  "x-amz-meta-name": "2023-invoice-company.pdf",
  "x-amz-meta-version": "2023-invoice-company.pdf"
}

s3storage.setFileMetadata('steeve-test-bucket', 'template.odt', { headers: _headers }, (err, resp) => {
  if (err) {
    return console.log("Error on updating metadata: ", err.toString());
  }
  /**
   * Request response:
   * - resp.body
   * - resp.headers
   * - resp.statusCode
   */
})
```
### Head Bucket

 The action `headBucket` is useful to determine if a bucket exists and you have permission to access it thanks to the Status code. A message body is not included, so you cannot determine the exception beyond these error codes. Two possible answers:
 - The action returns a 200 OK if the bucket exists and you have permission to access it.
 - If the bucket does not exist or you do not have permission to access it, the HEAD request returns a generic 400 Bad Request, 403 Forbidden or 404 Not Found code.

```js
s3storage.headBucket('bucketName', (err, resp) => {
  if (err) {
    return console.log("Error head Bucket: ", err.toString());
  }
  /**
   * Request response:
   * - resp.body => empty string
   * - resp.headers
   * - resp.statusCode
   */
});
```

### List Buckets

Returns a list of all buckets owned by the authenticated sender of the request. To use this operation, you must have the s3:ListAllMyBuckets permission.

```js
s3storage.listBuckets((err, resp) => {
  if (err) {
    return console.log("Error list Buckets: ", err.toString());
  }
  /**
   * Request response:
   * - resp.body => { bucket: [ { "name": "bucket1", "creationdate": "2023-02-27T11:46:24.000Z" } ] }
   * - resp.headers
   * - resp.statusCode
   */
})
```

### Bucket Alias

To simplify requests to custom named bucket into different S3 providers, it is possible to create aliases by providing a `buckets` object on credentials. When calling a function, define the bucket alias as first argument, it will request the current active storage automatically.

```js
const storageClient = require('tiny-storage-client');

/** The credentials of every storage must be passed as a single Array */
const s3storage = storageClient([{
  accessKeyId    : 'accessKeyId',
  secretAccessKey: 'secretAccessKey',
  url            : 's3.gra.io.cloud.ovh.net',
  region         : 'gra',
  buckets        : {
    invoices : "invoices-ovh-gra",
    www      : "www-ovh-gra"
  }
},
{
  accessKeyId    : 'accessKeyId',
  secretAccessKey: 'secretAccessKey',
  url            : 's3.eu-west-3.amazonaws.com',
  region         : 'eu-west-3',
  buckets        : {
    invoices : "invoices-aws-west-3",
    www      : "www-aws-west-3"
  }
}])

/**
 * On the following example, "downloadFile" will request the main storage "invoices-ovh-gra"
 * or the backup "invoices-aws-west-3" if something goes wrong.
 */
s3storage.downloadFile('invoices', '2023-invoice.pdf', (err, resp) => {
  if (err) {
    return console.log("Error on download: ", err);
  }
  /**
   * Request response:
   * - resp.body => downloaded file as Buffer
   * - resp.headers
   * - resp.statusCode
   */
})

```

### Custom requests

The `request` function can be used to request the object storage with custom options.
Prototype to get the data as Buffer:
```js
s3storage.request(method, path, { headers, queries, body }, (err, resp) => {
  /**
   * Request response:
   * - resp.body => body as Buffer
   * - resp.headers
   * - resp.statusCode
   */
})
```
Prototype to get the data as Stream, set the option `output` with a function returning the output Stream.
```js
function createOutputStream(opts, res) {
  const writer = fs.createWriteStream('2023-invoice.pdf')
  writer.on('error', (e) => { /* clean up your stuff */ })
  return writer
}

s3storage.request(method, path, { headers, queries, body, output: createOutputStream }, (err, resp) => {
  /**
   * Request response:
   * - resp.headers
   * - resp.statusCode
   *
   * When the callback is called, the file created and the stream is closed, meaning you don't have to pipe yourself!.
   */
})
```
For bucket requests, pass the bucket name as `path`, such as: `/{bucket}`. For object requests, pass the bucket and the object name, such as: `/{bucket}/{object}`.

### Logs

By default, logs are printed with `console.log`. Use `setLogFunction` to override the default log function: `(message, level, fields) => {}`
- `message`: string
- `level`: `info`, `warning` or `error`
- `fields`: flat object for structured logs (JSON loggers, metrics). Always `event` and `storage` (`'s3'`), and when relevant: `index`, `region`, `method`, `path` (without query string), `status` (HTTP status of the storage), `code` (network error code, e.g. `ETIMEDOUT`), `from`, `to` (storage indexes). Never tokens, credentials or signed URLs.

A function with two arguments `(message, level)` keeps working. The default console output is unchanged.

```js
s3storage.setLogFunction((message, level, fields) => {
  logger[level === 'warning' ? 'warn' : level]({ ...fields }, message);
})
```

| `event` | Level | When |
|---|---|---|
| `storage_fallback` | warning | A request failed (network error, 5xx, 401): the next storage is used |
| `storage_unavailable` | error | No storage available, the request returns `All S3 storages are not available` |
| `storage_main_restored` | info | The main storage answers again, the next requests use it |
| `storage_index_invalid` | error | `requestStorageIndex` points to no storage |
| `getmd5_error` | error | The `Content-MD5` of a body cannot be computed |

### Timeout

The default request timeout is 60 seconds of inactivity (no byte received or sent, not the total duration, like the AWS SDK). With several storages, a storage that stops answering takes up to 2 × the timeout before the next storage is used (one retry by rock-req): lower it with `setTimeout` for a faster failover:
```js
s3storage.setTimeout(30000); // 30 seconds
```