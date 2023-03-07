const s3 = require('../s3.js')
const { xmlToJson } = s3({})
const assert = require('assert')

const _assert = (actual, expected) => {
  assert.strictEqual(JSON.stringify(actual), JSON.stringify(expected))
}

describe.only('xmlToJson', function () {

  it('should not crash with empty/null/undefiend/weird', function () {
    _assert(xmlToJson(''), {})
    _assert(xmlToJson(null), {})
    _assert(xmlToJson(undefined), {})
    _assert(xmlToJson({}), {})
    _assert(xmlToJson([]), {})
  })


  it('should return simple object', function () {
    const _json = xmlToJson('<Name>Eric</Name><Color>Blue</Color>')

    const _expected = {
      name: 'Eric',
      color: 'Blue',
    }

    _assert(_json, _expected)
  })

  it('should return simple object, and overwrite an existing field', function () {
    const _json = xmlToJson('<Color>Blue</Color><Color>Red</Color>')

    const _expected = {
      color: 'Red'
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

  it('should return simple nested object', function () {
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

  it('should parse a simpled nested object', function () {
    let _xml = '<Name>templates</Name><Contents><Key>template.odt</Key></Contents>'
    const _json = xmlToJson(_xml)

    const _expected = {
      name: 'templates',
      contents: {
        key: 'template.odt',
      },
    }
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

  it('should parse a simple nested object, if the name is the same, it should be overwrited', function () {
    let _xml =
      '<Colors><Name>Blue</Name><Name>Green</Name></Colors>'
    const _json = xmlToJson(_xml)

    const _expected = {
      colors: {
        name: "Green"
      }
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
  });

  it('should parse the response of "ListObject V2" and skip the 2 depth object', function () {
    const _xml = '<?xml version="1.0" encoding="UTF-8"?>' +
      '<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">'+
          '<Name>bucket</Name>'+
          '<Prefix/>'+
          '<KeyCount>205</KeyCount>'+
          '<MaxKeys>1000</MaxKeys>'+
          '<IsTruncated>false</IsTruncated>'+
          '<Contents>'+
              '<Key>my-image.jpg</Key>'+
              '<LastModified>2009-10-12T17:50:30.000Z</LastModified>'+
              '<ETag>"fba9dede5f27731c9771645a39863328"</ETag>'+
              '<Size>434234</Size>'+
              '<StorageClass>STANDARD</StorageClass>'+
          '</Contents>'+
          '<Contents>'+
              '<Key>my-image2.jpg</Key>'+
              '<LastModified>2009-10-12T17:50:30.000Z</LastModified>'+
              '<ETag>"fba9dede5f27731c9771645a39863328"</ETag>'+
              '<Size>434234</Size>'+
              '<StorageClass>STANDARD</StorageClass>'+
          '</Contents>'+
      '</ListBucketResult>';

    const _json = xmlToJson(_xml)

    const _expected = {
      listbucketresult: {
        name: 'bucket',
        keycount: 205,
        maxkeys: 1000,
        istruncated: false,
        contents: '<Key>my-image2.jpg</Key><LastModified>2009-10-12T17:50:30.000Z</LastModified><ETag>"fba9dede5f27731c9771645a39863328"</ETag><Size>434234</Size><StorageClass>STANDARD</StorageClass>'
      }
    }

    _assert(_json, _expected)
  });
})