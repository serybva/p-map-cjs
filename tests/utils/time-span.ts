export function convertHrtime(hrtime: bigint) {
	const nanoseconds = hrtime;
	const number = Number(nanoseconds);
	const milliseconds = number / 1000000;
	const seconds = number / 1000000000;

	return {
		seconds,
		milliseconds,
		nanoseconds,
	};
}

export function timeSpan() {
	const start = process.hrtime.bigint();
	const end = (type: keyof ReturnType<typeof convertHrtime>) =>
		convertHrtime(process.hrtime.bigint() - start)[type];

	const returnValue = () => Number(end("milliseconds"));
	returnValue.rounded = () => Math.round(Number(end("milliseconds")));
	returnValue.seconds = () => Number(end("seconds"));
	returnValue.nanoseconds = () => Number(end("nanoseconds"));

	return returnValue;
}
