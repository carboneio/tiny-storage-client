const get = require('simple-get');
const aws4 = require('aws4');
const crypto = require('crypto');
const fs = require('fs');

/**
 * TODO
 * - [x] Bulk delete
 * - [ ] Transform XML to JSON on error / when fetching a list of objects / when delete response
 * - [ ] Test and improve list objects (query params)
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
    return fs.readFile('/etc/passwd', (err, objectBuffer) => {
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
function deleteFile (bucket, filename, callback) {
  return request('DELETE', `/${bucket}/${encodeURIComponent(filename)}`, {}, callback);
}


/**
 * @doc https://docs.aws.amazon.com/AmazonS3/latest/API/API_ListObjectsV2.html
 */
function listFiles(bucket, options, callback) {
  return request('GET', `/${bucket}?list-type=2`, options, (err, resp) => {
    if (err) {
      return callback(err);
    }
    console.log(resp.body.toString());
    xmlToJson(resp.body.toString());
  });
}

/**
 * @doc https://docs.aws.amazon.com/AmazonS3/latest/API/API_HeadObject.html
 */
function getFileMetadata(bucket, filename, callback) {
  return request('HEAD', `/${bucket}/${encodeURIComponent(filename)}`, {}, callback);
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
  getFileMetadata(bucket, filename, (err, resp) => {
    if (err) {
      return callback(err);
    }
    /**
     * TODO: verify Metadata size lower or equal to 2KB maximum
     */
    request('PUT', `/${bucket}/${encodeURIComponent(filename)}`,
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
        return streamToString(res, false, (err, msg) => {
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

function xmlToJson (xml, options) {

  options = options ?? {};

  const getValue = (str) => {
    if (!isNaN(str) && !isNaN(parseFloat(str))) {
      return parseInt(str)
    } else if (str.toLowerCase() === "true") {
      return true;
    } else if (str.toLowerCase() === "false") {
      return false;
    }
    if (str[0] === '"' && str?.[str.length - 1] === '"') {
      return str.slice(1, str.length - 1);
    }
    return str;
  }

  let root = {};
  let parent = root;
  let parentName = '';
  let _previousTag = '';
  let _previousTagFull = '';
  let _previousTagValue = null;


  var _xmlTagRegExp = /<([^>]+?)>/g;
  var _prevLastIndex = 0;
  let _tagParsed = [];
  while ((_tagParsed = _xmlTagRegExp.exec(xml))) {
    var _tagStr = _tagParsed[1];
    var _tagAttributeIndex = _tagStr.indexOf(' '); /** remove attributes from HTML tags <div class="s"> */
    var _tagFull = _tagStr.slice(0, _tagAttributeIndex > 0 ? _tagAttributeIndex : _tagStr.length);
    const _tag = _tagFull.replace('/', '').toLowerCase();

    if (_tagFull === '?xml' || _tagFull?.[_tagFull.length - 1] === '/') {
      continue;
    }

    console.log(_tagFull, "prev:" + _previousTagFull, "par:" + parentName, "pv:" + _previousTagValue, root);

    // /** Get the parent tag */
    if (_tag !== _previousTag && parentName !== _tag && _previousTag !== '' &&  _previousTagValue === null  && _previousTagFull[0] !== '/' ) {
      root[_previousTag] = options?.forceArray?.includes(_previousTag) === true ? [{}] : {};
      parent = root[_previousTag];
      parentName = _previousTag;
      _previousTagValue = null;
    }
    // else if (_tag !== _previousTag && _previousTag === parentName && _previousTagFull[0] === '/') {
    //   const _tmp = parent;

    //   parent = root;
    // }

    // else if (parentName === _tag && parent?.constructor !== Array/**  && _tagFull[0] !== '/' */) {
    //   console.log("PASS HEREEEEE----", parent)
    //   /** Create an array from the existing object */
    //   root[parentName] = new Array(parent);
    //   parent = root[parentName];
    //   console.log("Already exist", _tag, parentName, parent, root);
    // }
    // // else if (parentName === _tag && _tagFull[0] === '/') {
    // //   parentName = '';
    // // }

    /** Get and set the attribute value */
    if (_tag === _previousTag && _tagFull[0] === '/' && _previousTag !== '') {
      const _value = getValue(xml.slice(_prevLastIndex, _tagParsed.index))
      _previousTagValue = _value;

      console.log("SHOULD set the VALUE", _value, parent);

      if (parent?.constructor === Array) {
        /** If the element is an Array, create a new element if the tag already exist */
        if (parent[parent.length - 1]?.[_tag]) {
          parent.push({});
        }
        parent[parent.length - 1][_tag] = _value;
      } else {
        parent[_tag] = _value;
      }
    } else {
      _previousTagValue = null;
    }

    _previousTag = _tag;
    _previousTagFull = _tagFull;
    _prevLastIndex = _xmlTagRegExp.lastIndex;
  }
  console.log(root);
  return root;
}
    // if (previousTag !== '' && previousTag !== _tag && !json?.[previousTag] && _tagOnly[0] === '/') {
    //   json[previousTag] = {}
    //   parent = json[previousTag];
    // } else if (previousTag === _tag) {
    //   parent[_tag] = xml.slice(_xmlTagRegExp.lastIndex, _tag.index)
    // }

// <?xml version='1.0' encoding='UTF-8'?>
// <ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
//   <Name>templates</Name>
//   <Prefix/>
//   <KeyCount>1</KeyCount>
//   <MaxKeys>1000</MaxKeys>
//   <IsTruncated>false</IsTruncated>
//   <Contents>
//     <Key>template.odt</Key>
//     <LastModified>2023-03-02T07:18:55.000Z</LastModified>
//     <ETag>"fde6d729123cee4db6bfa3606306bc8c"</ETag>
//     <Size>11822</Size>
//     <StorageClass>STANDARD</StorageClass>
//   </Contents>
// </ListBucketResult>

// {
//   "ListBucketResult" : {
//     "name": "templates",
//     "KeyCount": 1,
//     "MaxKeys": 1000,
//     "IsTruncated": false,
//     contents : [
//       "key": "template.odt",
//       "LastModified": "2023-03-02T07:18:55.000Z",
//       "ETag": "fde6d729123cee4db6bfa3606306bc8c",
//       "Size": "11822",
//       "StorageClass": "STANDARD"
//     ]
//   }
// }


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


