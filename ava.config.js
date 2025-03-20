module.exports = {
	timeout: "2m",
	extensions: ["ts"],
	require: ["ts-node/register"],
	files: ["tests/**/*", "!tests/utils/*", "!tests/index.test-d.ts"],
};
