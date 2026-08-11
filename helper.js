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

  module.exports = {
    getUrlParameters,
    encodeObjectName,
    isFnStream: o => o instanceof Function
  }