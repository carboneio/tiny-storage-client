# OpenStack Object Storage High Availability
![GitHub release (latest by date)](https://img.shields.io/github/v/release/carboneio/ovh-object-storage-ha?style=for-the-badge)
[![Documentation](https://img.shields.io/badge/documentation-yes-brightgreen.svg?style=for-the-badge)](#api-usage)

High availability and performances are the main focus of this tiny Node SDK: **upload** and **download files**, with __fallback storages__ if something goes wrong (Server or DNS not responding, timeout, error 500, too many redirection, and more...).

## Install

1. **Prior installing**, Object Storages must be synchronized in order to access same objects. Learn more: https://docs.ovh.com/us/en/storage/pcs/sync-container/
2. Install the package with your package manager:

```sh
npm install --save ovh-object-storage-ha
// od
yarn add ovh-object-storage-ha
```
## API Usage

Initialise and authenticate the object storage with a list of storages. You can register one or multiple storage, if something goes wrong, the next region will take over automatically.
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
Upload a file
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
```
Download a file
```js
storage.downloadFile('templates', 'filename.jpg', (err, body) => {
  if (err) {
    // handle error
  }
  // success, the `body` argument is the content of the file as a Buffer
});
```

Delete a file
```js
storage.deleteFile('templates', 'filename.jpg', (err) => {
  if (err) {
    // handle error
  }
  // success
});
```

Get container list objects and details
```js
storage.listFiles('templates', function (err, body) {
  if (err) {
    // handle error
  }
  // success
});

// Possible to pass queries and overwrite request headers, list of options: https://docs.openstack.org/api-ref/object-store/?expanded=show-container-details-and-list-objects-detail#show-container-details-and-list-objects
storage.listFiles('templates', { queries: { prefix: 'prefixName' }, headers: { Accept: 'application/xml' } }, function (err, body) {
  if (err) {
    // handle error
  }
  // success
});
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
