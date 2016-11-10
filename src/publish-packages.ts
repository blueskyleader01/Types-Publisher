import * as fs from "fs";
import * as yargs from "yargs";

import { Options, existsTypesDataFileSync, readAllPackagesArray } from "./lib/common";
import NpmClient from "./lib/npm-client";
import * as publisher from "./lib/package-publisher";
import Versions, { changedPackages } from "./lib/versions";
import { LogWithErrors, logger, writeLog } from "./util/logging";
import { done } from "./util/util";

if (!module.parent) {
	if (!existsTypesDataFileSync()) {
		console.log("Run parse-definitions first!");
	}
	else if (!Versions.existsSync()) {
		console.log("Run calculate-versions first!");
	}
	else if (!fs.existsSync("./output") || fs.readdirSync("./output").length === 0) {
		console.log("Run generate-packages first!");
	}
	else {
		const dry = !!yargs.argv.dry;
		const singleName = yargs.argv.single;
		// For testing only. Do not use on real @types repo.
		const shouldUnpublish = !!yargs.argv.unpublish;

		if (singleName && shouldUnpublish) {
			throw new Error("Select only one of --single=foo or --shouldUnpublish");
		}

		done(go());

		async function go(): Promise<void> {
			if (shouldUnpublish) {
				await unpublish(dry, Options.defaults);
			}
			else {
				const client = await NpmClient.create();
				if (singleName) {
					await single(client, singleName, dry, Options.defaults);
				}
				else {
					await main(client, dry, Options.defaults);
				}
			}
		}
	}
}

export default async function main(client: NpmClient, dry: boolean, options: Options): Promise<void> {
	const [log, logResult] = logger();
	if (dry) {
		log("=== DRY RUN ===");
	}

	const packagesShouldPublish = await changedPackages(await readAllPackagesArray(options));

	for (const pkg of packagesShouldPublish) {
		console.log(`Publishing ${pkg.libraryName}...`);
		const publishLog = await publisher.publishPackage(client, pkg, dry);
		writeLogs({ infos: publishLog, errors: [] });
	}

	function writeLogs(res: LogWithErrors): void {
		for (const line of res.infos) {
			log(`   * ${line}`);
		}
		for (const err of res.errors) {
			log(`   * ERROR: ${err}`);
		}
	}

	await writeLog("publishing.md", logResult());
	console.log("Done!");
}

async function single(client: NpmClient, name: string, dry: boolean, options: Options): Promise<void> {
	const pkg = (await readAllPackagesArray(options)).find(p => p.typingsPackageName === name);
	if (pkg === undefined) {
		throw new Error(`Can't find a package named ${name}`);
	}

	const publishLog = await publisher.publishPackage(client, pkg, dry);

	console.log(publishLog);
}

async function unpublish(dry: boolean, options: Options): Promise<void> {
	for (const pkg of await readAllPackagesArray(options)) {
		await publisher.unpublishPackage(pkg, dry);
	}
}
