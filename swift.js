const rock = require('rock-req');
const fs = require('fs');
const { getUrlParameters, isFnStream, encodeObjectName, failureToString, failureFields, storageUnavailableError, downloadOptions, catchSyncError, finalOutput } = require('./helper.js');

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

  /** Invariant: `endpoints` and `token` belong to `activeStorage`, or are empty. Every change of `activeStorage` clears or replaces them */
  const _config = {
    storages: [],
    activeStorage: 0,
    endpoints: {},
    token: '',
    timeout: 60000 // ms, inactivity timeout (like botocore read timeout)
  };

  /** Callbacks waiting for the authentication in progress, null if none: parallel requests share a single authentication */
  let _connectionCallbacks = null;
  /** Incremented by setStorages(): an authentication started on the previous storages is restarted on the new ones */
  let _storagesVersion = 0;
  /** Probe of the main storage while a fallback is active: one at a time, every PROBE_DELAY_MIN ms, doubled on each failure up to PROBE_DELAY_MAX */
  const PROBE_DELAY_MIN = 60000;
  const PROBE_DELAY_MAX = 600000;
  let _probeDelay = PROBE_DELAY_MIN;
  let _probeAt = 0;
  let _probing = false;

  /**
   * @description Optional: authenticate now (startup check, or to fail fast on wrong credentials).
   * Otherwise the first request authenticates automatically. Joins the authentication in progress, if any.
   *
   * @param {function} callback function(err):void = The `err` is null by default.
   */
  function publicConnection (callback) {
    return sharedConnection(callback, 0, {});
  }

  /**
   * [PRIVATE] Authenticate and initialise the auth token and retreive the endpoint based on the region
   *
   * @param {function} callback function(err):void = The `err` is null by default.
   * @param {Number} originStorage [PRIVATE] index of the storage used when the request started
   * @param {Object} failure [PRIVATE] { statusCode, error } last failure of the request, attached to the returned error if no storage is available
   */
  function connection (callback, originStorage = 0, failure = {}) {
    const arrayArguments = [callback, originStorage, failure];

    if (_config.activeStorage === _config.storages.length) {
      /** Reset the index of the actual storage. The endpoint and token of the last storage are cleared: the next request authenticates on the main storage */
      _config.activeStorage = 0;
      _config.endpoints = {};
      _config.token = '';
      log(`SWIFT Storage | Object Storages are not available`, 'error', { event: 'storage_unavailable', storage: 'swift', ...failureFields(failure) });
      return callback(storageUnavailableError('Object Storages are not available', failure));
    }

    /**
     * Record the failure, then authenticate on the fallback storage.
     * Single storage: no fallback to activate, a single log line and the error is returned at once
     */
    function fallback (message, statusCode, error) {
      failure.statusCode = statusCode;
      failure.error = error;
      const _fields = { storage: 'swift', index: _index, region: _storage.region, ...failureFields(failure) };
      if (_config.storages.length === 1) {
        _config.activeStorage = 0;
        log(`${message} | Storage not available, no fallback storage`, 'error', { event: 'storage_unavailable', ..._fields });
        return callback(storageUnavailableError('Object Storages are not available', failure));
      }
      log(message, 'warning', { event: 'storage_connection_failed', ..._fields });
      activateFallbackStorage(originStorage);
      arrayArguments[1] = _config.activeStorage;
      return connection.apply(null, arrayArguments);
    }
    const _index = _config.activeStorage;
    const _storage = _config.storages[_index];
    const _version = _storagesVersion;
    const _prefix = `SWIFT Storage | Index "${_index}" region "${_storage.region}"`;
    log(`${_prefix} connection...`, 'info', { event: 'storage_connecting', storage: 'swift', index: _index, region: _storage.region });

    /** A synchronous throw of the HTTP client (invalid authUrl...) is a failure of this storage, never a stuck connection */
    let _responded = false;
    try {
      authenticate(_storage, (authFailure, token, endpoints) => {
        _responded = true;
        /** setStorages() was called meanwhile: this result is stale, authenticate on the new storages */
        if (_version !== _storagesVersion) {
          return connection(callback, 0, failure);
        }
        /** A parallel request failed over meanwhile: this token belongs to the previous storage, authenticate on the active one */
        if (_index !== _config.activeStorage) {
          return connection(callback, _config.activeStorage, failure);
        }
        if (authFailure) {
          return fallback(`${_prefix} ${authFailure.message}`, authFailure.statusCode, authFailure.error);
        }
        _config.token = token;
        _config.endpoints = endpoints;
        log(`${_prefix} connected!`, 'info', { event: 'storage_connected', storage: 'swift', index: _index, region: _storage.region });
        return callback(null);
      });
    } catch (err) {
      /** Thrown by the response callback (caller code): not swallowed, never called twice */
      if (_responded === true) {
        throw err;
      }
      return fallback(`${_prefix} Action "connection" ${err.toString()}`, undefined, err);
    }
  }

  /**
   * [PRIVATE] Keystone authentication on a storage, without changing the state of the client
   *
   * @param {Object} storage credentials
   * @param {function} callback function(failure, token, endpoints):void `failure` { message, statusCode, error } is null on success
   */
  function authenticate (storage, callback) {
    const _json = {
      auth : {
        identity : {
          methods  : ['password'],
          password : {
            user : {
              name     : storage.username,
              domain   : { id : 'default' },
              password : storage.password
            }
          }
        }
      }
    };
    if (storage.tenantName) {
      _json.auth.scope = {
        project : {
          domain : {
            id : 'default'
          },
          name : storage.tenantName
        }
      };
    }
    /** An authUrl without protocol ("auth.cloud.ovh.net/v3") would be read as a path and POST the credentials to localhost */
    if (URL.canParse(storage.authUrl) === false) {
      throw new Error(`Invalid authUrl "${storage.authUrl}"`);
    }
    rock.concat({
      url    : `${storage.authUrl}/auth/tokens`,
      method : 'POST',
      json   : true,
      body   : _json,
      timeout: _config.timeout,
      /** The body carries the password: never re-sent to another URL. Keystone answers directly, a 3xx is an authentication failure (failover) */
      followRedirects: false
    }, (err, res, data) => {
      if (err) {
        return callback({ message: `Action "connection" ${err.toString()}`, error: err });
      }
      if (res.statusCode < 200 || res.statusCode >= 300) {
        return callback({ message: `connection failed | Status ${res.statusCode.toString()} | Message: ${res.statusMessage}`, statusCode: res.statusCode });
      }
      /** A malformed auth body (empty, no token, no catalog, no endpoints) is a failure of this storage, never a crash */
      const _catalog = data?.token?.catalog;
      const _serviceCatalog = Array.isArray(_catalog) ? _catalog.find((element) => element?.type === 'object-store') : undefined;
      if (!Array.isArray(_serviceCatalog?.endpoints)) {
        return callback({ message: 'Storage catalog not found', error: new Error('Storage catalog not found') });
      }
      const _endpoints = _serviceCatalog.endpoints.find((element) => {
        const isSameRegion = element?.region?.toLowerCase() === storage.region?.toLowerCase();
        if (storage?.interface) {
          return element?.interface?.toLowerCase() === storage.interface.toLowerCase() && isSameRegion;
        }
        return isSameRegion;
      });
      if (!_endpoints?.url) {
        return callback({ message: 'Storage endpoint not found, invalid region', error: new Error('Storage endpoint not found, invalid region') });
      }
      return callback(null, res.headers['x-subject-token'], _endpoints);
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
    /** An explicit `null`/`undefined` passed as options must not crash the setters below */
    options = options ?? {};
    options.alias = container;
    return request('GET', `/${container}`, options, (err, resp) => {
      if (err) {
        return callback(err);
      }
      if (resp.headers?.['content-type']?.includes('application/json') === true) {
        try {
          resp.body = JSON.parse(resp.body.toString());
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
    /** An explicit `null`/`undefined` passed as options must not crash the setters below */
    options = options ?? {};
    options.alias = container;
    /** Encoded before reading the file: an invalid filename (URIError) is returned to the callback, never thrown by the fs callback */
    const _path = `/${container}/${encodeObjectName(filename)}`;
    /** Is File Path */
    if (Buffer.isBuffer(localPathOrBuffer) === false && isFnStream(localPathOrBuffer) === false) {
      return fs.readFile(localPathOrBuffer, (err, objectBuffer) => {
        if (err){
          return callback(err);
        }
        options.body = objectBuffer;
        return request('PUT', _path, options, callback);
      });
    }
    /** Is a Buffer or a Function returning a ReadStream */
    options.body = localPathOrBuffer;
    return request('PUT', _path, options, callback);
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
    /** Raw bytes ("decompress: false", "accept-encoding: identity") on a copy: the caller's options are not mutated */
    return request('GET', `/${container}/${encodeObjectName(filename)}`, downloadOptions(options, container), callback);
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
    /** An explicit `null`/`undefined` passed as options must not crash the setters below */
    options = options ?? {};
    options.alias = container;
    return request('DELETE', `/${container}/${encodeObjectName(filename)}`, options, callback);
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
    /** An explicit `null`/`undefined` passed as options must not crash the setters below */
    options = options ?? {};
    options.alias = container;
    return request('HEAD', `/${container}/${encodeObjectName(filename)}`, options, callback);
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
    /** An explicit `null`/`undefined` passed as options must not crash the setters below */
    options = options ?? {};
    if (Array.isArray(objects) === false) {
      return callback(new Error('Deleting files: the list of files must be an Array'));
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
    };
    options.defaultQueries = 'bulk-delete';
    options.alias = container;
    return request('POST', `/`, options, (err, resp) => {
      if (err) {
        return callback(err);
      }
      if (resp.headers?.['content-type']?.includes('application/json') === true) {
        try {
          resp.body = JSON.parse(resp.body.toString());
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
    /** An explicit `null`/`undefined` passed as options must not crash the setters below */
    options = options ?? {};
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
    /** An explicit `null`/`undefined` passed as options must not crash the setters below */
    options = options ?? {};
    return request('GET', `/`, options, (err, resp) => {
      if (err) {
        return callback(err);
      }
      if (resp.headers?.['content-type']?.includes('application/json') === true) {
        try {
          resp.body = JSON.parse(resp.body.toString());
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
    /** An explicit `null`/`undefined` passed as options must not crash the setters below */
    options = options ?? {};
    options.alias = container;
    return request('POST', `/${container}/${encodeObjectName(filename)}`, options, callback);
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
    if (callback === undefined) {
      callback = options;
      options = { headers: {}, queries: {}, body: null };
    }
    /** Private state of the request, shared by its retries */
    return sendRequest(method, path, options, callback, { unauthorizedRetry: false, failures: 0, failure: {} });
  }

  /**
   * [PRIVATE] Send the request, reconnect and retry on error/401
   * @param {Object} state { unauthorizedRetry, failures, failure } unauthorizedRetry: true if the request has already been retried after a 401, failures: number of 5xx/network errors, failure: the last one
   */
  function sendRequest (method, path, options, callback, state) {
    /**
     * Not connected (first request, after setStorages, or after a failover): authenticate first, with a single
     * authentication shared by the parallel requests
     */
    if (!_config.endpoints?.url) {
      return sharedConnection((err) => {
        if (err) {
          return callback(err);
        }
        return sendRequest(method, path, options, callback, state);
      }, _config.activeStorage, state.failure);
    }
    /** On a fallback storage: check in the background if the main storage is back */
    if (_config.activeStorage !== 0 && _probing === false && (Date.now() - _probeAt >= _probeDelay || Date.now() < _probeAt)) { /** a clock set back must not postpone the check */
      probeMainStorage();
    }
    const _originStorage = _config.activeStorage;
    const _token = _config.token;

    let _path = path;
    const _isStreamOutput = isFnStream(options?.output);
    /** A response retried on another storage or after a reconnection: its body is never written into the stream `output` of the caller */
    const _isRetried = (res) => res.statusCode >= 500 || (res.statusCode === 401 && state.unauthorizedRetry === false);
    /** A synchronous throw (invalid query, header value...) is returned to the callback, never thrown */
    let _responded = false;
    const _requestCallback = function (err, res, body) {
      _responded = true;
      /** The last failure of this request (not shared: requests run in parallel), attached to the returned error if no storage is available */
      const _failure = state.failure = { statusCode: res?.statusCode, error: err };
      const _fields = { storage: 'swift', index: _config.activeStorage, region: _config.storages[_config.activeStorage]?.region, method, path: _path.split('?')[0] };
      /** Single storage: no fallback to activate, the error is returned at once */
      if ((err || res?.statusCode >= 500) && _config.storages.length === 1) {
        log(`SWIFT Storage | Index "${_config.activeStorage}" region "${_config.storages[_config.activeStorage]?.region}" | ${method} ${_path.split('?')[0]} | Storage not available, no fallback storage | ${failureToString(_failure)}`, 'error', { event: 'storage_unavailable', ..._fields, ...failureFields(_failure) });
        return callback(storageUnavailableError('Object Storages are not available', _failure));
      }
      /** Catch error and retry */
      if ((err || res?.statusCode >= 500)) {
        log(`SWIFT Storage | Index "${_config.activeStorage}" region "${_config.storages[_config.activeStorage]?.region}" | ${method} ${_fields.path} | ${res?.statusCode ?? err?.toString()}`, 'error', { event: 'storage_request_failed', ..._fields, ...failureFields(_failure) });
        activateFallbackStorage(_originStorage);
        /** One attempt per storage, even if a parallel request switched the storage: parallel failovers never send it round again (request storm) */
        if (++state.failures >= _config.storages.length && _config.activeStorage < _config.storages.length) {
          log(`SWIFT Storage | Object Storages are not available`, 'error', { event: 'storage_unavailable', storage: 'swift', ...failureFields(_failure) });
          return callback(storageUnavailableError('Object Storages are not available', _failure));
        }
      } else if (res?.statusCode === 401) {
        /** A single reconnection per request: a second 401 is returned like any 4xx (wrong permissions, not an expired token) */
        if (state.unauthorizedRetry === true) {
          return _isStreamOutput === true ? callback(null, res) : callback(null, { headers : res.headers, statusCode: res.statusCode, body : body });
        }
        state.unauthorizedRetry = true;
      }

      /** If something went wrong: connect again and request again */
      if (err || res?.statusCode >= 500 || res?.statusCode === 401) {
        const _retry = (err) => {
          if (err) {
            return callback(err);
          }
          // Request again with the new Auth token
          return sendRequest(method, path, options, callback, state);
        };
        /**
         * The failover cleared the token: the retry authenticates on the storage just activated, with a single authentication
         * shared by the parallel requests (its failure fails over to the next one). If a parallel request has already
         * authenticated on it, the retry is sent at once
         */
        if (res?.statusCode !== 401) {
          return _retry(null);
        }
        /** The token was already renewed by a parallel request since this one was sent */
        if (_connectionCallbacks === null && _token !== _config.token) {
          return _retry(null);
        }
        if (_connectionCallbacks === null) {
          log(`SWIFT Storage | Index "${_config.activeStorage}" region "${_config.storages[_config.activeStorage]?.region}" try reconnect...`, 'info', { event: 'storage_reconnect', storage: 'swift', index: _config.activeStorage, region: _config.storages[_config.activeStorage]?.region, method, path: _fields.path, status: 401 });
        }
        return sharedConnection(_retry, _originStorage, _failure);
      }
      return _isStreamOutput === true ? callback(null, res) : callback(null, { headers : res.headers, statusCode: res.statusCode, body : body });
    };
    try {
      const _urlParams = getUrlParameters(options?.queries ?? '', options?.defaultQueries ?? '');

      /**
       * Return a bucket name based on an alias and current active storage.
       * If the alias does not exist, the alias is returned as bucket name
       */
      let _body = options?.body;
      const _activeBucket = _config.storages[_config.activeStorage]?.buckets?.[options?.alias] ?? options?.alias;
      if (_activeBucket !== options?.alias) {
        _path = _path.replace(options?.alias, _activeBucket);
        /** The bulk-delete body lists the container of every file, only a String body can be remapped */
        if (_urlParams.includes('bulk-delete') === true && typeof _body === 'string') {
          /** Only the container at the start of each line "alias/object": an object name may contain the alias */
          const _alias = String(options.alias).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          _body = _body.replace(new RegExp(`^${_alias}/`, 'gm'), () => `${_activeBucket}/`);
        }
      }

      const _requestOptions = {
        timeout: _config.timeout,
        output: _isStreamOutput ? finalOutput(options.output, _isRetried) : null, /** Handle Streams */
        /** Rock-req Options: they cannot override the URL, the method, the body or the auth token below (a dropped token would loop on 401) */
        ...(options?.requestOptions ? options?.requestOptions : {}),
        url     : `${_config.endpoints.url}${_path}${_urlParams}`,
        method  : method,
        headers : {
          ...options?.requestOptions?.headers,
          'X-Auth-Token' : _config.token,
          Accept         : 'application/json',
          ...(options?.headers ? options?.headers : {})
        },
        ...(_body ? { body: _body } : {}),
      };
      return _isStreamOutput === true ? rock(_requestOptions, _requestCallback) : rock.concat(_requestOptions, _requestCallback);
    } catch (err) {
      /** Thrown by the callback (caller code): not swallowed, never called twice */
      if (_responded === true) {
        throw err;
      }
      return callback(err);
    }
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
    /** A single storage or a list of storages */
    const _storages = Array.isArray(storages) === true ? storages : [storages];
    /** Every storage is checked: a null fallback would crash on failover, a missing "authUrl" would POST the credentials to localhost */
    for (let i = 0; i < _storages.length; i++) {
      if (typeof _storages[i]?.username !== 'string' || typeof _storages[i]?.password !== 'string' || typeof _storages[i]?.authUrl !== 'string') {
        throw new Error("Swift Storage credentials not correct or missing - did you provide correct credentials?");
      }
    }
    _storagesVersion++;
    _probeDelay = PROBE_DELAY_MIN;
    _config.token = '';
    _config.endpoints = {};
    _config.activeStorage = 0;
    _config.storages = _storages;
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
   * log messages (default logger: the structured fields are not printed)
   *
   * @param {String} msg Message
   * @param {String} level info, warning, error
   * @param {Object} fields flat object of primitives: { event, storage, index, region, method, path, status, code, from, to }
   */
  // eslint-disable-next-line no-unused-vars
  function log(msg, level = 'info', fields) {
    return console.log(level === 'error' ? `🔴 ${msg}` : level === 'warning' ? `🟠 ${msg}` : `🟢 ${msg}`);
  }

  /**
   * Override the log function, it takes three arguments: message, level, fields
   * @param {Function} newLogFunction (message, level, fields) => {} The level can be: `info`, `warning`, `error`. `fields` is a flat object: { event, storage, index, region, method, path, status, code, from, to }
   */
  function setLogFunction (newLogFunction) {
    if (newLogFunction) {
      // eslint-disable-next-line no-func-assign
      log = newLogFunction;
    }
  }

  /** ================ PRIVATE FUNCTION ================= */

  /**
   * Authenticate (first request, explicit connection() or 401). A single authentication at a time: the callers
   * arriving meanwhile wait for the one in progress, and all get its result (the same error if it fails)
   */
  function sharedConnection (callback, originStorage, failure) {
    if (_connectionCallbacks !== null) {
      _connectionCallbacks.push(callback);
      return;
    }
    const _callbacks = _connectionCallbacks = [callback];
    const _done = (err) => {
      _connectionCallbacks = null;
      let _error = null;
      for (let i = 0; i < _callbacks.length; i++) {
        /** An exception of one caller must not strand the other waiting requests: the first one is rethrown after all are called */
        try {
          _callbacks[i](err);
        } catch (e) {
          _error = _error ?? { e };
        }
      }
      if (_error !== null) {
        throw _error.e;
      }
    };
    try {
      connection(_done, originStorage, failure);
    } catch (err) {
      /** Already done: the exception comes from a callback of the caller, it is not swallowed */
      if (_connectionCallbacks !== _callbacks) {
        throw err;
      }
      _done(err);
    }
  }

  /** Switch to the next storage, unless a parallel request already did. The token and endpoint of the failing storage are cleared */
  function activateFallbackStorage(originStorage) {
    if (originStorage === _config.activeStorage && _config.activeStorage + 1 <= _config.storages.length) {
      log(`SWIFT Storage | Activate fallback storage: switch from "${_config.activeStorage}" to "${_config.activeStorage + 1}"`, 'warning', { event: 'storage_fallback', storage: 'swift', from: _config.activeStorage, to: _config.activeStorage + 1 });
      _config.activeStorage += 1;
      _config.token = '';
      _config.endpoints = {};
      /** The main storage has just failed: the first probe is sent after the probe delay */
      _probeAt = Date.now();
    }
  }

  /**
   * Check in the background if the main storage is back: authenticate on it into a temporary state, then HEAD its account.
   * On OVH all regions share a single Keystone: a successful authentication alone does not prove the region is up.
   * On success the next requests use the main storage, the requests in progress finish on the fallback.
   * Never returns an error to a caller and never throws: a failure is logged and doubles the delay of the next probe.
   */
  function probeMainStorage () {
    _probing = true;
    _probeAt = Date.now();
    const _version = _storagesVersion;
    const _from = _config.activeStorage;
    const _storage = _config.storages[0];
    let _done = false;
    const _end = (failure, token, endpoints) => {
      if (_done === true) {
        return;
      }
      _done = true;
      _probing = false;
      /** Discarded if setStorages() was called, or if the state changed meanwhile (an authentication in progress, another failover) */
      if (_version !== _storagesVersion) {
        return;
      }
      if (failure) {
        _probeDelay = Math.min(_probeDelay * 2, PROBE_DELAY_MAX);
        return log(`SWIFT Storage | Index "0" region "${_storage.region}" main storage still not available, next check in ${_probeDelay / 1000}s | ${failure.message}`, 'info', { event: 'storage_main_unavailable', storage: 'swift', index: 0, region: _storage.region, ...failureFields(failure) });
      }
      if (_connectionCallbacks !== null || _config.activeStorage !== _from) {
        return;
      }
      _probeDelay = PROBE_DELAY_MIN;
      _config.activeStorage = 0;
      _config.token = token;
      _config.endpoints = endpoints;
      log(`SWIFT Storage | Main storage available - reconnecting for next requests`, 'info', { event: 'storage_main_restored', storage: 'swift', index: 0, region: _storage.region });
    };
    try {
      authenticate(_storage, (failure, token, endpoints) => {
        if (failure) {
          return _end(failure);
        }
        try {
          rock.concat({ url: endpoints.url, method: 'HEAD', headers: { 'X-Auth-Token': token }, timeout: _config.timeout }, (err, res) => {
            if (err || res.statusCode < 200 || res.statusCode >= 300) {
              return _end({ message: `HEAD account | ${err?.toString() ?? `Status ${res.statusCode}`}`, statusCode: res?.statusCode, error: err });
            }
            return _end(null, token, endpoints);
          });
        } catch (err) {
          _end({ message: err.toString(), error: err });
        }
      });
    } catch (err) {
      _end({ message: err.toString(), error: err });
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

  setStorages(config);

  return {
    connection: publicConnection,
    /** A synchronous throw of these methods (filename with a lone surrogate...) is passed to their callback */
    uploadFile      : catchSyncError(uploadFile),
    downloadFile    : catchSyncError(downloadFile),
    deleteFile      : catchSyncError(deleteFile),
    listFiles       : catchSyncError(listFiles),
    getFileMetadata : catchSyncError(getFileMetadata),
    setFileMetadata : catchSyncError(setFileMetadata),
    setTimeout,
    setStorages,
    getStorages,
    getConfig,
    setLogFunction,
    request         : catchSyncError(request),
    getRockReqDefaults,
    setRockReqDefaults,
    deleteFiles     : catchSyncError(deleteFiles),
    headBucket      : catchSyncError(headBucket),
    listBuckets     : catchSyncError(listBuckets)
  };
};