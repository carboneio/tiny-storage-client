# High available Node Client for OpenStack Switf Object Storage

![GitHub release (latest by date)](https://img.shields.io/github/v/release/carboneio/ovh-object-storage-ha?style=for-the-badge)
[![Documentation](https://img.shields.io/badge/documentation-yes-brightgreen.svg?style=for-the-badge)](#api-usage)


> High availability, Performances, and Simplicity are the main focus of this tiny Node SDK to request the OpenStack Object Storage API. It was initially made to request the OVHCloud Object storage, but it can be used for any OpenStack Object Storage.

## Features
* 🦄 **Simple to use** - Only 4 methods: `Upload`, `Delete`, `List` and `Download` files
* 🌎 **High availability** - Initiate the SDK with a list of object storages credentials, and the SDK will switch storage if something goes wrong (Server/DNS not responding, timeout, error 500, too many redirection, authentication error, and more...).
* ✨ **Reconnect automatically** - If a request fails due to an authentication token expiration, the SDK fetches a new authentication token and retry the initial request with it.
* 🚀 **Performances** - Less than 500 lines of code with only 2 dependencies `simple-get` and `debug`.
* ✅ **100% tested**

## Install

1. **Prior installing**, Object Storages must be synchronized in order to access same objects. Learn more on the OVHCloud documentation: https://docs.ovh.com/us/en/storage/pcs/sync-container/
2. Install the package with your package manager:

```sh
npm install --save ovh-object-storage-ha
// od
yarn add ovh-object-storage-ha
```
## API Usage

### Connection

Initialise the SDK with one or multiple storage, if something goes wrong, the next region will take over automatically. If any storage is available, an error message is returned `Error: Object Storages are not available`.

```js
const storageSDK = require('ovh-object-storage-ha');

let storage = storageSDK([{
  authUrl    : 'https://auth.cloud.ovh.net/v3',
  username   : 'username-1',
  password   : 'password-1',
  tenantName : 'tenantName-1',
  region     : 'region-1'
},
{
  authUrl    : 'https://auth.cloud.ovh.net/v3',
  username   : 'username-2',
  password   : 'password-2',
  tenantName : 'tenantName-2',
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
storage.uploadFile('container', 'filename.jpg', path.join(__dirname, './assets/file.txt'), (err) => {
  if (err) {
    // handle error
  }
  // success
});

/** SOLUTION 2: A buffer can be passed for the file content **/
storage.uploadFile('container', 'filename.jpg', Buffer.from("File content"), (err) => {
  if (err) {
    // handle error
  }
  // success
});

/** SOLUTION 3: the function accepts a optionnal fourth argument `option` including query parameters and headers. List of query parameters and headers: https://docs.openstack.org/api-ref/object-store/?expanded=create-or-replace-object-detail#create-or-replace-object **/
storage.uploadFile('container', 'filename.jpg', Buffer.from("File content"), { queries: { temp_url_expires: '1440619048' }, headers: { 'X-Object-Meta-LocationOrigin': 'Paris/France' }}, (err) => {
  if (err) {
    // handle error
  }
  // success
});
```

### Download a file

```js
storage.downloadFile('templates', 'filename.jpg', (err, body, headers) => {
  if (err) {
    // handle error
  }
  // success, the `body` argument is the content of the file as a Buffer
});
```

### Delete a file

```js
storage.deleteFile('templates', 'filename.jpg', (err) => {
  if (err) {
    // handle error
  }
  // success
});
```

### List objects from a container

```js
/**
 * SOLUTION 1
 **/
storage.listFiles('templates', function (err, body) {
  if (err) {
    // handle error
  }
  // success
});

/**
 * SOLUTION 2
 * Possible to pass queries and overwrite request headers, list of options: https://docs.openstack.org/api-ref/object-store/? expanded=show-container-details-and-list-objects-detail#show-container-details-and-list-objects
 **/
storage.listFiles('templates', { queries: { prefix: 'prefixName' }, headers: { Accept: 'application/xml' } }, function (err, body) {
  if (err) {
    // handle error
  }
  // success
});
```

### Log

The package uses debug to print logs into the terminal. To activate logs, you must pass the `DEBUG=*` environment variable.
You can use the `setLogFunction` to override the default log function. Create a function with two arguments: `message` as a string, `level` as a string and the value can be: `info`/`warning`/`error`. Example to use:
```js
storage.setLogFunction((message, level) => {
  console.log(`${level} : ${message}`);
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

Feel free to check [issues page](https://github.com/carboneio/ovh-object-storage-ha/issues).

## Show your support

Give a ⭐️ if this project helped you!

## 👤 Author

- [**@steevepay**](https://github.com/steevepay)
