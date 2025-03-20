export type BaseOptions = {
	/**
    Number of concurrently pending promises returned by `mapper`.

    Must be an integer from 1 and up or `Infinity`.

    @default Infinity
    */
	readonly concurrency?: number;
};
export type Options = BaseOptions & {
	/**
    When `true`, the first mapper rejection will be rejected back to the consumer.

    When `false`, instead of stopping when a promise rejects, it will wait for all the promises to settle and then reject with an [`AggregateError`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/AggregateError) containing all the errors from the rejected promises.

    Caveat: When `true`, any already-started async mappers will continue to run until they resolve or reject. In the case of infinite concurrency with sync iterables, *all* mappers are invoked on startup and will continue after the first rejection. [Issue #51](https://github.com/sindresorhus/p-map/issues/51) can be implemented for abort control.

    @default true
    */
	readonly stopOnError?: boolean;
	/**
    You can abort the promises using [`AbortController`](https://developer.mozilla.org/en-US/docs/Web/API/AbortController).

    @example
    ```
    import pMap from 'p-map';
    import delay from 'delay';

    const abortController = new AbortController();

    setTimeout(() => {
        abortController.abort();
    }, 500);

    const mapper = async value => value;

    await pMap([delay(1000), delay(1000)], mapper, {signal: abortController.signal});
    // Throws AbortError (DOMException) after 500 ms.
    ```
    */
	readonly signal?: AbortSignal;
};
export type IterableOptions = BaseOptions & {
	/**
    Maximum number of promises returned by `mapper` that have resolved but not yet collected by the consumer of the async iterable. Calls to `mapper` will be limited so that there is never too much backpressure.

    Useful whenever you are consuming the iterable slower than what the mapper function can produce concurrently. For example, to avoid making an overwhelming number of HTTP requests if you are saving each of the results to a database.

    Default: `options.concurrency`
    */
	readonly backpressure?: number;
};
type MaybePromise<T> = T | Promise<T>;
/**
Function which is called for every item in `input`. Expected to return a `Promise` or value.

@param element - Iterated element.
@param index - Index of the element in the source array.
*/
export type Mapper<Element = any, NewElement = unknown> = (
	element: Element,
	index: number,
) => MaybePromise<NewElement | typeof pMapSkip>;
export default function pMap<Element, NewElement>(
	iterable:
		| AsyncIterable<Element | Promise<Element>>
		| Iterable<Element | Promise<Element>>,
	mapper: (
		element: Element,
		index: number,
	) => Promise<NewElement | typeof pMapSkip> | NewElement | typeof pMapSkip,
	{ concurrency, stopOnError, signal }?: Options,
): Promise<Array<Exclude<NewElement, typeof pMapSkip>>>;
export declare function pMapIterable<Element, NewElement>(
	iterable:
		| AsyncIterable<Element | Promise<Element>>
		| Iterable<Element | Promise<Element>>,
	mapper: Mapper<Element, NewElement>,
	{ concurrency, backpressure }?: IterableOptions,
): AsyncGenerator<Exclude<NewElement, typeof pMapSkip>, void, unknown>;
export declare const pMapSkip: unique symbol;
export {};
