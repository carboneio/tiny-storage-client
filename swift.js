const rock = require('rock-req');
const fs = require('fs');
const { getUrlParameters, isFnStream } = require('./helper.js')

/**
 *
 * @description Initialise and return an instance of the Object Storage SDK.
 *
 * @param {Object} config
 * @param {String} config.authUrl URL used for authentication, default: "https://auth.cloud.ovh.net/v3"
 * @param {String} config.username Username for authentication
 * @param {String} config.password Password for authentication
 * @param {String} config.tenantName Tenant Name/Tenant ID for authentication
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
   * @param {function} callback function(err):void = The `err` is null by default, return an object if an error occurs.
   */
  function connection (callback, originStorage = 0) {
    const arrayArguments = [callback, originStorage];

    if (_config.activeStorage === _config.storages.length) {
      /**  Reset the index of the actual storage */
      _config.activeStorage = 0;
      log(`Object Storages are not available`, 'error');
      return callback(new Error('Object Storages are not available'));
    }
    const _storage = _config.storages[_config.activeStorage];
    log(`Object Storage index "${_config.activeStorage}" region "${_storage.region}" connection...`, 'info');
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
        log(`Object Storage index "${_config.activeStorage}" region "${_storage.region}" Action "connection" ${err.toString()}`, 'error');
        activateFallbackStorage(originStorage);
        arrayArguments[1] = _config.activeStorage;
        return connection.apply(null, arrayArguments);
      }

      if (res.statusCode < 200 || res.statusCode >= 300) {
        log(`Object Storage index "${_config.activeStorage}" region "${_storage.region}" connexion failled | Status ${res.statusCode.toString()} | Message: ${res.statusMessage}`, 'error');
        activateFallbackStorage(originStorage);
        arrayArguments[1] = _config.activeStorage;
        return connection.apply(null, arrayArguments);
      }

      _config.token = res.headers['x-subject-token'];

      const _serviceCatalog = data.token.catalog.find((element) => {
        return element.type === 'object-store';
      });

      if (!_serviceCatalog) {
        log(`Object Storage index "${_config.activeStorage}" region "${_storage.region}" Storage catalog not found`, 'error');
        activateFallbackStorage(originStorage);
        arrayArguments[1] = _config.activeStorage;
        return connection.apply(null, arrayArguments);
      }

      _config.endpoints = _serviceCatalog.endpoints.find((element) => {
        return element.region === _storage.region;
      });

      if (!_config.endpoints) {
        log(`Object Storage index "${_config.activeStorage}" region "${_storage.region} Storage endpoint not found, invalid region`, 'error');
        activateFallbackStorage(originStorage);
        arrayArguments[1] = _config.activeStorage;
        return connection.apply(null, arrayArguments);
      }
      log(`Object Storage index "${_config.activeStorage}" region "${_storage.region}" connected!`, 'info');
      return callback(null);
    });
  }
  /**
   * @description List objects from a container. It is possible to pass as a second argument as an object with queries or headers to overwrite the request.
   *
   * @param {String} container container name
   * @param {Object} options [OPTIONAL]: { headers: {}, queries: {} } List of headers and queries: https://docs.openstack.org/api-ref/object-store/?expanded=show-container-details-and-list-objects-detail#show-container-details-and-list-objects
   * @param {function} callback function(err, body):void = The second argument `body` is the content of the file as a Buffer. The `err` argument is null by default, return an object if an error occurs.
   */
  function listFiles(container, options, callback) {
    if (!callback) {
      callback = options;
      options = {};
    }

    return request('GET', `/${container}`, options, callback);
  }

  /**
   * @description Save a file on the OVH Object Storage
   *
   * @param {string} container Container name
   * @param {string} filename file to store
   * @param {string|Buffer|Function} localPathOrBuffer absolute path to the file
   * @param {Object} options [OPTIONAL]: { headers: {}, queries: {} } List of query parameters and headers: https://docs.openstack.org/api-ref/object-store/?expanded=create-or-replace-object-detail#create-or-replace-object
   * @param {function} callback function(err):void = The `err` is null by default, return an object if an error occurs.
   * @returns {void}
   */
  function uploadFile (container, filename, localPathOrBuffer, options, callback) {
    if (!callback) {
      callback = options;
      options = {};
    }
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
   * @param {function} callback function(err, body):void = The second argument `body` is the content of the file as a Buffer. The `err` argument is null by default, return an object if an error occurs.
   * @returns {void}
   */
  function downloadFile (container, filename, options, callback) {
    if (!callback) {
      callback = options;
      options = {};
    }
    return request('GET', `/${container}/${filename}`, options, callback);
  }

  /**
   * @description Delete a file from the OVH Object Storage
   *
   * @param {string} container Container name
   * @param {string} filename filename to store
   * @param {Object} options [OPTIONAL]: { headers: {}, queries: {} } List of query parameters and headers: https://docs.openstack.org/api-ref/object-store/?expanded=create-or-replace-object-detail#delete-object
   * @param {function} callback function(err):void = The `err` argument is null by default, return an object if an error occurs.
   * @returns {void}
   */
  function deleteFile (container, filename, options, callback) {
    if (!callback) {
      callback = options;
      options = {};
    }
    return request('DELETE', `/${container}/${filename}`, options, callback);
  }

  /**
   * @description Get object metadata
   *
   * @param {string} container Container name
   * @param {string} filename filename to store
   * @param {Object} options [OPTIONAL]: { headers: {}, queries: {} } List of query parameters and headers: https://docs.openstack.org/api-ref/object-store/?expanded=create-or-replace-object-detail#show-object-metadata
   * @param {function} callback function(err, headers):void = The `err` argument is null by default, return an object if an error occurs.
   * @returns {void}
   */
  function getFileMetadata(container, filename, options, callback) {
    if (!callback) {
      callback = options;
      options = {};
    }
    return request('HEAD', `/${container}/${filename}`, options, callback);
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

    const _requestOptions = {
      url     : `${_config.endpoints.url}${path}${_urlParams}`,
      method  : method,
      headers : {
        'X-Auth-Token' : _config.token,
        Accept         : 'application/json',
        ...(options?.headers ? options?.headers : {})
      },
      timeout: _config.timeout,
      output: isFnStream(options?.output) ? options?.output : null, /** Handle Streams */
      ...(options?.body ? { body: options?.body } : {}),
    }

    const _requestCallback = function (err, res, body) {
      /** Catch error and retry */
      if ((err || res?.statusCode >= 500)) {
        log(`Object Storage index "${_config.activeStorage}" region "${_config.storages[_config.activeStorage].region}" Status ${res?.statusCode}`, 'error');
        activateFallbackStorage(arrayArguments[arrayArguments.length - 1].originStorage);
      } else if (res?.statusCode === 401) {
        log(`Object Storage index "${_config.activeStorage}" region "${_config.storages[_config.activeStorage].region}" try reconnect...`, 'info');
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
    return console.log(level === 'error' ? `❗️ Error: ${msg}` : level === 'warning' ? `⚠️  ${msg}` : msg );
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
      _config.activeStorage += 1;
      log(`Object Storage Activate Fallback Storage index "${_config.activeStorage}" 🚩`, 'warning');
    }
  }

  function getRockReqDefaults() {
    return rock.defaults;
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
    getRockReqDefaults
  }
}