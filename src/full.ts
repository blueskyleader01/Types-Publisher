import * as yargs from "yargs";
import clean from "./clean";
import getDefinitelyTyped from "./get-definitely-typed";
import parseDefinitions from "./parse-definitions";
import checkParseResults from "./check-parse-results";
import calculateVersions from "./calculate-versions";
import generatePackages from "./generate-packages";
import createSearchIndex from "./create-search-index";
import publishPackages from "./publish-packages";
import uploadBlobs from "./upload-blobs";
import NpmClient from "./lib/npm-client";
import { currentTimeStamp } from "./lib/util";

if (!module.parent) {
	const dry = !!yargs.argv.dry;
	NpmClient.create()
		.then(client => full(client, dry, currentTimeStamp())
		.then(() => console.log("Done!")))
		.catch(console.error);
}

export default async function full(client: NpmClient, dry: boolean, timeStamp: string): Promise<void> {
	await clean();
	await getDefinitelyTyped();
	await parseDefinitions();
	checkParseResults();
	await calculateVersions(/*forceUpdate*/ false);
	await generatePackages();
	await createSearchIndex(/*skipDownloads*/ false);
	await publishPackages(client, dry);
	if (!dry) {
		await uploadBlobs(timeStamp);
	}
}
