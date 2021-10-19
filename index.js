const get = require('simple-get');
const fs = require('fs');
const debug = require('debug')('ovh-object-storage-ha')
const { Readable } = require('stream');

let _config = {
  storages: [],
  actifStorage: 0,
  endpoints: null,
  token: null,
  timeout: 5000
}

/**
 * @description Authenticate and initialise the auth token and retreive the endpoint based on the region
 *
 * @param {function} callback function(err):void = The `err` is null by default, return an object if an error occurs.
 */
function connection (callback) {
  if (_config.actifStorage === _config.storages.length) {
    // Reset the index of the actual storage
    _config.actifStorage = 0;
    debug(`Error: Object Storages are not available`);
    return callback(new Error('Object Storages are not available'));
  }
  console.log("Connect with the storage", _config.actifStorage)
  const _storage = _config.storages[_config.actifStorage];
  debug(`Object Storage index "${_config.actifStorage}" region "${_storage.region}" connection...`);
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
      },
      scope : {
        project : {
          domain : {
            id : 'default'
          },
          name : _storage.tenantName
        }
      }
    }
  };

  get.concat({
    url    : `${_storage.authUrl}/auth/tokens`,
    method : 'POST',
    json   : true,
    body   : _json,
    timeout: _config.timeout
  }, (err, res, data) => {
    if (err) {
      return callback(new Error(err.toString()));
    }

    if (res.statusCode < 200 || res.statusCode >= 300) {
      debug(`Object Storage index "${_config.actifStorage}" region "${_storage.region}" not available | Status ${res.statusCode.toString()} | Message: ${res.statusMessage} `);
      _config.actifStorage += 1
      return connection.apply(null, arguments);
    }

    _config.token = res.headers['x-subject-token'];

    const _serviceCatalog = data.token.catalog.find((element) => {
      return element.type === 'object-store';
    });

    if (!_serviceCatalog) {
      debug(`Object Storage index "${_config.actifStorage}" region "${_storage.region}" warning: Object storage catalog not found`);
      _config.actifStorage += 1
      return connection.apply(null, arguments);
    }

    _config.endpoints = _serviceCatalog.endpoints.find((element) => {
      return element.region === _storage.region;
    });

    if (!_config.endpoints) {
      debug(`Object Storage index "${_config.actifStorage}" region "${_storage.region} warning: storage endpoint not found, invalid region`);
      _config.actifStorage += 1
      return connection.apply(null, arguments);
    }
    debug(`Object Storage index "${_config.actifStorage}" region "${_storage.region}" connected!`);
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
  let _options = {};

  if (!callback) {
    callback = options;
    _options = { headers: {}, queries: {} };
  } else {
    _options = options;
  }

  const { headers, queries } = getHeaderAndQueryParameters(_options);

  get.concat({
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
    res = { error: (err && err.toString().length > 0 ? err.toString() : null), ...res };

    checkIsConnected(res, 'listFiles', arguments, (error) => {
      if (error) {
        return callback(error);
      }

      if (res && res.statusCode === 404) {
        return callback(new Error('Container does not exist'));
      }

      err = err || checkResponseError(res);

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
 * @param {string|Buffer} localPathOrBuffer absolute path to the file
 * @param {Object} options [OPTIONAL]: { headers: {}, queries: {} } List of query parameters and headers: https://docs.openstack.org/api-ref/object-store/?expanded=create-or-replace-object-detail#create-or-replace-object
 * @param {function} callback function(err):void = The `err` is null by default, return an object if an error occurs.
 * @returns {void}
 */
function uploadFile (container, filename, localPathOrBuffer, options, callback) {
  let readStream = Buffer.isBuffer(localPathOrBuffer) === true ? Readable.from(localPathOrBuffer) : fs.createReadStream(localPathOrBuffer);

  let _options = {};

  if (!callback) {
    callback = options;
    _options = { headers: {}, queries: {} };
  } else {
    _options = options;
  }

  const { headers, queries } = getHeaderAndQueryParameters(_options);

  get({
    url     : `${_config.endpoints.url}/${container}/${filename}${queries}`,
    method  : 'PUT',
    body    : readStream,
    headers : {
      'X-Auth-Token' : _config.token,
      Accept         : 'application/json',
      ...headers
    },
    timeout: _config.timeout
  }, (err, res) => {

    /** Manage special errors: timeouts, too many redirects or any unexpected behavior */
    res = res || {};
    res = { error: (err && err.toString().length > 0 && err.code !== 'ENOENT' ? err.toString() : null), ...res };

    checkIsConnected(res, 'uploadFile', arguments, (error) => {
      if (error) {
        return callback(error);
      }

      err = err || checkResponseError(res);

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
  get.concat({
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
    res = { error: (err && err.toString().length > 0 ? err.toString() : null), ...res };

    checkIsConnected(res, 'downloadFile', arguments, (error) => {
      if (error) {
        return callback(error);
      }

      if (res && res.statusCode === 404) {
        return callback(new Error('File does not exist'));
      }

      err = err || checkResponseError(res);

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
  get.concat({
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
    res = { error: (err && err.toString().length > 0 ? err.toString() : null), ...res };

    checkIsConnected(res, 'deleteFile', arguments, (error) => {
      if (error) {
        return callback(error);
      }

      if (res && res.statusCode === 404) {
        return callback(new Error('File does not exist'));
      }

      err = err || checkResponseError(res);

      if (err) {
        return callback(err);
      }

      return callback(null);
    });
  });
}

/**
 * @description Check the response status code and return an Error.
 *
 * @param {Object} response Response object from request
 * @returns {null|Error}
 */
function checkResponseError (response) {
  if (!response) {
    return new Error('No response');
  }

  if (response.statusCode < 200 || response.statusCode >= 300) {
    return new Error(`${response.statusCode.toString()} ${response.statusMessage}`);
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
  if (!response || (response.statusCode < 500 && response.statusCode !== 401) || (!response.statusCode && !!response.error !== true)) {
    return callback(null);
  }

  if (response && response.statusCode >= 500) {
    debug(`Object Storage index "${_config.actifStorage}" region "${_config.storages[_config.actifStorage].region}" Error Status ${response.statusCode}`);
    _config.actifStorage += 1
  }

  if (response && !!response.error === true) {
    debug(`Object Storage index "${_config.actifStorage}" region "${_config.storages[_config.actifStorage].region}" ${response.error}`);
    _config.actifStorage += 1
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
      default:
        callback(null);
        break;
    }
  });
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
  _config.actifStorage = 0;
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
  setStorages(config)
  return {
    connection,
    uploadFile,
    downloadFile,
    deleteFile,
    listFiles,
    setTimeout,
    setStorages,
    getStorages,
    getConfig
  }
}

/** ============ Utils =========== */

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

  if (Object.prototype.hasOwnProperty.call(options, 'queries') === true) {
    queries = getQueryParameters(options.queries);
  }
  if (Object.prototype.hasOwnProperty.call(options, 'headers') === true) {
    headers = options.headers;
  }
  return { headers, queries }
}