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