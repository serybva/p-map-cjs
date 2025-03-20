// From https://github.com/sindresorhus/random-int/blob/c37741b56f76b9160b0b63dae4e9c64875128146/index.js#L13-L15
const randomInteger = (minimum: number, maximum: number) =>
	Math.floor(Math.random() * (maximum - minimum + 1) + minimum);

const createAbortError = () => {
	const error = new Error("Delay aborted");
	error.name = "AbortError";
	return error;
};

const clearMethods = new WeakMap();

type DelayOptions<T> = {
	value: T;
	signal?: AbortSignal;
};

export function createDelay() {
	// We cannot use `async` here as we need the promise identity.
	return <T = undefined>(
		milliseconds: number,
		{ value, signal } = {} as DelayOptions<T>,
	): Promise<T> => {
		// TODO: Use `signal?.throwIfAborted()` when targeting Node.js 18.
		if (signal?.aborted) {
			return Promise.reject(createAbortError());
		}

		let timeoutId: NodeJS.Timeout | null;
		let settle: () => void;
		let rejectFunction: (error: Error) => void;
		const clear = clearTimeout;

		const signalListener = () => {
			if (timeoutId) {
				clear(timeoutId);
			}
			rejectFunction(createAbortError());
		};

		const cleanup = () => {
			if (signal) {
				signal.removeEventListener("abort", signalListener);
			}
		};

		const delayPromise = new Promise<T>((resolve, reject) => {
			settle = () => {
				cleanup();
				resolve(value);
			};

			rejectFunction = reject;
			timeoutId = setTimeout(settle, milliseconds);
		});

		if (signal) {
			signal.addEventListener("abort", signalListener, { once: true });
		}

		clearMethods.set(delayPromise, () => {
			if (timeoutId) {
				clear(timeoutId);
			}
			timeoutId = null;
			settle();
		});

		return delayPromise;
	};
}

const delay = createDelay();

export default delay;

export async function rangeDelay<T>(
	minimum: number,
	maximum: number,
	options: DelayOptions<T>,
) {
	return delay(randomInteger(minimum, maximum), options);
}

export function clearDelay<T>(promise: Promise<T>) {
	clearMethods.get(promise)?.();
}
