# Tiny client for distributed S3/Swift storages

![GitHub release (latest by date)](https://img.shields.io/github/v/release/carboneio/high-availability-object-storage?style=for-the-badge)
[![Documentation](https://img.shields.io/badge/documentation-yes-brightgreen.svg?style=for-the-badge)](#api-usage)

> High availability, Performances, and Simplicity are the main focus of this tiny Node client to request AWS S3 API or the OpenStack Swift Object Storage API. It was initially made to request OVHCloud, but it can be used for any Server/Cloud provider.

## Highlights

* 🦄 **Simple to use** - Only 5 methods: `uploadFile`, `deleteFile`, `listFiles`, `downloadFile` and `request` for custom requests.
* 🚀 **Performances** - Vanilla JS + Only 2 dependencies [simple-get](https://github.com/feross/simple-get) for HTTP requests and [aws4](https://github.com/mhart/aws4) for signing S3 requests.
* 🌎 **High availability** - Provide one or a list of storages credentials: the SDK will switch storage if something goes wrong (Server/DNS not responding, timeout, error 500, too many redirection, authentication error, and more...). As soon as the main storage is available, the SDK returns to the main storage
* ✨ **Reconnect automatically** - If a request fails due to an authentication token expiration, the SDK fetches a new authentication token and retry the initial request with it (Concerns only Swift Storage).
* ✅ **100% tested** - Production battle-tested against hundreds of GBs of file uploads & downloads
* 👉 **JSON responses** - XML responses are automatically converted as JSON Objects (Concerns only S3 Storage: `ListObjects` and `Errors`).

## Documentation

- Aws S3: **[Coming soon]**
- [Open Stack Swift](./USAGE-SWIFT.md)

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

Feel free to check [issues page](https://github.com/carboneio/high-availability-object-storage/issues).

## Show your support

Give a ⭐️ if this project helped you!

## 👤 Author

- [**@steevepay**](https://github.com/steevepay)
