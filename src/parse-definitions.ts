import { readdir, statSync } from "fs-extra";
import * as path from "path";
import * as yargs from "yargs";

import { Options, writeDataFile } from "./lib/common";
import * as parser from "./lib/definition-parser";
import { typesDataFilename, TypingsVersionsRaw } from "./lib/packages";
import { logger, moveLogs, quietLogger, writeLog } from "./util/logging";
import { done, nAtATime } from "./util/util";

if (!module.parent) {
	const singleName = yargs.argv.single;
	done((singleName ? single(singleName, Options.defaults) : main(Options.defaults)));
}

export default async function main(options: Options): Promise<void> {
	const [summaryLog, summaryLogResult] = logger();
	const [detailedLog, detailedLogResult] = quietLogger();

	summaryLog("# Typing Publish Report Summary");
	summaryLog(`Started at ${(new Date()).toUTCString()}`);

	let packageNames = await readdir(options.typesPath);
	packageNames = packageNames.filter(packageName => statSync(path.join(options.typesPath, packageName)).isDirectory());

	summaryLog(`Found ${packageNames.length} typings folders in ${options.typesPath}`);

	const typings: { [name: string]: TypingsVersionsRaw } = {};

	await nAtATime(1, packageNames, use, { name: "Parsing...", flavor: name => name, options });
	async function use(packageName: string): Promise<void> {
		const { data, logs } = await parser.getTypingInfo(packageName, options);
		typings[packageName] = data;

		// Flush detailed log
		detailedLog(`# ${packageName}`);
		moveLogs(detailedLog, logs);
	}

	await Promise.all([
		writeLog("parser-log-summary.md", summaryLogResult()),
		writeLog("parser-log-details.md", detailedLogResult()),
		writeDataFile(typesDataFilename, typings)
	]);
}

async function single(singleName: string, options: Options): Promise<void> {
	const result = await parser.getTypingInfo(singleName, options);
	const typings = { [singleName]: result.data };
	await writeDataFile(typesDataFilename, typings);
	console.log(JSON.stringify(result, undefined, 4));
}
