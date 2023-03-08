/**
 * Convert XML to JSON, supports only 1 object depth such as: "{ child: [], child2: {} }".
 *
 * @param {String} xml
 * @param {Object} options (Optional) accepts "forceArray" a list of strings, define if "child" of one element must be lists
 * @returns {Object} XML as JSON
 */
function xmlToJson (xml, options) {

  options = options ?? {};

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
 * Function to convert string to corresponding types
 * @param {String} str value
 * @returns {String|Boolean|Number}
 */
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

module.exports = xmlToJson;