import assert = require("assert");
import * as fs from "fs";

import { fetchJson, readJson, writeJson } from "../util/io";
import { Logger } from "../util/logging";
import { nAtATime, intOfString, sortObjectKeys } from "../util/util";

import { AnyPackage, AllPackages, fullPackageName, settings } from "./common";

const versionsFilename = "data/versions.json";
const changesFilename = "data/version-changes.txt";
const additionsFilename = "data/version-additions.txt";

export default class Versions {
	static async load(): Promise<Versions> {
		return new Versions(await readJson(versionsFilename));
	}

	static existsSync(): boolean {
		return fs.existsSync(versionsFilename);
	}

	/**
	 * Calculates versions and changed packages by comparing contentHash of parsed packages the NPM registry.
	 * `additions` is a subset of `changes`.
	 */
	static async determineFromNpm({ typings, notNeeded }: AllPackages, log: Logger, forceUpdate: boolean
		): Promise<{changes: Changes, additions: Changes, versions: Versions}> {
		const changes: Changes = [];
		const additions: Changes = [];
		const data: VersionMap = {};

		const defaultVersionInfo = { version: { major: -1, minor: -1, patch: -1 }, contentHash: "", deprecated: false };

		await nAtATime(25, typings, async pkg => {
			const packageName = pkg.typingsPackageName;
			const versionInfo = await fetchTypesPackageVersionInfo(packageName);
			if (!versionInfo) {
				log(`Added: ${packageName}`);
				additions.push(packageName);
			}
			let { version, contentHash, deprecated } = versionInfo || defaultVersionInfo;
			assert(!deprecated, `Package ${packageName} has been deprecated, so we shouldn't have parsed it. Was it re-added?`);
			if (forceUpdate || !versionInfo || pkg.contentHash !== contentHash) {
				log(`Changed: ${packageName}`);
				changes.push(packageName);
				version = updateVersion(version, pkg.libraryMajorVersion, pkg.libraryMinorVersion);
				contentHash = pkg.contentHash;
			}
			data[packageName] = { version, contentHash, deprecated };
		});

		await nAtATime(25, notNeeded, async pkg => {
			const packageName = pkg.typingsPackageName;
			let { version, contentHash, deprecated } = await fetchTypesPackageVersionInfo(packageName) || defaultVersionInfo;
			if (!deprecated) {
				log(`Now deprecated: ${packageName}`);
				changes.push(packageName);
				version = pkg.asOfVersion ? parseSemver(pkg.asOfVersion) : { major: 0, minor: 0, patch: 0 };
			}
			data[packageName] = { version, contentHash, deprecated };
		});

		// Sort keys so that versions.json is easy to read
		return { changes, additions, versions: new Versions(sortObjectKeys(data)) };
	}

	private constructor(private data: VersionMap) {}

	save(): Promise<void> {
		return writeJson(versionsFilename, this.data);
	}

	versionInfo({typingsPackageName}: AnyPackage): VersionInfo {
		const info = this.data[typingsPackageName];
		if (!info) {
			throw new Error(`No version info for ${typingsPackageName}`);
		}
		return info;
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

/** Returns undefined if the package does not exist. */
async function fetchTypesPackageVersionInfo(packageName: string): Promise<VersionInfo | undefined> {
	return fetchVersionInfoFromNpm(fullPackageName(packageName).replace(/\//g, "%2f"));
}

export async function fetchVersionInfoFromNpm(escapedPackageName: string): Promise<VersionInfo | undefined> {
	const uri = settings.npmRegistry + escapedPackageName;
	const info = await fetchJson(uri, { retries: true });

	if (info.error) {
		if (info.error === "Not found") {
			return undefined;
		}
		else {
			throw new Error(`Error getting version at ${uri}: ${info.error}`);
		}
	}
	// Kludge: NPM started returning `{}` for not-found @types packages. Should be able to remove this case once that behavior is changed.
	else if (!info["dist-tags"]) {
		return undefined;
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

/** Read all changed packages. */
export function readChanges(): Promise<Changes> {
	return readJson(changesFilename);
}

/** Read only packages which are newly added. */
export function readAdditions(): Promise<Changes> {
	return readJson(additionsFilename);
}

export async function writeChanges(changes: Changes, additions: Changes): Promise<void> {
	await writeJson(changesFilename, changes);
	await writeJson(additionsFilename, additions);
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
