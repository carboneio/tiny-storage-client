# Tiny node client for distributed Openstack Swift Object Storage

## Highlight

* 🚀 Vanilla JS + Only 1 dependency [rock-req](https://github.com/carboneio/rock-req) for HTTP requests.
* 🌎 Provide one or a list of storages credentials: the SDK will switch storage if something goes wrong (Server/DNS not responding, timeout, repeated 5xx errors, authentication error). A throttled request (`498`, `429`) is returned, never sent to another storage, optionally after backoff retries on the same storage (`maxThrottleRetry`). As soon as the main storage is available again, the SDK returns to it: while a fallback is active, a request starts at most one background check every 60 s (an authentication on the main storage, then a `HEAD` of its account). The delay doubles on each failure, up to 10 min. Requests are never delayed by this check, and parallel failovers share a single authentication on the fallback storage
* ✨ If a request fails due to an authentication token expiration, the SDK fetches a new authentication token and retries the initial request with it.
* 🔒 Object names and request parameters are automatically encoded, as required by the [Swift API](https://docs.openstack.org/swift/latest/api/object_api_v1_overview.html). The `/` separators are kept as-is, so pseudo-folders such as `invoices/2024/client.pdf` keep working.
* 🚩 When initialising the Tiny SDK client, provide only a list of S3 or a list of Swift credentials, switching from one storage system to another is not supported.
* ✅ Production battle-tested against hundreds of TBs of file uploads & downloads

## Install

### 1. Prior installing

you need a minimum of one object storage container, or you can synchronize Object Storages containers in order to access same objects if a fallback occur:
- Sync 2 containers: `1 <=> 2`. They would both need to share the same secret synchronization key.
- You can also set up a chain of synced containers if you want more than two. You would point `1 -> 2`, then `2 -> 3`, and finally `3 -> 1` for three containers. They would all need to share the same secret synchronization key.
Learn more [on the OpenStack documentation](https://docs.openstack.org/swift/latest/overview_container_sync.html) or [on the OVHCloud documentation](https://docs.ovh.com/us/en/storage/pcs/sync-container/).

<details>
  <summary>Quick tutorial to synchronise 1 container into another with OVHCloud Object Storage (1 -> 2 one way sync)</summary>

  1. Install the `swift-pythonclient`, an easy way to access Storages is with the Swift command line client, run on your terminal:
  ```
  $ pip install python-swiftclient
  ```
  2. Download the OpenStack RC file on the OVH account to change environment variables. Tab `Public Cloud` > `Users & Roles` > Pick the user and “Download OpenStack’s RC file”
  3. Open a terminal, load the contents of the file into the current environment:
  ```bash
  $ source openrc.sh
  ```
  4. In order for the containers to identify themselves, a key must be created and then configured on each container:
  ```bash
  $ sharedKey=$(openssl rand -base64 32)
  ```
  5. See which region you are connected to:
  ```bash
  env | grep OS_REGION
  ```
  6. Retrieve the Account ID `AUTH_xxxxxxx` of the destination container in order to configure the source container:
  ```bash
  destContainer=$(swift --debug stat containerBHS 2>&1 | grep 'curl -i.*storage' | awk '{ print $4 }') && echo $destContainer
  ```
  7. Change to the source region:
  ```bash
  OS_REGION_NAME=RegionSource
  ```
  8. Upload the key and the destination sync url to the source container:
  ```bash
  $ swift post -t ‘//OVH_PUBLIC_CLOUD/RegionDestination/AUTH_xxxxxxxxx/containerNameDestination’ -k "$sharedKey" containerNameSource
  ```
  9. You can check that this has been configured by using the following command:
  ```bash
  $ swift stat containerName
  ```
  10. You can check if the synchronization worked by listing the files in each of the containers:
  ```bash
  $ OS_REGION_NAME=RegionSource && swift list containerName
  $ OS_REGION_NAME=RegionDestination && swift list containerName
  ```
</details>

### 2. Install the package with your package manager:

```bash
$ npm install tiny-storage-client
// or
$ yarn add tiny-storage-client
```

Requires **Node.js 20 or higher**.

## API Usage

### Setup

Initialise the SDK with one or multiple storage, if something goes wrong, the next region will take over automatically. If no storage is available, an error message is returned `Error: Object Storages are not available`. The error carries the cause of the last failure (request or authentication):
- `err.storageStatusCode`: the last HTTP status code of the storage (5xx, or the status of the failed authentication), if the storage replied
- `err.code`: the network error code (`ETIMEDOUT`, `ECONNRESET`...), if any
- `err.cause`: the original `Error`, if any (network error, `Storage catalog not found`, `Storage endpoint not found, invalid region`, `X-Subject-Token header missing`)

`err.statusCode` and `err.status` are never set: HTTP frameworks (Express...) reply with them, a storage `401` must not become the `401` of your API.

```js
const storageClient = require('tiny-storage-client');

let storage = storageClient([{
  authUrl    : 'https://auth.cloud.ovh.net/v3', // REQUIRED
  username   : 'username-1',                    // REQUIRED
  password   : 'password-1',                    // REQUIRED
  region     : 'region-1',                      // REQUIRED
  tenantName : 'tenantName-1',                  // OPTIONAL
  interface  : 'public'                         // OPTIONAL: 'public', 'internal' or 'admin'
},
{
  authUrl    : 'https://auth.cloud.ovh.net/v3',
  username   : 'username-2',
  password   : 'password-2',
  region     : 'region-2'
}]);

/** The first request authenticates automatically, then sends the request */
storage.downloadFile('container', 'filename.pdf', (err, resp) => {
  if (err) {
    // e.g. invalid credentials: Error 'Object Storages are not available' with its cause
  }
})
```

Authentication (auth token and endpoint of the region) is handled by the SDK, like S3: the first request
authenticates, with a single authentication shared by the requests running in parallel. The token is renewed
automatically when it expires.

The optional `interface` selects which endpoint of the Swift catalog is used for the region. When it is
not set, every interface of the region matches and the first one returned by the server is used, which
may not be the one you expect if the catalog exposes several.

### Throttling, retries and failover

| Answer of the storage | What the SDK does |
|---|---|
| `498` or `429` (rate limit) | Throttled: after the quick retry of rock-req (`429`), retried on the **same storage** with a full-jitter exponential backoff (`random() × min(500 ms × 2^attempt, 20 s)`, at least the `Retry-After` header, up to 5 s more than the backoff), `maxThrottleRetry` times (option of each storage, an integer >= 0, default `0`: no backoff retry, as before 4.1; `setStorages` throws on any other value). Then the last response is returned as `{ statusCode, headers, body }`, as in 4.0: never sent to another storage, never counted as a failure. |
| `5xx` (but `501`) | After the retry of rock-req (`502`, `503`, `504`...), sent to the next storage (authenticated apart, its token is kept for the next ones). The active storage is switched for all requests after **3 consecutive failures**; any other answer of the active storage resets the count. |
| Network error or timeout (already retried once by rock-req), authentication failure | The active storage is switched at once. |
| `401` | A new token, shared by the parallel requests, then the request is sent again once. |
| `501 Not Implemented`, `2xx`, `3xx`, other `4xx` | Returned to the caller. Redirects are never followed: the token is never sent to another host or port. |

With a stream `output`, only a `2xx` response is written into your stream. Any other response is returned as `{ statusCode, headers, body }` (JSON parsed if `application/json`). Your `output()` is called at most once per request, for the first `2xx` response: once it is called, a network error (body cut, reset after the headers) or an error of your stream itself (disk full, destination destroyed) is returned with no failover (rock-req may still send its single retry: its response is discarded, never written into your stream). A network error before any response (a stale keep-alive socket) is still retried once on the same storage. A stream already destroyed returned by `output()` is an error.

### Security notes

- `uploadFile` reads any local path it is given: never pass a path built from user input.
- Object names are encoded, but `..` segments are sent as is (`a/../b`): validating names built from user input is the caller's responsibility.
- The `authUrl` must be the final Keystone URL, with its protocol (`https://`): the authentication request carries the password, so it never follows a redirect (a `3xx` is an authentication failure, the next storage is tried).
- With a stream `output`, `resp` is the raw HTTP response: `console.log(resp)` or `util.inspect(resp)` prints the request headers, including the `X-Auth-Token`. Log `resp.statusCode` and `resp.headers` only.

### HTTP client options

`setRockReqDefaults()` (and `global.rockReqConf`) change the defaults of [rock-req](https://github.com/carboneio/rock-req) for every request, its retries included (`maxRetry`, `retryOnCode`, `beforeRequest`), with two exceptions. `followRedirects` is always `false`. And `keepAliveTimeout` and `keepAliveDuration` are silently ignored: rock-req reads them once, when it creates its HTTP agents in `rock.extend()`. To change them, pass your own agent: `setRockReqDefaults({ agent: new https.Agent({ keepAlive: true, keepAliveMsecs: 3000 }) })`.

The SDK uses its own copy of rock-req if the version of your application differs (rock-req `=5.3.2`): your `rock.defaults` then do not apply to the storage requests. Depend on the same rock-req version as the SDK.

### Upload a file

```js
const path = require('path');

/** SOLUTION 1: The file content can be passed by giving the file absolute path **/
storage.uploadFile('container', 'filename.jpg', path.join(__dirname, './assets/file.txt'), (err, resp) => {
  if (err) {
    // handle error
  }
  /**
   * Response details:
   * - resp.headers
   * - resp.statusCode
   * - resp.body
   **/
});

/** SOLUTION 2: A Buffer can be passed for the file content **/
storage.uploadFile('container', 'filename.jpg', Buffer.from("File content"), (err, resp) => {
  if (err) {
    // handle error
  }
  /**
   * Response details:
   * - resp.headers
   * - resp.statusCode
   * - resp.body
   **/
});

/** SOLUTION 3: Pass a function returning a ReadStream **/
storage.uploadFile('container', 'filename.jpg', () => fs.createReadStream(path.join(__dirname, './assets/file.txt')), (err, resp) => {
  if (err) {
    // handle error
  }
    /** 
   * Response details:
   * - resp.headers
   * - resp.statusCode
   * - resp.body
   **/
});

/** SOLUTION 4: the function accepts an optional fourth argument `option` including query parameters and headers. List of query parameters and headers: https://docs.openstack.org/api-ref/object-store/?expanded=create-or-replace-object-detail#create-or-replace-object **/
storage.uploadFile('container', 'filename.jpg', Buffer.from("File content"), { queries: { temp_url_expires: '1440619048' }, headers: { 'X-Object-Meta-LocationOrigin': 'Paris/France' }}, (err, resp) => {
  if (err) {
    // handle error
  }
  /**
   * Response details:
   * - resp.headers
   * - resp.statusCode
   * - resp.body
   **/
});
```

### Download a file

```js
/** Solution 1: Download the file as Buffer **/
storage.downloadFile('containerName', 'filename.jpg', (err, resp) => {
  if (err) {
    // handle error
  }
  /**
   * Response details:
   * - resp.headers
   * - resp.statusCode
   * - resp.body => the content of the file as a Buffer
   **/
});

/** Solution 2: Download the file as Stream,  set the option `output` with a function returning the output Stream */
function createOutputStream(opts, res) {
  const writer = fs.createWriteStream('2023-invoice.pdf')
  writer.on('error', (e) => { /* clean up your stuff */ })
  return writer
}

storage.downloadFile('containerName', '2023-invoice.pdf', { output: createOutputStream }, (err, resp) => {
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

### Delete a file

```js
storage.deleteFile('templates', 'filename.jpg', (err, resp) => {
  if (err) {
    // handle error
  }
  /**
   * Response details:
   * - resp.headers
   * - resp.statusCode
   * - resp.body
   **/
});
```

### List objects from a container

```js
/**
 * SOLUTION 1
 **/
storage.listFiles('templates', function (err, resp) {
  if (err) {
    // handle error
  }
  /**
   * Response details:
   * - resp.headers
   * - resp.statusCode
   * - resp.body => List of objects as an Array, example:
   * [
   *    {
   *      "bytes": 47560,
   *      "last_modified": "2020-12-03T10:14:40.049830",
   *      "hash": "bd3593e317e71fd9992405f29475afd4",
   *      "name": "invoice.pdf",
   *      "content_type": "application/pdf"
   *    }
   * ]
   **/
});

/**
 * SOLUTION 2
 * Possible to pass queries and overwrite request headers, list of options: https://docs.openstack.org/api-ref/object-store/? expanded=show-container-details-and-list-objects-detail#show-container-details-and-list-objects
 **/
storage.listFiles('templates', { queries: { prefix: 'prefixName' }, headers: { Accept: 'application/xml' } }, function (err, resp) {
  if (err) {
    // handle error
  }
  /**
   * Response details:
   * - resp.headers
   * - resp.statusCode
   * - resp.body
   **/
});
```

### Get file metadata

Shows object metadata. Checkout the list of [headers](https://docs.openstack.org/api-ref/object-store/?expanded=create-or-update-object-metadata-detail,show-object-metadata-detail#show-object-metadata).

```js
storage.getFileMetadata('templates', 'filename.jpg', (err, resp) => {
  if (err) {
    // handle error
  }
  /**
   * Response details:
   * - resp.headers
   * - resp.statusCode
   * - resp.body
   **/

  /**
   * Returned headers `resp.headers`: {
   *  Content-Length: 14
   *  Accept-Ranges: bytes
   *  Last-Modified: Thu, 16 Jan 2014 21:12:31 GMT
   *  Etag: 451e372e48e0f6b1114fa0724aa79fa1
   *  X-Timestamp: 1389906751.73463
   *  X-Object-Meta-Book: GoodbyeColumbus
   *  Content-Type: application/octet-stream
   *  X-Trans-Id: tx37ea34dcd1ed48ca9bc7d-0052d84b6f
   *  X-Openstack-Request-Id: tx37ea34dcd1ed48ca9bc7d-0052d84b6f
   *  Date: Thu, 16 Jan 2014 21:13:19 GMT
   *  X-Object-Meta-Custom-Metadata-1: Value
   *  X-Object-Meta-Custom-Metadata-2: Value
   * }
   * 
   * Related documentation: https://docs.openstack.org/api-ref/object-store/?expanded=show-object-metadata-detail#show-object-metadata
   */
});
```

### Set file metadata

To create or update custom metadata, use the "X-Object-Meta-name" header, where `name` is the name of the metadata item. The function overwrite all custom metadata applied on the file.
Checkout the list of [headers availables](https://docs.openstack.org/api-ref/object-store/?expanded=create-or-replace-object-detail,create-or-update-object-metadata-detail#create-or-update-object-metadata).

```js
storage.setFileMetadata('templates', 'filename.jpg', { headers: { 'Content-Type': 'image/jpeg', 'X-Object-Meta-LocationOrigin': 'Paris/France', 'X-Delete-At': 1440619048 }}, (err, resp) => {
  if (err) {
    // handle error
  }
  /**
   * Response details:
   * - resp.headers
   * - resp.statusCode
   * - resp.body
   **/
});
```

### Delete files

Bulk delete files (Maximum 10 000 objects per requests).

```js
/**
 * Provide a list of filenames as second argument, it can be:
 * - a list of string ["object1.pdf", "object2.docx", "object3.pptx"]
 * - a list of objects with `key` as attribute name [{ "key": "object1.pdf"}, { "key": "object2.docx" }, { "key": "object3.pptx" }]
 * - Or a list of objects with `name` as attribute for the filename: [{ "name" : "file1.png" }, { "name": "file2.docx" }]
 * - Or a list of objects with a custom Key for filenames, you must define `fileNameKey` as option (third argument). 
*/
const filesToDelete = [ { name: '1685696359848.jpg' }, { name: 'template-column.docx' }, { name: 'test file |1234.odt' } ]

swift.deleteFiles('', filesToDelete, function(err, resp) {
  if (err) {
    // handle error
  }
 /**
   * Request response:
   * - resp.headers
   * - resp.statusCode
   * - resp.body => body as Object, example: {"Response Status":"200 OK","Response Body":"","Number Deleted":3,"Number Not Found":0,"Errors":[]}
   **/
})
```

### Head Bucket

Shows container metadata, including the number of objects and the total bytes of all objects stored in the container.

```js
storage.headBucket('templates', (err, resp) => {
  if (err) {
    // handle error
  }
   /**
   * Request response:
   * - resp.headers
   * - resp.statusCode
   * - resp.body
   **/
});
```

### List Buckets

Shows details for an account and lists containers, sorted by name, in the account.

```js
storage.listBuckets((err, resp) => {
  if (err) {
    // handle error
  }
  /**
   * Request response:
   * - resp.headers
   * - resp.statusCode
   * - resp.body > The response body returns a list of containers as an Array, example: 
   * [
   *     {
   *      name: 'container1',
   *      count: 55,
   *      bytes: 106522,
   *      last_modified: '2022-01-12T14:02:33.672010'
   *    }
   * ]
   **/
})
```


### Custom request

The `request` function can be used to request the object storage with custom options.
Prototype to get the data as Buffer:
```js
storage.request(method, path, { headers, queries, body }, (err, resp) => {})
```
Prototype to get the data as Stream
Set the option `output` with a function returning the output Stream.
When the callback is called, the stream is closed and the file created.
```js
function createOutputStream(opts, res) {
  const writer = fs.createWriteStream('file.pdf')
  writer.on('error', (e) => { /* clean up your stuff */ })
  return writer
}

storage.request(method, path, { headers, queries, body, output: createOutputStream }, (err) => {})
```

Every method accepts the option `requestOptions`, passed to [rock-req](https://github.com/carboneio/rock-req) (e.g. `{ requestOptions: { timeout: 10000, decompress: true } }`). It cannot override the URL, the method or the `X-Auth-Token`; `requestOptions.headers` are merged with the headers.

On a `401`, the client reconnects and retries the request once; a second `401` is returned in `resp.statusCode`.

The base URL requests by default the account, passing an empty string will request the account details. For container requests, pass the container name, such as: `/{container}`. For file requests, pass the container and the file, such as: `/{container}/{filename}`. Object Storage Swift API specification: https://docs.openstack.org/api-ref/object-store/

The `request` function automatically reconnects to the Object Storage or switch storage if something goes wrong.

Example of custom request, bulk delete file from a `customerDocuments` container:
```js
  const _headers = {
    'Content-Type': 'text/plain',
    'Accept'      : 'application/json'
  }

 storage.request('POST', '/customerDocuments?bulk-delete', { headers: _headers, body: 'file1\nfile2\n' }, (err, resp) => {
  /**
   * Response details:
   * - resp.headers
   * - resp.statusCode
   * - resp.body => body as Javascript Object, example: {"Response Status":"200 OK","Response Body":"","Number Deleted":3,"Number Not Found":0,"Errors":[]}
   **/
});
```



### Logs

By default, logs are printed with `console.log`. Use `setLogFunction` to override the default log function: `(message, level, fields) => {}`
- `message`: string
- `level`: `info`, `warning` or `error`
- `fields`: flat object for structured logs (JSON loggers, metrics). Always `event` and `storage` (`'swift'`), and when relevant: `index`, `region`, `method`, `path` (without query string), `status` (HTTP status of the storage), `code` (network error code, e.g. `ETIMEDOUT`), `from`, `to` (storage indexes). Never tokens, credentials or signed URLs.

A function with two arguments `(message, level)` keeps working. The default console output is unchanged.

```js
storage.setLogFunction((message, level, fields) => {
  logger[level === 'warning' ? 'warn' : level]({ ...fields }, message);
})
```

| `event` | Level | When |
|---|---|---|
| `storage_connecting` | info | Authentication on a storage |
| `storage_connected` | info | Authenticated, endpoint of the region resolved |
| `storage_connection_failed` | warning | Authentication failed on a storage, the next one is tried |
| `storage_reconnect` | info | The token expired (`401`): a new authentication, shared by the parallel requests |
| `storage_throttled` | info | The storage throttled the request (`498`, `429`): retried on the same storage after `delay` ms |
| `storage_request_failed` | error | A request failed (network error, `5xx`): the next storage is used |
| `storage_fallback` | warning | The active storage is switched for all requests (network error, authentication failure, 3 consecutive `5xx`) |
| `storage_main_unavailable` | info | The background check of the main storage failed, the fallback is kept: next check in 2× the delay (60 s to 10 min) |
| `storage_main_restored` | info | The main storage answers again, the next requests use it |
| `storage_unavailable` | error | No storage available, the request returns `Object Storages are not available` |

### Timeout

The default request timeout is 60 seconds of inactivity (no byte received or sent, not the total duration, like the AWS SDK). With several storages, a storage that stops answering takes up to 2 × the timeout before the next storage is used (one retry by rock-req): lower it with `setTimeout` for a faster failover:
```js
storage.setTimeout(30000); // 30 seconds
```

### Container Alias

To simplify requests to custom named containers into different SWIFT providers, it is possible to create aliases by providing a `buckets` object on credentials. When calling a function, define the bucket alias as first argument, it will request the current active storage automatically.

```js
const storageClient = require('tiny-storage-client')

const swift = storageClient([
  /** SWIFT Storage 1 **/
  {
    username                     : '',
    password                     : '',
    authUrl                      : '',
    region                       : '',
    buckets                      : {
      invoices: "invoices-ovh-gra",
      www     : "www-ovh-gra"
    }
  },
  /** SWIFT Storage 2 **/
  {
    username                     : '',
    password                     : '',
    authUrl                      : '',
    region                       : '',
    buckets                      : {
      invoices: "invoices-aws-paris",
      www     : "www-aws-paris"
    }
  }
])

/**
 * On the following example, "downloadFile" will request the main storage "invoices-ovh-gra"
 * or the backup "invoices-aws-paris" if something goes wrong.
 */
swift.downloadFile('invoices', '2023-invoice.pdf', (err, resp) => {
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