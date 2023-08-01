### v3.0.0
- New major version to make S3 and Swift methods identical (function arguments and callback functions)
- SWIFT Breaking changes:
  - All callback function are returning now `(err, resp) => {}`. The `resp` object contains `{ body, headers, statusCode }`
  - Updated `listFiles`: On success, the JSON body is automatically converted into a Javascript Object. If the body returned is not `application/json`, the raw body is returned.
  - Added: Container aliases are now supported for all methods
- SWIFT New methods:
  - `deleteFiles` to bulk delete files
  - `headBucket` to determine if a bucket (container) exists and you have permission to access it
  - `listBucket` to return a list of all buckets (containers) owned by the authenticated sender of the request. On success, the JSON body is automatically converted into a Javascript Object. If the body returned is not `application/json`, the raw body is returned.
- SWIFT Code change: important refactoring 

### v2.2.5
- SWIFT updated:
  - The authentication object does not require the `tenantName` attribute anymore, it is now optional.
  - `swift.uploadFile`: The 3rd argument accepts a function returning a ReadStream, in addition to the Buffer and the absolute path of the file
- Updated dev npm packages: 
  - `eslint` to `8.45.0` 
  - `nock` to `=13.3.2`

### v2.2.4
- Patched `s3.deleteFiles`: the XML body includes object names without encoding. Previously, objects with special character was encoded (encodeURIComponent), and S3 did not delete them.

### v2.2.3
- Patched `s3.setFileMetadata`: Bucket aliases are now supported and are not generating a 403 error anymore.

### v2.2.2
- Patched rock-req options initialisation

### v2.2.1
- Updated package `rock-req` to `5.1.3`

### v2.2.0
- Updated to a singleton pattern: the `require('tiny-storage-client')({ config-S3-or-SWIFT })` return a new storage instance. Meaning, existing instances are not overwritten anymore when creating a new one.

### v2.1.4
- Updated package `rock-req` to `5.1.2`

### v2.1.3
- Patched loading module `xmlToJson.js`

### v2.1.2
- Updated setting defaults of rock-req by propagating the object instead of assigning.

### v2.1.1
- Updated package `rock-req` to `5.1.1`

### v2.1.0
- Added the possibility to set [defaults rock-req](https://github.com/carboneio/rock-req#global-options--extend) values:
  - Added function `setRockReqDefaults` and `getRockReqDefaults`
  - Or create the global variable `global.rockReqConf`, it must be initialised before calling `require('tiny-storage-client')`
- Added for all S3 methods: the options argument can takes the option `requestOptions` object, it will be merged into the HTTP request options. Example to upload a file: `storage.uploadFile('bucket', 'file.pdf', Buffer.from(fileXml), { requestOptions: { tenantId: 200, headers: { "custom-option" : true } } }, (err, resp) => {})`

### v2.0.0
- Replaced `simple-get` by `rock-req` package (0 deps, bench: 21797 req/s and streams fully tested)
- To download a file as stream, you have to provide an `output` function as option. The `output` function must return the output stream, and it is invoked by `rock-req` for every request and retries. If something goes wrong, the Writable stream is destroyed automatically, and the error can be captured with 'error' event or `stream.finished`. When the callback is called, the streamed is finised.
The `stream:true` boolean options to get an HTTP response a Stream is removed, and replaced by the `output: () => { return OutputStream }` option (Explained above).

### v1.0.2
- Fixed Bucket aliases generating a false AWS4 signature

### v1.0.1
- Removed unused code
- Updated documentation

### v1.0.0
- Renamed the project "high-availability-object-storage" to "tiny-storage-client"
- Added support for AWS s3, [learn more to connect and request](./USAGE-S3.md)

### v0.4.0
- the `request` function accept an option `stream:true` to get the HTTP response as a stream, instead of a content as Buffer, such as: `request(method, path, { headers, queries, body, stream: true }, (err, resp) => {})`.
- Removed `debug` package

### v0.3.0
- Add function to create custom request to the object storage. Prototype: `request(method, path, { headers, queries, body }, (err, body, headers) => {})`. The base URL requests by default the account, passing an empty string will request the account details. For container requests, pass the container name, such as: `/{container}`. For file requests, pass the container and the file, such as: `/{container}/{filename}`. Object Storage Swift API specification: https://docs.openstack.org/api-ref/object-store/

### v0.2.0
- Add function `setFileMetadata` to create or replace object metadata
- Add function `getFileMetadata` to get an object metadata
- Updated package `debug` to `4.3.4`

### v0.1.9
- Updated package `simple-get` to `4.0.1`

### v0.1.8
- Fixed the `downloadFile` callback function, the third argument is now always returning the response header of the request.

### v0.1.7
- Added `setLogFunction` used to Override the log function. It takes to arguments: `message` as a string, `level` as a string and can be: `info`/`warning`/`error`. Example to use:
```js
storage.setLogFunction((message, level) => {
  console.log(`${level} : ${message}`);
})
```

### v0.1.6
- Fixed `connection` fallback on error & add tests

### v0.1.5
  - Fixed `uploadFile`: return the response body if an error occurs
  - Added parallel tests
### v0.1.4
  - Fix the automatic fallback when multiple clients are using all functions in parallel
### v0.1.3
  - Renamed `getFiles` function to `listFiles`
  - Renamed `writeFile` function to `uploadFile`
  - Renamed `readFile` function to `downloadFile`
  - Added: Pass a list of object storage credential to the constructor, the sdk will automatically connect to another storage if something goes wrong (Server or DNS not responding, timeout, error 500, too many redirection, and more...)
  - Added: the method `uploadFile` accepts a new optionnal fourth argument `option`: `{ queries: { temp_url_expires: '1440619048' }, headers: { X-Object-Meta-LocationOrigin: 'Paris/France' }`. List of query parameters and headers: https://docs.openstack.org/api-ref/object-store/?expanded=create-or-replace-object-detail#create-or-replace-object


### v0.1.2
  - Added method `getFiles`: Show container details and list objects. It is possible to filter the list or overwrite the request headers, such as:
    ```js
      storage.getFiles('containerName', { queries: { prefix: 'prefixName' }, headers: { Accept: 'application/xml' } }, function (err, body) {
        if (err) {
          return console.log(err);
        }
        console.log(body.toString());
      });
    ```
    List of headers and queries: https://docs.openstack.org/api-ref/object-store/?expanded=show-container-details-and-list-objects-detail#show-container-details-and-list-objects
### v0.1.1
  - Updated `writeFile` function : it can take a Buffer as an argument

### v0.1.0
  - Methods to interact with the OVH Object Storage:
    - writeFile: upload a file
    - readFile: download a file
    - deleteFile: delete a file
  - a new authentication token is requested when the authentication token is not valid during a request