import * as fs from "fs";
import * as yargs from "yargs";

import { Options } from "./lib/common";
import { AllPackages } from "./lib/packages";
import NpmClient from "./lib/npm-client";
import * as publisher from "./lib/package-publisher";
import { changedPackages } from "./lib/versions";
import { LogWithErrors, logger, writeLog } from "./util/logging";
import { done } from "./util/util";

if (!module.parent) {
	if (!fs.existsSync("./output") || fs.readdirSync("./output").length === 0) {
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
				await unpublish(dry);
			}
			else {
				const client = await NpmClient.create();
				if (singleName) {
					await single(client, singleName, dry);
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

	const packagesShouldPublish = await changedPackages(await AllPackages.read(options));

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

async function single(client: NpmClient, name: string, dry: boolean): Promise<void> {
	const pkg = await AllPackages.readSingle(name);
	const publishLog = await publisher.publishPackage(client, pkg, dry);
	console.log(publishLog);
}

async function unpublish(dry: boolean): Promise<void> {
	for (const pkg of await AllPackages.readTypings()) {
		await publisher.unpublishPackage(pkg, dry);
	}
}
