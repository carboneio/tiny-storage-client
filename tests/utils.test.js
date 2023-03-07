const s3 = require('../s3.js')
const { xmlToJson } = s3({})
const assert = require('assert')

const _assert = (actual, expected) => {
  assert.strictEqual(JSON.stringify(actual), JSON.stringify(expected))
}

describe.only('xmlToJson', function () {
  it('should return simple object', function () {
    const _json = xmlToJson('<Name>Eric</Name><Color>Blue</Color>')

    const _expected = {
      name: 'Eric',
      color: 'Blue',
    }

    _assert(_json, _expected)
  })

  it('should return simple nested object', function () {
    const _json = xmlToJson(
      '<Bucket><Name>Eric</Name><Color>Blue</Color></Bucket>',
    )

    const _expected = {
      bucket: {
        name: 'Eric',
        color: 'Blue',
      },
    }

    _assert(_json, _expected)
  })

  it.only('should return simple nested object', function () {
    const _json = xmlToJson(
      '<Bucket><Color>Blue</Color></Bucket><Name>John</Name>',
    )

    const _expected = {
      bucket: {
        color: 'Blue',
      },
      name: "John"
    }

    _assert(_json, _expected)
  })

  it('should return simple nested object as Array', function () {
    const _json = xmlToJson(
      '<Bucket><Name>Eric</Name><Color>Blue</Color></Bucket><Bucket><Name>John</Name><Color>Green</Color></Bucket>',
    )

    const _expected = {
      bucket: [
        {
          name: 'Eric',
          color: 'Blue',
        },
        {
          name: 'John',
          color: 'Green',
        },
      ],
    }

    _assert(_json, _expected)
  })

  it('should parse a simpled nested object', function () {
    let _xml =
      '<Name>templates</Name><Contents><Key>template.odt</Key></Contents>'
    // let _xml = '<Name>templates</Name><Prefix/><KeyCount>1</KeyCount><MaxKeys>1000</MaxKeys><IsTruncated>false</IsTruncated><Contents><Key>template.odt</Key><LastModified>2023-03-02T07:18:55.000Z</LastModified><ETag>"fde6d729123cee4db6bfa3606306bc8c"</ETag><Size>11822</Size><StorageClass>STANDARD</StorageClass></Contents>';
    const _json = xmlToJson(_xml)

    const _expected = {
      name: 'templates',
      contents: {
        key: 'template.odt',
      },
    }
    // {
    // "name":"templates",
    // "keycount":1,
    // "maxkeys":1000,
    // "istruncated":false,
    // "key":"template.odt",
    // "lastmodified":"2023-03-02T07:18:55.000Z",
    // "etag":"\"fde6d729123cee4db6bfa3606306bc8c\\",
    // "size":11822,
    // "storageclass":"STANDARD"}

    _assert(_json, _expected)
  })

  it('should parse a simple nested object', function () {
    let _xml =
      '<Name>templates</Name><Prefix/><KeyCount>1</KeyCount><MaxKeys>1000</MaxKeys><IsTruncated>false</IsTruncated><Contents><Key>template.odt</Key><LastModified>2023-03-02T07:18:55.000Z</LastModified><ETag>"fde6d729123cee4db6bfa3606306bc8c"</ETag><Size>11822</Size><StorageClass>STANDARD</StorageClass></Contents>'
    const _json = xmlToJson(_xml)

    const _expected = {
      name: 'templates',
      keycount: 1,
      maxkeys: 1000,
      istruncated: false,
      contents: {
        key: 'template.odt',
        lastmodified: '2023-03-02T07:18:55.000Z',
        etag: 'fde6d729123cee4db6bfa3606306bc8c',
        size: 11822,
        storageclass: 'STANDARD',
      },
    }
    _assert(_json, _expected)
  })

  it('should parse a the response of "ListObjects V2"', function () {
    let _xml =
      '<Name>templates</Name><Prefix/><KeyCount>1</KeyCount><MaxKeys>1000</MaxKeys><IsTruncated>false</IsTruncated><Contents><Key>template.odt</Key><LastModified>2023-03-02T07:18:55.000Z</LastModified><ETag>"fde6d729123cee4db6bfa3606306bc8c"</ETag><Size>11822</Size><StorageClass>STANDARD</StorageClass></Contents><Contents><Key>template.docx</Key><LastModified>2024-03-02T07:18:55.000Z</LastModified><ETag>"fde6d729123cee4db6bfa1111306b222"</ETag><Size>85000</Size><StorageClass>STANDARD</StorageClass></Contents>'
    const _json = xmlToJson(_xml)

    const _expected = {
      name: 'templates',
      keycount: 1,
      maxkeys: 1000,
      istruncated: false,
      contents: [
        {
          key: 'template.odt',
          lastmodified: '2023-03-02T07:18:55.000Z',
          etag: 'fde6d729123cee4db6bfa3606306bc8c',
          size: 11822,
          storageclass: 'STANDARD',
        },
        {
          key: 'template.docx',
          lastmodified: '2024-03-02T07:18:55.000Z',
          etag: 'fde6d729123cee4db6bfa1111306b222',
          size: 85000,
          storageclass: 'STANDARD',
        },
      ],
    }
    _assert(_json, _expected)
  })

  it('should parse a simple nested object and force an element to be a Array (options: forceArray)', function () {
    let _xml =
      '<Name>templates</Name><Prefix/><KeyCount>1</KeyCount><MaxKeys>1000</MaxKeys><IsTruncated>false</IsTruncated><Contents><Key>template.odt</Key><LastModified>2023-03-02T07:18:55.000Z</LastModified><ETag>"fde6d729123cee4db6bfa3606306bc8c"</ETag><Size>11822</Size><StorageClass>STANDARD</StorageClass></Contents>'
    const _json = xmlToJson(_xml, { forceArray: ["contents"] } )

    const _expected = {
      name: 'templates',
      keycount: 1,
      maxkeys: 1000,
      istruncated: false,
      contents: [{
        key: 'template.odt',
        lastmodified: '2023-03-02T07:18:55.000Z',
        etag: 'fde6d729123cee4db6bfa3606306bc8c',
        size: 11822,
        storageclass: 'STANDARD',
      }],
    }
    _assert(_json, _expected)
  })

  it.skip('should parse a simple nested object and force an element to be a Array (options: forceArray)', function () {
    let _xml =
      '<Colors><Name>Blue</Name><Name>Green</Name></Colors>' //<Size>10000</Size>
    const _json = xmlToJson(_xml)

    const _expected = {
      colors: [{
        name: "Blue"
      },
      {
        name: "Green"
      }],
      // size: 10000
    }
    _assert(_json, _expected)
  })
})
