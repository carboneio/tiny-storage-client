const rock = require('rock-req');
const aws4 = require('aws4');
const URL = require('url').URL;
const crypto = require('crypto');
const fs = require('fs');
const xmlToJson = require('./xmlToJson.js');
const { getUrlParameters, isFnStream } = require('./helper.js');

module.exports = (config) => {

  const _config = {
    /** List of S3 credentials */
    storages       : [],
    /** Request params */
    timeout        : 5000,
    activeStorage  : 0
  };

  let retryReconnectMainStorage = false;

  setConfig(config);
  /**
   * Set a new list of S3 credentials and set the active storage to the first storage on the list
   * @param {Object|Array} newConfig
   */
  function setConfig(newConfig) {
    if (newConfig?.constructor === Object) {
      newConfig = [newConfig];
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
    options.alias = bucket;
    return request('GET', `/${bucket}/${encodeURIComponent(filename)}`, options, callback);
  }

  /**
   * @doc https://docs.aws.amazon.com/AmazonS3/latest/API/API_PutObject.html
   */
  function uploadFile (bucket, filename, localPathOrBuffer, options, callback) {
    if (!callback) {
      callback = options;
      options = {};
    }
    options.alias = bucket;
    const _uploadFileRequest = function (bucket, filename, objectBuffer, options, callback) {
      options.body = objectBuffer;
      options.headers = {
        ...options?.headers
      };
      return request('PUT', `/${bucket}/${encodeURIComponent(filename)}`, options, callback);
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
        _uploadFileRequest(bucket, filename, objectBuffer, options, callback);
      });
    }
    return _uploadFileRequest(bucket, filename, localPathOrBuffer, options, callback);
  }

  /**
   * @doc https://docs.aws.amazon.com/AmazonS3/latest/API/API_DeleteObject.html
   */
  function deleteFile (bucket, filename, options, callback) {
    if (!callback) {
      callback = options;
      options = {};
    }
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
    options.defaultQueries = 'list-type=2';
    options.alias = bucket;
    return request('GET', `/${bucket}`, options, (err, resp) => {
      if (err) {
        return callback(err);
      }
      const _body = resp?.body?.toString();
      if (_body && resp.statusCode === 200) {
        const _regRes = _body?.match(/<ListBucketResult[^<>]*?>([^]*?)<\/ListBucketResult>/);
        resp.body = xmlToJson(_regRes?.[1], { forceArray: ['contents'] });
      }
      return callback(null, resp);
    });
  }

  /**
   * @doc https://docs.aws.amazon.com/AmazonS3/latest/API/API_HeadObject.html
   */
  function getFileMetadata(bucket, filename, options, callback) {
    if (!callback) {
      callback = options;
      options = {};
    }
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
    return request('GET', `/`, options, (err, resp) => {
      if (err) {
        return callback(err);
      }
      const _body = resp?.body?.toString();
      if (_body && resp.statusCode === 200) {
        const _regRes = _body?.match(/<Buckets[^<>]*?>([^]*?)<\/Buckets>/);
        resp.body = xmlToJson(_regRes?.[1], { forceArray: ['bucket'] });
      }
      return callback(null, resp);
    });
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

    options.alias = bucket;
    options["headers"] = {
      'x-amz-copy-source': `/${bucket}/${encodeURIComponent(filename)}`,
      'x-amz-metadata-directive': 'REPLACE',
      ...options.headers
    };

    request('PUT', `/${bucket}/${encodeURIComponent(filename)}`, options, function(err, resp) {
      if (err) {
        return callback(err);
      }
      const _body = resp?.body?.toString();
      if (_body && resp.statusCode === 200) {
        const _regRes = _body?.match(/<CopyObjectResult[^<>]*?>([^]*?)<\/CopyObjectResult>/);
        resp.body = xmlToJson(_regRes?.[1] ?? '');
      }
      return callback(null, resp);
    });
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
    options.alias = bucket;

    let _body = '<Delete>';
    for (let i = 0; i < files.length; i++) {
      _body += `<Object><Key>${files?.[i]?.[options?.fileNameKey] ?? files?.[i]?.name ?? files?.[i]?.key ?? files?.[i]}</Key></Object>`;
    }
    _body += '<Quiet>false</Quiet></Delete>';
    options.body = _body;
    options.headers = {
      ...options?.headers,
      'Content-MD5': getMD5(_body)
    };
    return request('POST', `/${bucket}/?delete`, options, (err, resp) => {
      if (err) {
        return callback(err);
      }
      const _body = resp?.body?.toString();
      if (_body && resp.statusCode === 200) {
        const _regRes = _body?.match(/<DeleteResult[^<>]*?>([^]*?)<\/DeleteResult>/);
        resp.body = xmlToJson(_regRes?.[1], { forceArray: ['deleted', 'error'] });
      }
      return callback(null, resp);
    });
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

    if (!options?.try) { options.try = 0; }

    if (_config.activeStorage >= _config.storages.length || options.try >= _config.storages.length) {
      /** Reset the index of the main storage if any storage are available */
      _config.activeStorage = 0;
      log(`S3 Storage | All storages are not available - switch to the main storage`, 'error');
      return callback(new Error('All S3 storages are not available'));
    } else if (_config.activeStorage !== 0 && options?.requestStorageIndex === undefined && retryReconnectMainStorage === false) {
      /**
       * Retry to reconnect to the main storage if a child storage is active by requesting GET "/": Request "ListBuckets". Notes:
       * - "requestStorageIndex" option is used to request a specific storage, disable the retry and not create an infinite loop of requests into child storages
       * - "retryReconnectMainStorage" global variable is used to request one time and not create SPAM parallele requests to the main storage.
       */
      retryReconnectMainStorage = true;
      request('GET', `/`, { requestStorageIndex: 0 }, function (err, resp) {
        /** If everything is alright, the active storage is reset to the main */
        if (resp?.statusCode === 200) {
          log(`S3 Storage | Main storage available - reconnecting for next requests`);
          _config.activeStorage = 0;
        }
        retryReconnectMainStorage = false;
      });
    }

    /** Get active storage based on an index */
    const _activeStorage = _config.storages[options?.requestStorageIndex ?? _config.activeStorage];
    options.originalStorage = _config.activeStorage;

    /**
     * Return a bucket name based on an alias and current active storage.
     * If the alias does not exist, the alias is returned as bucket name
     */
    const _activeBucket = _activeStorage?.buckets?.[options?.alias] ?? options?.alias;
    let _path = path;
    if (options?.alias !== _activeBucket) {
      _path = _path.replace(options?.alias, _activeBucket);
      /** For copy-ing object with metadatas, the alias must be applied on the URL */
      if (options?.headers?.['x-amz-copy-source']) {
        options.headers['x-amz-copy-source'] = options?.headers?.['x-amz-copy-source'].replace(options?.alias, _activeBucket);
      }
    }

    const _urlParams = getUrlParameters(options?.queries ?? '', options?.defaultQueries ?? '');
    const _requestParams = aws4.sign({
      method: method,
      url: `${_activeStorage.url}${_path}${_urlParams ?? ''}`,
      ...(options?.body ? { body: options?.body } : {}),
      headers: {
        ...(options?.headers ? options?.headers : {})
      },
      timeout: _config.timeout,
      /** Rock-req Options */
      output: isFnStream(options?.output) ? options?.output : null,
      ...(options?.requestOptions ? options?.requestOptions : {}),
      /** REQUIRED FOR AWS4 SIGNATURE */
      service: 's3',
      hostname: _activeStorage.hostname,
      path: `${_path}${_urlParams ?? ''}`,
      region: _activeStorage.region
    }, {
      accessKeyId: _activeStorage.accessKeyId,
      secretAccessKey: _activeStorage.secretAccessKey
    });

    const _requestCallback = function (err, res, body) {
      if ((err || res?.statusCode >= 500 || res?.statusCode === 401) && options?.requestStorageIndex === undefined) {
        /** Protection when requesting storage in parallel, another request may have already switch to a child storage on Error */
        if (options.originalStorage === _config.activeStorage) {
          log(`S3 Storage | Activate fallback storage: switch from "${_config.activeStorage}" to "${_config.activeStorage + 1}" | ${err?.toString() || "Status code: " + res?.statusCode}`, 'warning');
          _config.activeStorage += 1;
          options.try += 1;
        }
        return request(method, path, options, callback);
      } else if (err) {
        return callback(err, res);
      }
      /** If the response is an error as XML and not a stream, the error is parsed as JSON */
      if (res.statusCode >= 400 && res?.headers?.['content-type'] === 'application/xml' && isFnStream(options?.output) === false) {
        body = xmlToJson(body?.toString() ?? '');
      }
      return isFnStream(options?.output) === true ? callback(null, res) : callback(null, { headers : res.headers, statusCode: res.statusCode, body : body });
    };
    return isFnStream(options?.output) === true ? rock(_requestParams, _requestCallback) : rock.concat(_requestParams, _requestCallback);
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

  function getMetadataTotalBytes(header){
    let _str = '';
    for (const key in header) {
      const element = header[key];
      if (key.includes('x-amz-meta-') === true ) {
        _str += key.replace('x-amz-meta-', ''); /** must count the metadata name without "x-amz-meta-" */
        _str += element;
      }
    }
    return Buffer.from(_str).length;
  }

  /** ========= PRIVATE FUNCTIONS ========== */

  /**
   * Used for the 'Content-MD5' header:
   * The base64-encoded 128-bit MD5 digest of the message
   * (without the headers) according to RFC 1864.
   */
  function getMD5 (data) {
    try {
      return crypto.createHash('md5').update(typeof data === 'string' ? Buffer.from(data) : data ).digest('base64');
    } catch(err) {
      log(`S3 Storage | getMD5: ${err.toString()}`, "error");
      return '';
    }
  }

  /**
   * log messages
   *
   * @param {String} msg Message
   * @param {type} type warning, error
   */
  function log(msg, level = '') {
    return console.log(level === 'error' ? `🔴 ${msg}` : level === 'warning' ? `🟠 ${msg}` : `🟢 ${msg}`);
  }

  return {
    downloadFile,
    uploadFile,
    deleteFile,
    deleteFiles,
    listFiles,
    headBucket,
    listBuckets,
    getFileMetadata,
    setFileMetadata,
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