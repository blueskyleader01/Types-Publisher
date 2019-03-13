import assert = require("assert");
import { ensureFile, pathExists } from "fs-extra";
import RegClient = require("npm-registry-client");
import { resolve as resolveUrl } from "url";

import { Fetcher, readFile, readJson, sleep, writeJson } from "../util/io";
import { Logger, loggerWithErrors } from "../util/logging";
import { createTgz } from "../util/tgz";
import { identity, joinPaths, mapToRecord, recordToMap } from "../util/util";

import { getSecret, Secret } from "./secrets";
import { npmApi, npmRegistry, npmRegistryHostName } from "./settings";

function packageUrl(packageName: string): string {
    return resolveUrl(npmRegistry, packageName);
}

const cacheFile = joinPaths(__dirname, "..", "..", "cache", "npmInfo.json");

export type NpmInfoCache = ReadonlyMap<string, NpmInfo>;

export interface NpmInfoRaw {
    readonly "dist-tags": {
        readonly [tag: string]: string;
    };
    readonly versions: NpmInfoRawVersions;
    readonly time: {
        readonly [s: string]: string;
    };
}
export interface NpmInfoRawVersions {
    readonly [version: string]: NpmInfoVersion;
}

// Processed npm info. Intentially kept small so it can be cached.
export interface NpmInfo {
    readonly distTags: Map<string, string>;
    readonly versions: Map<string, NpmInfoVersion>;
    readonly time: Map<string, string>;
}
export interface NpmInfoVersion {
    readonly typesPublisherContentHash?: string;
    readonly deprecated?: string;
}

export class CachedNpmInfoClient {
    static async with<T>(uncachedClient: UncachedNpmInfoClient, cb: (client: CachedNpmInfoClient) => Promise<T>): Promise<T> {
        const log = loggerWithErrors()[0];
        let unroll: Map<string, NpmInfo>;
        log.info(`Checking for cache file at ${cacheFile}...`);
        const cacheFileExists = await pathExists(cacheFile);
        if (cacheFileExists) {
            log.info("Reading cache file...");
            const cache = await readJson(cacheFile) as Record<string, NpmInfoRaw>;
            log.info(`Cache file ${cacheFile} exists, copying to map...`);
            unroll = recordToMap(cache, npmInfoFromJson);
        } else {
            log.info("Cache file doesn't exist, using empty map.");
            unroll = new Map();
        }
        const client = new this(uncachedClient, unroll);
        const res = await cb(client);
        await client.writeCache();
        return res;
    }

    private constructor(private readonly uncachedClient: UncachedNpmInfoClient, private readonly cache: Map<string, NpmInfo>) {}

    /** May return old info -- caller should check that this looks up-to-date. */
    getNpmInfoFromCache(escapedPackageName: string): NpmInfo | undefined {
        return this.cache.get(escapedPackageName);
    }

    /** Call this when the result of getNpmInfoFromCache looks potentially out-of-date. */
    async fetchAndCacheNpmInfo(escapedPackageName: string): Promise<NpmInfo | undefined> {
        const info = await this.uncachedClient.fetchNpmInfo(escapedPackageName);
        if (info) { this.cache.set(escapedPackageName, info); }
        return info;
    }

    private async writeCache(): Promise<void> {
        await ensureFile(cacheFile);
        await writeJson(cacheFile, mapToRecord(this.cache, jsonFromNpmInfo));
    }

    formatKeys(): string {
        return Array.from(this.cache.keys()).join(", ");
    }
}

export class UncachedNpmInfoClient {
    private readonly fetcher = new Fetcher();

    async fetchNpmInfo(escapedPackageName: string): Promise<NpmInfo | undefined> {
        const raw = await this.fetchRawNpmInfo(escapedPackageName);
        await sleep(0.01); // If we don't do this, npm resets the connection?
        return raw === undefined ? undefined : npmInfoFromJson(raw);
    }

