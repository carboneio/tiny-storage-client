const get = require('simple-get');
const fs = require('fs');
const { Readable } = require('stream');

let _config = {
  authUrl: 'https://auth.cloud.ovh.net/v3',
  username: null,
  password: null,
  tenantName: null,
  region: null,
  _endpoints: null,
  _token: null
}

/**
 * @description Authenticate and initialise the auth token and retreive the endpoint based on the region
 *
 * @param {function} callback function(err):void = The `err` is null by default, return an object if an error occurs.
 */
function connection (callback) {
  const _json = {
    auth : {
      identity : {
        methods  : ['password'],
        password : {
          user : {
            name     : _config.username,
            domain   : { id : 'default' },
            password : _config.password
          }
        }
      },
      scope : {
        project : {
          domain : {
            id : 'default'
          },
          name : _config.tenantName
        }
      }
    }
  };

  get.concat({
    url    : `${_config.authUrl}/auth/tokens`,
    method : 'POST',
    json   : true,
    body   : _json
  }, (err, res, data) => {
    if (err) {
      return callback(new Error(err.toString()));
    }

    if (res.statusCode < 200 || res.statusCode >= 300) {
      return callback(new Error(res.statusCode.toString() + ' ' + res.statusMessage));
    }

    _config._token = res.headers['x-subject-token'];

    const _serviceCatalog = data.token.catalog.find((element) => {
      return element.type === 'object-store';
    });

    if (!_serviceCatalog) {
      return callback(new Error('Endpoint not found'));
    }

    _config._endpoints = _serviceCatalog.endpoints.find((element) => {
      return element.region === _config.region;
    });

    if (!_config._endpoints) {
      return callback(new Error('Endpoint not found, invalid region'));
    }

    return callback(null);
  });
}

/**
 * @description Save a file on the OVH Object Storage
 *
 * @param {string} container Container name
 * @param {string} filename file to store
 * @param {string|Buffer} localPath absolute path to the file
 * @param {function} callback function(err):void = The `err` is null by default, return an object if an error occurs.
 * @returns {void}
 */
function writeFile (container, filename, localPathOrContentBuffer, callback) {
  let readStream = Buffer.isBuffer(localPathOrContentBuffer) === true ? Readable.from(localPathOrContentBuffer) : fs.createReadStream(localPathOrContentBuffer);

  get({
    url     : `${_config._endpoints.url}/${container}/${filename}`,
    method  : 'PUT',
    body    : readStream,
    headers : {
      'X-Auth-Token' : _config._token,
      Accept         : 'application/json'
    }
  }, (err, res) => {
    checkIsConnected(res, 'writeFile', arguments, (error) => {
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
function readFile (container, filename, callback) {
  get.concat({
    url     : `${_config._endpoints.url}/${container}/${filename}`,
    method  : 'GET',
    headers : {
      'X-Auth-Token' : _config._token,
      Accept         : 'application/json'
    }
  }, (err, res, body) => {
    checkIsConnected(res, 'readFile', arguments, (error) => {
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

      return callback(null, body);
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
    url     : `${_config._endpoints.url}/${container}/${filename}`,
    method  : 'DELETE',
    headers : {
      'X-Auth-Token' : _config._token,
      Accept         : 'application/json'
    }
  }, (err, res) => {
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
  if (!response || response.statusCode !== 401) {
    return callback(null);
  }

  // Reconnect to object storage
  connection((err) => {
    if (err) {
      return callback(err);
    }

    switch (from) {
      case 'readFile':
        readFile.apply(null, args);
        break;
      case 'writeFile':
        writeFile.apply(null, args);
        break;
      case 'deleteFile':
        deleteFile.apply(null, args);
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
function setConfig(config) {
  _config = { ...config }
}

/**
 * @description Return the configuration value
 *
 * @param {String} name property name
 * @returns {String} value of the config property
 */
function getConfig(name) {
  return _config[name];
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
  setConfig(config)
  return {
    connection,
    writeFile,
    readFile,
    deleteFile,
    setConfig,
    getConfig
  }
}