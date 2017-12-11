import fetch from "node-fetch";
import * as yargs from "yargs";

import { getSecret, Secret } from "./lib/secrets";
import { sourceBranch } from "./lib/settings";
import { expectedSignature } from "./lib/webhook-server";
import { done } from "./util/util";

if (!module.parent) {
	const remote = yargs.argv.remote;

	const port = parseInt(process.env.PORT!, 10);
	if (!port) {
		throw new Error("Must provide PORT");
	}

	const url = remote ? "http://typespublisher.azurewebsites.net" : `http://localhost:${port}`;
	done(main(url));
}

async function main(url: string): Promise<void> {
	const key = await getSecret(Secret.GITHUB_SECRET);
	const body = JSON.stringify({ ref: `refs/heads/${sourceBranch}` });
	const headers = { "x-hub-signature": expectedSignature(key, body) };
	const resp = await fetch(url, { method: "POST", body, headers });
	console.log(await resp.text());
}
