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
   * - `code`: the network error code (ETIMEDOUT, ECONNRESET...), or else the error code of the storage (S3 "InternalError"), if any
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
    /** The network error code, or the error code of the storage, such as "InternalError" (S3) */
    if (failure?.error?.code || failure?.code) {
      _err.code = failure.error?.code || failure.code;
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
   * Stream `output` of a request, shared by its attempts. Only a 2xx response is written into the caller's stream: the body of
   * any other response (3xx, 4xx, throttled, failing over) is kept in `body`, and returned or retried like a buffered one.
   * The caller's `output()` is called at most once per request (`written`): the request is then never retried nor failed over.
   * A retry by rock-req (network error) gets this first stream, destroyed by the failed attempt: rock-req ends with the error.
   *
   * @param {Function} output caller's function returning a Writable stream
   * @returns {Object} { output, body, written } `output` is the option of rock-req: (opts, res) => Writable
   */
  function streamOutput (output) {
    let _caller = null;
    const _stream = {
      body    : null,
      written : false,
      output  : (opts, res) => {
        /** The caller's stream was given to a previous attempt: any later response (a retry of rock-req, 2xx or not) gets it back, destroyed, and ends the request with its error */
        if (_stream.written === true) {
          return _caller;
        }
        if (res.statusCode < 200 || res.statusCode >= 300) {
          const _chunks = _stream.body = [];
          return new Writable({ write (chunk, encoding, cb) { _chunks.push(chunk); cb(); } });
        }
        _stream.body = null;
        _stream.written = true;
        return (_caller ??= output(opts, res));
      }
    };
    return _stream;
  }

  /** Throttling (S3 503 SlowDown, 429, Swift 498): retried on the same storage with a full-jitter exponential backoff, after the quick retry of rock-req */
  const THROTTLE_DELAY_BASE = 500; // ms
  const THROTTLE_DELAY_MAX = 20000; // ms
  /** A Retry-After longer than the backoff delay is honoured up to this extra delay */
  const RETRY_AFTER_MAX_EXTRA = 5000; // ms
  /** Global switch of the active storage after this number of consecutive failures (5xx) of the active storage */
  const FAILURE_THRESHOLD = 3;
  /** Default number of backoff retries of a throttled request (option `maxThrottleRetry` of each storage): 0, as before 4.1 (only the quick retry of rock-req) */
  const THROTTLE_RETRY = 0;
  /** Probe of the main storage while a fallback is active: one at a time, every PROBE_DELAY_MIN ms, doubled on each failure up to PROBE_DELAY_MAX */
  const PROBE_DELAY_MIN = 60000;
  const PROBE_DELAY_MAX = 600000;

  /**
   * Retry-After header (RFC 9110: delay in seconds or HTTP-date) in ms. Missing, invalid or past: 0
   *
   * @param {Object} headers response headers
   * @returns {Number} ms
   */
  function retryAfter (headers) {
    const _value = headers?.['retry-after'];
    const _ms = typeof _value !== 'string' ? 0 : /^\d+$/.test(_value) === true ? _value * 1000 : Date.parse(_value) - Date.now();
    return _ms > 0 ? _ms : 0;
  }

  /**
   * Delay before retrying a throttled request: full jitter `random() * min(base * 2^attempt, cap)`. A Retry-After is
   * honoured, extended by RETRY_AFTER_MAX_EXTRA ms at most: `max(delay, min(retryAfter, delay + extra))`
   *
   * @param {Number} attempt number of retries already done (0 for the first one)
   * @param {Object} headers response headers
   * @returns {Number} ms
   */
  function throttleDelay (attempt, headers) {
    const _delay = Math.random() * Math.min(THROTTLE_DELAY_BASE * 2 ** attempt, THROTTLE_DELAY_MAX);
    const _retryAfter = retryAfter(headers);
    return _retryAfter > 0 ? Math.max(_delay, Math.min(_retryAfter, _delay + RETRY_AFTER_MAX_EXTRA)) : _delay;
  }

  /** A server error, failed over: every 5xx but "501 Not Implemented", a feature the request needs and no storage has */
  function isServerError (statusCode) {
    return statusCode >= 500 && statusCode !== 501;
  }

  /**
   * Delay before sending a throttled request again on the same storage, or undefined after `maxThrottleRetry` retries (option of
   * the storage, integer >= 0, 0 by default)
   *
   * @param {Object} state { throttles } retries done on the storage of the attempt, updated
   * @param {Object} storage the storage of the attempt
   * @param {Object} headers response headers (Retry-After)
   * @returns {Number|undefined} ms
   */
  function throttleRetry (state, storage, headers) {
    /** Checked again here: a value changed on the storage object after setConfig()/setStorages() never makes the retries unbounded (Infinity) */
    const _max = Number.isInteger(storage?.maxThrottleRetry) === true && storage.maxThrottleRetry >= 0 ? storage.maxThrottleRetry : THROTTLE_RETRY;
    return state.throttles < _max ? throttleDelay(state.throttles++, headers) : undefined;
  }

  /**
   * Consecutive failures of the active storage. `generation` changes with the active storage: an attempt captures it when it
   * is sent to the active storage (-1 otherwise), its failure counts only if the active storage did not change meanwhile
   * (parallel requests, a switch then a return to this storage)
   */
  function failureTracker () {
    return {
      generation : 0,
      failures   : 0,
      /** Generation of an attempt sent to the storage `index` */
      of (index, activeStorage) {
        return index === activeStorage ? this.generation : -1;
      },
      /** The active storage changed */
      reset () {
        this.generation++;
        this.failures = 0;
      },
      /** A failure of an attempt: true if the active storage must be switched, at once if `isDown` */
      fail (generation, isDown) {
        return generation === this.generation && (isDown === true || ++this.failures >= FAILURE_THRESHOLD);
      },
      /** An answer of the storage of an attempt: the failures of the active storage are reset */
      success (generation) {
        if (generation === this.generation) {
          this.failures = 0;
        }
      }
    };
  }

  /**
   * Schedule of the probe of the main storage while a fallback is active: one at a time, every PROBE_DELAY_MIN ms, doubled on each
   * failure up to PROBE_DELAY_MAX. Replaced by setConfig()/setStorages(): a probe in progress ends on its own schedule, discarded
   */
  function probeSchedule () {
    return {
      delay   : PROBE_DELAY_MIN,
      at      : 0,
      running : false,
      /** True if a probe must be sent now. A clock set back must not postpone it */
      due () {
        const _now = Date.now();
        return this.running === false && (_now - this.at >= this.delay || _now < this.at);
      },
      start () {
        this.running = true;
        this.at = Date.now();
      },
      /** A fallback was just activated: the next request probes the main storage at once (a short blip is recovered at once, as before 4.1), then PROBE_DELAY_MIN after a failure */
      soon () {
        this.at = 0;
        this.delay = PROBE_DELAY_MIN / 2;
      },
      /** End of a probe: back to the minimum delay if the main storage is up, else doubled */
      end (isUp) {
        this.running = false;
        this.delay = isUp === true ? PROBE_DELAY_MIN : Math.min(this.delay * 2, PROBE_DELAY_MAX);
      }
    };
  }

  /**
   * Call every callback waiting for a shared authentication: an exception of one caller must not strand the others,
   * the first one is rethrown after all are called
   */
  function callAll (callbacks, ...args) {
    let _error = null;
    for (let i = 0; i < callbacks.length; i++) {
      try {
        callbacks[i](...args);
      } catch (e) {
        _error = _error ?? { e };
      }
    }
    if (_error !== null) {
      throw _error.e;
    }
  }

  /**
   * Throw if the option `maxThrottleRetry` of a storage is set but is not an integer >= 0 (checked by setConfig/setStorages,
   * like `storageClass`: a wrong value is never silently ignored)
   * @param {Object} storage
   * @param {String} name "S3" or "Swift", for the message
   */
  function checkMaxThrottleRetry (storage, name) {
    if (storage?.maxThrottleRetry !== undefined && (Number.isInteger(storage.maxThrottleRetry) === false || storage.maxThrottleRetry < 0)) {
      throw new Error(`${name} Storage "maxThrottleRetry" must be an integer >= 0, such as 3`);
    }
  }

  /** Call `fn` after `delay` ms (the clients shadow the global setTimeout with their own) */
  function wait (delay, fn) {
    return setTimeout(fn, delay);
  }

  module.exports = {
    catchSyncError,
    streamOutput,
    retryAfter,
    throttleDelay,
    throttleRetry,
    checkMaxThrottleRetry,
    isServerError,
    failureTracker,
    probeSchedule,
    callAll,
    wait,
    hasHeader,
    downloadOptions,
    getUrlParameters,
    encodeObjectName,
    escapeXml,
    failureToString,
    failureFields,
    storageUnavailableError,
    isFnStream: o => o instanceof Function
  };