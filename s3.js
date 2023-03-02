const get = require('simple-get');
const aws4 = require('aws4');
const crypto = require('crypto');

/**
 * TODO
 * - [x] Bulk delete
 * - [ ] Transform XML to JSON on error / when fetching a list of objects / when delete response
 * - [ ] Change Region on error 500 & read only
 * - [ ] Change Region on Timeout & read only
 * - [ ] Test unitaires
 */

let _config = {
  url            : '',
  region         : '',
  timeout        : 5000
}


function downloadFile (bucket, filename, options, callback) {
  if (!callback) {
    callback = options;
    options = {};
  }
  return request('GET', `/${bucket}/${encodeURIComponent(filename)}`, options, callback);
}

function uploadFile (bucket, filename, localPathOrBuffer, options, callback) {
  options.body = localPathOrBuffer;
  options.headers = {
    ...options?.headers
  }
  return request('PUT', `/${bucket}/${encodeURIComponent(filename)}`, options, callback);
}

function deleteFile (bucket, filename, callback) {
  return request('DELETE', `/${bucket}/${encodeURIComponent(filename)}`, {}, callback);
}

function listFiles(bucket, options, callback) {
  return request('GET', `/${bucket}?list-type=2`, options, callback);
}

function getFileMetadata(bucket, filename, callback) {
  return request('HEAD', `/${bucket}/${encodeURIComponent(filename)}`, {}, callback);
}

function setFileMetadata(bucket, filename, options, callback) {
  /**
   * Copy an existing file to edit metadatas.
   * Custom metadata must start with "x-amz-meta-", followed by a name to create a custom key.
   * Metadata can be as large as 2 KB total. To calculate the total size of user-defined metadata,
   * sum the number of bytes in the UTF-8 encoding for each key and value. Both keys and their values must conform to US-ASCII standards.
   */
  getFileMetadata(bucket, filename, (err, resp) => {
    if (err) {
      return callback(err);
    }
    return request('PUT', `/${bucket}/${encodeURIComponent(filename)}`,
      {
        headers: {
          ...resp.headers,
          'x-amz-copy-source': `/${bucket}/${encodeURIComponent(filename)}`,
          'x-amz-metadata-directive': 'REPLACE',
          ...options.headers
        }
      }, callback);
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

  const _requestParams = aws4.sign({
    method: method,
    url: `https://${_config.url}${path}`,
    ...(options?.body ? { body: options?.body } : {}),
    headers: {
      ...(options?.headers ? options?.headers : {})
    },
    timeout: _config.timeout,
    /** REQUIRED FOR AWS4 SIGNATURE */
    service: 's3',
    hostname: _config.url,
    path: path,
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
    if (res.statusCode >= 500 && res?.headers?.['content-type'] === 'application/xml') {
      console.log("CHANGE OBJECT STORAGE");
    }
    if (res.statusCode >= 400 && res?.headers?.['content-type'] === 'application/xml') {
      if (options?.stream === true) {
        return streamToString(res, (err, msg) => {
          callback(err ?? msg ?? 'Something went wrong');
        });
      }
      return callback(body.toString());
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
    getConfig
  }
}

// function getHeaderAndQueryParameters (options) {
//   let headers = {};
//   let queries = '';
//   let body = null

//   if (options?.queries) {
//     queries = getQueryParameters(options.queries);
//   }
//   if (options?.headers) {
//     headers = options.headers;
//   }
//   if (options?.body) {
//     body = options.body;
//   }
//   return { headers, queries, body }
// }

function streamToString (stream, callback) {
  const chunks = [];
  stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
  stream.on('error', (err) => callback(err));
  stream.on('end', () => callback(null, Buffer.concat(chunks).toString('utf8')));
}

function getMD5 (data) {
  console.log(typeof data);
  try {
    return crypto.createHash('md5').update(typeof data === 'string' ? Buffer.from(data) : data ).digest('base64');
  } catch(err) {
    console.log(`Error - S3 getMD5: ${err.toString()}`);
    return '';
  }
}