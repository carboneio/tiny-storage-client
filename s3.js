const rock = require('rock-req');
const aws4 = require('aws4');
const URL = require('url').URL;
const crypto = require('crypto');
const fs = require('fs');
const xmlToJson = require('./xmlToJson.js');
const { getUrlParameters, isFnStream, escapeXml, failureToString, failureFields, storageUnavailableError, downloadOptions, catchSyncError, finalOutput } = require('./helper.js');

/** xmlToJson options of an S3 "Error" response: these values are returned as written in the XML */
const XML_ERROR_OPTIONS = { forceString: ['key', 'bucketname', 'requestid', 'hostid'] };

module.exports = (config) => {

  const _config = {
    /** List of S3 credentials */
    storages       : [],
    /** Request params */
    timeout        : 60000, // ms, inactivity timeout (like botocore read timeout)
    activeStorage  : 0
  };

  let retryReconnectMainStorage = false;
  /** Incremented each time the main storage is restored by the health check */
  let mainStorageRestored = 0;

  setConfig(config);
  /**
   * Set a new list of S3 credentials and set the active storage to the first storage on the list
   * @param {Object|Array} newConfig
   */
  function setConfig(newConfig) {
    if (newConfig?.constructor === Object) {
      newConfig = [newConfig];
    }
    if (Array.isArray(newConfig) === false) {
      throw new Error("S3 Storage credentials not correct or missing - did you provide correct credentials?");
    }

    for (let i = 0; i < newConfig.length; i++) {
      const _auth = newConfig[i];
      if (typeof _auth?.accessKeyId !== 'string' || typeof _auth?.secretAccessKey !== 'string' || typeof _auth?.url !== 'string' || typeof _auth?.region !== 'string') {
        throw new Error("S3 Storage credentials not correct or missing - did you provide correct credentials?");
      }
      /** If the URL has no protocol, HTTPS is used by default */
      if (_auth.url?.startsWith('https://') === false && _auth.url?.startsWith('http://') === false) {
        _auth.url = 'https://' + _auth.url;
      }
      if (_auth.url?.endsWith('/') === true) {
        _auth.url = _auth.url.replace(/\/$/, "");
      }
      if (URL.canParse(_auth.url) === false) {
        throw new Error("S3 Storage credentials not correct or missing - did you provide correct credentials?");
      }
      /** Save the hostname for AWS4 signature */
      _auth.hostname = new URL(_auth.url).hostname;
    }
    _config.storages        = [...newConfig];
    _config.activeStorage   = 0;
  }

  /**
   * Set HTTP requests timeout
   * @param {Number} timeout
   */
  function setTimeout(timeout) {
    _config.timeout = timeout;
  }

  /**
   * Return S3 configurations requests and list of credentials
   * @returns
   */
  function getConfig() {
    return _config;
  }

  /**
   * @doc https://docs.aws.amazon.com/AmazonS3/latest/API/API_GetObject.html
   */
  function downloadFile (bucket, filename, options, callback) {
    if (!callback) {
      callback = options;
      options = {};
    }
    /** Raw bytes ("decompress: false", "accept-encoding: identity") on a copy: the caller's options are not mutated */
    return request('GET', `/${bucket}/${encodeURIComponent(filename)}`, downloadOptions(options, bucket), callback);
  }

  /**
   * @doc https://docs.aws.amazon.com/AmazonS3/latest/API/API_PutObject.html
   */
  function uploadFile (bucket, filename, localPathOrBuffer, options, callback) {
    if (!callback) {
      callback = options;
      options = {};
    }
    /** An explicit `null`/`undefined` passed as options must not crash the setters below */
    options = options ?? {};
    options.alias = bucket;
    /** Encoded before reading the file: an invalid filename (URIError) is returned to the callback, never thrown by the fs callback */
    const _path = `/${bucket}/${encodeURIComponent(filename)}`;
    const _uploadFileRequest = function (objectBuffer) {
      options.body = objectBuffer;
      options.headers = {
        ...options?.headers
      };
      return request('PUT', _path, options, callback);
    };
    /**
     * AWS4 does not support computing signature with a Stream
     * https://github.com/mhart/aws4/issues/43
     * The file buffer must be read.
     */
    if (Buffer.isBuffer(localPathOrBuffer) === false) {
      return fs.readFile(localPathOrBuffer, (err, objectBuffer) => {
        if (err){
        return callback(err);
        }
        _uploadFileRequest(objectBuffer);
      });
    }
    return _uploadFileRequest(localPathOrBuffer);
  }

  /**
   * @doc https://docs.aws.amazon.com/AmazonS3/latest/API/API_DeleteObject.html
   */
  function deleteFile (bucket, filename, options, callback) {
    if (!callback) {
      callback = options;
      options = {};
    }
    /** An explicit `null`/`undefined` passed as options must not crash the setters below */
    options = options ?? {};
    options.alias = bucket;
    return request('DELETE', `/${bucket}/${encodeURIComponent(filename)}`, options, callback);
  }


  /**
   * @doc https://docs.aws.amazon.com/AmazonS3/latest/API/API_ListObjectsV2.html
   *
   *  Query parameters for pagination/filter:
   *  - "max-keys=3&" : Sets the maximum number of keys returned in the response. By default the action returns up to 1,000 key names. The response might contain fewer keys but will never contain more.
   *  - "prefix=E&"   : Limits the response to keys that begin with the specified prefix.
   *  - "start-after=": StartAfter is where you want Amazon S3 to start listing from. Amazon S3 starts listing after this specified key. StartAfter can be any key in the bucket.
   */
  function listFiles(bucket, options, callback) {
    if (!callback) {
      callback = options;
      options = {};
    }
    /** An explicit `null`/`undefined` passed as options must not crash the setters below */
    options = options ?? {};
    options.defaultQueries = 'list-type=2';
    options.alias = bucket;
    return request('GET', `/${bucket}`, options, parseXmlResponse('listFiles', 'ListBucketResult', { forceArray: ['contents'], forceString: ['key', 'name', 'prefix', 'delimiter', 'startafter', 'continuationtoken', 'nextcontinuationtoken'] }, callback));
  }

  /**
   * @doc https://docs.aws.amazon.com/AmazonS3/latest/API/API_HeadObject.html
   */
  function getFileMetadata(bucket, filename, options, callback) {
    if (!callback) {
      callback = options;
      options = {};
    }
    /** An explicit `null`/`undefined` passed as options must not crash the setters below */
    options = options ?? {};
    options.alias = bucket;
    return request('HEAD', `/${bucket}/${encodeURIComponent(filename)}`, options, callback);
  }

  /**
   * HEAD Bucket: This action is useful to determine if a bucket exists and you have permission to access it thanks to the Status code. A message body is not included, so you cannot determine the exception beyond these error codes.
   * - The action returns a 200 OK if the bucket exists and you have permission to access it.
   * - If the bucket does not exist or you do not have permission to access it, the HEAD request returns a generic 400 Bad Request, 403 Forbidden or 404 Not Found code.
   *
   * @doc https://docs.aws.amazon.com/AmazonS3/latest/API/API_HeadBucket.html
   */
  function headBucket(bucket, options, callback) {
    if (!callback) {
      callback = options;
      options = {};
    }
    /** An explicit `null`/`undefined` passed as options must not crash the setters below */
    options = options ?? {};
    options.alias = bucket;
    return request('HEAD', `/${bucket}`, options, callback);
  }

  /**
   * Returns a list of all buckets owned by the authenticated sender of the request. To use this operation, you must have the s3:ListAllMyBuckets permission.
   * @doc https://docs.aws.amazon.com/AmazonS3/latest/API/API_ListBuckets.html
   */
  function listBuckets(options, callback) {
    if (!callback) {
      callback = options;
      options = {};
    }
    /** An explicit `null`/`undefined` passed as options must not crash the setters below */
    options = options ?? {};
    return request('GET', `/`, options, parseXmlResponse('listBuckets', 'Buckets', { forceArray: ['bucket'], forceString: ['name'] }, callback, true));
  }

  /**
   * @doc https://docs.aws.amazon.com/AmazonS3/latest/API/API_CopyObject.html
   *
   * Set metadatas by copying the file, metadata are replaced with metadata provided in the request. Set the header "x-amz-metadata-directive":"COPY" to copy metadata from the source object.
   * Custom metadata must start with "x-amz-meta-", followed by a name to create a custom key.
   * Metadata can be as large as 2 KB total. To calculate the total size of user-defined metadata,
   * sum the number of bytes in the UTF-8 encoding for each key and value. Both keys and their values must conform to US-ASCII standards.
   */
  function setFileMetadata(bucket, filename, options, callback) {

    if (!callback) {
      callback = options;
      options = {};
    }
    /** An explicit `null`/`undefined` passed as options must not crash the setters below */
    options = options ?? {};

    options.alias = bucket;
    options["headers"] = {
      'x-amz-copy-source': `/${bucket}/${encodeURIComponent(filename)}`,
      'x-amz-metadata-directive': 'REPLACE',
      ...options.headers
    };

    request('PUT', `/${bucket}/${encodeURIComponent(filename)}`, options, parseXmlResponse('setFileMetadata', 'CopyObjectResult', {}, callback));
  }

  /**
   * BULK DELETE 1000 files maximum
   * @argument {String} bucket The bucket name
   * @argument {Array} files List of files, it can be:
   *                 - A list of String, each string is the filename: ["file1.png", "file2.docx"]
   *                 - Or a list of objects with `key` as attribute for the filename: [{"key": "file1.png"}, {"key": "file2.docx"}]
   *                 - Or a list of objects with `name` as attribute for the filename: [{"name": "file1.png"}, {"name": "file2.docx"}]
   *                 - Or a list of objects with a custom key for filenames, you must define `fileNameKey` as option (third argument)
   * @argument {Object} options [OPTIONAL]: { headers: {}, queries: {}, fileNameKey: '' }
   * @argument {Function} callback (err, {statusCode, body, header}) => { }
   * @documentation https://docs.aws.amazon.com/AmazonS3/latest/API/API_DeleteObjects.html#API_DeleteObjects_Examples
   */
  function deleteFiles (bucket, files, options, callback) {
    if (!callback) {
      callback = options;
      options = {};
    }
    /** An explicit `null`/`undefined` passed as options must not crash the setters below */
    options = options ?? {};
    options.alias = bucket;

    if (Array.isArray(files) === false) {
      return callback(new Error('Deleting files: the list of files must be an Array'));
    }
    /** S3 rejects a DeleteObjects request of more than 1000 objects with a "MalformedXML" error */
    if (files.length > 1000) {
      return callback(new Error('Deleting files: 1000 files maximum per request'));
    }

    let _body = '<Delete>';
    for (let i = 0; i < files.length; i++) {
      _body += `<Object><Key>${escapeXml(files?.[i]?.[options?.fileNameKey] ?? files?.[i]?.name ?? files?.[i]?.key ?? files?.[i])}</Key></Object>`;
    }
    _body += '<Quiet>false</Quiet></Delete>';
    options.body = _body;
    options.headers = {
      ...options?.headers,
      'Content-MD5': getMD5(_body)
    };
    return request('POST', `/${bucket}/?delete`, options, parseXmlResponse('deleteFiles', 'DeleteResult', { forceArray: ['deleted', 'error'], forceString: ['key', 'versionid', 'deletemarkerversionid'] }, callback));
  }

  function setRockReqDefaults (newDefaults) {
    if (newDefaults && typeof newDefaults === 'object') {
      Object.assign(rock.defaults, newDefaults);
    }
  }

  function getRockReqDefaults() {
    return rock.defaults;
  }

  /**
   *
   * @param {String} method POST/GET/HEAD/DELETE
   * @param {String} path Path to a ressource
   * @param {Object} options { headers: {}, body: "Buffer", queries: {},  defaultQueries: '' }
   * @param {Function} callback function(err, resp):void = The `err` is null by default. `resp` is the HTTP response including: { statusCode: 200, headers: {}, body: "Buffer/Object/String" }
   * @returns
   */
  function request (method, path, options, callback) {
    /**
     * Fallback tracking is private to this request (never written on the caller's options):
     * a reused options object must start a new request from scratch
     */
    return sendRequest(method, path, options ?? {}, callback, { try: 0, lastFailure: undefined, originalStorage: undefined, restoredRetry: false });
  }

  /**
   * [PRIVATE] Send the request, and retry on the fallback storages
   * @param {Object} state { try, lastFailure, originalStorage, restoredRetry } private state of the request, shared by its retries (restoredRetry: the main storage restored meanwhile already spared an attempt)
   */
  function sendRequest (method, path, options, callback, state) {

    /** A "requestStorageIndex" pointing to nothing would leave the storage undefined when signing the request */
    if (options?.requestStorageIndex !== undefined
      && (Number.isInteger(options.requestStorageIndex) === false
        || options.requestStorageIndex < 0
        || options.requestStorageIndex >= _config.storages.length)) {
      log(`S3 Storage | The requested storage index "${options.requestStorageIndex}" does not exist`, 'error', { event: 'storage_index_invalid', storage: 's3', index: Number(options.requestStorageIndex) });
      return callback(new Error(`S3 storage index "${options.requestStorageIndex}" does not exist`));
    }

    if (_config.activeStorage >= _config.storages.length || state.try >= _config.storages.length) {
      /** Reset the index of the main storage if any storage are available */
      _config.activeStorage = 0;
      log(`S3 Storage | All storages are not available - switch to the main storage`, 'error', { event: 'storage_unavailable', storage: 's3', ...failureFields(state.lastFailure) });
      return callback(storageUnavailableError('All S3 storages are not available', state.lastFailure));
    } else if (_config.activeStorage !== 0 && options?.requestStorageIndex === undefined && retryReconnectMainStorage === false) {
      /**
       * Retry to reconnect to the main storage if a child storage is active by requesting GET "/": Request "ListBuckets". Notes:
       * - "requestStorageIndex" option is used to request a specific storage, disable the retry and not create an infinite loop of requests into child storages
       * - "retryReconnectMainStorage" global variable is used to request one time and not create SPAM parallele requests to the main storage.
       */
      retryReconnectMainStorage = true;
      request('GET', `/`, { requestStorageIndex: 0 }, function (err, resp) {
        /**
         * The main storage is back if it answers like a storage that would serve the requests: the same rule as the
         * failover (network error, 5xx or 401 = not available). A 403 (credentials scoped to a bucket, without the
         * "s3:ListAllMyBuckets" permission) or a 404 is an answer of a healthy storage.
         */
        if (!err && resp?.statusCode < 500 && resp.statusCode !== 401) {
          log(`S3 Storage | Main storage available - reconnecting for next requests`, 'info', { event: 'storage_main_restored', storage: 's3', index: 0, region: _config.storages[0]?.region });
          _config.activeStorage = 0;
          mainStorageRestored++;
        }
        retryReconnectMainStorage = false;
      });
    }

    /** Get active storage based on an index */
    const _activeStorage = _config.storages[options?.requestStorageIndex ?? _config.activeStorage];
    state.originalStorage = _config.activeStorage;
    const _mainStorageRestored = mainStorageRestored;

    /**
     * Return a bucket name based on an alias and current active storage.
     * If the alias does not exist, the alias is returned as bucket name
     */
    const _activeBucket = _activeStorage?.buckets?.[options?.alias] ?? options?.alias;
    let _path = path;
    const _headers = {
      ...options?.requestOptions?.headers,
      ...(options?.headers ? options?.headers : {})
    };
    if (options?.alias !== _activeBucket) {
      _path = _path.replace(options?.alias, _activeBucket);
      /** For copy-ing object with metadatas, the alias must be applied on the URL. On a copy: the next attempt (fallback) starts from the alias */
      if (_headers['x-amz-copy-source']) {
        _headers['x-amz-copy-source'] = _headers['x-amz-copy-source'].replace(options?.alias, _activeBucket);
      }
    }

    const _isStreamOutput = isFnStream(options?.output);
    /** A response failing over to the next storage, its body is never written into the stream `output` of the caller */
    const _isFailure = (res) => (res?.statusCode >= 500 || res?.statusCode === 401) && options?.requestStorageIndex === undefined;
    /** A synchronous throw (invalid query, header value...) is returned to the callback, never thrown */
    let _responded = false;

    const _requestCallback = function (err, res, body) {
      _responded = true;
      if ((err && options?.requestStorageIndex === undefined) || _isFailure(res)) {
        /** The last failure of this request (not shared: requests run in parallel), attached to the returned error if no storage is available */
        state.lastFailure = { statusCode: res?.statusCode, error: err };
        const _fields = { storage: 's3', index: _config.activeStorage, region: _activeStorage.region, method, path: _path.split('?')[0], ...failureFields(state.lastFailure) };
        /** Single storage: no fallback to activate, the error is returned at once */
        if (_config.storages.length === 1) {
          log(`S3 Storage | ${method} ${_path.split('?')[0]} | Storage not available, no fallback storage | ${failureToString(state.lastFailure)}`, 'error', { event: 'storage_unavailable', ..._fields });
          return callback(storageUnavailableError('All S3 storages are not available', state.lastFailure));
        }
        /** Protection when requesting storage in parallel, another request may have already switch to a child storage on Error */
        if (state.originalStorage === _config.activeStorage) {
          log(`S3 Storage | Activate fallback storage: switch from "${_config.activeStorage}" to "${_config.activeStorage + 1}" | ${failureToString(state.lastFailure)}`, 'warning', { event: 'storage_fallback', ..._fields, from: _config.activeStorage, to: _config.activeStorage + 1 });
          _config.activeStorage += 1;
        }
        /**
         * Every failed attempt counts, even if a parallel request switched the storage: one attempt per storage, parallel
         * failovers never send it round the storages again (request storm). Unless the main storage was restored meanwhile,
         * once per request: a flapping main storage (health check OK, requests failing) never makes it loop
         */
        if (_mainStorageRestored === mainStorageRestored || state.restoredRetry === true) {
          state.try += 1;
        } else {
          state.restoredRetry = true;
        }
        return sendRequest(method, path, options, callback, state);
      } else if (err) {
        return callback(err, res);
      }
      /** If the response is an error as XML and not a stream, the error is parsed as JSON. The content type may carry parameters: "application/xml; charset=utf-8" */
      if (res.statusCode >= 400 && res?.headers?.['content-type']?.startsWith('application/xml') === true && _isStreamOutput === false) {
        body = xmlToJson(body?.toString() ?? '', XML_ERROR_OPTIONS);
      }
      return _isStreamOutput === true ? callback(null, res) : callback(null, { headers : res.headers, statusCode: res.statusCode, body : body });
    };
    try {
      const _urlParams = getUrlParameters(options?.queries ?? '', options?.defaultQueries ?? '');
      const _pathWithParams = `${_path}${_urlParams ?? ''}`;
      const _requestParams = aws4.sign({
        timeout: _config.timeout,
        output: _isStreamOutput ? finalOutput(options.output, _isFailure) : null,
        /** Rock-req Options: they cannot override the URL, the method, the body or the signed headers below */
        ...(options?.requestOptions ? options?.requestOptions : {}),
        method: method,
        url: `${_activeStorage.url}${_pathWithParams}`,
        ...(options?.body ? { body: options?.body } : {}),
        headers: _headers,
        /** REQUIRED FOR AWS4 SIGNATURE */
        service: 's3',
        hostname: _activeStorage.hostname,
        path: _pathWithParams,
        region: _activeStorage.region
      }, {
        accessKeyId: _activeStorage.accessKeyId,
        secretAccessKey: _activeStorage.secretAccessKey
      });
      return _isStreamOutput === true ? rock(_requestParams, _requestCallback) : rock.concat(_requestParams, _requestCallback);
    } catch (err) {
      /** Thrown by the callback (caller code): not swallowed, never called twice */
      if (_responded === true) {
        throw err;
      }
      return callback(err);
    }
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

  function getMetadataTotalBytes(header){
    let _str = '';
    for (const key in header) {
      const element = header[key];
      if (key.includes('x-amz-meta-') === true ) {
        _str += key.replace('x-amz-meta-', ''); /** must count the metadata name without "x-amz-meta-" */
        _str += element;
      }
    }
    return Buffer.byteLength(_str);
  }

  /** ========= PRIVATE FUNCTIONS ========== */

  /**
   * Return the callback of a request whose body is XML: on a 200, the content of `<rootTag>` is converted to JSON.
   * A 200 without a complete `<rootTag>` (empty, cut, proxy page) returns an error with the response. An "Error"
   * embedded in the 200 is parsed like a 4xx error, the caller reads `resp.body.error.code` and retries.
   * @doc https://docs.aws.amazon.com/AmazonS3/latest/API/API_CopyObject.html "the error response is embedded in the 200 OK response"
   *
   * @param {String} action name of the function, for the error message
   * @param {String} rootTag XML element wrapping the result, such as "ListBucketResult"
   * @param {Object} options xmlToJson options
   * @param {Function} callback (err, resp) => {}
   * @param {Boolean} [isEmptyRootValid] true if a self-closing `<rootTag/>` is a valid empty result: "<Buckets/>" is
   *                  written by Garage and LocalStack for an account without any bucket
   * @returns {Function} (err, resp) => {} the callback for `request`
   */
  function parseXmlResponse (action, rootTag, options, callback, isEmptyRootValid) {
    const _closingTag = `</${rootTag}>`;
    const _openingTag = `<${rootTag}(?:\\s[^<>]*?)?`;
    const _rootTagRegExp = new RegExp(`${_openingTag}(?:${isEmptyRootValid === true ? '\\/>|' : ''}>([^]*?)<\\/${rootTag}>)`);
    const _emptyRootTagRegExp = isEmptyRootValid === true ? new RegExp(`${_openingTag}\\/>`) : null;
    return function (err, resp) {
      if (err) {
        return callback(err);
      }
      /** With a stream `output`, the raw response is returned and has no body */
      if (resp.statusCode === 200 && resp.body !== undefined) {
        const _body = resp.body.toString();
        /**
         * Searched up to the last closing tag only: linear time. On a body of opening tags without closing tag
         * (hostile or cut), the lazy `([^]*?)` would scan the rest of the body from each opening tag (quadratic)
         */
        const _end = _body.lastIndexOf(_closingTag);
        const _regRes = _end !== -1 ? _body.slice(0, _end + _closingTag.length).match(_rootTagRegExp) : (_emptyRootTagRegExp?.exec(_body) ?? null);
        if (!_regRes) {
          if (/<Error[\s>]/.test(_body) === true) {
            resp.body = xmlToJson(_body, XML_ERROR_OPTIONS);
          }
          const _code = resp.body.error?.code;
          return callback(new Error(`S3 ${action} | Invalid response: "${rootTag}" not found in the body${_code ? ` (${_code})` : ''}`), resp);
        }
        resp.body = xmlToJson(_regRes[1] ?? '', options);
      }
      return callback(null, resp);
    };
  }

  /**
   * Used for the 'Content-MD5' header:
   * The base64-encoded 128-bit MD5 digest of the message
   * (without the headers) according to RFC 1864.
   */
  function getMD5 (data) {
    try {
      /** `update` accepts a string directly (utf8), converting it to a Buffer first only copies it twice. */
      return crypto.createHash('md5').update(data).digest('base64');
    } catch(err) {
      log(`S3 Storage | getMD5: ${err.toString()}`, 'error', { event: 'getmd5_error', storage: 's3', code: err?.code });
      return '';
    }
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

  /** A synchronous throw of these methods (filename with a lone surrogate...) is passed to their callback */
  return {
    downloadFile    : catchSyncError(downloadFile),
    uploadFile      : catchSyncError(uploadFile),
    deleteFile      : catchSyncError(deleteFile),
    deleteFiles     : catchSyncError(deleteFiles),
    listFiles       : catchSyncError(listFiles),
    headBucket      : catchSyncError(headBucket),
    listBuckets     : catchSyncError(listBuckets),
    getFileMetadata : catchSyncError(getFileMetadata),
    setFileMetadata : catchSyncError(setFileMetadata),
    request         : catchSyncError(request),
    setTimeout,
    getConfig,
    setConfig,
    xmlToJson,
    setLogFunction,
    getMetadataTotalBytes,
    setRockReqDefaults,
    getRockReqDefaults
  };
};