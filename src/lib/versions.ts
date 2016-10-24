import assert = require("assert");
import * as fs from "fs";

import { fetchJson, readFile, readJson, writeFile } from "../util/io";
import { Logger } from "../util/logging";
import { nAtATime, intOfString, sortObjectKeys } from "../util/util";

import { AnyPackage, AllPackages, fullPackageName, settings } from "./common";

const versionsFilename = "data/versions.json";
const changesFilename = "data/version-changes.txt";

export default class Versions {
	static async load(): Promise<Versions> {
		return new Versions(await readJson(versionsFilename));
	}

	static existsSync(): boolean {
		return fs.existsSync(versionsFilename);
	}

	/** Calculates versions and changed packages by comparing contentHash of parsed packages the NPM registry. */
	static async determineFromNpm({ typings, notNeeded }: AllPackages, log: Logger, forceUpdate: boolean
		): Promise<{changes: Changes, versions: Versions}> {
		const changes: Changes = [];
		const data: VersionMap = {};

		await nAtATime(25, typings, async pkg => {
			const packageName = pkg.typingsPackageName;
			let { version, contentHash, deprecated } = await fetchVersionInfoFromNpm(packageName);
			assert(!deprecated, `Package ${packageName} has been deprecated, so we shouldn't have parsed it. Was it re-added?`);
			if (forceUpdate || pkg.contentHash !== contentHash) {
				log(`Changed: ${packageName}`);
				changes.push(packageName);
				version = updateVersion(version, pkg.libraryMajorVersion, pkg.libraryMinorVersion);
				contentHash = pkg.contentHash;
			}
			data[packageName] = { version, contentHash, deprecated };
		});

		await nAtATime(25, notNeeded, async pkg => {
			const packageName = pkg.typingsPackageName;
			let { version, contentHash, deprecated } = await fetchVersionInfoFromNpm(packageName);
			if (!deprecated) {
				log(`Now deprecated: ${packageName}`);
				changes.push(packageName);
				version = pkg.asOfVersion ? parseSemver(pkg.asOfVersion) : { major: 0, minor: 0, patch: 0 };
			}
			data[packageName] = { version, contentHash, deprecated };
		});

		// Sort keys so that versions.json is easy to read
		return { changes, versions: new Versions(sortObjectKeys(data)) };
	}

	private constructor(private data: VersionMap) {}

	save(): Promise<void> {
		return writeFile(versionsFilename, this.render());
	}

	versionInfo({typingsPackageName}: AnyPackage): VersionInfo {
		const info = this.data[typingsPackageName];
		if (!info) {
			throw new Error(`No version info for ${typingsPackageName}`);
		}
		return info;
	}

	private render() {
		return JSON.stringify(this.data, undefined, 4);
	}
}

/** Version of a package published to NPM. */
export interface Semver {
	major: number;
	minor: number;
	patch: number;
}

function updateVersion(prev: Semver, newMajor: number, newMinor: number): Semver {
	if (prev.major === newMajor && prev.minor === newMinor) {
		return { major: prev.major, minor: prev.minor, patch: prev.patch + 1 };
	}
	else {
		return { major: newMajor, minor: newMinor, patch: 0 };
	}
}

export function versionString(version: Semver): string {
	return `${version.major}.${version.minor}.${version.patch}`;
}

async function fetchVersionInfoFromNpm(packageName: string): Promise<VersionInfo> {
	const escapedPackageName = fullPackageName(packageName).replace(/\//g, "%2f");
	const uri = settings.npmRegistry + escapedPackageName;
	const info = await fetchJson(uri, { retries: true });

	if (info.error) {
		if (info.error === "Not found") {
			return { version: { major: -1, minor: -1, patch: -1 }, contentHash: "", deprecated: false };
		}
		else {
			throw new Error(`Error getting version of ${packageName}: ${info.error}`);
		}
	}
	else {
		const versionSemver: string = info["dist-tags"].latest;
		assert(typeof versionSemver === "string");
		const latestVersionInfo = info.versions[versionSemver];
		assert(!!latestVersionInfo);
		const contentHash = latestVersionInfo.typesPublisherContentHash || "";
		const deprecated = !!latestVersionInfo.deprecated;
		return { version: parseSemver(versionSemver), contentHash, deprecated };
	}
}

function parseSemver(semver: string): Semver {
	// Per the semver spec <http://semver.org/#spec-item-2>:
 	// "A normal version number MUST take the form X.Y.Z where X, Y, and Z are non-negative integers, and MUST NOT contain leading zeroes."
	const rgx = /^(\d+)\.(\d+)\.(\d+)$/;
	const match = rgx.exec(semver);
	if (!match) {
		throw new Error(`Unexpected semver: ${semver}`);
	}
	return { major: intOfString(match[1]), minor: intOfString(match[2]), patch: intOfString(match[3]) };
}

// List of package names that have changed
export type Changes = string[];

async function readChanges(): Promise<Changes> {
	return (await readFile(changesFilename)).split("\n");
}

export function writeChanges(changes: Changes): Promise<void> {
	return writeFile(changesFilename, changes.join("\n"));
}

/** Latest version info for a package.
 * If it needs to be published, `version` is the version to publish and `contentHash` is the new hash.
 */
export interface VersionInfo {
	/**
	 * If this package has changed, the version that we should publish.
	 * If this package has not changed, the last version.
	 */
	version: Semver;
	/** Hash of content from DefinitelyTyped. Also stored in "typesPublisherContentHash" on NPM. */
	contentHash: string;
	/** True if this package has been deprecated (is a not-needed package). */
	deprecated: boolean;
}

/** Used to store a JSON file of version info for every package. */
interface VersionMap {
	[typingsPackageName: string]: VersionInfo;
}

export async function changedPackages(allPackages: AnyPackage[]): Promise<AnyPackage[]> {
	const changes = await readChanges();
	return changes.map(changedPackageName => {
		const pkg = allPackages.find(p => p.typingsPackageName === changedPackageName);
		if (pkg === undefined) {
			throw new Error(`Expected to find a package named ${changedPackageName}`);
		}
		return pkg;
	});
}
