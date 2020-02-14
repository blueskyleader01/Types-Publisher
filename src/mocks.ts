import { parseHeaderOrFail } from "definitelytyped-header-parser";

import { Dir, FS, InMemoryDT } from "./get-definitely-typed";
import { Semver } from "./lib/versions";

class DTMock {
    public readonly fs: FS;
    private readonly root: Dir;

    constructor() {
        this.root = new Dir(undefined);
        this.root.set("notNeededPackages.json", `{
            "packages": [{
            "libraryName": "Angular 2",
            "typingsPackageName": "angular",
            "asOfVersion": "1.2.3",
            "sourceRepoURL": "https://github.com/angular/angular2"
          }]
        }`);
        this.fs = new InMemoryDT(this.root, "DefinitelyTyped");
    }

    public pkgDir(packageName: string): Dir {
        return this.root.subdir("types").subdir(packageName);
    }

    public pkgFS(packageName: string): FS {
        return this.fs.subDir("types").subDir(packageName);
    }

    /**
     * Creates a shallow copy of a package, meaning all entries in the old version directory that will be created refer to the copied entry from the
     * latest version. The only exceptions are the `index.d.ts` and `tsconfig.json` files.
     *
     * The directory name will exactly follow the given `olderVersion`. I.e. `2` will become `v2`, whereas `2.2` will become `v2.2`.
     *
     * @param packageName The package of which an old version is to be added.
     * @param olderVersion The older version that's to be added.
     */
    public addOldVersionOfPackage(packageName: string, olderVersion: string) {
        const latestDir = this.pkgDir(packageName);
        const index = latestDir.get("index.d.ts") as string;
        const latestHeader = parseHeaderOrFail(index);
        const latestVersion = `${latestHeader.libraryMajorVersion}.${latestHeader.libraryMinorVersion}`;
        const olderVersionParsed = Semver.parse(olderVersion, true)!;

        const oldDir = latestDir.subdir(`v${olderVersion}`);
        const tsconfig = JSON.parse(latestDir.get("tsconfig.json") as string);

        oldDir.set("index.d.ts", index.replace(latestVersion, `${olderVersionParsed.major}.${olderVersionParsed.minor}`));
        oldDir.set("tsconfig.json", JSON.stringify({
            ...tsconfig,
            compilerOptions: {
                ...tsconfig.compilerOptions,
                paths: {
                    [packageName]: [`${packageName}/v${olderVersion}`],
                },
            },
        }));

        latestDir.forEach((content, entry) => {
            if (
                content !== oldDir
                && entry !== "index.d.ts"
                && entry !== "tsconfig.json"
                && !(content instanceof Dir && /^v\d+(\.\d+)?$/.test(entry))
            ) {
                oldDir.set(entry, content);
            }
        });

        return oldDir;
    }
}

export function createMockDT() {
    const dt = new DTMock();

    const boring = dt.pkgDir("boring");
    boring.set("index.d.ts", `// Type definitions for boring 1.0
// Project: https://boring.com
// Definitions by: Some Guy From Space <https://github.com/goodspaceguy420>
// Definitions: https://github.com/DefinitelyTyped/DefinitelyTyped

import * as React from 'react';
export const drills: number;
`);
    boring.set("secondary.d.ts", `
import deffo from 'react-default';
import { mammoths } from 'boring/quaternary';
export const hovercars: unknown;
declare module "boring/fake" {
    import { stock } from 'boring/tertiary';
}
declare module "other" {
    export const augmented: true;
}
`);
    boring.set("tertiary.d.ts", `
import { stuff } from 'things';
export var stock: number;
`);
    boring.set("quaternary.d.ts", `
export const mammoths: object;
`);
    boring.set("commonjs.d.ts", `
import vortex = require('vorticon');
declare const australia: {};
export = australia;
`);
    boring.set("v1.d.ts", `
export const inane: true | false;
`);
    boring.set("untested.d.ts", `
import { help } from 'manual';
export const fungible: false;
`);
    boring.set("boring-tests.ts", `
import { superstor } from "super-big-fun-hus";
import { drills } from "boring";
import { hovercars } from "boring/secondary";
import australia = require('boring/commonjs');
import { inane } from "boring/v1";
`);
    boring.set("OTHER_FILES.txt", `
untested.d.ts
`);
    boring.set("tsconfig.json", `{
    "compilerOptions": {
        "module": "commonjs",
        "lib": [
            "es6",
            "dom"
        ],
        "target": "es6",
        "noImplicitAny": true,
        "noImplicitThis": true,
        "strictNullChecks": true,
        "strictFunctionTypes": true,
        "baseUrl": "../",
        "typeRoots": [
            "../"
        ],
        "types": [],
        "noEmit": true,
        "forceConsistentCasingInFileNames": true
    },
    "files": [
        "index.d.ts",
        "boring-tests.ts"
    ]
}`);

    const globby = dt.pkgDir("globby");
    globby.set("index.d.ts", `// Type definitions for globby 0.2
// Project: https://globby-gloopy.com
// Definitions by: The Dragon Quest Slime <https://github.com/gloopyslime>
// Definitions: https://github.com/DefinitelyTyped/DefinitelyTyped

/// <reference path="./sneaky.d.ts" />
/// <reference types="andere/snee" />
declare var x: number
`);
    globby.set("merges.d.ts", `
declare var y: number
`);
    globby.set("sneaky.d.ts", `
declare var ka: number
`);
    globby.set("globby-tests.ts", `
var z = x;
`);
    const tests = globby.subdir("test");
    tests.set("other-tests.ts", `
/// <reference types="globby/merges" />
var z = y;
`);
    globby.set("tsconfig.json", `{
    "compilerOptions": {
        "module": "commonjs",
        "lib": [
            "es6",
            "dom"
        ],
        "target": "es6",
        "noImplicitAny": true,
        "noImplicitThis": true,
        "strictNullChecks": true,
        "strictFunctionTypes": true,
        "baseUrl": "../",
        "typeRoots": [
            "../"
        ],
        "types": [],
        "noEmit": true,
        "forceConsistentCasingInFileNames": true
    },
    "files": [
        "index.d.ts",
        "globby-tests.ts",
        "test/other-tests.ts"
    ]
}`);
    const jquery = dt.pkgDir("jquery");
    jquery.set("JQuery.d.ts", `
declare var jQuery: 1;
`);
    jquery.set("index.d.ts", `// Type definitions for jquery 3.3
// Project: https://jquery.com
// Definitions by: Leonard Thieu <https://github.com/leonard-thieu>
// Definitions: https://github.com/DefinitelyTyped/DefinitelyTyped
// TypeScript Version: 2.3

/// <reference path="JQuery.d.ts" />

export = jQuery;
`);
    jquery.set("jquery-tests.ts", `
console.log(jQuery);
`);
    jquery.set("tsconfig.json", `{
    "compilerOptions": {
        "module": "commonjs",
        "lib": [
            "es6",
            "dom"
        ],
        "target": "es6",
        "noImplicitAny": true,
        "noImplicitThis": true,
        "strictNullChecks": true,
        "strictFunctionTypes": true,
        "baseUrl": "../",
        "typeRoots": [
            "../"
        ],
        "types": [],
        "noEmit": true,
        "forceConsistentCasingInFileNames": true
    },
    "files": [
        "index.d.ts",
        "jquery-tests.ts"
    ]
}

`);

    return dt;
}
