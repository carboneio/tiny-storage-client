const get = require('simple-get');
const aws4 = require('aws4');
const crypto = require('crypto');
const fs = require('fs');

/**
 * TODO
 * - [x] Bulk delete
 * - [x] Transform XML to JSON on error / when fetching a list of objects / when delete response
 * - [x] Test and improve list objects (query params)
 * - [ ] Change Region on error 500 & read only
 * - [ ] Change Region on Timeout & read only
 * - [ ] Test unitaires
 */

let _config = {
  url            : '',
  region         : '',
  timeout        : 5000
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
function getFileMetadata(bucket, filename, callback) {
  return request('HEAD', `/${bucket}/${encodeURIComponent(filename)}`, {}, callback);
}

/**
 * @doc https://docs.aws.amazon.com/AmazonS3/latest/API/API_HeadObject.html
 */
function getBucketMetadata(bucket, callback) {
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
 * BULK DELETE
 * @documentation https://docs.aws.amazon.com/AmazonS3/latest/API/API_DeleteObjects.html#API_DeleteObjects_Examples
 */
function deleteFiles (bucket, files, options, callback) {
  if (!callback) {
    callback = options;
    options = {};
  }

  if (files.length > 1000) {
    return callback("")
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

function request (method, path, options, callback) {

  const _urlParams = getUrlParameters(options?.queries ?? '', options?.defaultQueries ?? '');

  const _requestParams = aws4.sign({
    method: method,
    url: `https://${_config.url}${path}${_urlParams ?? ''}`,
    ...(options?.body ? { body: options?.body } : {}),
    headers: {
      ...(options?.headers ? options?.headers : {})
    },
    timeout: _config.timeout,
    /** REQUIRED FOR AWS4 SIGNATURE */
    service: 's3',
    hostname: _config.url,
    path: `${path}${_urlParams ?? ''}`,
    region: _config.region,
    protocol: 'https:'
  }, {
    accessKeyId: _config.accessKeyId,
    secretAccessKey: _config.secretAccessKey
  })

  const _requestCallback = function (err, res, body) {
    if (err) {
      return callback(err, res);
    }
    if (res.statusCode >= 500) {
      // res?.headers?.['content-type'] === 'application/xml'
      console.log("CHANGE OBJECT STORAGE");
    }
    if (res.statusCode >= 400 && res?.headers?.['content-type'] === 'application/xml') {
      if (options?.stream === true) {
        return streamToString(res, false, (err, msg) => {
          callback(err ?? xmlToJson(msg) ?? 'Something went wrong');
        });
      }
      return callback(xmlToJson(body?.toString() ?? ''));
    }
    return options?.stream === true ? callback(null, res) : callback(null, { headers   : res.headers, statusCode: res.statusCode, body : body });
  }
  return options?.stream === true ? get(_requestParams, _requestCallback) : get.concat(_requestParams, _requestCallback);
}

function setTimeout(timeout) {
  _config.timeout = timeout;
}

function getConfig() {
  return _config;
}

module.exports = (config) => {
  _config = {
    ..._config,
    ...config
  }

  return {
    downloadFile,
    uploadFile,
    deleteFile,
    deleteFiles,
    listFiles,
    getFileMetadata,
    setFileMetadata,
    setTimeout,
    getConfig,
    xmlToJson
  }
}

function streamToString (stream, json, callback) {
  const chunks = [];

  stream.on('error', (err) => callback(err));
  stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
  stream.on('end', () => callback(null, Buffer.concat(chunks).toString('utf8')));
}

/**
 * Convert XML to JSON, supports only 1 object depth such as: "{ child: [], child2: {} }".
 *
 * @param {String} xml
 * @param {Object} options (Optional) accepts "forceArray" a list of strings, define if "child" of one element must be lists
 * @returns
 */
function xmlToJson (xml, options) {

  options = options ?? {};

  /** Function to convert string to real types */
  const getValue = (str) => {
    if (!isNaN(str) && !isNaN(parseFloat(str))) {
      return parseInt(str)
    } else if (str.toLowerCase() === "true") {
      return true;
    } else if (str.toLowerCase() === "false") {
      return false;
    }
    /** S3 Storage returns the "MD5" hash wrapped with double quotes, must be removed. */
    if (str[0] === '"' && str?.[str.length - 1] === '"') {
      return str.slice(1, str.length - 1);
    }
    return str;
  }

  /** JSON variables */
  let root = {};
  let child = null;
  let childName = null;
  let _previousTag = '';
  let _previousTagFull = '';
  let _skipObject = null;
  /** Regex variables */
  const _xmlTagRegExp = /<([^>]+?)>/g;
  let _previousLastIndex = 0;
  let _tagParsed = [];
  /** Loop through all XML tags */
  while ((_tagParsed = _xmlTagRegExp.exec(xml))) {
    const _tagStr = _tagParsed[1];
    const _tagAttributeIndex = _tagStr.indexOf(' '); /** remove attributes from HTML tags <div class="s"> */
    const _tagFull = _tagStr.slice(0, _tagAttributeIndex > 0 ? _tagAttributeIndex : _tagStr.length);
    const _tag = _tagFull.replace('/', '').toLowerCase();

    /** End of skipped elements */
    if (_skipObject === _tag && _tagFull[0] === '/') {
      _skipObject = null;
    }

    if (_tagFull === '?xml' || _tagFull?.[_tagFull.length - 1] === '/' || _skipObject !== null) {
      continue;
    }

    /** Create a new child {}/[] if two opening tags are different, such as: <files><name>value</name></files> */
    if(_tag !== _previousTag && (child === null && _previousTag !== '' && _tagFull[0] !== '/' && _previousTagFull[0] !== '/')) {
      child = options?.forceArray?.includes(_previousTag) === true ? [{}] : {};
      childName = _previousTag;
    } /** If a child already exist, and the two tags are equal, the existing element is retreive from the JSON and transformed as LIST */
    else if (_tag === _previousTag && _tagFull[0] !== '/' && _previousTagFull[0] === '/' && child === null && (root[_tag]?.constructor === Object || root[_tag]?.constructor === Array)) {
      child = root[_tag]?.constructor === Object ? [root[_tag]] : root[_tag];
      childName = _tag;
    } /** Skip objects of 2 depth */
    else if (_tag !== _previousTag && child !== null && childName !== _previousTag && _tagFull[0] !== '/' && _previousTagFull[0] !== '/') {
      _skipObject = _previousTag;
      continue;
    }

    /** When we reach the end of a list of child tags `</name></files>`, the child is assigned to the root object */
    if (_tagFull[0] === '/' && _previousTagFull[0] === '/' && child) {
      root[childName] = child?.constructor === Array ? [ ...child ] : { ...child };
      child = null;
      childName = null;
    } /** When we reach the end of a tag <color>red</color>, the value is assign to the child or root object */
    else if (_tagFull[0] === '/') {
      const _value = getValue(xml.slice(_previousLastIndex, _tagParsed.index))
      if (child) {
        if (child?.constructor === Array) {
          /** Tag already exist, we must create a new element on the list */
          if (child[child.length - 1]?.[_tag]) {
            child.push({});
          }
          child[child.length - 1][_tag] = _value;
        }
        child[_tag] = _value;
      } else {
        root[_tag] = _value;
      }
    }

    _previousTag = _tag;
    _previousTagFull = _tagFull;
    _previousLastIndex = _xmlTagRegExp.lastIndex;
  }
  return root;
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