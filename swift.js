const rock = require('rock-req');
const fs = require('fs');
const { getUrlParameters, isFnStream } = require('./helper.js')

/**
 *
 * @description Initialise and return an instance of the Open Stack SWIFT client.
 *
 * @param {Object} config
 * @param {String} config.authUrl URL used for authentication, default: "https://auth.cloud.ovh.net/v3"
 * @param {String} config.username Username for authentication
 * @param {String} config.password Password for authentication
 * @param {String} config.region Region used to retreive the Object Storage endpoint to request
 */
module.exports = (config) => {

  let _config = {
    storages: [],
    activeStorage: 0,
    endpoints: {},
    token: '',
    timeout: 5000
  }

  /**
   * @description Authenticate and initialise the auth token and retreive the endpoint based on the region
   *
   * @param {function} callback function(err):void = The `err` is null by default.
   */
  function connection (callback, originStorage = 0, options) {
    const arrayArguments = [callback, originStorage, options];

    if (_config.activeStorage === _config.storages.length) {
      /**  Reset the index of the actual storage */
      _config.activeStorage = 0;
      log(`SWIFT Storage | Object Storages are not available`, 'error');
      return callback(new Error('Object Storages are not available'));
    }
    const _storage = _config.storages[_config.activeStorage];
    log(`SWIFT Storage | Index "${_config.activeStorage}" region "${_storage.region}" connection...`);
    const _json = {
      auth : {
        identity : {
          methods  : ['password'],
          password : {
            user : {
              name     : _storage.username,
              domain   : { id : 'default' },
              password : _storage.password
            }
          }
        }
      }
    };
    if (_storage.tenantName) {
      _json.auth.scope = {
        project : {
          domain : {
            id : 'default'
          },
          name : _storage.tenantName
        }
      }
    }

    rock.concat({
      url    : `${_storage.authUrl}/auth/tokens`,
      method : 'POST',
      json   : true,
      body   : _json,
      timeout: _config.timeout
    }, (err, res, data) => {
      if (err) {
        log(`SWIFT Storage | Index "${_config.activeStorage}" region "${_storage.region}" Action "connection" ${err.toString()}`, 'warning');
        activateFallbackStorage(originStorage);
        arrayArguments[1] = _config.activeStorage;
        return connection.apply(null, arrayArguments);
      }

      if (res.statusCode < 200 || res.statusCode >= 300) {
        log(`SWIFT Storage | Index "${_config.activeStorage}" region "${_storage.region}" connexion failled | Status ${res.statusCode.toString()} | Message: ${res.statusMessage}`, 'warning');
        activateFallbackStorage(originStorage);
        arrayArguments[1] = _config.activeStorage;
        return connection.apply(null, arrayArguments);
      }

      _config.token = res.headers['x-subject-token'];

      const _serviceCatalog = data.token.catalog.find((element) => {
        return element.type === 'object-store';
      });

      if (!_serviceCatalog) {
        log(`SWIFT Storage | Index "${_config.activeStorage}" region "${_storage.region}" Storage catalog not found`, 'warning');
        activateFallbackStorage(originStorage);
        arrayArguments[1] = _config.activeStorage;
        return connection.apply(null, arrayArguments);
      }

      _config.endpoints = _serviceCatalog.endpoints.find((element) => {
        const isSameRegion = element.region?.toLowerCase() === _storage.region?.toLowerCase();

        return options && options.interface
          ? element.interface?.toLowerCase() === options.interface.toLowerCase() && isSameRegion
          : isSameRegion;
      });

      if (!_config.endpoints) {
        log(`SWIFT Storage | Index "${_config.activeStorage}" region "${_storage.region} Storage endpoint not found, invalid region`, 'warning');
        activateFallbackStorage(originStorage);
        arrayArguments[1] = _config.activeStorage;
        return connection.apply(null, arrayArguments);
      }
      log(`SWIFT Storage | Index "${_config.activeStorage}" region "${_storage.region}" connected!`, 'info');
      return callback(null);
    });
  }
  /**
   * @description List objects from a container. It is possible to pass as a second argument as an object with queries or headers to overwrite the request.
   *
   * @param {String} container container name
   * @param {Object} options [OPTIONAL]: { headers: {}, queries: {} } List of headers and queries: https://docs.openstack.org/api-ref/object-store/?expanded=show-container-details-and-list-objects-detail#show-container-details-and-list-objects
   * @param {function} callback (err, {statusCode, body, header}) => { }
   */
  function listFiles(container, options, callback) {
    if (!callback) {
      callback = options;
      options = {};
    }
    options.alias = container;
    return request('GET', `/${container}`, options, (err, resp) => {
      if (err) {
        return callback(err);
      }
      if (resp.headers?.['content-type']?.includes('application/json') === true) {
        try {
          resp.body = JSON.parse(resp.body.toString())
        } catch(err) {
          return callback(new Error('Listing files JSON parse: ' + err.toString()), resp);
        }
      }
      return callback(err, resp);
    });
  }

  /**
   * @description Save a file on the OVH Object Storage
   *
   * @param {string} container Container name
   * @param {string} filename file to store
   * @param {string|Buffer|Function} localPathOrBuffer absolute path to the file
   * @param {Object} options [OPTIONAL]: { headers: {}, queries: {} } List of query parameters and headers: https://docs.openstack.org/api-ref/object-store/?expanded=create-or-replace-object-detail#create-or-replace-object
   * @param {function} callback (err, {statusCode, body, header}) => { }
   * @returns {void}
   */
  function uploadFile (container, filename, localPathOrBuffer, options, callback) {
    if (!callback) {
      callback = options;
      options = {};
    }
    options.alias = container;
    /** Is File Path */
    if (Buffer.isBuffer(localPathOrBuffer) === false && isFnStream(localPathOrBuffer) === false) {
      return fs.readFile(localPathOrBuffer, (err, objectBuffer) => {
        if (err){
          return callback(err);
        }
        options.body = objectBuffer;
        return request('PUT', `/${container}/${filename}`, options, callback);
      });
    } 
    /** Is a Buffer or a Function returning a ReadStream */
    options.body = localPathOrBuffer;
    return request('PUT', `/${container}/${filename}`, options, callback)
  }

  /**
   * @description Download a file from the OVH Object Storage
   *
   * @param {string} container Container name
   * @param {string} filename filename to download
   * @param {Object} options [OPTIONAL]: { headers: {}, queries: {} } List of query parameters and headers: https://docs.openstack.org/api-ref/object-store/?expanded=create-or-replace-object-detail#get-object-content-and-metadata
   * @param {function} callback (err, {statusCode, body, header}) => { }
   * @returns {void}
   */
  function downloadFile (container, filename, options, callback) {
    if (!callback) {
      callback = options;
      options = {};
    }
    options.alias = container;
    return request('GET', `/${container}/${filename}`, options, callback);
  }

  /**
   * @description Delete a file from the OVH Object Storage
   *
   * @param {string} container Container name
   * @param {string} filename filename to store
   * @param {Object} options [OPTIONAL]: { headers: {}, queries: {} } List of query parameters and headers: https://docs.openstack.org/api-ref/object-store/?expanded=create-or-replace-object-detail#delete-object
   * @param {function} callback (err, {statusCode, body, header}) => { }
   * @returns {void}
   */
  function deleteFile (container, filename, options, callback) {
    if (!callback) {
      callback = options;
      options = {};
    }
    options.alias = container;
    return request('DELETE', `/${container}/${filename}`, options, callback);
  }

  /**
   * @description Get object metadata
   *
   * @param {string} container Container name
   * @param {string} filename filename to store
   * @param {Object} options [OPTIONAL]: { headers: {}, queries: {} } List of query parameters and headers: https://docs.openstack.org/api-ref/object-store/?expanded=create-or-replace-object-detail#show-object-metadata
   * @param {function} callback (err, {statusCode, body, header}) => { }
   * @returns {void}
   */
  function getFileMetadata(container, filename, options, callback) {
    if (!callback) {
      callback = options;
      options = {};
    }
    options.alias = container;
    return request('HEAD', `/${container}/${filename}`, options, callback);
   }


   /**
    * @param {string} container Container name
    * @param {Array} objects List of files, it can be:
    *                 - A list of String, each string is the filename: ["file1.png", "file2.docx"]
    *                 - Or a list of objects with `key` as attribute for the filename: [{"key": "file1.png"}, {"key": "file2.docx"}]
    *                 - Or a list of objects with `name` as attribute for the filename: [{"name": "file1.png"}, {"name": "file2.docx"}]
    *                 - Or a list of objects with a custom key for filenames, you must define `fileNameKey` as option (third argument)
    * @param {Object} options [OPTIONAL]: { headers: {}, queries: {} }
    * @param {function} callback (err, {statusCode, body, header}) => { }
    * @returns 
    * 
    * Swift Official documentation: https://docs.openstack.org/swift/latest/api/bulk-delete.html
    */
  function deleteFiles (container, objects, options, callback) {
    if (!callback) {
      callback = options;
      options = {};
    }
    let _filesAsText = '';
    for (let i = 0; i < objects.length; i++) {
      const _fileName = objects[i]?.[options?.fileNameKey] ?? objects[i]?.name ?? objects[i]?.key ?? objects[i];
      if (typeof _fileName !== 'string') {
        continue;
      }
      _filesAsText += `${container}/${encodeURIComponent(_fileName)}\n`;
    }
    options.body = _filesAsText;
    options.headers = {
      ...options?.headers,
      'Content-Type': 'text/plain'
    }
    options.defaultQueries = 'bulk-delete';
    options.alias = container;
    return request('POST', `/`, options, (err, resp) => {
      if (err) {
        return callback(err);
      }
      if (resp.headers?.['content-type']?.includes('application/json') === true) {
        try {
          resp.body = JSON.parse(resp.body.toString())
        } catch(err) {
          return callback(new Error('Deleting files JSON parse: ' + err.toString()), resp);
        }
      }
      return callback(err, resp);
    });
  }

  /**
   * 
   * @param {String} container Container name
   * @param {Object} options [OPTIONAL]: { headers: {}, queries: {} } List of query parameters and headers: https://docs.openstack.org/api-ref/object-store/?expanded=create-or-replace-object-detail#show-container-metadata
   * @param {Function} callback (err, {statusCode, body, header}) => { }
   * @returns 
   */
  function headBucket(container, options, callback) {
    if (!callback) {
      callback = options;
      options = {};
    }
    options.alias = container;
    return request('HEAD', `/${container}`, options, callback);
  }

  /**
   * Show account details and list containers
   * 
   * @param {Optional} options [OPTIONAL]: { headers: {}, queries: {} } List of query parameters and headers: https://docs.openstack.org/api-ref/object-store/?expanded=create-or-replace-object-detail#show-account-details-and-list-containers
   * @param {Function} callback (err, {statusCode, body, header}) => { }
   * @returns 
   */
  function listBuckets(options, callback) {
    if (!callback) {
      callback = options;
      options = {};
    }
    return request('GET', `/`, options, (err, resp) => {
      if (err) {
        return callback(err);
      }
      if (resp.headers?.['content-type']?.includes('application/json') === true) {
        try {
          resp.body = JSON.parse(resp.body.toString())
        } catch(err) {
          return callback(new Error('Listing bucket JSON parse: ' + err.toString()), resp);
        }
      }
      return callback(err, resp);
    });
  }

   /**
   * @description Create or update object metadata.
   * @description To create or update custom metadata
   * @description use the X-Object-Meta-name header,
   * @description where "name" is the name of the metadata item.
   *
   * @param {string} container Container name
   * @param {string} filename filename
   * @param {Object} options { headers: {}, queries: {} } List of query parameters and headers: https://docs.openstack.org/api-ref/object-store/?expanded=create-or-update-object-metadata-detail#create-or-update-object-metadata
   * @param {function} callback function(err, headers):void = The `err` is null by default, return an object if an error occurs.
   * @returns {void}
   */
  function setFileMetadata (container, filename, options, callback) {
    if (!callback) {
      callback = options;
      options = {};
    }
    options.alias = container;
    return request('POST', `/${container}/${filename}`, options, callback);
  }

   /**
   * @description Send a custom request to the object storage
   *
   * @param {string} method HTTP method used (POST, COPY, etc...)
   * @param {string} path path requested, passing an empty string will request the account details. For container request pass the container name, such as: '/containerName'. For file request, pass the container and the file, such as: '/container/filename.txt'.
   * @param {Object} options { headers: {}, queries: {}, body: '' } Pass to the request the body, query parameters and/or headers. List of headers: https://docs.openstack.org/api-ref/object-store/?expanded=create-or-update-object-metadata-detail#create-or-update-object-metadata
   * @param {function} callback function(err, body, headers):void = The `err` is null by default.
   * @returns {void}
   */
  function request (method, path, options, callback) {

    const arrayArguments = [...arguments];

    if (callback === undefined) {
      callback = options;
      arrayArguments.push(options);
      options = { headers: {}, queries: {}, body: null };
      arrayArguments[3] = options;
    }

    arrayArguments.push({ originStorage : _config.activeStorage })

    const _urlParams = getUrlParameters(options?.queries ?? '', options?.defaultQueries ?? '');

    /**
     * Return a bucket name based on an alias and current active storage.
     * If the alias does not exist, the alias is returned as bucket name
     */
    let _path = path;
    let _body = options?.body;
    const _activeBucket = _config.storages[_config.activeStorage]?.buckets?.[options?.alias] ?? options?.alias;
    if (_activeBucket !== options?.alias) {
      _path = _path.replace(options?.alias, _activeBucket);
      if (_urlParams.includes('bulk-delete') === true) {
        _body = _body.replaceAll(options?.alias, _activeBucket);
      }
    }

    const _requestOptions = {
      url     : `${_config.endpoints.url}${_path}${_urlParams}`,
      method  : method,
      headers : {
        'X-Auth-Token' : _config.token,
        Accept         : 'application/json',
        ...(options?.headers ? options?.headers : {})
      },
      timeout: _config.timeout,
      output: isFnStream(options?.output) ? options?.output : null, /** Handle Streams */
      ...(_body ? { body: _body } : {}),
    }

    const _requestCallback = function (err, res, body) {
      /** Catch error and retry */
      if ((err || res?.statusCode >= 500)) {
        log(`SWIFT Storage | Index "${_config.activeStorage}" region "${_config.storages[_config.activeStorage].region}" | ${res?.statusCode ?? err?.toString()}`, 'error');
        activateFallbackStorage(arrayArguments[arrayArguments.length - 1].originStorage);
      } else if (res?.statusCode === 401) {
        log(`SWIFT Storage | Index "${_config.activeStorage}" region "${_config.storages[_config.activeStorage].region}" try reconnect...`, 'info');
      }

      /** If something went wrong: connect again and request again */
      if (err || res?.statusCode >= 500 || res?.statusCode === 401) {
        return connection(
          (err) => {
            if (err) {
              return callback(err);
            }
            // Request again with the new Auth token
            return request.apply(null, arrayArguments);
          }, 
          arrayArguments[arrayArguments.length - 1].originStorage
        );
      }
      return isFnStream(options?.output) === true ? callback(null, res) : callback(null, { headers : res.headers, statusCode: res.statusCode, body : body });
    }
    return isFnStream(options?.output) === true ? rock(_requestOptions, _requestCallback) : rock.concat(_requestOptions, _requestCallback);
  }

  /**
   * @description Set and overwrite the Object Storage SDK configurations
   *
   * @param {Object} config
   * @param {String} config.authUrl URL used for authentication, default: "https://auth.cloud.ovh.net/v3"
   * @param {String} config.username Username for authentication
   * @param {String} config.password Password for authentication
   * @param {String} config.tenantName Tenant Name/Tenant ID for authentication
   * @param {String} config.region Region used to retreive the Object Storage endpoint to request
   */
  function setStorages(storages) {
    _config.token = '';
    _config.endpoints = {};
    _config.activeStorage = 0;
    if (Array.isArray(storages) === true) {
      /** List of storage */
      _config.storages = storages;
    } else if (typeof storages === 'object') {
      /** Only a single storage is passed */
      _config.storages = [];
      _config.storages.push(storages)
    }
  }

  /**
   * Set the timeout
   *
   * @param {Integer} timeout
   */
  function setTimeout(timeout) {
    _config.timeout = timeout;
  }

  /**
   * @description Return the list of storages
   *
   * @returns {String} The list of storages
   */
  function getStorages() {
    return _config.storages;
  }

  /**
   * @description Return the configuration object
   *
   * @returns {String} The list of storages
   */
  function getConfig() {
    return _config;
  }

  /**
   * log messages
   *
   * @param {String} msg Message
   * @param {type} type warning, error
   */
  function log(msg, level = 'info') {
    return console.log(level === 'error' ? `🔴 ${msg}` : level === 'warning' ? `🟠 ${msg}` : `🟢 ${msg}`);
  }

  /**
   * Override the log function, it takes to arguments: message, level
   * @param {Function} newLogFunction (message, level) => {} The level can be: `info`, `warning`, `error`
   */
  function setLogFunction (newLogFunction) {
    if (newLogFunction) {
      // eslint-disable-next-line no-func-assign
      log = newLogFunction;
    }
  }

  /** ================ PRIVATE FUNCTION ================= */

  function activateFallbackStorage(originStorage) {
    if (originStorage === _config.activeStorage && _config.activeStorage + 1 <= _config.storages.length) {
      log(`SWIFT Storage | Activate Fallback Storage: switch from "${_config.activeStorage}" to "${_config.activeStorage + 1}"`, 'warning');
      _config.activeStorage += 1;
    }
  }

  function getRockReqDefaults() {
    return rock.defaults;
  }

  function setRockReqDefaults (newDefaults) {
    if (newDefaults && typeof newDefaults === 'object') {
      Object.assign(rock.defaults, newDefaults);
    }
  }

  setStorages(config)

  return {
    connection,
    uploadFile,
    downloadFile,
    deleteFile,
    listFiles,
    getFileMetadata,
    setFileMetadata,
    setTimeout,
    setStorages,
    getStorages,
    getConfig,
    setLogFunction,
    request,
    getRockReqDefaults,
    setRockReqDefaults,
    deleteFiles,
    headBucket,
    listBuckets
  }
}