import { createNotNeededPackageJSON, createPackageJSON, createReadme, getLicenseFileText } from "./generate-packages";
import { Registry } from "./lib/common";
import { AllPackages, License, NotNeededPackage, readNotNeededPackages, TypesDataFile, TypingsData, TypingsDataRaw } from "./lib/packages";
import { createMockDT } from "./mocks";
import { testo } from "./util/test";
function createRawPackage(license: License): TypingsDataRaw {
    return {
        libraryName: "jquery",
        typingsPackageName: "jquery",
        dependencies: [],
        testDependencies: [],
        pathMappings: [],
        contributors: [{ name: "A", url: "b@c.d", githubUsername: "e" }],
        libraryMajorVersion: 1,
        libraryMinorVersion: 0,
        minTsVersion: "3.0",
        typesVersions: [],
        files: ["index.d.ts", "jquery.test.ts"],
        license,
        packageJsonDependencies: [],
        contentHash: "11",
        projectName: "jquery.org",
        globals: [],
        declaredModules: ["juqery"],
    };
}
function createTypesData(): TypesDataFile {
    return {
        jquery: {
            1: createRawPackage(License.MIT),
        },
    };
}
function createUnneededPackage() {
    return new NotNeededPackage({
        libraryName: "absalom",
        typingsPackageName: "absalom",
        asOfVersion: "1.1.1",
        sourceRepoURL: "https://github.com/aardwulf/absalom",
    });
}
testo({
    mitLicenseText() {
        const typing = new TypingsData(createRawPackage(License.MIT), /*isLatest*/ true);
        expect(getLicenseFileText(typing)).toEqual(expect.stringContaining("MIT License"));
    },
    apacheLicenseText() {
        const typing = new TypingsData(createRawPackage(License.Apache20), /*isLatest*/ true);
        expect(getLicenseFileText(typing)).toEqual(expect.stringContaining("Apache License, Version 2.0"));
    },
    basicReadme() {
        const typing = new TypingsData(createRawPackage(License.Apache20), /*isLatest*/ true);
        expect(createReadme(typing)).toEqual(expect.stringContaining("This package contains type definitions for"));
    },
    readmeContainsProjectName() {
        const typing = new TypingsData(createRawPackage(License.Apache20), /*isLatest*/ true);
        expect(createReadme(typing)).toEqual(expect.stringContaining("jquery.org"));
    },
    readmeNoDependencies() {
        const typing = new TypingsData(createRawPackage(License.Apache20), /*isLatest*/ true);
        expect(createReadme(typing)).toEqual(expect.stringContaining("Dependencies: none"));
    },
    readmeNoGlobals() {
        const typing = new TypingsData(createRawPackage(License.Apache20), /*isLatest*/ true);
        expect(createReadme(typing)).toEqual(expect.stringContaining("Global values: none"));
    },
    basicPackageJson() {
        const packages = AllPackages.from(createTypesData(), readNotNeededPackages(createMockDT()));
        const typing = new TypingsData(createRawPackage(License.MIT), /*isLatest*/ true);
        expect(createPackageJSON(typing, "1.0", packages, Registry.NPM)).toEqual(`{
    "name": "@types/jquery",
    "version": "1.0",
    "description": "TypeScript definitions for jquery",
    "license": "MIT",
    "contributors": [
        {
            "name": "A",
            "url": "b@c.d",
            "githubUsername": "e"
        }
    ],
    "main": "",
    "types": "index.d.ts",
    "repository": {
        "type": "git",
        "url": "https://github.com/DefinitelyTyped/DefinitelyTyped.git",
        "directory": "types/jquery"
    },
    "scripts": {},
    "dependencies": {},
    "typesPublisherContentHash": "11",
    "typeScriptVersion": "3.0"
}`);
    },
    githubPackageJsonName() {
        const packages = AllPackages.from(createTypesData(), readNotNeededPackages(createMockDT()));
        const typing = new TypingsData(createRawPackage(License.MIT), /*isLatest*/ true);
        expect(createPackageJSON(typing, "1.0", packages, Registry.Github)).toEqual(
            expect.stringContaining('"name": "@types/jquery"'));
    },
    githubPackageJsonRegistry() {
        const packages = AllPackages.from(createTypesData(), readNotNeededPackages(createMockDT()));
        const typing = new TypingsData(createRawPackage(License.MIT), /*isLatest*/ true);
        const s = createPackageJSON(typing, "1.0", packages, Registry.Github);
        expect(s).toEqual(expect.stringContaining("publishConfig"));
        expect(s).toEqual(expect.stringContaining('"registry": "https://npm.pkg.github.com/"'));
    },
    basicNotNeededPackageJson() {
        const s = createNotNeededPackageJSON(createUnneededPackage(), Registry.NPM);
        expect(s).toEqual(`{
    "name": "@types/absalom",
    "version": "1.1.1",
    "typings": null,
    "description": "Stub TypeScript definitions entry for absalom, which provides its own types definitions",
    "main": "",
    "scripts": {},
    "author": "",
    "repository": "https://github.com/aardwulf/absalom",
    "license": "MIT",
    "dependencies": {
        "absalom": "*"
    }
}`);
    },
    githubNotNeededPackageJson() {
        const s = createNotNeededPackageJSON(createUnneededPackage(), Registry.Github);
        expect(s).toEqual(expect.stringContaining("@types"));
        expect(s).toEqual(expect.stringContaining("npm.pkg.github.com"));
    },
});
