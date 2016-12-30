import path = require("path");
import { existsSync, readFileSync } from "fs";
import * as fsp from "fs-promise";
import * as sourceMapSupport from "source-map-support";

import { readJson, writeJson } from "../util/io";
import { parseJson } from "../util/util";

sourceMapSupport.install();
if (process.env.LONGJOHN) {
	console.log("=== USING LONGJOHN ===");
	const longjohn = require("longjohn");
	longjohn.async_trace_limit = -1; // unlimited
}

export const home = path.join(__dirname, "..", "..");
export const settings: PublishSettings = parseJson(readFileSync(path.join(home, "settings.json"), "utf-8"));

/** Settings that may be determined dynamically. */
export interface Options {
	// e.g. '../DefinitelyTyped'
	// This is overridden to `cwd` when running the tester, as that is run from within DefinitelyTyped.
	definitelyTypedPath: string;
}
export namespace Options {
	export const defaults: Options = {
		definitelyTypedPath: "../DefinitelyTyped",
	};
}

export function existsDataFileSync(filename: string): boolean {
	return existsSync(dataFilePath(filename));
}

export function readDataFile(filename: string): Promise<any> {
	return readJson(dataFilePath(filename));
}

export async function writeDataFile(filename: string, content: {}, formatted = true) {
	await fsp.ensureDir(dataDir);
	await writeJson(dataFilePath(filename), content, formatted);
}

const dataDir = path.join(home, "data");
function dataFilePath(filename: string) {
	return path.join(dataDir, filename);
}
