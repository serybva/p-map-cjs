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

export default async function pMap<Element, NewElement>(
	iterable:
		| AsyncIterable<Element | Promise<Element>>
		| Iterable<Element | Promise<Element>>,
	mapper: (
		element: Element,
		index: number,
	) => Promise<NewElement | typeof pMapSkip> | NewElement | typeof pMapSkip,
	{
		concurrency = Number.POSITIVE_INFINITY,
		stopOnError = true,
		signal,
	}: Options = {},
): Promise<Array<Exclude<NewElement, typeof pMapSkip>>> {
	return new Promise((resolve_, reject_) => {
		if (
			!(
				Symbol.iterator in Object(iterable) ||
				Symbol.asyncIterator in Object(iterable)
			)
		) {
			throw new TypeError(
				`Expected \`input\` to be either an \`Iterable\` or \`AsyncIterable\`, got (${typeof iterable})`,
			);
		}

		if (typeof mapper !== "function") {
			throw new TypeError("Mapper function is required");
		}

		if (
			!(
				(Number.isSafeInteger(concurrency) && concurrency >= 1) ||
				concurrency === Number.POSITIVE_INFINITY
			)
		) {
			throw new TypeError(
				`Expected \`concurrency\` to be an integer from 1 and up or \`Infinity\`, got \`${concurrency}\` (${typeof concurrency})`,
			);
		}

		const result: Array<NewElement | typeof pMapSkip> = [];
		const errors: Error[] = [];
		const skippedIndexesMap = new Map<number, typeof pMapSkip>();
		let isRejected = false;
		let isResolved = false;
		let isIterableDone = false;
		let resolvingCount = 0;
		let currentIndex = 0;
		const iterator =
			Symbol.iterator in Object(iterable)
				? (iterable as Iterable<Element>)[Symbol.iterator]()
				: (iterable as AsyncIterable<Element>)[Symbol.asyncIterator]()!;

		const signalListener = () => {
			reject(signal!.reason);
		};

		const cleanup = () => {
			signal?.removeEventListener("abort", signalListener);
		};

		const resolve = (value: Array<Exclude<NewElement, typeof pMapSkip>>) => {
			resolve_(value);
			cleanup();
		};

		const reject = (reason: any) => {
			isRejected = true;
			isResolved = true;
			reject_(reason);
			cleanup();
		};

		if (signal) {
			if (signal.aborted) {
				reject(signal.reason);
			}
			signal.addEventListener("abort", signalListener, { once: true });
		}

		const next = async () => {
			if (isResolved) {
				return;
			}

			const nextItem = await iterator.next();
			const index = currentIndex++;

			// Note: `iterator.next()` can be called many times in parallel.
			// This can cause multiple calls to this `next()` function to
			// receive a `nextItem` with `done === true`.
			// The shutdown logic that rejects/resolves must be protected
			// so it runs only one time as the `skippedIndex` logic is
			// non-idempotent.
			if (nextItem.done) {
				isIterableDone = true;

				if (resolvingCount === 0 && !isResolved) {
					if (!stopOnError && errors.length > 0) {
						reject(new AggregateError(errors));
						return;
					}

					isResolved = true;

					if (skippedIndexesMap.size === 0) {
						resolve(result as Array<Exclude<NewElement, typeof pMapSkip>>);
						return;
					}

					const pureResult = [];

					// Support multiple `pMapSkip`'s.
					for (const [index, value] of result.entries()) {
						if (skippedIndexesMap.get(index) === pMapSkip) {
							continue;
						}
						pureResult.push(value);
					}

					resolve(pureResult as Array<Exclude<NewElement, typeof pMapSkip>>);
				}

				return;
			}

			resolvingCount++;

			// Intentionally detached
			(async () => {
				try {
					const element = await nextItem.value;

					if (isResolved) {
						return;
					}

					const value = await mapper(element, index);
					// Use Map to stage the index of the element.
					if (value === pMapSkip) {
						skippedIndexesMap.set(index, value as typeof pMapSkip);
					}

					result[index] = value;

					resolvingCount--;
					await next();
				} catch (error) {
					if (stopOnError) {
						reject(error);
					} else {
						errors.push(error);
						resolvingCount--;

						// In that case we can't really continue regardless of `stopOnError` state
						// since an iterable is likely to continue throwing after it throws once.
						// If we continue calling `next()` indefinitely we will likely end up
						// in an infinite loop of failed iteration.
						try {
							await next();
						} catch (error) {
							reject(error);
						}
					}
				}
			})();
		};

		// Create the concurrent runners in a detached (non-awaited)
		// promise. We need this so we can await the `next()` calls
		// to stop creating runners before hitting the concurrency limit
		// if the iterable has already been marked as done.
		// NOTE: We *must* do this for async iterators otherwise we'll spin up
		// infinite `next()` calls by default and never start the event loop.
		(async () => {
			for (let i = 0; i < concurrency; i++) {
				try {
					await next();
				} catch (error) {
					reject(error);
					break;
				}

				if (isIterableDone || isRejected) {
					break;
				}
			}
		})();
	});
}

