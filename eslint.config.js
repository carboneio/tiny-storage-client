module.exports = [
  {
    files: ["**/*.js"],
    languageOptions: {
      globals: {
        /** NODE: https://github.com/sindresorhus/globals/blob/HEAD/globals.json */
        __dirname: false,
        __filename: false,
        AbortController: false,
        AbortSignal: false,
        atob: false,
        Blob: false,
        BroadcastChannel: false,
        btoa: false,
        Buffer: false,
        ByteLengthQueuingStrategy: false,
        clearImmediate: false,
        clearInterval: false,
        clearTimeout: false,
        CloseEvent: false,
        CompressionStream: false,
        console: false,
        CountQueuingStrategy: false,
        crypto: false,
        Crypto: false,
        CryptoKey: false,
        CustomEvent: false,
        DecompressionStream: false,
        DOMException: false,
        Event: false,
        EventTarget: false,
        exports: true,
        fetch: false,
        File: false,
        FormData: false,
        global: false,
        Headers: false,
        MessageChannel: false,
        MessageEvent: false,
        MessagePort: false,
        module: false,
        navigator: false,
        Navigator: false,
        performance: false,
        Performance: false,
        PerformanceEntry: false,
        PerformanceMark: false,
        PerformanceMeasure: false,
        PerformanceObserver: false,
        PerformanceObserverEntryList: false,
        PerformanceResourceTiming: false,
        process: false,
        queueMicrotask: false,
        ReadableByteStreamController: false,
        ReadableStream: false,
        ReadableStreamBYOBReader: false,
        ReadableStreamBYOBRequest: false,
        ReadableStreamDefaultController: false,
        ReadableStreamDefaultReader: false,
        Request: false,
        require: false,
        Response: false,
        setImmediate: false,
        setInterval: false,
        setTimeout: false,
        structuredClone: false,
        SubtleCrypto: false,
        TextDecoder: false,
        TextDecoderStream: false,
        TextEncoder: false,
        TextEncoderStream: false,
        TransformStream: false,
        TransformStreamDefaultController: false,
        URL: false,
        URLSearchParams: false,
        WebAssembly: false,
        WebSocket: false,
        WritableStream: false,
        WritableStreamDefaultController: false,
        WritableStreamDefaultWriter: false,
        /** MOCHA */
        after: false,
        afterEach: false,
        before: false,
        beforeEach: false,
        context: false,
        describe: false,
        it: false,
        mocha: false,
        run: false,
        setup: false,
        specify: false,
        suite: false,
        suiteSetup: false,
        suiteTeardown: false,
        teardown: false,
        test: false,
        xcontext: false,
        xdescribe: false,
        xit: false,
        xspecify: false,
      },
    },
    rules: {
      /** RECOMMENDED: https://github.com/eslint/eslint/blob/main/packages/js/src/configs/eslint-recommended.js */
      semi: "error",
      "prefer-const": "error",
      "constructor-super": "error",
      "for-direction": "error",
      "getter-return": "error",
      "no-async-promise-executor": "error",
      "no-case-declarations": "error",
      "no-class-assign": "error",
      "no-compare-neg-zero": "error",
      "no-cond-assign": "error",
      "no-const-assign": "error",
      "no-constant-binary-expression": "error",
      "no-constant-condition": "error",
      "no-control-regex": "error",
      "no-debugger": "error",
      "no-delete-var": "error",
      "no-dupe-args": "error",
      "no-dupe-class-members": "error",
      "no-dupe-else-if": "error",
      "no-dupe-keys": "error",
      "no-duplicate-case": "error",
      "no-empty": "error",
      "no-empty-character-class": "error",
      "no-empty-pattern": "error",
      "no-empty-static-block": "error",
      "no-ex-assign": "error",
      "no-extra-boolean-cast": "error",
      "no-fallthrough": "error",
      "no-func-assign": "error",
      "no-global-assign": "error",
      "no-import-assign": "error",
      "no-invalid-regexp": "error",
      "no-irregular-whitespace": "error",
      "no-loss-of-precision": "error",
      "no-misleading-character-class": "error",
      "no-new-native-nonconstructor": "error",
      "no-nonoctal-decimal-escape": "error",
      "no-obj-calls": "error",
      "no-octal": "error",
      "no-prototype-builtins": "error",
      "no-redeclare": "error",
      "no-regex-spaces": "error",
      "no-self-assign": "error",
      "no-setter-return": "error",
      "no-shadow-restricted-names": "error",
      "no-sparse-arrays": "error",
      "no-this-before-super": "error",
      "no-undef": "error",
      "no-unexpected-multiline": "error",
      "no-unreachable": "error",
      "no-unsafe-finally": "error",
      "no-unsafe-negation": "error",
      "no-unsafe-optional-chaining": "error",
      "no-unused-labels": "error",
      "no-unused-private-class-members": "error",
      "no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "no-useless-backreference": "error",
      "no-useless-catch": "error",
      "no-useless-escape": "error",
      "no-with": "error",
      "require-yield": "error",
      "use-isnan": "error",
      "valid-typeof": "error",
    },
  },
];
