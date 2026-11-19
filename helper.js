  const { Writable } = require('stream');

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
        _queries += `${encodeURIComponent(_queriesEntries[i])}=${encodeURIComponent(queries[_queriesEntries[i]])}`;
        if (i + 1 !== _totalQueries) {
          _queries += '&';
        }
      }
    }
    return _queries ? '?' + _queries : '';
  }

  /**
   * UTF-8 + URL-encode an object name, as required by the Swift API:
   * "You must UTF-8-encode and then URL-encode container and object names before you call the API binding."
   * @doc https://docs.openstack.org/swift/latest/api/object_api_v1_overview.html
   *
   * The "/" separators are kept as-is: a "/" is a valid character of an object name and is used by
   * Swift as a pseudo-hierarchy, encoding it as "%2F" would change the object being requested.
   *
   * @param {String} name object name
   * @returns {String} the object name, safe to inject into a URL path
   */
  function encodeObjectName (name) {
    return String(name).split('/').map(_segment => encodeURIComponent(_segment)).join('/');
  }

  const XML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;', '\r': '&#13;', '\n': '&#10;' };

  /**
   * Escape a value injected into an XML element, such as an object key: "a&b.pdf" must be sent as "a&amp;b.pdf".
   * A carriage return and a newline are written as character references, the XML parser of the server normalizes
   * a raw "\r" into "\n" (AWS "Naming Amazon S3 objects", XML-related object key constraints)
   *
   * @param {String} value
   * @returns {String} the value, safe to inject into an XML element
   */
  function escapeXml (value) {
    return String(value).replace(/[&<>"'\r\n]/g, (char) => XML_ESCAPES[char]);
  }

  /**
   * Describe the failure of a request for the logs: the network error ("Error: read ETIMEDOUT") or the HTTP status ("Status code: 503")
   *
   * @param {Object} failure { statusCode, error }
   * @returns {String}
   */
  function failureToString (failure) {
    return failure?.error?.toString() || `Status code: ${failure?.statusCode}`;
  }

  /**
   * Structured log fields of a failure { statusCode, error }: only primitives, never the error object
   */
  function failureFields (failure) {
    return { status: failure?.statusCode, code: failure?.error?.code };
  }

  /**
   * Build the error returned when no storage can serve a request. The message is unchanged, callers may match on it.
   * The last failure of the request is attached:
   * - `storageStatusCode`: the last HTTP status of the storage (5xx, 401), if the storage replied
   * - `code`: the network error code (ETIMEDOUT, ECONNRESET...), if any
   * - `cause`: the original network Error, if any
   * `statusCode` and `status` are never set: HTTP frameworks (Express, ...) reply with them,
   * a storage 401 would log out the user of the caller's app.
   *
   * @param {String} message
   * @param {Object} failure { statusCode, error } the last failure of the request, may be undefined
   * @returns {Error}
   */
  function storageUnavailableError (message, failure) {
    const _err = new Error(message, failure?.error ? { cause: failure.error } : undefined);
    if (failure?.statusCode) {
      _err.storageStatusCode = failure.statusCode;
    }
    if (failure?.error?.code) {
      _err.code = failure.error.code;
    }
    return _err;
  }

  /**
   * Return true if the header is set, whatever its case ("Accept-Encoding", "accept-encoding")
   *
   * @param {Object} headers
   * @param {String} name lower case header name
   * @returns {Boolean}
   */
  function hasHeader (headers, name) {
    for (const key in headers) {
      if (key.toLowerCase() === name) {
        return true;
      }
    }
    return false;
  }

  /**
   * Options of `downloadFile`, without mutating the caller's object:
   * - return the stored bytes untouched: an object saved with a "Content-Encoding" metadata (gzip, deflate, br)
   *   must not be decompressed by rock-req, otherwise the body would not match the stored size and ETag.
   *   It can be overwritten with `requestOptions: { decompress: true }`
   * - without decompression, ask for "accept-encoding: identity" (unless the caller sets it), so a proxy/CDN does not compress the file on the fly
   *
   * @param {Object} options caller options, may be null/undefined
   * @param {String} alias bucket/container
   * @returns {Object} new options
   */
  function downloadOptions (options, alias) {
    const _requestOptions = { decompress: false, ...options?.requestOptions };
    const _options = { ...options, alias, requestOptions: _requestOptions };
    if (_requestOptions.decompress === false && hasHeader(_options.headers, 'accept-encoding') === false && hasHeader(_requestOptions.headers, 'accept-encoding') === false) {
      _options.headers = { ..._options.headers, 'accept-encoding': 'identity' };
    }
    return _options;
  }

  /**
   * Return `fn`, whose synchronous throw (such as the URIError of a filename with a lone surrogate) is passed to
   * the callback, its last argument. An exception thrown by the callback itself is rethrown: never swallowed,
   * and the callback is never called twice.
   *
   * @param {Function} fn API function, its last argument is the callback
   * @returns {Function}
   */
  function catchSyncError (fn) {
    return function (...args) {
      const _callback = args[args.length - 1];
      if (typeof _callback !== 'function') {
        return fn(...args);
      }
      let _called = false;
      args[args.length - 1] = function () {
        _called = true;
        return _callback.apply(this, arguments);
      };
      try {
        return fn(...args);
      } catch (err) {
        if (_called === true) {
          throw err;
        }
        return _callback(err);
      }
    };
  }

  /**
   * Stream `output` of a request: the body of a response retried on another storage (5xx, 401) is discarded,
   * the caller's `output()` is called once, for the response returned to the caller.
   *
   * @param {Function} output caller's function returning a Writable stream
   * @param {Function} isRetried (res) => true if the response is retried on another storage / after a reconnection
   * @returns {Function} the `output` option of rock-req: (opts, res) => Writable
   */
  function finalOutput (output, isRetried) {
    return (opts, res) => (isRetried(res) === true ? new Writable({ write (chunk, encoding, cb) { cb(); } }) : output(opts, res));
  }

  module.exports = {
    catchSyncError,
    finalOutput,
    downloadOptions,
    getUrlParameters,
    encodeObjectName,
    escapeXml,
    failureToString,
    failureFields,
    storageUnavailableError,
    isFnStream: o => o instanceof Function
  };