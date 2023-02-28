const get = require('simple-get');
const aws4 = require('aws4');

let _config = {
  url            : '',
  region         : '',
  timeout        : 5000
}

let _auth = {
  accessKeyId    : '',
  secretAccessKey: '',
}

function downloadFile (bucket, filename, callback) {

  if (!bucket) {
    console.log('"Bucket" property is required');
  } else if (!filename) {
    console.log('"filename" property is required');
  }

  const _params = {
    method: 'GET',
    url: `https://${_config.url}/${bucket}/${encodeURIComponent(filename)}`,
    /** REQUIRED FOR AWS4 SIGNATURE */
    path: `/${bucket}/${encodeURIComponent(filename)}`,
    service: 's3',
    hostname: _config.url,
    region: _config.region,
    protocol: 'https:'
  }

  return get.concat(aws4.sign({ ..._params }, _auth), function (err, res, body) {
    if (err) {
      console.log(err);
      return callback(err);
    }
    if (res.statusCode >= 400 && res.headers['content-type'] === 'application/xml') {
      return callback(body.toString());
    }
    return callback(null, body);
  })
}

module.exports = (config) => {
  _config = {
    ..._config,
    ...config
  }

  _auth.accessKeyId = _config.accessKeyId;
  _auth.secretAccessKey = _config.secretAccessKey;

  delete _config.accessKeyId;
  delete _config.secretAccessKey;
  return {
    downloadFile
  }
}