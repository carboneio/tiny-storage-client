### v4.1.0
Resilience release: a busy storage can now be retried with a backoff (opt-in), and one failing request no longer moves all traffic to the fallback storage. The API is unchanged. Upgrade `rock-req` to 5.4.0 in your app at the same time (see below). Behaviour changes are listed first.

- **Deployment**: `rock-req` is now pinned to exactly 5.4.0. If your app also uses `rock-req` and sets `rock.defaults` (for example a proxy in `beforeRequest`), it must use 5.4.0 too, otherwise npm installs two copies and your defaults stop applying to storage requests.
- **S3 and Swift**: the active storage now switches for all requests only after 3 server errors in a row. A single `5xx` still sends that request to the next storage, and a network error, a timeout or an S3 `401` still switch at once. One corrupt object no longer moves every request to a fallback that may be stale.
- **S3 and Swift**: a `501 Not Implemented` is returned to you directly, with no retry and no failover.
- **S3 and Swift**: redirects are no longer followed. A signed S3 request or a Swift token is never sent to another host, the `3xx` is returned to you.
- **S3 and Swift**: with a stream `output`, only a `2xx` response is written into your stream. Error responses (a `404`, a throttle, a failover) are returned as `{ statusCode, headers, body }` instead of being saved as the file. Your `output()` is called at most once per request, and once data is written, a network error is returned to you instead of failing over. An error of your own stream, such as a full disk, is returned at once.
- **S3**: while on a fallback, the main storage was checked on every request and restored even when it was throttled. It is now checked once right after a switch, then every 60 s, doubling up to 10 min while it stays down. Only a `2xx`, `403` or `404` restores it. When the last storage fails, the client goes back to the main storage.
- **S3**: when no storage can serve a request, `err.code` now holds the S3 error code (`InternalError`, `SlowDown`...) if there is no network error code. In 4.0 it only held network codes.
- **S3 and Swift**: new storage option `maxThrottleRetry` (default `0`, nothing changes unless you set it). A throttled request (`429`, Swift `498`, S3 `503 SlowDown`) is retried on the same storage with an exponential backoff, at most 20 s per wait, honouring `Retry-After`. Then a `429` or `498` is returned as before, and an S3 `503` moves to the next storage. When every storage is throttled, the error reads `All S3 storages are not available | Throttled by the storage (slow down)`, so code matching the start of the old message still works. An invalid value throws at configuration time.
- **S3**: new storage option `storageClass`, sent as `x-amz-storage-class` on `uploadFile` and `setFileMetadata` unless you set that header yourself. Values depend on the provider (OVHcloud accepts `EXPRESS_ONEZONE` and `STANDARD`).
- **S3 and Swift**: the `options` you pass are never modified. Reusing an options object with `setFileMetadata` could copy the first file onto the second one.
- **S3 and Swift**: new log events `storage_throttled`, `storage_request_failed` and `storage_main_unavailable`. The S3 `storage_unavailable` message is now just `S3 Storage | All storages are not available`.
- **S3 and Swift**: a `101` answer, or an output stream created with `emitClose: false`, no longer loses the callback.
- **S3**: a `text/xml` error body is parsed like `application/xml`, and a `requestStorageIndex` request never affects failover.
- **Swift**: a Keystone answer without a token is a failed login. Every request was sent with `X-Auth-Token: undefined`.
- **Swift**: the active storage can no longer point past the end of the list, and `setStorages()` copies the list you pass.

### v4.0.0
Major version because of two behaviour changes: `downloadFile` returns stored bytes (no more automatic decompression) and the default timeout goes from 5 s to 60 s. The API is unchanged: code that does not download gzip-encoded objects or rely on the 5 s timeout needs no change.

- ⚠️ **S3 and Swift**: `downloadFile` now returns the file exactly as stored. A file uploaded with `Content-Encoding: gzip`, `deflate` or `br` was silently decompressed: its size and MD5 no longer matched the stored object, and copies to another storage lost their compression. So a stream `output` now writes the compressed file, and `body.toString()` or `JSON.parse` on a gzip-stored file gets compressed bytes. To get the old behaviour, pass `{ requestOptions: { decompress: true } }` on each call: `setRockReqDefaults({ decompress: true })` does not restore it. `downloadFile` also sends `accept-encoding: identity` (unless you set this header), so a proxy or CDN does not compress the file on the fly. Listings and other API responses are not affected. Requires `rock-req` 5.3.0.
- **S3 and Swift**: default timeout raised from 5 s to 60 s (inactivity, not total): slow S3 operations no longer time out while succeeding server-side. With several storages, a storage that stops answering now takes up to 60 s (×2 with the rock-req retry) before failover: call `setTimeout()` to lower it.
- **S3 and Swift**: with `rock-req` 5.3.0, a network error (timeout, `ECONNRESET`...) is retried once (`maxRetry: 1`) before failing over to a fallback storage, as for the HTTP codes. So a failover can take up to ~2× the timeout.
- **S3 and Swift**: the errors `All S3 storages are not available` and `Object Storages are not available` now say why they happened: `err.storageStatusCode` (e.g. `503`), `err.code` (e.g. `ETIMEDOUT`) and `err.cause`. The message is unchanged.
  Not `err.statusCode`: Express and other HTTP frameworks reply with `err.statusCode`/`err.status`, so a storage `401` would log out your user.
