const get = require('simple-get');
const aws4 = require('aws4');
const crypto = require('crypto');
const fs = require('fs');
const xmlToJson = require('./xmltoJson.js')

/**
 * TODO
 * - [x] Bulk delete
 * - [x] Transform XML to JSON on error / when fetching a list of objects / when delete response
 * - [x] Test and improve list objects (query params)
 * - [x] Test headBucket > usefull to know the S3 status/connexion
 * - [ ] Test unitaires
 * - [ ] Change Region on error 500 & read only
 * - [ ] Change Region on Timeout & read only
 */

let _config = {
  /** List of S3 credentials */
  storages      : [],
  /** Request params */
  timeout        : 5000,
  activeStorage  : 0,
}

/**
 * @doc https://docs.aws.amazon.com/AmazonS3/latest/API/API_GetObject.html
 */
function downloadFile (bucket, filename, options, callback) {
  if (!callback) {
    callback = options;
    options = {};
  }
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
  const _uploadFileRequest = function (bucket, filename, objectBuffer, options, callback) {
    options.body = objectBuffer;
    options.headers = {
      ...options?.headers
    }
    return request('PUT', `/${bucket}/${encodeURIComponent(filename)}`, options, callback);
  }
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
  return request('GET', `/${bucket}`, options, (err, resp) => {
    if (err) {
      return callback(err);
    }
    const _body = resp?.body?.toString();
    if (_body) {
      let _regRes = _body?.match(/<ListBucketResult[^<>]*?>([^]*?)<\/ListBucketResult>/);
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
  return request('HEAD', `/${bucket}/${encodeURIComponent(filename)}`, options, callback);
}

/**
 * HEAD Bucket: This action is useful to determine if a bucket exists and you have permission to access it thanks to the Status code. A message body is not included, so you cannot determine the exception beyond these error codes.
 * - The action returns a 200 OK if the bucket exists and you have permission to access it.
 * - If the bucket does not exist or you do not have permission to access it, the HEAD request returns a generic 400 Bad Request, 403 Forbidden or 404 Not Found code.
 *
 * @doc https://docs.aws.amazon.com/AmazonS3/latest/API/API_HeadBucket.html
 */
function headBucket(bucket, callback) {
  return request('HEAD', `/${bucket}`, {}, callback);
}

/**
 * @doc https://docs.aws.amazon.com/AmazonS3/latest/API/API_CopyObject.html
 *
 * Copy an existing file to edit metadatas.
 * Custom metadata must start with "x-amz-meta-", followed by a name to create a custom key.
 * Metadata can be as large as 2 KB total. To calculate the total size of user-defined metadata,
 * sum the number of bytes in the UTF-8 encoding for each key and value. Both keys and their values must conform to US-ASCII standards.
 */
function setFileMetadata(bucket, filename, options, callback) {
  if (!callback) {
    callback = options;
    options = {};
  }
  getFileMetadata(bucket, filename, (err, resp) => {
    if (err) {
      return callback(err);
    }
    /**
     * TODO: verify Metadata size lower or equal to 2KB maximum
     */
    options["headers"] = {
      ...resp.headers,
      'x-amz-copy-source': `/${bucket}/${encodeURIComponent(filename)}`,
      'x-amz-metadata-directive': 'REPLACE',
      ...options.headers
    }
    request('PUT', `/${bucket}/${encodeURIComponent(filename)}`, options, callback);
  })
}

/**
 * BULK DELETE 1000 files maximum
 * @documentation https://docs.aws.amazon.com/AmazonS3/latest/API/API_DeleteObjects.html#API_DeleteObjects_Examples
 */
function deleteFiles (bucket, files, options, callback) {
  if (!callback) {
    callback = options;
    options = {};
  }

  let _body = '<Delete>';
  for (let i = 0; i < files.length; i++) {
    _body += `<Object><Key>${files?.[i]?.name ?? files?.[i]}</Key></Object>`;
  }
  _body += '<Quiet>true</Quiet></Delete>';
  options.body = _body;
  options.headers = {
    ...options?.headers,
    'Content-MD5': getMD5(_body)
  }
  return request('POST', `/${bucket}/?delete`, options, callback);
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

  if (_config.activeStorage >= _config.storages.length) {
    /** Reset the index of the main storage if any storage are available */
    _config.activeStorage = 0;
    console.log(`Object Storages are not available 🚩`, 'error');
    return callback(new Error('Object Storages are not available'));
  } else if (_config.activeStorage !== 0 && options?.checkMainStorageStatus !== true ) {
    /**
     * If a child storage is active, the main storage is requested to reconnect automatically if available
     * GET "/": Request "ListBuckets"
     * "checkMainStorageStatus" option is used to not create an infinite loop of requests.
     */
    return request('GET', `/`, { checkMainStorageStatus: true }, function (err, resp) {
      if (err) {
        console.log(err);
      }
      if (resp.statusCode === 200) {
        /** If everything is alright, the active storage is reset to the main */
        _config.activeStorage = 0;
      }
    });
  }

  const _activeStorage = _config.storages[options?.checkMainStorageStatus === true ? 0 : _config.activeStorage];

  const _urlParams = getUrlParameters(options?.queries ?? '', options?.defaultQueries ?? '');
  const _requestParams = aws4.sign({
    method: method,
    url: `https://${_activeStorage.url}${path}${_urlParams ?? ''}`,
    ...(options?.body ? { body: options?.body } : {}),
    headers: {
      ...(options?.headers ? options?.headers : {})
    },
    timeout: _config.timeout,
    /** REQUIRED FOR AWS4 SIGNATURE */
    service: 's3',
    hostname: _activeStorage.url,
    path: `${path}${_urlParams ?? ''}`,
    region: _activeStorage.region,
    protocol: 'https:'
  }, {
    accessKeyId: _activeStorage.accessKeyId,
    secretAccessKey: _activeStorage.secretAccessKey
  })

  const _requestCallback = function (err, res, body) {
    if (err) {
      return callback(err, res);
    }
    if (res.statusCode >= 500 && options?.checkMainStorageStatus !== true) {
      console.log(`S3 Storage - Activate Fallback Storage index "${_config.activeStorage}" 🚩`);
      _config.activeStorage += 1;
      return request(method, path, options, callback);
    }
    if (res.statusCode >= 400 && res?.headers?.['content-type'] === 'application/xml') {
      if (options?.stream === true) {
        return streamToString(res, (err, bodyErrorString) => {
          if (err) {
            return callback(err);
          }
          callback(null, { headers : res.headers, statusCode: res.statusCode, body : xmlToJson(bodyErrorString) });
        });
      }
      body = xmlToJson(body?.toString() ?? '');
    }
    return options?.stream === true ? callback(null, res) : callback(null, { headers : res.headers, statusCode: res.statusCode, body : body });
  }
  return options?.stream === true ? get(_requestParams, _requestCallback) : get.concat(_requestParams, _requestCallback);
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
 * Set a new list of S3 credentials and set the active storage to the first storage on the list
 * @param {Object|Array} newConfig
 */
function setConfig(newConfig) {
  if (newConfig?.constructor === Object) {
    newConfig = [newConfig];
  }

  for (let i = 0; i < newConfig.length; i++) {
    const _auth = newConfig[i];
    if (!_auth?.accessKeyId || !_auth?.secretAccessKey || !_auth?.url || !_auth?.region) {
      throw new Error("S3 Storage credentials not correct or missing - did you provide correct credentials?")
    }
  }

  _config.storages        = [...newConfig];
  _config.accessKeyId     = _config.storages[0].accessKeyId;
  _config.secretAccessKey = _config.storages[0].secretAccessKey;
  _config.region          = _config.storages[0].region;
  _config.url             = _config.storages[0].url;
  _config.activeStorage   = 0;
}

module.exports = (config) => {
  setConfig(config);
  return {
    downloadFile,
    uploadFile,
    deleteFile,
    deleteFiles,
    listFiles,
    headBucket,
    getFileMetadata,
    setFileMetadata,
    setTimeout,
    getConfig,
    setConfig,
    xmlToJson
  }
}

/**
 * Convert a stream to a string
 * @param {Stream} stream
 * @param {Function} callback function(err, result):void = The `err` is null by default. `result` is a String
 */
function streamToString (stream, callback) {
  const chunks = [];

  stream.on('error', (err) => callback(err));
  stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
  stream.on('end', () => callback(null, Buffer.concat(chunks).toString('utf8')));
}

/**
 * Used for the 'Content-MD5' header:
 * The base64-encoded 128-bit MD5 digest of the message
 * (without the headers) according to RFC 1864.
 */
function getMD5 (data) {
  try {
    return crypto.createHash('md5').update(typeof data === 'string' ? Buffer.from(data) : data ).digest('base64');
  } catch(err) {
    console.log(`Error - S3 getMD5: ${err.toString()}`);
    return '';
  }
}

/**
 * Convert an object of queries into a concatenated string of URL parameters.
 * @param {Object|String} queries
 * @param {String} defaultQueries
 * @returns {String} URL parameters
 */
function getUrlParameters (queries, defaultQueries) {
  let _queries = '';

  if (defaultQueries) {
    _queries += defaultQueries + '&';
  }

  if (queries && typeof queries === 'string') {
    _queries += queries;
  } else if (queries && typeof queries === "object") {
    const _queriesEntries = Object.keys(queries);
    const _totalQueries = _queriesEntries.length;
    for (let i = 0; i < _totalQueries; i++) {
      _queries += `${_queriesEntries[i]}=${encodeURIComponent(queries[_queriesEntries[i]])}`
      if (i + 1 !== _totalQueries) {
        _queries += '&'
      }
    }
  }
  return _queries ? '?' + _queries : '';
}