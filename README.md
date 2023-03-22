# Tiny client for distributed S3/Swift storages

![GitHub release (latest by date)](https://img.shields.io/github/v/release/carboneio/tiny-storage-client?style=for-the-badge)
[![Documentation](https://img.shields.io/badge/documentation-yes-brightgreen.svg?style=for-the-badge)](#api-usage)

> High availability, Performances, and Simplicity are the main focus of this tiny Node client to request AWS S3 API or the OpenStack Swift Object Storage API. It was initially made to request OVHCloud, but it can be used for any Server/Cloud provider.

## Highlights

* 🦄 **Simple to use** - Only 5 methods: `uploadFile`, `deleteFile`, `listFiles`, `downloadFile` and `request` for custom requests.
* 🚀 **Performances** - Vanilla JS + Only 2 dependencies [simple-get](https://github.com/feross/simple-get) for HTTP requests and [aws4](https://github.com/mhart/aws4) for signing S3 requests.
* 🌎 **High availability** - Provide one or a list of storages credentials: the SDK will switch storage if something goes wrong (Server/DNS not responding, timeout, error 500, too many redirection, authentication error, and more...). As soon as the main storage is available, the SDK returns to the main storage
* ✨ **Reconnect automatically** - If a request fails due to an authentication token expiration, the SDK fetches a new authentication token and retry the initial request with it (Concerns only Swift Storage).
* ✅ **100% tested** - Production battle-tested against hundreds of GBs of file uploads & downloads
* 👉 **JSON responses** - XML responses are automatically converted as Javascript Objects (Concerns only S3 Storage: `ListObjects` and `Errors`).
* 🚩 **Mixing S3 and Swift credentials is not supported** - When initialising the Tiny SDK client, provide only a list of S3 or a list of Swift credentials, switching from one storage system to another is not supported.

## Getting Start

Install and setup in less than 2 minutes:
- [AWS S3 API](./USAGE-S3.md)
- [Open Stack Swift Storage API](./USAGE-SWIFT.md)

## Supported Methods

| Swift API | S3 API | Method            | Description                                                            |
|-------------------------|------------|-------------------|------------------------------------------------------------------------|
| ✅ [example](./USAGE-SWIFT.md#upload-a-file)                    | ✅ [example](./USAGE-S3.md#upload-a-file)         | `uploadFile`      | Upload a file from a Buffer or file absolute path.                     |
| ✅ [example](./USAGE-SWIFT.md#download-a-file)                      | ✅ [example](./USAGE-S3.md#download-a-file)         | `downloadFile`    | Download a file as Buffer or Stream                                    |
| ✅ [example](./USAGE-SWIFT.md#delete-a-file)                      | ✅ [example](./USAGE-S3.md#delete-file)         | `deleteFile`      | Delete a file                                                          |
| ❌                       | ✅ [example](./USAGE-S3.md#delete-files)         | `deleteFiles`     | Bulk delete files (1000 max/per request)                               |
| ✅ [example](./USAGE-SWIFT.md#list-objects-from-a-container)                      | ✅ [example](./USAGE-S3.md#list-files)         | `listFiles`       | List files (1000 max/per requests) use query parameters for pagination |
| ✅ [example](./USAGE-SWIFT.md#get-file-metadata)                      | ✅ [example](./USAGE-S3.md#get-file-metadata)         | `getFileMetadata` | Fetch custom metadatas                                                 |
| ✅ [example](./USAGE-SWIFT.md#set-file-metadata)                      | ✅ [example](./USAGE-S3.md#set-file-metadata)         | `setFileMetadata` | Set custom file metadatas                                              |
| ❌                       | ✅ [example](./USAGE-S3.md#head-bucket)         | `headBucket`      | Determine if a bucket exists and you have permission to access it      |
| ❌                       | ✅ [example](./USAGE-S3.md#list-buckets)         | `listBuckets`      | Returns a list of all buckets owned by the authenticated sender of the request. |
| ✅ [example](./USAGE-SWIFT.md#custom-request)                      | ✅  [example](./USAGE-S3.md#custom-requests)        | `request`         | Create custom requests                                                 |
| ✅ [example](./USAGE-SWIFT.md#connection)                      | ❌          | `connection`         | Connection is required only for Openstack Swift Object storage to get a unique auth token                                                 |
| ❌                      |  ✅  [example](./USAGE-S3.md#bucket-alias)          | Bucket Alias  | Simplify requests by using bucket alias |


## S3 Example

The following exemple is an initialisation of the SDK client with a list of S3 credentials and a request to download a file.
If something goes wrong when downloading the file, the SDK will switch storage and retry to download with the second credentials.
As soon as the first storage is available, the SDK returns to the main storage

```js
const storageSDK = require('tiny-storage-client');

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

s3storage.downloadFile('bucketName', 'filename.pdf', (err, resp) => {
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

## 👤 Author

- [**@steevepay**](https://github.com/steevepay)
