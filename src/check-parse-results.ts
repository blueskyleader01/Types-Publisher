import * as semver from "semver";
import { Options } from "./lib/common";
import { fetchNpmInfo } from "./lib/npm-client";
import { AllPackages, AnyPackage, TypingsData } from "./lib/packages";
import { Logger, logger, writeLog } from "./util/logging";
import { best, done, multiMapAdd, nAtATime } from "./util/util";

if (!module.parent) {
	done(main(true, Options.defaults));
}

export default async function main(includeNpmChecks: boolean, options: Options): Promise<void> {
	const allPackages = await AllPackages.read(options);
	const [log, logResult] = logger();

	checkTypeScriptVersions(allPackages);

	checkPathMappings(allPackages);

	const packages = allPackages.allPackages();
	checkForDuplicates(packages, pkg => pkg.libraryName, "Library Name", log);
	checkForDuplicates(packages, pkg => pkg.projectName, "Project Name", log);

	if (includeNpmChecks) {
		await nAtATime(10, allPackages.allTypings(), pkg => checkNpm(pkg, log), {
			name: "Checking for typed packages...",
			flavor: pkg => pkg.desc,
			options
		});
	}

	await writeLog("conflicts.md", logResult());
}

function checkForDuplicates(packages: ReadonlyArray<AnyPackage>, func: (info: AnyPackage) => string | undefined, key: string, log: Logger): void {
	const lookup = new Map<string, TypingsData[]>();
	for (const info of packages) {
		const libraryOrProjectName = func(info);
		if (libraryOrProjectName !== undefined) {
			multiMapAdd(lookup, libraryOrProjectName, info);
		}
	}

	for (const [libName, values] of lookup) {
		if (values.length > 1) {
			log(` * Duplicate ${key} descriptions "${libName}"`);
			for (const n of values) {
				log(`   * ${n.desc}`);
			}
		}
	}
}

function checkTypeScriptVersions(allPackages: AllPackages): void {
	for (const pkg of allPackages.allTypings()) {
		for (const dep of allPackages.allDependencyTypings(pkg)) {
			if (dep.typeScriptVersion > pkg.typeScriptVersion) {
				throw new Error(`${pkg.desc} depends on ${dep.desc} but has a lower required TypeScript version.`);
			}
		}
	}
}

function checkPathMappings(allPackages: AllPackages): void {
	for (const pkg of allPackages.allTypings()) {
		const pathMappings = new Map(pkg.pathMappings);
		const unusedPathMappings = new Set(pathMappings.keys());

		// If A depends on B, and B has path mappings, A must have the same mappings.
		for (const dependency of allPackages.allDependencyTypings(pkg)) {
			for (const [name, dependencyMappingVersion] of dependency.pathMappings) {
				if (pathMappings.get(name) !== dependencyMappingVersion) {
					throw new Error(
						`${pkg.desc} depends on ${dependency.desc}, which has a path mapping for ${name} v${dependencyMappingVersion}. ` +
						`${pkg.desc} must have the same path mappings as its dependencies.`);
				}
				unusedPathMappings.delete(name);
			}

			unusedPathMappings.delete(dependency.name);
		}

		for (const unusedPathMapping of unusedPathMappings) {
			if (pkg.name !== unusedPathMapping) {
				throw new Error(`${pkg.desc} has unused path mapping for ${unusedPathMapping}`);
			}
		}
	}
}

async function checkNpm(pkg: TypingsData, log: Logger): Promise<void> {
	const asOfVersion = await firstPackageVersionWithTypes(pkg.name);
	if (asOfVersion) {
		const ourVersion = `${pkg.major}.${pkg.minor}`;
		log(`Typings already defined for ${pkg.name} (${pkg.libraryName}) as of ${asOfVersion} (our version: ${ourVersion})`);
	}
}

export async function packageHasTypes(packageName: string): Promise<boolean> {
	return (await firstPackageVersionWithTypes(packageName)) !== undefined;
}

async function firstPackageVersionWithTypes(packageName: string): Promise<string | undefined> {
	const info = await fetchNpmInfo(packageName);
	// Info may be empty if the package is not on NPM
	return info.versions && firstVersionWithTypes(info.versions);
}

function firstVersionWithTypes(versions: { [version: string]: {} }): string | undefined {
	const versionsWithTypings = Object.entries(versions).filter(([_version, info]) => hasTypes(info)).map(([version]) => version);
	// Type annotation needed because of https://github.com/Microsoft/TypeScript/issues/12915
	return best<string>(versionsWithTypings, semver.lt);
}

function hasTypes(info: any): boolean {
	return "types" in info || "typings" in info;
}