- **S3 and Swift**: with a single storage, a failed request logs one clear error, such as `S3 Storage | GET /bucket/file.pdf | Storage not available, no fallback storage | Status code: 503`, instead of a misleading "switch from 0 to 1" followed by "All storages are not available". Logs with several storages are unchanged.
- **S3 and Swift**: a custom `setLogFunction` receives a level on every log line (two `info` lines passed `undefined`).
- **S3 and Swift**: `setLogFunction` receives a third argument `fields` for structured logs (`event`, `storage`, `region`, `status`...): see the events in the USAGE docs. Loggers with two arguments and the default console output are unchanged. A few Swift messages were fixed ("connection failed", method and path on request errors).
- **Swift**: every method accepts `requestOptions`, like S3. On both, they cannot override the URL, the method or the auth headers.
- **Swift**: on a `401`, the client reconnects and retries once per request; a second `401` is returned instead of looping.
- **Swift**: when the token expires, the parallel requests share a single reconnection: 15 requests receiving a `401` made 15 authentications at once (Keystone rate limit). If it fails, they all get the same error.
- **Swift**: `connection()` is now optional; the first request connects automatically. Existing code calling `connection()` keeps working.
- **Swift**: a malformed auth response or an invalid `authUrl` now fails over to the next storage, then returns `Object Storages are not available`, instead of throwing. An error thrown while connecting is now passed to the `connection()` callback.
- **S3**: a reused `options` object no longer keeps the fallback state of the previous request, which could return an old error without sending any request. On S3 and Swift, `downloadFile` no longer modifies the `options` you pass.
- **Security, S3 and Swift**: the XML parser is hardened against prototype pollution and against slow parsing of malformed bodies (ReDoS). Upgrading is recommended.
- **S3 and Swift**: an invalid header value or filename is now returned to the callback as an error, instead of being thrown.
- **Swift**: `deleteFiles` with a container alias replaced the alias inside object names too: `invoices/invoices-2024.pdf` became `invoices-prod/invoices-prod-2024.pdf`. Only the container is replaced now.
- **Swift**: the authentication request no longer follows redirects, as its body contains the password. A `3xx` is an authentication failure and the next storage is tried: set `authUrl` to the final Keystone URL, with `https://`.
- **Swift**: every storage passed to the constructor or to `setStorages()` is checked: a `null` storage, or one without `username`, `password` or `authUrl`, throws `Swift Storage credentials not correct or missing`. An `authUrl` without protocol fails over to the next storage.
- **Swift**: after `Object Storages are not available`, the next request authenticates again on the main storage. It was sent to the endpoint of the last storage, with the container alias of the main one.
- **Swift**: when a request fails and the fallback authentication fails too, the fallback is no longer authenticated a second time (failover took twice as long).
- **Swift**: the client now returns to the main storage when it is available again, as the docs said (it stayed on the fallback until it failed or `setStorages()` was called). While a fallback is active, a request starts at most one background check every 60 s: an authentication on the main storage, then a `HEAD` of its account (on OVH all regions share one Keystone, so a token alone does not prove the region is up). On success the next requests use the main storage (`storage_main_restored`); on failure the delay doubles, up to 10 min (`storage_main_unavailable`, level `info`). No timer: nothing runs without requests, and nothing runs while on the main storage.
- **Swift**: parallel requests failing over (network error, `5xx`) share a single authentication on the fallback storage: 50 requests made 50 authentications at once (Keystone rate limit), now 1. A request sent meanwhile waits for it, instead of using the token and endpoint of the failing storage.
- **Swift**: a fallback authentication finishing after `Object Storages are not available` could set the endpoint of the fallback while the main storage was active: the next requests went to the fallback with the container alias of the main storage.
- **Swift**: when the callback of a request throws, the other requests waiting for the same authentication still get their answer (they waited forever).
- **S3**: after a failover, `setFileMetadata` sent the bucket of the main storage in `x-amz-copy-source`, and the fallback replied `404 NoSuchBucket`. The caller's `headers` are no longer modified.
- **S3**: the main storage is restored when its health check answers anything but a network error, a `5xx` or a `401`, the same rule as the failover. Credentials scoped to one bucket get a `403` on `ListBuckets`, and the client stayed on the fallback forever.
- **S3 and Swift**: with a stream `output`, the error body of a storage that fails over (`5xx`, `401`) is no longer written into your stream, and `output()` is called once, for the response you get.
- **S3 and Swift**: when every storage is down, parallel requests no longer storm them. Each failed attempt now counts, so a request tries each storage once, then returns `All S3 storages are not available` or `Object Storages are not available`. Measured with 50 parallel requests: S3 sent 3,719 HTTP requests instead of 150, and with unresponsive storages the slowest callback took 77 s instead of 2 s. Swift sent 2,299 authentications, now at most one per storage. On S3, a request retries the main storage at most once more if the health check restored it in the meantime: with a main storage that answers the health check but fails the requests, 200 parallel requests made up to 63 attempts each, now 3 at most.
- **S3**: `deleteFiles` parsed an empty `<Deleted></Deleted>` (sent by MinIO in a mixed result) by putting the next `<Error>` inside the deleted item. The empty element is now ignored.
- **Docs**: `keepAliveTimeout` and `keepAliveDuration` cannot be changed with `setRockReqDefaults()` or `global.rockReqConf`: pass your own `agent` instead.
- **S3**: `setConfig(null)` or an invalid `url` throws `S3 Storage credentials not correct or missing` instead of a raw `TypeError`.
- **S3 and Swift**: query parameter names are URL-encoded, like their values.
- Requires `rock-req` 5.3.1: on a redirect to another host, or from `https` to `http`, it drops the `X-Auth-Token` and `Authorization` headers.

