# Tiny node client for distributed Openstack Swift Object Storage

## Highlight

* 🚀 Vanilla JS + Only 2 dependencies [simple-get](https://github.com/feross/simple-get) for HTTP requests and [aws4](https://github.com/mhart/aws4) for signing S3 requests.
* 🌎 Provide one or a list of storages credentials: the SDK will switch storage if something goes wrong (Server/DNS not responding, timeout, error 500, too many redirection, authentication error, and more...). As soon as the main storage is available, the SDK returns to the main storage
* ✨ If a request fails due to an authentication token expiration, the SDK fetches a new authentication token and retry the initial request with it (Concerns only Swift Storage).
* 🚩 When initialising the Tiny SDK client, provide only a list of S3 or a list of Swift credentials, switching from one storage system to another is not supported.
* ✅ Production battle-tested against hundreds of GBs of file uploads & downloads

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
$ npm install --save tiny-storage-client
// or
$ yarn add tiny-storage-client
```
## API Usage

### Connection

Initialise the SDK with one or multiple storage, if something goes wrong, the next region will take over automatically. If any storage is available, an error message is returned `Error: Object Storages are not available`.

```js
const storageClient = require('tiny-storage-client');

let storage = storageClient([{
  authUrl    : 'https://auth.cloud.ovh.net/v3', // REQUIRED
  username   : 'username-1',                    // REQUIRED
  password   : 'password-1',                    // REQUIRED
  region     : 'region-1',                      // REQUIRED
  tenantName : 'tenantName-1'                   // OPTIONAL
},
{
  authUrl    : 'https://auth.cloud.ovh.net/v3',
  username   : 'username-2',
  password   : 'password-2',
  region     : 'region-2'
}]);

storage.connection((err) => {
  if (err) {
    // Invalid credentials
  }
  // Success, connected!
})
```
### Upload a file

```js
const path = require(path);

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

/** SOLUTION 4: the function accepts a optionnal fourth argument `option` including query parameters and headers. List of query parameters and headers: https://docs.openstack.org/api-ref/object-store/?expanded=create-or-replace-object-detail#create-or-replace-object **/
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
   * Request reponse:
   * - resp.headers
   * - resp.statusCode
   *
   * When the callback is called, the stream is closed and the file created,
   * you don't have to pipe yourself!
   */
})
```

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
storage.setFileMetadata('templates', 'filename.jpg', { headers: { 'Content-Type': 'image/jpeg', 'X-Object-Meta-LocationOrigin': 'Paris/France', 'X-Delete-At': 1440619048 }} (err, resp) => {
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
 * - a list of object with `keys` as attribute name [{ "keys": "object1.pdf"}, { "keys": "object2.docx" }, { "keys": "object3.pptx" }]
 * - Or a list of objects with `name` as attribute for the filename: [{ "name" : "file1.png" }, { "name": "file2.docx" }]
 * - Or a list of objects with a custom Key for filenames, you must define `fileNameKey` as option (third argument). 
*/
const filesToDelete = [ { name: '1685696359848.jpg' }, { name: 'template-column.docx' }, { name: 'test file |1234.odt' } ]

swift.deleteFiles('', filesToDelete, function(err, resp) {
  if (err) {
    // handle error
  }
 /**
   * Request reponse:
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
   * Request reponse:
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
   * Request reponse:
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
request(method, path, { headers, queries, body }, (err, body, headers) => {}).
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

request(method, path, { headers, queries, body, output: createOutputStream }, (err) => {})`.
```

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

By default, logs are printed with to `console.log`. You can use the `setLogFunction` to override the default log function. Create a function with two arguments: `message` as a string, `level` as a string and the value can be: `info`/`warning`/`error`. Example to use:
```js
storage.setLogFunction((message, level) => {
  console.log(`${level} : ${message}`);
})
```

### Timeout

The default request timeout is 5 seconds, change it by calling `setTimeout`:
```js
storage.setTimeout(30000); // 30 seconds
```

### Container Alias

To simplify requests to custom named containers into different SWIFT providers, it is possible to create aliases by providing a `buckets` object on credentials. When calling a function, define the bucket alias as first argument, it will request the current active storage automatically.

```js
const storageClient = require('')

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
   * Request reponse:
   * - resp.body => downloaded file as Buffer
   * - resp.headers
   * - resp.statusCode
   */
})
```