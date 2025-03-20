import { ExecutionContext } from "ava";
import chalk from "chalk";
import inRange from "./in-range";

export default function assertInRange(
	t: ExecutionContext,
	value: number,
	{ start = 0, end = 0 }: { start?: number; end?: number },
) {
	if (inRange(value, { start, end })) {
		t.pass();
	} else {
		t.fail(
			`${start} ${start <= value ? "≤" : chalk.red("≰")} ${chalk.yellow(value)} ${value <= end ? "≤" : chalk.red("≰")} ${end}`,
		);
	}
}