### v3.6.0
- **S3**: `listFiles` returns an error when the status is `200` but the body does not contain a complete `<ListBucketResult>` (empty body, body cut before the end, HTML page of a proxy). The body was returned as is, without any file and without `istruncated`: a caller paginating the bucket read it as the last page, and a synchronisation tool could delete the missing files from another storage.
- **S3**: object keys, bucket names, prefixes and pagination tokens are returned exactly as written in the XML. They were converted like any value: the key `0001` was returned as the number `1`, `1e3` as `1000`, `true` as a boolean, `12345678901234567890` as `12345678901234567000`, ` 42 ` lost its spaces and `"name"` its double quotes. Such a file could not be downloaded or deleted with the returned key, and paginating with `start-after` set to the last returned key skipped or repeated files. Applied to `listFiles`, `listBuckets`, `deleteFiles` and the XML error responses.
- **S3**: an `ETag` is always returned as a string. An ETag made only of digits, or such as `123e45…`, was converted to a number.
- `xmlToJson`: new option `forceString`, a list of element names whose values are always strings, never converted to numbers or booleans: `xmlToJson(xml, { forceString: ['key'] })`.
- **S3**: the XML entities are decoded in all the parsed responses. A key was returned as written in the XML: `R&D.pdf` as `R&amp;D.pdf`, `l'offre.pdf` as `l&#39;offre.pdf` (OVH, MinIO), and the AWS ETags as `&quot;fde6…&quot;`. Such a file could not be downloaded with the returned key, and its ETag never matched the MD5 of the content. The predefined entities (`&amp;` `&lt;` `&gt;` `&quot;` `&apos;`) and the character references (`&#39;`, `&#x9;`) are decoded in a single pass, unknown entities are kept as written.
- **S3**: `deleteFiles` escapes the XML special characters of the keys (`&` `<` `>` `"` `'`). A key containing a `&` or a `<` made the whole request fail with `MalformedXML`, the 1000 files of the request were not deleted. And deleting the key `R&amp;D.pdf`, returned by the listing, deleted the file `R&D.pdf`.
- **S3**: `listBuckets`, `deleteFiles` and `setFileMetadata` return an error when the status is `200` but the body does not contain a complete `<Buckets>`, `<DeleteResult>` or `<CopyObjectResult>`, as `listFiles` already does. AWS can return a `200 OK` carrying an `<Error>` instead of the result (`CopyObject` failing during the copy, `DeleteObjects` with a malformed request): it was returned as a success with an empty body, a copy reported as done was not. For these four functions, such an `<Error>` is now parsed like a `4xx` error: the caller reads `resp.body.error.code` (`InternalError`, `SlowDown`) and retries. A self-closing `<Buckets/>` (Garage, LocalStack) is an empty list.
- **S3**: the XML error responses (`4xx`, `5xx`) are parsed as JSON when the content type carries parameters, such as `application/xml; charset=utf-8`. Only the exact `application/xml` was parsed, the body of the other responses was returned as a Buffer without `error`.
- **S3**: `deleteFiles` writes a carriage return as `&#13;` and a newline as `&#10;` in the keys, as required by AWS. The XML parser of the server normalizes a raw `\r` into `\n`: the file `a\rb.pdf` was not deleted, and the response reported `a\nb.pdf` as deleted.

