### v0.1.9
- Update `simple-get` node dep to `4.0.1`

### v0.1.8
- Fix the `downloadFile` callback function, the third argument is now always returning the response header of the request.

### v0.1.7
- add `setLogFunction` used to Override the log function. It takes to arguments: `message` as a string, `level` as a string and can be: `info`/`warning`/`error`. Example to use:
```js
storage.setLogFunction((message, level) => {
  console.log(`${level} : ${message}`);
})
```

### v0.1.6
- Fix `connection` fallback on error & add tests

### v0.1.5
  - Fix `uploadFile`: return the response body if an error occurs
  - Added parallel tests
### v0.1.4
  - Fix the automatic fallback when multiple clients are using all functions in parallel
### v0.1.3
  - Rename `getFiles` function to `listFiles`
  - Rename `writeFile` function to `uploadFile`
  - Rename `readFile` function to `downloadFile`
  - NEW: Pass a list of object storage credential to the constructor, the sdk will automatically connect to another storage if something goes wrong (Server or DNS not responding, timeout, error 500, too many redirection, and more...)
  - NEW: the method `uploadFile` accepts a new optionnal fourth argument `option`: `{ queries: { temp_url_expires: '1440619048' }, headers: { X-Object-Meta-LocationOrigin: 'Paris/France' }`. List of query parameters and headers: https://docs.openstack.org/api-ref/object-store/?expanded=create-or-replace-object-detail#create-or-replace-object


### v0.1.2
  - Add method `getFiles`: Show container details and list objects. It is possible to filter the list or overwrite the request headers, such as:
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
  - Update `writeFile` function : it can take a Buffer as an argument

### v0.1.0
  - Methods to interact with the OVH Object Storage:
    - writeFile: upload a file
    - readFile: download a file
    - deleteFile: delete a file
  - a new authentication token is requested when the authentication token is not valid during a request