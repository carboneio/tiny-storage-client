const rock = require('rock-req');
const fs = require('fs');

const isFnStream = o => o instanceof Function

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
    const arrayArguments = [...arguments];

    if (callback === undefined) {
      callback = options;
      arrayArguments.push(options);
      options = { headers: {}, queries: {} };
      arrayArguments[1] = options;
    }

    arrayArguments.push({ originStorage : _config.activeStorage })

    const { headers, queries } = getHeaderAndQueryParameters(options);
    rock.concat({
      url     : `${_config.endpoints.url}/${container}${queries}`,
      method  : 'GET',
      headers : {
        'X-Auth-Token' : _config.token,
        Accept         : 'application/json',
        ...headers
      },
      timeout: _config.timeout
    }, (err, res, body) => {

      /** Manage special errors: timeouts, too many redirects or any unexpected behavior */
      res = res || {};
      res.error = err && err.toString().length > 0 ? err.toString() : null;

      checkIsConnected(res, 'listFiles', arrayArguments, (error) => {
        if (error) {
          return callback(error);
        }

        if (res && res.statusCode === 404) {
          return callback(new Error('Container does not exist'));
        }

        err = err || checkResponseError(res);

        /** TODO: remove? it should never happen as every error switch to another storage */
        if (err) {
          return callback(err);
        }

        return callback(null, body);
      });
    });
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
    let readStream = Buffer.isBuffer(localPathOrBuffer) === true || typeof localPathOrBuffer === 'function' ? localPathOrBuffer  : () => { return fs.createReadStream(localPathOrBuffer) } ;

    const arrayArguments = [...arguments];

    if (callback === undefined) {
      callback = options;
      arrayArguments.push(options);
      options = { headers: {}, queries: {} };
      arrayArguments[3] = options;
    }

    arrayArguments.push({ originStorage : _config.activeStorage })

    const { headers, queries } = getHeaderAndQueryParameters(options);
    rock.concat({
      url     : `${_config.endpoints.url}/${container}/${filename}${queries}`,
      method  : 'PUT',
      body    : readStream,
      headers : {
        'X-Auth-Token' : _config.token,
        Accept         : 'application/json',
        ...headers
      },
      timeout: _config.timeout
    }, (err, res, body) => {

      /** Manage special errors: timeouts, too many redirects or any unexpected behavior */
      res = res || {};
      res.error = err && err.toString().length > 0 && err.code !== 'ENOENT' ? err.toString() : null;

      checkIsConnected(res, 'uploadFile', arrayArguments, (error) => {
        if (error) {
          return callback(error);
        }

        err = err || checkResponseError(res, body.toString());

        if (err) {
          if (err.code === 'ENOENT') {
            return callback(new Error('The local file does not exist'));
          }

          return callback(err);
        }
        return callback(null);
      });
    });
  }

  /**
   * @description Download a file from the OVH Object Storage
   *
   * @param {string} container Container name
   * @param {string} filename filename to download
   * @param {function} callback function(err, body):void = The second argument `body` is the content of the file as a Buffer. The `err` argument is null by default, return an object if an error occurs.
   * @returns {void}
   */
  function downloadFile (container, filename, callback) {

    const arrayArguments = [...arguments, { originStorage : _config.activeStorage }];

    rock.concat({
      url     : `${_config.endpoints.url}/${container}/${filename}`,
      method  : 'GET',
      headers : {
        'X-Auth-Token' : _config.token,
        Accept         : 'application/json'
      },
      timeout: _config.timeout
    }, (err, res, body) => {

      /** Manage special errors: timeouts, too many redirects or any unexpected behavior */
      res = res || {};
      res.error = err && err.toString().length > 0 ? err.toString() : null;

      checkIsConnected(res, 'downloadFile', arrayArguments, (error) => {
        if (error) {
          return callback(error);
        }

        if (res && res.statusCode === 404) {
          return callback(new Error('File does not exist'));
        }

        err = err || checkResponseError(res);

        /** TODO: remove? it should never happen as every error switch to another storage */
        if (err) {
          return callback(err);
        }

        return callback(null, body, res.headers);
      });
    });
  }

  /**
   * @description Delete a file from the OVH Object Storage
   *
   * @param {string} container Container name
   * @param {string} filename filename to store
   * @param {function} callback function(err):void = The `err` argument is null by default, return an object if an error occurs.
   * @returns {void}
   */
  function deleteFile (container, filename, callback) {

    const arrayArguments = [...arguments, { originStorage : _config.activeStorage }];

    rock.concat({
      url     : `${_config.endpoints.url}/${container}/${filename}`,
      method  : 'DELETE',
      headers : {
        'X-Auth-Token' : _config.token,
        Accept         : 'application/json'
      },
      timeout: _config.timeout
    }, (err, res) => {

      /** Manage special errors: timeouts, too many redirects or any unexpected behavior */
      res = res || {};
      res.error = err && err.toString().length > 0 ? err.toString() : null;

      checkIsConnected(res, 'deleteFile', arrayArguments, (error) => {
        if (error) {
          return callback(error);
        }

        if (res && res.statusCode === 404) {
          return callback(new Error('File does not exist'));
        }

        err = err || checkResponseError(res);

        /** TODO: remove? it should never happen as every error switch to another storage */
        if (err) {
          return callback(err);
        }

        return callback(null);
      });
    });
  }

  /**
   * @description Get object metadata
   *
   * @param {string} container Container name
   * @param {string} filename filename to store
   * @param {function} callback function(err, headers):void = The `err` argument is null by default, return an object if an error occurs.
   * @returns {void}
   */
  function getFileMetadata(container, filename, callback) {
    const arrayArguments = [...arguments, { originStorage : _config.activeStorage }];

    rock.concat({
      url     : `${_config.endpoints.url}/${container}/${filename}`,
      method  : 'HEAD',
      headers : {
        'X-Auth-Token' : _config.token,
        Accept         : 'application/json'
      },
      timeout: _config.timeout
    }, (err, res) => {

      /** Manage special errors: timeouts, too many redirects or any unexpected behavior */
      res = res || {};
      res.error = err && err.toString().length > 0 ? err.toString() : null;

      checkIsConnected(res, 'getFileMetadata', arrayArguments, (error) => {
        if (error) {
          return callback(error);
        }

        if (res && res.statusCode === 404) {
          return callback(new Error('File does not exist'));
        }

        err = err || checkResponseError(res);

        /** TODO: remove? it should never happen as every error switch to another storage */
        if (err) {
          return callback(err);
        }

        return callback(null, res.headers);
      });
    });
   }

   /**
   * @description Create or update object metadata.
   * @description To create or update custom metadata
   * @description use the X-Object-Meta-name header,
   * @description where name is the name of the metadata item.
   *
   * @param {string} container Container name
   * @param {string} filename file to store
   * @param {string|Buffer} localPathOrBuffer absolute path to the file
   * @param {Object} options { headers: {}, queries: {} } List of query parameters and headers: https://docs.openstack.org/api-ref/object-store/?expanded=create-or-update-object-metadata-detail#create-or-update-object-metadata
   * @param {function} callback function(err, headers):void = The `err` is null by default, return an object if an error occurs.
   * @returns {void}
   */
  function setFileMetadata (container, filename, options, callback) {

    const arrayArguments = [...arguments];

    if (callback === undefined) {
      callback = options;
      arrayArguments.push(options);
      options = { headers: {}, queries: {} };
      arrayArguments[3] = options;
    }

    arrayArguments.push({ originStorage : _config.activeStorage })

    const { headers, queries } = getHeaderAndQueryParameters(options);
    rock.concat({
      url     : `${_config.endpoints.url}/${container}/${filename}${queries}`,
      method  : 'POST',
      headers : {
        'X-Auth-Token' : _config.token,
        Accept         : 'application/json',
        ...headers
      },
      timeout: _config.timeout
    }, (err, res) => {

      /** Manage special errors: timeouts, too many redirects or any unexpected behavior */
      res = res || {};
      res.error = err && err.toString().length > 0 ? err.toString() : null;

      checkIsConnected(res, 'setFileMetadata', arrayArguments, (error) => {
        if (error) {
          return callback(error);
        }

        if (res && res.statusCode === 404) {
          return callback(new Error('File does not exist'));
        }

        err = err || checkResponseError(res);

        /** TODO: remove? it should never happen as every error switch to another storage */
        if (err) {
          return callback(err);
        }
        return callback(null, res.headers);
      });
    });
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

    const { headers, queries, body } = getHeaderAndQueryParameters(options);

    const _requestOptions = {
      url     : `${_config.endpoints.url}${path}${queries}`,
      method  : method,
      headers : {
        'X-Auth-Token' : _config.token,
        Accept         : 'application/json',
        ...headers
      },
      timeout: _config.timeout,
      output: isFnStream(options?.output) ? options?.output : null, /** Handle Streams */
      ...(body ? { body } : {})
    }

    const _requestCallback = function (err, res, body) {
      /** Manage special errors: timeouts, too many redirects or any unexpected behavior */
      res = res || {};
      res.error = err && err.toString().length > 0 ? err.toString() : null;
      checkIsConnected(res, 'request', arrayArguments, (error) => {
        if (error) {
          return callback(error);
        }
        err = err || checkResponseError(res);

        /** TODO: remove? it should never happen as every error switch to another storage */
        if (err) {
          return callback(err);
        }
        return isFnStream(options?.output) === true ? callback(null, res) : callback(null, body, res.headers);
      });
    }
    return isFnStream(options?.output) === true ? rock(_requestOptions, _requestCallback) : rock.concat(_requestOptions, _requestCallback);
  }

  /**
   * @description Check the response status code and return an Error.
   *
   * @param {Object} response Response object from request
   * @returns {null|Error}
   */
  function checkResponseError (response, body = '') {
    /** TODO: remove? it should never happen as every error switch to another storage */
    if (!response) {
      return new Error('No response');
    }

    if (response.statusCode < 200 || response.statusCode >= 300) {
      return new Error(`${response.statusCode.toString()} ${response.statusMessage || body}`);
    }

    return null;
  }

  /**
   * @description Check if the request is authorized, if not, it authenticate again to generate a new token, and execute again the initial request.
   *
   * @param {Object} response Request response
   * @param {String} from Original function called
   * @param {Object} args Arguments of the original function.
   * @param {function} callback function(err):void = The `err` argument is null by default, return an object if an error occurs.
   * @returns {void}
   */
  function checkIsConnected (response, from, args, callback) {
    if (!response || (response?.statusCode < 500 && response?.statusCode !== 401) || (!response?.statusCode && !!response?.error !== true)) {
      return callback(null);
    }

    if (response?.statusCode >= 500) {
      log(`Object Storage index "${_config.activeStorage}" region "${_config.storages[_config.activeStorage].region}" Action "${from}" Status ${response?.statusCode}`, 'error');
      activateFallbackStorage(args[args.length - 1].originStorage);
    }

    if (!!response?.error === true) {
      log(`Object Storage index "${_config.activeStorage}" region "${_config.storages[_config.activeStorage].region}" Action "${from}" ${response.error}`, 'error');
      activateFallbackStorage(args[args.length - 1].originStorage);
    }

    if (response?.statusCode === 401) {
      log(`Object Storage index "${_config.activeStorage}" region "${_config.storages[_config.activeStorage].region}" try reconnect...`, 'info');
    }

    // Reconnect to object storage
    connection((err) => {
      if (err) {
        return callback(err);
      }

      switch (from) {
        case 'downloadFile':
          downloadFile.apply(null, args);
          break;
        case 'uploadFile':
          uploadFile.apply(null, args);
          break;
        case 'deleteFile':
          deleteFile.apply(null, args);
          break;
        case 'listFiles':
          listFiles.apply(null, args);
          break;
        case 'getFileMetadata':
          getFileMetadata.apply(null, args);
          break;
        case 'setFileMetadata':
          setFileMetadata.apply(null, args);
          break;
        case 'request':
          request.apply(null, args);
          break;
        default:
          /** TODO: remove? it should never happen */
          return callback(null);
      }
    }, args[args.length - 1].originStorage);
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


  /**
   * Convert an Object of query parameters into a string
   * Example: { "prefix" : "user_id_1234", "format" : "xml"} => "?prefix=user_id_1234&format=xml"
   *
   * @param {Object} queries
   * @returns
   */
  function getQueryParameters (queries) {
    let _queries = '';

    if (queries && typeof queries === "object") {
      const _queriesEntries = Object.keys(queries);
      const _totalQueries = _queriesEntries.length;
      for (let i = 0; i < _totalQueries; i++) {
        if (i === 0) {
          _queries += '?'
        }
        _queries += `${_queriesEntries[i]}=${queries[_queriesEntries[i]]}`
        if (i + 1 !== _totalQueries) {
          _queries += '&'
        }
      }
    }
    return _queries;
  }

  function getHeaderAndQueryParameters (options) {
    let headers = {};
    let queries = '';
    let body = null

    if (options?.queries) {
      queries = getQueryParameters(options.queries);
    }
    if (options?.headers) {
      headers = options.headers;
    }
    if (options?.body) {
      body = options.body;
    }
    return { headers, queries, body }
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