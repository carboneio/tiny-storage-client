const s3 = require('./s3.js');
const swift = require('./swift.js');

module.exports = (config) => {
  /** Check the first credential and return storage type: S3 or Swift client */
  const _auth = Array.isArray(config) && config.length > 0 ? config[0] : config;
  if (_auth?.accessKeyId && _auth?.secretAccessKey && _auth?.url && _auth?.region) {
    return s3(config);
  } else if (_auth?.username && _auth?.password && _auth?.authUrl && _auth?.tenantName && _auth?.region) {
    return swift(config);
  } else {
    throw new Error("Storage connexion not recognised - did you provide correct credentials for a S3 or Swift storage?")
  }
}