# Tiny node client for distributed S3


## Highlight

* 🚀 Vanilla JS + Only 2 dependencies [simple-get](https://github.com/feross/simple-get) for HTTP requests and [aws4](https://github.com/mhart/aws4) for signing S3 requests.
* 🌎 Provide one or a list of S3 storages credentials: the SDK will switch storage if something goes wrong (Server/DNS not responding, timeout, error 500, too many redirection, authentication error, and more...). As soon as the main storage is available, the SDK returns to the main storage.
* ✨ File names and request parameters are automatically encoded.
* ⚡️ Use [Bucket alias](#bucket-alias) if you have synchronised buckets into multiple regions/datacenters
* 👉 XML responses from S3 are automatically converted as Javascript Objects (for `ListObjects`, `deleteFiles` and any `Errors`).
* 🚩 When initialising the Tiny SDK client, provide only a list of S3 or a list of Swift credentials, switching from one storage system to another is not supported.
* ✅ Production battle-tested against hundreds of GBs of file uploads & downloads

## Install

```bash
$ npm install --save high-availability-object-storage
// or
$ yarn add high-availability-object-storage
```

## API Usage

### Setup

Initialise the SDK with one or multiple storage, if something goes wrong (Error 500 / Timeout), the next region/provider will take over automatically. If any storage is available, an error message is returned `Error: All S3 storages are not available`.

On the following example, the SDK is initialised with credentials of 2 cloud providers: a OVHCloud S3 storage and a AWS S3 storage.

```js
const storageSDK = require('high-availability-object-storage');

const s3storage = storageSDK({
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
})
```

### Upload a file

```js
const path = require(path);

/** SOLUTION 1: The file content can be passed by giving the file absolute path **/
s3storage.uploadFile('bucketName', 'file.pdf', path.join(__dirname, 'dir2', 'file.pdf'), (err, resp) => {
  if (err) {
    return console.log("Error on upload: ", err.toString());
  }
  /**
   * Request reponse:
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
   * Request reponse:
   * - resp.body
   * - resp.headers
   * - resp.statusCode
   */
})

/** SOLUTION 3: the function accepts a optionnal fourth argument `option` including query parameters and headers. List of query parameters and headers **/
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
   * Request reponse:
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
   * Request reponse:
   * - resp.body => downloaded file as Buffer
   * - resp.headers
   * - resp.statusCode
   */
})

/** Solution 2: Download the file as Stream by providing the option `stream:true` */
s3storage.downloadFile('bucketName', '2023-invoice.pdf', { stream: true }, (err, resp) => {
  if (err) {
    return console.log("Error on download: ", err);
  }
  /**
   * Request reponse:
   * - resp => file stream to pipe
   * - resp.headers
   * - resp.statusCode
   */
})
```

### Delete file

Removes an object. If the object does not exist, S3 storage will still respond that the command was successful.

```js
s3storage.deleteFile('bucketName', 'invoice-2023.pdf', (err, resp) => {
  if (err) {
    return console.log("Error on delete: ", err.toString());
  }
  /**
   * Request reponse:
   * - resp.body => empty body
   * - resp.headers
   * - resp.statusCode
   */
});
```

### Delete files

Bulk delete files (Maximum 1000 keys per requests)

```js
/**
 * Create a list of objects, it can be:
 * - a list of string ["object1.pdf", "object2.docx"]
 * - a list of object with `keys` as attribute name [{ "keys": "object1.pdf"}, { "keys": "object2.docx" }]
*/
const files = ["object1.pdf", "object2.docx"];

s3storage.deleteFiles('bucketName', files, (err, resp) => {
  if (err) {
    return console.log("Error on deleting files: ", err.toString());
  }
  /**
   * Request reponse:
   * - resp.body => body as JSON listing deleted files and errors
   * - resp.headers
   * - resp.statusCode
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
   * Request reponse:
   * - resp.body => list of files as JSON format
   * - resp.headers
   * - resp.statusCode
   */
});

/** Solution 2: only provide the bucket name and query parameters for pagination*/
const _queries = {
  "max-keys": 100,
  "start-after": "2022-02-invoice-client.pdf"
}
s3storage.listFiles('bucketName', { queries: _queries } function(err, resp) {
  if (err) {
    return console.log("Error on listing files: ", err.toString());
  }
   /**
   * Request reponse:
   * - resp.body => list of files as JSON format
   * - resp.headers
   * - resp.statusCode
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
   * Request reponse:
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
   * Request reponse:
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
   * Request reponse:
   * - resp.body => empty string
   * - resp.headers
   * - resp.statusCode
   */
});
```

### Bucket Alias

To simplify requests to custom named bucket into different S3 providers, it is possible to create aliases by providing a `buckets` object on credentials. When calling a function, define the bucket alias as first argument, it will request the current active storage automatically.

```js
const storageSDK = require('high-availability-object-storage');

const s3storage = storageSDK({
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
})

/**
 * On the following example, "downloadFile" will request the main storage "invoices-ovh-gra"
 * or the backup "invoices-aws-west-3" if something goes wrong.
 */
s3storage.downloadFile('invoices', '2023-invoice.pdf', (err, resp) => {
  if (err) {
    return console.log("Error on download: ", err);
  }
  /**
   * Request reponse:
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
request(method, path, { headers, queries, body }, (err, resp) => {
  /**
   * Request reponse:
   * - resp.body => body as Buffer
   * - resp.headers
   * - resp.statusCode
   */
}).
```
Prototype to get the data as Stream, set the option `stream:true`:
```js
request(method, path, { headers, queries, body, stream: true }, (err, resp) => {
  /**
   * Request reponse:
   * - resp.body => body as Stream
   * - resp.headers
   * - resp.statusCode
   */
})`.
```
For container requests, pass the container name as `path`, such as: `/{container}`. For object requests, pass the container and the object name, such as: `/{container}/{object}`.

### Logs

By default, logs are printed with to `console.log`. You can use the `setLogFunction` to override the default log function. Create a function with two arguments: `message` as a string, `level` as a string and the value can be: `info`/`warning`/`error`. Example to use:
```js
s3storage.setLogFunction((message, level) => {
  console.log(`${level} : ${message}`);
})
```

### Timeout

The default request timeout is 5 seconds, change it by calling `setTimeout`:
```js
s3storage.setTimeout(30000); // 30 seconds
```