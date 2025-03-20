const min = (left: Number | BigInt, right: Number | BigInt) =>
	left < right ? left : right;
const max = (left: Number | BigInt, right: Number | BigInt) =>
	left > right ? left : right;

const isNumberOrBigInt = (value: Number | BigInt) =>
	["number", "bigint"].includes(typeof value);

const inRange = (
	number: Number | BigInt,
	{ start = 0, end }: { start?: Number | BigInt; end: Number | BigInt },
) => {
	if (
		!isNumberOrBigInt(number) ||
		!isNumberOrBigInt(start) ||
		!isNumberOrBigInt(end)
	) {
		throw new TypeError(
			"Expected each argument to be either a number or a BigInt",
		);
	}

	return number >= min(start, end) && number <= max(end, start);
};

export default inRange;
