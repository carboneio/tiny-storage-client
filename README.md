# Tiny client for distributed S3/Swift storages

![GitHub release (latest by date)](https://img.shields.io/github/v/release/carboneio/tiny-storage-client?style=for-the-badge)
[![Documentation](https://img.shields.io/badge/documentation-yes-brightgreen.svg?style=for-the-badge)](#supported-methods)

> High availability, Performance, and Simplicity are the main focus of this tiny Node client to request AWS S3 API or the OpenStack Swift Object Storage API. It was initially made to request OVHCloud, but it can be used for any Server/Cloud provider.

## Highlights

* 🦄 **Simple to use** - Only 10 core methods: `uploadFile`, `downloadFile`, `deleteFile`, `listFiles`, `listBuckets`, `headBucket`, `setFileMetadata`, `getFileMetadata`, `deleteFiles` and `request` for custom requests. A few helpers come on top: `setTimeout`, `setConfig`/`getConfig`, `setLogFunction` and `setRockReqDefaults`/`getRockReqDefaults`.
* 🚀 **Performance** - Vanilla JS + Only 2 dependencies [rock-req](https://github.com/carboneio/rock-req) as HTTP client and [aws4](https://github.com/mhart/aws4) for signing S3 requests.
* 🌎 **High availability** - Provide one or a list of storages credentials: the SDK will switch storage if something goes wrong (Server/DNS not responding, timeout, repeated 5xx errors, authentication error). A throttled request (`429`, S3 `503 SlowDown`, Swift `498`) is handled as before (a `429` / `498` is returned, an S3 `503` goes to the next storage), optionally after backoff retries on the same storage (`maxThrottleRetry`). As soon as the main storage is available, the SDK returns to the main storage (S3: checked at the next request after a switch, then every 60 s doubling up to 10 min while it stays down; Swift: at most every 60 s, up to 10 min). See [S3](./USAGE-S3.md#throttling-retries-and-failover) and [Swift](./USAGE-SWIFT.md#throttling-retries-and-failover).
* ✨ **Reconnect automatically** - If a request fails due to an authentication token expiration, the SDK fetches a new authentication token and retries the initial request with it (Swift Storage only).
* ✅ **Battle-tested** - Used in production against hundreds of TBs of file uploads, downloads and deletes, and covered by an extensive test suite.
* 👉 **Convert XML/JSON responses to JS** - XML/JSON responses are automatically converted into `Objects`/`Arrays` (only for: `listFiles`, `listBuckets` and `Errors`).
* 🚩 **Mixing S3 and Swift credentials is not supported** - When initialising the Tiny SDK client, provide only a list of S3 or a list of Swift credentials, switching from one storage system to another is not supported.

## Install

```bash
$ npm install tiny-storage-client
```

Requires **Node.js 20 or higher**.

## Getting Started

Install and setup in less than 2 minutes:
- [AWS S3 API](./USAGE-S3.md)
- [OpenStack Swift Storage API](./USAGE-SWIFT.md)

## Supported Methods

| Swift API | S3 API | Method            | Description                                                            |
|-------------------------|------------|-------------------|------------------------------------------------------------------------|
| ✅ [example](./USAGE-SWIFT.md#upload-a-file)                    | ✅ [example](./USAGE-S3.md#upload-a-file)         | `uploadFile`      | Upload a file from a Buffer or file absolute path.                     |
| ✅ [example](./USAGE-SWIFT.md#download-a-file)                      | ✅ [example](./USAGE-S3.md#download-a-file)         | `downloadFile`    | Download a file as Buffer or Stream                                    |
| ✅ [example](./USAGE-SWIFT.md#delete-a-file)                      | ✅ [example](./USAGE-S3.md#delete-file)         | `deleteFile`      | Delete a file                                                          |
| ✅ [example](./USAGE-SWIFT.md#delete-files)                      | ✅ [example](./USAGE-S3.md#delete-files)         | `deleteFiles`     | Bulk delete files (1000 max/per request)                               |
| ✅ [example](./USAGE-SWIFT.md#list-objects-from-a-container)                      | ✅ [example](./USAGE-S3.md#list-files)         | `listFiles`       | List files (1000 max/per requests) use query parameters for pagination |
| ✅ [example](./USAGE-SWIFT.md#get-file-metadata)                      | ✅ [example](./USAGE-S3.md#get-file-metadata)         | `getFileMetadata` | Fetch custom metadata                                                 |
| ✅ [example](./USAGE-SWIFT.md#set-file-metadata)                      | ✅ [example](./USAGE-S3.md#set-file-metadata)         | `setFileMetadata` | Set custom file metadata                                              |
| ✅  [example](./USAGE-SWIFT.md#head-bucket)                     | ✅ [example](./USAGE-S3.md#head-bucket)         | `headBucket`      | Determine if a bucket exists and you have permission to access it      |
| ✅ [example](./USAGE-SWIFT.md#list-buckets)                      | ✅ [example](./USAGE-S3.md#list-buckets)         | `listBuckets`      | Returns a list of all buckets owned by the authenticated sender of the request. |
| ✅ [example](./USAGE-SWIFT.md#custom-request)                      | ✅  [example](./USAGE-S3.md#custom-requests)        | `request`         | Create custom requests                                                 |
| ✅  [example](./USAGE-SWIFT.md#container-alias)                    |  ✅  [example](./USAGE-S3.md#bucket-alias)          | Bucket Alias  | Simplify requests by using bucket alias |


## S3 Example

The following example is an initialisation of the SDK client with a list of S3 credentials and a request to download a file.
If something goes wrong when downloading the file, the SDK will switch storage and retry to download with the second credentials.
As soon as the first storage is available, the SDK returns to the main storage

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

s3storage.downloadFile('bucketName', 'filename.pdf', (err, resp) => {
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

### S3 storage class and OVHcloud endpoints

Each S3 storage accepts an optional `storageClass`, sent as `x-amz-storage-class` on `uploadFile` and `setFileMetadata` (unless you set the header). After a failover, the class of the storage actually used applies. The values are provider specific: on OVHcloud (endpoint `s3.<region>.io.cloud.ovh.net`), `EXPRESS_ONEZONE` is High Performance in 1-AZ regions and `STANDARD` is Standard; MinIO and Cloudflare R2 reject an unknown value with a `400`. See [Storage class](./USAGE-S3.md#storage-class).

On OVHcloud, prefer the endpoint `s3.<region>.io.cloud.ovh.net` to the legacy `perf` endpoint.

## Swift Example

The same client is used for OpenStack Swift, only the credentials differ. The first request authenticates automatically
(the SDK renews the token when it expires).

```js
const storageClient = require('tiny-storage-client');

const swiftStorage = storageClient([{
    username: 'username',
    password: 'password',
    authUrl : 'https://auth.cloud.ovh.net/v3',
    region  : 'GRA'
  },
  {
    username: 'username',
    password: 'password',
    authUrl : 'https://auth.cloud.ovh.net/v3',
    region  : 'SBG'
  }])

swiftStorage.downloadFile('containerName', 'filename.pdf', (err, resp) => {
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

## Run tests

Install

```bash
$ npm install
```

To run all the tests:

```bash
$ npm run test
```

## 🤝 Contributing

Contributions, issues and feature requests are welcome!

Feel free to check [issues page](https://github.com/carboneio/tiny-storage-client/issues).

## Show your support

Give a ⭐️ if this project helped you!

## License

[Apache-2.0](./LICENSE.txt)

# Supporters

This package is maintained by Carbone:

<p>
  <a href="https://carbone.io" target="_blank" alt="Supporter Carbone.io - Automate the generation of documents with a templating and nocode service">
    <img src="https://raw.githubusercontent.com/carboneio/rock-req/master/doc/carbone-logo.svg" alt="Carbone.io logo" height="60"/>
  </a>
</p>
