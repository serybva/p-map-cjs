# p-map-cjs

## A drop in replacement for p-map that supports CJS

### Why

From version 4 onwards, p-map and all other packages issued by https://github.com/sindresorhus it seems, are ESM only.

While evolution is a good thing it's unrealistic that entire codebases will adapt in a few month, if at all.

Before v4 `p-map` uses a custom packages `aggregate-error` as a replacement of `AggregateError` for compatibility with node versions < 15.
And this package is now ESM only as well since v4, and the `errors` property was also added in the v4.

As a result, if you use `p-map` in a CJs project, and you happen to have an AggregateError you can't have any details about the aggregated errors unles you convert it to string.

### Improvements:

- Unmodified package name so you don't have to rewrite your imports
- Sources are now in typescript
- CJS compatible

> Map over promises concurrently

Useful when you need to run promise-returning & async functions multiple times with different inputs concurrently.

This is different from `Promise.all()` in that you can control the concurrency and also decide whether or not to stop iterating when there's an error.

## Install

```sh
yarn add p-map@https://github.com/serybva/p-map-cjs.git
```

## Usage

```js
import pMap from "p-map";
import got from "got";

const sites = [
	getWebsiteFromUsername("sindresorhus"), //=> Promise
	"https://avajs.dev",
	"https://github.com",
];

const mapper = async (site) => {
	const { requestUrl } = await got.head(site);
	return requestUrl;
};

const result = await pMap(sites, mapper, { concurrency: 2 });

console.log(result);
//=> ['https://sindresorhus.com/', 'https://avajs.dev/', 'https://github.com/']
```

## API

### pMap(input, mapper, options?)

Returns a `Promise` that is fulfilled when all promises in `input` and ones returned from `mapper` are fulfilled, or rejects if any of the promises reject. The fulfilled value is an `Array` of the fulfilled values returned from `mapper` in `input` order.

### pMapIterable(input, mapper, options?)

Returns an async iterable that streams each return value from `mapper` in order.

```js
import { pMapIterable } from "p-map";

// Multiple posts are fetched concurrently, with limited concurrency and backpressure
for await (const post of pMapIterable(postIds, getPostMetadata, {
	concurrency: 8,
})) {
	console.log(post);
}
```

#### input

Type: `AsyncIterable<Promise<unknown> | unknown> | Iterable<Promise<unknown> | unknown>`

Synchronous or asynchronous iterable that is iterated over concurrently, calling the `mapper` function for each element. Each iterated item is `await`'d before the `mapper` is invoked so the iterable may return a `Promise` that resolves to an item.

Asynchronous iterables (different from synchronous iterables that return `Promise` that resolves to an item) can be used when the next item may not be ready without waiting for an asynchronous process to complete and/or the end of the iterable may be reached after the asynchronous process completes. For example, reading from a remote queue when the queue has reached empty, or reading lines from a stream.

#### mapper(element, index)

Type: `Function`

Expected to return a `Promise` or value.

#### options

Type: `object`

##### concurrency

Type: `number` _(Integer)_\
Default: `Infinity`\
Minimum: `1`

Number of concurrently pending promises returned by `mapper`.

##### backpressure

**Only for `pMapIterable`**

Type: `number` _(Integer)_\
Default: `options.concurrency`\
Minimum: `options.concurrency`

Maximum number of promises returned by `mapper` that have resolved but not yet collected by the consumer of the async iterable. Calls to `mapper` will be limited so that there is never too much backpressure.

Useful whenever you are consuming the iterable slower than what the mapper function can produce concurrently. For example, to avoid making an overwhelming number of HTTP requests if you are saving each of the results to a database.

##### stopOnError

**Only for `pMap`**

Type: `boolean`\
Default: `true`

When `true`, the first mapper rejection will be rejected back to the consumer.

When `false`, instead of stopping when a promise rejects, it will wait for all the promises to settle and then reject with an [`AggregateError`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/AggregateError) containing all the errors from the rejected promises.

Caveat: When `true`, any already-started async mappers will continue to run until they resolve or reject. In the case of infinite concurrency with sync iterables, _all_ mappers are invoked on startup and will continue after the first rejection. [Issue #51](https://github.com/sindresorhus/p-map/issues/51) can be implemented for abort control.

##### signal

**Only for `pMap`**

Type: [`AbortSignal`](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal)

You can abort the promises using [`AbortController`](https://developer.mozilla.org/en-US/docs/Web/API/AbortController).

```js
import pMap from "p-map";
import delay from "delay";

const abortController = new AbortController();

setTimeout(() => {
	abortController.abort();
}, 500);

const mapper = async (value) => value;

await pMap([delay(1000), delay(1000)], mapper, {
	signal: abortController.signal,
});
// Throws AbortError (DOMException) after 500 ms.
```

### pMapSkip

Return this value from a `mapper` function to skip including the value in the returned array.

```js
import pMap, { pMapSkip } from "p-map";
import got from "got";

const sites = [
	getWebsiteFromUsername("sindresorhus"), //=> Promise
	"https://avajs.dev",
	"https://example.invalid",
	"https://github.com",
];

const mapper = async (site) => {
	try {
		const { requestUrl } = await got.head(site);
		return requestUrl;
	} catch {
		return pMapSkip;
	}
};

const result = await pMap(sites, mapper, { concurrency: 2 });

console.log(result);
//=> ['https://sindresorhus.com/', 'https://avajs.dev/', 'https://github.com/']
```