    async fetchRawNpmInfo(escapedPackageName: string): Promise<NpmInfoRaw | undefined> {
        const info = await this.fetcher.fetchJson({
            hostname: npmRegistryHostName,
            path: escapedPackageName,
            retries: true,
        }) as { readonly error: string } | NpmInfoRaw;
        if ("error" in info) {
            if (info.error === "Not found") { return undefined; }
            throw new Error(`Error getting version at ${escapedPackageName}: ${info.error}`);
        }
        if (!info["dist-tags"] && !info.versions) {
            // Unpublished
            return undefined;
        }
        return info;
    }

    // See https://github.com/npm/download-counts
    async getDownloads(packageNames: ReadonlyArray<string>): Promise<ReadonlyArray<number>> {
        // NPM uses a different API if there's only a single name, so ensure there's at least 2 for every batch of 128.
        const names = (packageNames.length % 128) === 1 ? [...packageNames, "dummy"] : packageNames;
        const nameGroups = Array.from(splitToFixedSizeGroups(names, 128)); // NPM has a limit of 128 packages at a time.

        const out: number[] = [];
        for (const nameGroup of nameGroups) {
            const data = await this.fetcher.fetchJson({
                hostname: npmApi,
                path: `/downloads/point/last-month/${nameGroup.join(",")}`,
                retries: true,
            }) as { readonly error: string } | { readonly [key: string]: { readonly downloads: number } };
            if ("error" in data) { throw new Error(data.error as string); }
            for (const key in data) {
                assert(key === names[out.length], `at index ${out.length} of ${Object.keys(data)} : ${key} !== ${names[out.length]}`);
                out.push(data[key] ? data[key].downloads : 0);
            }
        }
        return out;
    }
}

function splitToFixedSizeGroups(names: ReadonlyArray<string>, chunkSize: number): ReadonlyArray<ReadonlyArray<string>> {
    const out: string[][] = [];
    for (let i = 0; i < names.length; i += chunkSize) {
        out.push(names.slice(i, i + chunkSize));
    }
    return out;
}

export class NpmPublishClient {
    static async create(config?: RegClient.Config): Promise<NpmPublishClient> {
        const token = await getSecret(Secret.NPM_TOKEN);
        return new this(new RegClient(config), { token });
    }

    private constructor(private readonly client: RegClient, private readonly auth: RegClient.Credentials) {}

    async publish(publishedDirectory: string, packageJson: {}, dry: boolean, log: Logger): Promise<void> {
        const readme = await readFile(joinPaths(publishedDirectory, "README.md"));

        return new Promise<void>((resolve, reject) => {
            const body = createTgz(publishedDirectory, reject);
            const metadata = { readme, ...packageJson };
            if (dry) {
                log("(dry) Skip publish of " + publishedDirectory);
            }
            resolve(dry ? undefined : promisifyVoid(cb => {
                this.client.publish(npmRegistry, { access: "public", auth: this.auth, metadata, body }, cb);
            }));
        });
    }

    tag(packageName: string, version: string, tag: string): Promise<void> {
        return promisifyVoid(cb => { this.client.tag(packageUrl(packageName), { version, tag, auth: this.auth }, cb); });
    }

    deprecate(packageName: string, version: string, message: string): Promise<void> {
        const url = packageUrl(packageName.replace("/", "%2f"));
        const params = {
            message,
            version,
            auth: this.auth,
        };
        return promisifyVoid(cb => { this.client.deprecate(url, params, cb); });
    }
}

function npmInfoFromJson(n: NpmInfoRaw): NpmInfo {
    return {
        distTags: recordToMap(n["dist-tags"], identity),
        // Callback ensures we remove any other properties
        versions: recordToMap(n.versions, ({ typesPublisherContentHash, deprecated }) => ({ typesPublisherContentHash, deprecated })),
        time: recordToMap(n.time),
    };
}

function jsonFromNpmInfo(n: NpmInfo): NpmInfoRaw {
    return {
        "dist-tags": mapToRecord(n.distTags),
        versions: mapToRecord(n.versions),
        time: mapToRecord(n.time),
    };
}

function promisifyVoid(callsBack: (cb: (error: Error | undefined) => void) => void): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        callsBack(error => {
            if (error) {
                reject(error);
            } else {
                resolve();
            }
        });
    });
}
