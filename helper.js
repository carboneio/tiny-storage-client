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

  module.exports = {
    getUrlParameters,
    isFnStream: o => o instanceof Function
  }