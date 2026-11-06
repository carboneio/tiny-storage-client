const xmlToJson = require('../xmlToJson.js');
const assert = require('assert');

const _assert = (actual, expected) => {
  assert.strictEqual(JSON.stringify(actual), JSON.stringify(expected));
};

describe('xmlToJson', function () {
  it('should not crash with empty/null/undefiend/weird', function () {
    _assert(xmlToJson(''), {});
    _assert(xmlToJson(null), {});
    _assert(xmlToJson(undefined), {});
    _assert(xmlToJson({}), {});
    _assert(xmlToJson([]), {});
    _assert(xmlToJson('<<a><</a>/>/><</>a/>'), {});
  });

  it('should return simple object', function () {
    const _json = xmlToJson('<Name>Eric</Name><Color>Blue</Color>');

    const _expected = {
      name: 'Eric',
      color: 'Blue',
    };

    _assert(_json, _expected);
  });

  it('should return simple object, and overwrite an existing field', function () {
    const _json = xmlToJson('<Color>Blue</Color><Color>Red</Color>');

    const _expected = {
      color: 'Red',
    };

    _assert(_json, _expected);
  });

  it('should return simple nested object', function () {
    const _json = xmlToJson(
      '<Bucket><Name>Eric</Name><Color>Blue</Color></Bucket>',
    );

    const _expected = {
      bucket: {
        name: 'Eric',
        color: 'Blue',
      },
    };

    _assert(_json, _expected);
  });

  it('should return simple nested object', function () {
    const _json = xmlToJson(
      '<Bucket><Color>Blue</Color></Bucket><Name>John</Name>',
    );

    const _expected = {
      bucket: {
        color: 'Blue',
      },
      name: 'John',
    };

    _assert(_json, _expected);
  });

  it('should parse a simple nested object', function () {
    const _xml =
      '<Name>templates</Name><Contents><Key>template.odt</Key></Contents>';
    const _json = xmlToJson(_xml);

    const _expected = {
      name: 'templates',
      contents: {
        key: 'template.odt',
      },
    };
    _assert(_json, _expected);
  });

  it('should parse a simple nested object', function () {
    const _xml =
      '<Name>templates</Name><Prefix/><KeyCount>1</KeyCount><MaxKeys>1000</MaxKeys><IsTruncated>false</IsTruncated><Contents><Key>template.odt</Key><LastModified>2023-03-02T07:18:55.000Z</LastModified><ETag>"fde6d729123cee4db6bfa3606306bc8c"</ETag><Size>11822</Size><StorageClass>STANDARD</StorageClass></Contents>';
    const _json = xmlToJson(_xml);

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
    };
    _assert(_json, _expected);
  });

  it('should parse a simple nested object, if the name is the same, it should be overwrited', function () {
    const _xml = '<Colors><Name>Blue</Name><Name>Green</Name></Colors>';
    const _json = xmlToJson(_xml);

    const _expected = {
      colors: {
        name: 'Green',
      },
    };
    _assert(_json, _expected);
  });

  it('should return simple nested object as Array', function () {
    const _json = xmlToJson(
      '<Bucket><Name>Eric</Name><Color>Blue</Color></Bucket><Bucket><Name>John</Name><Color>Green</Color></Bucket>',
    );

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
    };

    _assert(_json, _expected);
  });

  it('should parse a the response of "ListObjects V2"', function () {
    const _xml =
      '<Name>templates</Name><Prefix/><KeyCount>1</KeyCount><MaxKeys>1000</MaxKeys><IsTruncated>false</IsTruncated><Contents><Key>template.odt</Key><LastModified>2023-03-02T07:18:55.000Z</LastModified><ETag>"fde6d729123cee4db6bfa3606306bc8c"</ETag><Size>11822</Size><StorageClass>STANDARD</StorageClass></Contents><Contents><Key>template.docx</Key><LastModified>2024-03-02T07:18:55.000Z</LastModified><ETag>"fde6d729123cee4db6bfa1111306b222"</ETag><Size>85000</Size><StorageClass>STANDARD</StorageClass></Contents>';
    const _json = xmlToJson(_xml);

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
    };
    _assert(_json, _expected);
  });

  it('should parse a the response of "ListObjects V2" and return an Array for "contents" even if the Content list has one element.', function () {
    const _xml =
      '<Name>templates</Name><Prefix/><KeyCount>1</KeyCount><MaxKeys>1000</MaxKeys><IsTruncated>true</IsTruncated><Contents><Key>template.odt</Key><LastModified>2023-03-02T07:18:55.000Z</LastModified><ETag>"fde6d729123cee4db6bfa3606306bc8c"</ETag><Size>11822</Size><StorageClass>STANDARD</StorageClass></Contents>';
    const _json = xmlToJson(_xml, { forceArray: ['contents'] });

    const _expected = {
      name: 'templates',
      keycount: 1,
      maxkeys: 1000,
      istruncated: true,
      contents: [
        {
          key: 'template.odt',
          lastmodified: '2023-03-02T07:18:55.000Z',
          etag: 'fde6d729123cee4db6bfa3606306bc8c',
          size: 11822,
          storageclass: 'STANDARD',
        }
      ],
    };
    _assert(_json, _expected);
  });

  it('should parse a simple nested object and force an element to be a Array (options: forceArray)', function () {
    const _xml =
      '<Name>templates</Name><Prefix/><KeyCount>1</KeyCount><MaxKeys>1000</MaxKeys><IsTruncated>false</IsTruncated><Contents><Key>template.odt</Key><LastModified>2023-03-02T07:18:55.000Z</LastModified><ETag>"fde6d729123cee4db6bfa3606306bc8c"</ETag><Size>11822</Size><StorageClass>STANDARD</StorageClass></Contents>';
    const _json = xmlToJson(_xml, { forceArray: ['contents'] });

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
      ],
    };
    _assert(_json, _expected);
  });

  it('should parse the response of "ListObject V2" and skip the 2 depth object', function () {
    const _xml =
      '<?xml version="1.0" encoding="UTF-8"?>' +
      '<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">' +
        '<Name>bucket</Name>' +
        '<Prefix/>' +
        '<KeyCount>205</KeyCount>' +
        '<MaxKeys>1000</MaxKeys>' +
        '<IsTruncated>false</IsTruncated>' +
        '<Contents>' +
          '<Key>my-image.jpg</Key>' +
          '<LastModified>2009-10-12T17:50:30.000Z</LastModified>' +
          '<ETag>"fba9dede5f27731c9771645a39863328"</ETag>' +
          '<Size>434234</Size>' +
          '<StorageClass>STANDARD</StorageClass>' +
        '</Contents>' +
        '<Contents>' +
          '<Key>my-image2.jpg</Key>' +
          '<LastModified>2009-10-12T17:50:30.000Z</LastModified>' +
          '<ETag>"fba9dede5f27731c9771645a39863328"</ETag>' +
          '<Size>434234</Size>' +
          '<StorageClass>STANDARD</StorageClass>' +
        '</Contents>' +
      '</ListBucketResult>';

    const _json = xmlToJson(_xml);

    const _expected = {
      listbucketresult: {
        name: 'bucket',
        keycount: 205,
        maxkeys: 1000,
        istruncated: false,
        contents:
          '<Key>my-image2.jpg</Key><LastModified>2009-10-12T17:50:30.000Z</LastModified><ETag>"fba9dede5f27731c9771645a39863328"</ETag><Size>434234</Size><StorageClass>STANDARD</StorageClass>',
      },
    };

    _assert(_json, _expected);
  });

  it('should parse an indented XML (real responses are pretty-printed)', function () {
    const _xml =
      '\n' +
      '  <Name>www</Name>\n' +
      '  <Prefix/>\n' +
      '  <IsTruncated>false</IsTruncated>\n' +
      '  <Contents>\n' +
      '    <Key>template.odt</Key>\n' +
      '    <Size>11822</Size>\n' +
      '  </Contents>\n' +
      '  <Contents>\n' +
      '    <Key>template.docx</Key>\n' +
      '    <Size>85000</Size>\n' +
      '  </Contents>\n';

    const _expected = {
      name: 'www',
      istruncated: false,
      contents: [
        { key: 'template.odt',  size: 11822 },
        { key: 'template.docx', size: 85000 },
      ],
    };

    _assert(xmlToJson(_xml, { forceArray: ['contents'] }), _expected);
  });

  it('should ignore the attributes of a tag', function () {
    const _xml = '<Bucket id="12" class="a b"><Name>Eric</Name></Bucket>';

    _assert(xmlToJson(_xml), { bucket: { name: 'Eric' } });
  });

  it('should convert booleans whatever the case', function () {
    const _xml = '<A>true</A><B>TRUE</B><C>False</C><D>fAlSe</D>';

    _assert(xmlToJson(_xml), { a: true, b: true, c: false, d: false });
  });

  it('should return an empty string if the tag has no value', function () {
    _assert(xmlToJson('<Name></Name><Color>Blue</Color>'), { name: '', color: 'Blue' });
  });

  it('should parse negative numbers', function () {
    _assert(xmlToJson('<Size>-42</Size>'), { size: -42 });
  });

  it('should force several elements to be arrays, and leave the others untouched (options: forceArray)', function () {
    const _xml = '<Deleted><Key>a.odt</Key></Deleted><Error><Key>b.odt</Key></Error><Bucket><Name>www</Name></Bucket>';

    const _expected = {
      deleted: [ { key: 'a.odt' } ],
      error: [ { key: 'b.odt' } ],
      bucket: { name: 'www' },
    };

    _assert(xmlToJson(_xml, { forceArray: ['deleted', 'error'] }), _expected);
  });

  it('should not force anything if the "forceArray" names do not match', function () {
    _assert(xmlToJson('<Bucket><Name>www</Name></Bucket>', { forceArray: ['nothing'] }), { bucket: { name: 'www' } });
  });

  it('should keep the decimal part of a float', function () {
    _assert(xmlToJson('<V>1.75</V>'), { v: 1.75 });
    _assert(xmlToJson('<V>-0.5</V>'), { v: -0.5 });
    _assert(xmlToJson('<V>.5</V>'), { v: 0.5 });
    _assert(xmlToJson('<V>1e3</V>'), { v: 1000 });
  });

  /**
   * `getValue` coerces every numeric-looking value. The cases below are the current
   * behaviour, kept under test so any change to the coercion is intentional and visible.
   */
  it('should coerce the other numeric-looking values (current behaviour)', function () {
    _assert(xmlToJson('<V>0123</V>'), { v: 123 });         /** a leading-zero id loses its zeros */
    _assert(xmlToJson('<V>0x10</V>'), { v: 16 });          /** an hexadecimal string is converted */
    _assert(xmlToJson('<V> 42 </V>'), { v: 42 });          /** surrounding spaces are ignored */
    _assert(xmlToJson('<V>12345678901234567890</V>'), { v: 12345678901234567000 }); /** beyond 2^53 the precision is lost */
  });

  it('should return the values of "forceString" elements exactly as written (options: forceString)', function () {
    const _xml = '<A>0001</A><B>1e3</B><C>true</C><D>12345678901234567890</D><E> 42 </E><F>"quoted"</F><G>0001</G>';

    _assert(xmlToJson(_xml, { forceString: ['a', 'b', 'c', 'd', 'e', 'f'] }), { a: '0001', b: '1e3', c: 'true', d: '12345678901234567890', e: ' 42 ', f: '"quoted"', g: 1 });
  });

  it('should apply "forceString" to the elements of a list (options: forceString)', function () {
    const _xml = '<IsTruncated>false</IsTruncated><Contents><Key>0001</Key><Size>10</Size></Contents><Contents><Key>true</Key><Size>20</Size></Contents>';

    _assert(xmlToJson(_xml, { forceArray: ['contents'], forceString: ['key'] }), {
      istruncated: false,
      contents: [ { key: '0001', size: 10 }, { key: 'true', size: 20 } ]
    });
  });

  it('should decode the predefined XML entities', function () {
    _assert(xmlToJson('<Key>a&amp;b &lt;c&gt; &quot;d&quot; &apos;e&apos;.pdf</Key>'), { key: 'a&b <c> "d" \'e\'.pdf' });
  });

  it('should decode the decimal and hexadecimal character references', function () {
    _assert(xmlToJson('<Key>l&#39;offre&#x9;&#xA;&#xd;&#128512;&#x1F600;.pdf</Key>'), { key: 'l\'offre\t\n\r😀😀.pdf' });
  });

  it('should decode the entities in a single pass', function () {
    _assert(xmlToJson('<Key>&amp;lt;&amp;amp;&amp;#39;</Key>'), { key: '&lt;&amp;&#39;' });
  });

  it('should keep unknown entities, invalid references and lone ampersands as written', function () {
    _assert(xmlToJson('<Key>a&nbsp;b &#x110000; &#xZZ; & &amp b</Key>'), { key: 'a&nbsp;b &#x110000; &#xZZ; & &amp b' });
  });

  it('should decode the entities of "forceString" elements, and of the elements of a list', function () {
    const _xml = '<Contents><Key>&#48;001</Key></Contents><Contents><Key>&quot;quoted&quot;</Key></Contents>';
    _assert(xmlToJson(_xml, { forceArray: ['contents'], forceString: ['key'] }), { contents: [ { key: '0001' }, { key: '"quoted"' } ] });
  });

  it('should return an ETag without its double quotes written as entities', function () {
    _assert(xmlToJson('<ETag>&quot;fde6d729123cee4db6bfa3606306bc8c&quot;</ETag>'), { etag: 'fde6d729123cee4db6bfa3606306bc8c' });
    _assert(xmlToJson('<ETag>&#34;fde6d729123cee4db6bfa3606306bc8c-3&#34;</ETag>'), { etag: 'fde6d729123cee4db6bfa3606306bc8c-3' });
  });

  it('should always return an ETag as a string, without the double quotes', function () {
    _assert(xmlToJson('<ETag>12345678901234567890123456789012</ETag>'), { etag: '12345678901234567890123456789012' });
    _assert(xmlToJson('<ETag>1234567890123e456789012345678901</ETag>'), { etag: '1234567890123e456789012345678901' });
    _assert(xmlToJson('<ETag>"12345678901234567890123456789012"</ETag>'), { etag: '12345678901234567890123456789012' });
    _assert(xmlToJson('<ETag>"fde6d729123cee4db6bfa3606306bc8c-3"</ETag>'), { etag: 'fde6d729123cee4db6bfa3606306bc8c-3' });
  });

  it('should return the Error response from S3 as JSON', function () {
    const _xml =
      '<?xml version="1.0" encoding="UTF-8"?>' +
      '<Error>' +
        '<Code>NoSuchKey</Code>' +
        '<Message>The resource you requested does not exist</Message>' +
        '<Resource>/mybucket/myfoto.jpg</Resource>' +
        '<RequestId>4442587FB7D0A2F9</RequestId>' +
      '</Error>';

    const _json = xmlToJson(_xml);

    const _expected = {
      error: {
        code: 'NoSuchKey',
        message: 'The resource you requested does not exist',
        resource: '/mybucket/myfoto.jpg',
        requestid: '4442587FB7D0A2F9',
      }
    };

    _assert(_json, _expected);
  });
});