### v3.5.0
- **Node 20 is now the minimum version** (`engines: { node: ">=20" }`). Tested on Node 20, 22, 24 and 26.
- **Swift**: object names are now URL encoded, as required by the [Swift API](https://docs.openstack.org/swift/latest/api/object_api_v1_overview.html). A name containing a `#` or a `?` used to be truncated and another object than the requested one was reached, `deleteFile('container', 'report#1.pdf')` deleted `report`. The `/` separators are untouched, Swift pseudo-folders keep working.
- **S3**: `deleteFiles` returns an error on the callback when more than 1000 files are provided, instead of letting S3 reply a `MalformedXML` error.
- **S3**: exposed the `request` method, it was already documented in `USAGE-S3.md` but missing from the returned client.
- Note: `uploadFile` accepts a Buffer, a file path, or a function returning a ReadStream on Swift. On S3, streams are not supported (AWS4 cannot sign a stream), the file is read in memory before being sent.
- Documentation: fixed the "Bucket Alias" example of `USAGE-S3.md`, the credentials were passed as two arguments instead of an Array so the second storage was silently ignored. Documented the Swift `interface` option, and corrected the `request` examples of both usage guides.
- Fixed `xmlToJson`: a decimal value was truncated to its integer part, `<Size>1.75</Size>` returned `1` instead of `1.75`. Values are now converted with `Number` instead of `parseInt`, which also fixes the exponent notation (`1e3` returned `1`) and the leading dot (`.5` returned `NaN`). Integers, hexadecimal strings and quoted ETags are unchanged.
- Fixed crashes: the SDK threw synchronously instead of calling back with an error, so the exception could not be caught from the callback. Now returning an error on the callback when:
  - `deleteFiles` receives something else than an Array of files (S3 + Swift)
  - a request is made with a `requestStorageIndex` pointing to a storage that does not exist (S3)
  - `null` is explicitly passed as the `options` argument of any method (S3 + Swift)
  - a Swift bulk-delete body is not a String, or the region is logged while all the storages are exhausted
- Performance: removed two useless Buffer allocations (`getMD5` and `getMetadataTotalBytes`) and hoisted values computed several times per request.
- Updated dev dependencies: `nock` to `14.0.17`, `eslint` to `10.8.1`, `mocha` to `11.8.0`
- Fixed the test suite for `nock@14`, which now streams exactly the `content-length` declared by a mock, and no longer returns a body for `HEAD` responses
- Added tests for `xmlToJson`: indented XML, tag attributes, boolean case, empty values, negative numbers, `forceArray` variants and numeric coercion

### v3.4.1
- Updated dev dependencies: `mocha` to `11.7.5`, `eslint` to `10.0.3`
- Updated dependency: `rock-req` to `5.2.1`

### v3.4.0
- Added support for Localhost Minio as S3 storage: It is possible to define the URL "http://localhost:80" when entering S3 credentials. While trailing slashes at the end of the URL are permitted, their use is not recommended.
- Updade dev dependencies

### v3.3.0
- Added for SWIFT storage only: When calling the 'connection' function, you can now specify the interface (admin/public/internal) in the Swift configuration. This ensures that the SDK picks the correct endpoints from the Swift server, preventing inconsistencies. Example of auth configuration for Swift with interface: 
```js
const swift = storageSDK([{
  username  : 'user',
  password  : 'password',
  authUrl   : 'url',
  region    : 'region',
  interface : 'admin' // or public, or internal
}]);
```
- Updated dependency "aws4" version from "1.12.0" to "1.13.2"
- Updated dev dependency "mocha/eslint/nock"
- Lint code with new eslint configuration

### v3.2.0
- S3 and Swift `deleteFiles` improved: For the second argument, you must provide a list of files, it can be:
  - A list of String, each string is the filename: ["file1.png", "file2.docx"]
  - Or a list of objects with `key` as attribute for the filename: [{"key": "file1.png"}, {"key": "file2.docx"}]
  - Or a list of objects with `name` as attribute for the filename: [{"name": "file1.png"}, {"name": "file2.docx"}]
  - **NEW** Or a list of objects with a custom key for filenames, you must define `fileNameKey` as option (third argument). Usage example with a custom key name:
```js
const files = [
  { filename: 'invoice-1.pdf'},
  { filename: 'contract-2021.docx'},
]

storage.deleteFiles('bucket-name', files, { fileNameKey: "filename" }, (err, resp) => {
  
})
```

### v3.1.0
- S3 methods patched: A request can only request one time each region.

### v3.0.1
- Fixed SWIFT authentication: the `region` value is case insensitive, it can be `GRA` or `gra`.

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
  - `setRockReqDefaults` to configure the HTTP client
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