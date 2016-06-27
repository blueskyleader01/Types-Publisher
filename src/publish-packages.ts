import * as fs from "fs";
import * as yargs from "yargs";
import * as common from "./lib/common";
import * as publisher from "./lib/package-publisher";
import { nAtATime } from "./lib/util";

const typeData = common.readTypesDataFile();

if (typeData === undefined || fs.readdirSync("./output").length === 0) {
	console.log("Run parse-definitions and generate-packages first!");
}
else {
	main().catch(console.error);
}

async function main(): Promise<void> {
	const dry = !!yargs.argv.dry;
	// For testing only. Do not use on real @types repo.
	const unpublish = !!yargs.argv.unpublish;

	const log: string[] = [];
	if (dry) {
		console.log("=== DRY RUN ===");
		log.push("=== DRY RUN ===");
	}

	const allPackages: common.AnyPackage[] = (common.typings(typeData) as common.AnyPackage[]).concat(common.readNotNeededPackages());

	if (unpublish) {
		for (const pkg of allPackages) {
			await publisher.unpublishPackage(pkg, dry);
		}
	}
	else {
		await nAtATime(100, allPackages, async typing => {
			const packageName = typing.libraryName;

			console.log(`Publishing ${packageName}...`);
			const publishLog = await publisher.publishPackage(typing, dry);
			log.push(` * ${packageName}`);
			publishLog.infos.forEach(line => log.push(`   * ${line}`));
			publishLog.errors.forEach(err => {
				log.push(`   * ERROR: ${err}`);
				console.error(` Error! ${err}`);
			});
		});

		common.writeLogSync("publishing.md", log);
		console.log("Done!");
	}
}
