# OVH Object Storage High Availability

![Version](https://img.shields.io/badge/version-0.1.2-blue.svg?style=flat-square&cacheSeconds=2592000)
[![Documentation](https://img.shields.io/badge/documentation-yes-brightgreen.svg?style=flat-square)](#api-usage)


High availability and performances are the main focus of this tiny helper: upload and get files in different regions, with fallback storage if something goes wrong.

## TODO

Version `1.0.0` in progress: coming versions may have breaking changes

- [x] Authenticate to get a new token if a request fail and request the API again
- [ ] Provide a Object Storage fallback if an issue occurs
- [ ] Upload to multiple Object Storage at the same time

## Install

```sh
npm install --save ovh-object-storage-ha
```

or

```sh
yarn add ovh-object-storage-ha
```
## API Usage

Initialise and authenticate the object storage
```js
const storageSDK = require('ovh-object-storage-ha');

let storage = storageSDK({
  authUrl    : 'https://auth.cloud.ovh.net/v3',
  username   : 'username',
  password   : 'password',
  tenantName : 'tenantName',
  region     : 'region'
});

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
storage.writeFile('container', 'filename.jpg', path.join(__dirname, './assets/file.txt'), (err) => {
  if (err) {
    // handle error
  }
  // success
});

/** SOLUTION 2: A buffer can be passed for the file content **/
storage.writeFile('container', 'filename.jpg', Buffer.from("File content"), (err) => {
  if (err) {
    // handle error
  }
  // success
});
```
Download a file
```js
storage.readFile('templates', 'filename.jpg', (err, body) => {
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
storage.getFiles('templates', function (err, body) {
  if (err) {
    // handle error
  }
  // success
});

// Possible to pass queries and overwrite request headers, list of options: https://docs.openstack.org/api-ref/object-store/?expanded=show-container-details-and-list-objects-detail#show-container-details-and-list-objects
storage.getFiles('templates', { queries: { prefix: 'prefixName' }, headers: { Accept: 'application/xml' } }, function (err, body) {
  if (err) {
    // handle error
  }
  // success
});
```

Overwrite the configuration
```js
// Each configuration is optional, for example is is possible to provide only the username and password
storage.setConfig({
  authUrl    : 'https://auth.cloud.ovh.net/v3',
  username   : 'username',
  password   : 'password',
  tenantName : 'tenantName',
  region     : 'region'
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
