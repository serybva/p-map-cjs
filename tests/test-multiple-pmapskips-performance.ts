import test from "ava";
import assertInRange from "./utils/assert-in-range";
import pMap, { pMapSkip } from "../index";
import { timeSpan } from "./utils/time-span";

function generateSkipPerformanceData(length: number): (typeof pMapSkip)[] {
	const data: (typeof pMapSkip)[] = [];
	for (let index = 0; index < length; index++) {
		data.push(pMapSkip);
	}

	return data;
}

test("multiple pMapSkips - algorithmic complexity", async (t) => {
	const testData = [
		generateSkipPerformanceData(1000),
		generateSkipPerformanceData(10_000),
		generateSkipPerformanceData(100_000),
	];
	const testDurationsMS: number[] = [];

	for (const data of testData) {
		const end = timeSpan();
		// eslint-disable-next-line no-await-in-loop
		await pMap(data, async (value) => value);
		testDurationsMS.push(Number(end()));
	}

	for (let index = 0; index < testDurationsMS.length - 1; index++) {
		// Time for 10x more items should take between 9x and 11x more time.
		const smallerDuration = testDurationsMS[index];
		const longerDuration = testDurationsMS[index + 1];

		// The longer test needs to be a little longer and also not 10x more than the
		// shorter test. This is not perfect... there is some fluctuation.
		// The idea here is to catch a regression that makes `pMapSkip` handling O(n^2)
		// on the number of `pMapSkip` items in the input.
		assertInRange(t, longerDuration, {
			start: 1.2 * smallerDuration,
			end: 15 * smallerDuration,
		});
	}
});