type PMapIterablePromise<NewElement> = Promise<
	| { done: boolean; value?: undefined; error?: undefined }
	| { done: boolean; value: symbol | Awaited<NewElement>; error?: undefined }
	| { error: any; done?: undefined; value?: undefined }
>;

export function pMapIterable<Element, NewElement>(
	iterable:
		| AsyncIterable<Element | Promise<Element>>
		| Iterable<Element | Promise<Element>>,
	mapper: Mapper<Element, NewElement>,
	{
		concurrency = Number.POSITIVE_INFINITY,
		backpressure = concurrency,
	}: IterableOptions = {},
) {
	if (
		(iterable as any)[Symbol.iterator] === undefined &&
		(iterable as any)[Symbol.asyncIterator] === undefined
	) {
		throw new TypeError(
			`Expected \`input\` to be either an \`Iterable\` or \`AsyncIterable\`, got (${typeof iterable})`,
		);
	}

	if (typeof mapper !== "function") {
		throw new TypeError("Mapper function is required");
	}

	if (
		!(
			(Number.isSafeInteger(concurrency) && concurrency >= 1) ||
			concurrency === Number.POSITIVE_INFINITY
		)
	) {
		throw new TypeError(
			`Expected \`concurrency\` to be an integer from 1 and up or \`Infinity\`, got \`${concurrency}\` (${typeof concurrency})`,
		);
	}

	if (
		!(
			(Number.isSafeInteger(backpressure) && backpressure >= concurrency) ||
			backpressure === Number.POSITIVE_INFINITY
		)
	) {
		throw new TypeError(
			`Expected \`backpressure\` to be an integer from \`concurrency\` (${concurrency}) and up or \`Infinity\`, got \`${backpressure}\` (${typeof backpressure})`,
		);
	}

	return (async function* () {
		const iterator =
			(iterable as any)[Symbol.asyncIterator] === undefined
				? (iterable as Iterable<Element>)[Symbol.iterator]()
				: (iterable as AsyncIterable<Element>)[Symbol.asyncIterator]();

		const promises: PMapIterablePromise<NewElement>[] = [];
		let runningMappersCount = 0;
		let isDone = false;
		let index = 0;

		function trySpawn() {
			if (
				isDone ||
				!(runningMappersCount < concurrency && promises.length < backpressure)
			) {
				return;
			}

			const promise = (async () => {
				const { done, value } = await iterator.next();

				if (done) {
					return { done: true };
				}

				runningMappersCount++;

				// Spawn if still below concurrency and backpressure limit
				trySpawn();

				try {
					const returnValue = await mapper(await value, index++);

					runningMappersCount--;

					if (returnValue === pMapSkip) {
						return { done: true, value: pMapSkip };
					}

					// Spawn if still below backpressure limit and just dropped below concurrency limit
					trySpawn();

					return { done: false, value: returnValue };
				} catch (error) {
					isDone = true;
					return { error };
				}
			})().then((result) => {
				if (result.done && result.value === pMapSkip) {
					const index = promises.indexOf(promise);

					if (index > 0) {
						promises.splice(index, 1);
					}
				}
				return result;
			});

			promises.push(promise);
		}

		trySpawn();

		while (promises.length > 0) {
			const { error, done, value } = await promises[0]; // eslint-disable-line no-await-in-loop

			promises.shift();

			if (error) {
				throw error;
			}

			if (done) {
				return;
			}

			// Spawn if just dropped below backpressure limit and below the concurrency limit
			trySpawn();

			if (value === pMapSkip) {
				continue;
			}

			yield value as Exclude<NewElement, typeof pMapSkip>;
		}
	})();
}

export const pMapSkip = Symbol("skip");
