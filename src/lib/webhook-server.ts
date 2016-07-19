import assert = require("assert");
import bufferEqualsConstantTime = require("buffer-equals-constant");
import { createHmac } from "crypto";
import { createServer, Server } from "http";
import full from "../full";
import RollingLogs from "./rolling-logs";
import { ArrayLog, settings } from "./common";
import { reopenIssue } from "./issue-updater";
import NpmClient from "./npm-client";
import { currentTimeStamp, parseJson } from "./util";

const rollingLogs = new RollingLogs("webhook-logs.md", 1000);

export default async function server(key: string, githubAccessToken: string, dry: boolean): Promise<Server> {
	const client = await NpmClient.create();
	return listenToGithub(key, githubAccessToken, dry, updateOneAtATime(async (log, timeStamp) => {
		log.info(""); log.info("");
		log.info(`# ${timeStamp}`);
		log.info("");
		log.info("Starting full...");
		await full(client, dry, timeStamp);
	}));
}

function writeLog(log: ArrayLog): Promise<void> {
	const { infos, errors } = log.result();
	assert(!errors.length);
	return rollingLogs.write(infos);
}

const webResult = `
<html>
<head></head>
<body>
	This is the TypeScript types-publisher webhook server. You probably meant to see:
	<ul>
		<li><a href="https://typespublisher.blob.core.windows.net/typespublisher/index.html">Latest data</a></li>
		<li><a href="https://github.com/Microsoft/types-publisher">GitHub</a></li>
		<li><a href="https://ms.portal.azure.com/?resourceMenuPerf=true#resource/subscriptions/99160d5b-9289-4b66-8074-ed268e739e8e/resourceGroups/Default-Web-WestUS/providers/Microsoft.Web/sites/types-publisher/App%20Services">Azure account (must have permission)</a></li>
	</ul>
</body>
</html>
`;

/** @param onUpdate: returns a promise in case it may error. Server will shut down on errors. */
function listenToGithub(key: string, githubAccessToken: string, dry: boolean, onUpdate: (log: ArrayLog, timeStamp: string) => Promise<void> | undefined): Server {
	const server = createServer((req, resp) => {
		switch (req.method) {
			case "GET":
				resp.write(webResult);
				resp.end();
				break;
			case "POST":
				req.on("data", (data: string) => receiveUpdate(data, req.headers));
				break;
			default:
				// Don't respond
		}
	});
	return server;

	function receiveUpdate(data: string, headers: any): void {
		const log = new ArrayLog(true);
		const timeStamp = currentTimeStamp();
		try {
			if (!checkSignature(key, data, headers["x-hub-signature"])) {
				log.error(`Request does not have the correct x-hub-signature: headers are ${JSON.stringify(headers, undefined, 4)}`);
				return;
			}

			log.info(`Message from github: ${data}`);
			const expectedRef = `refs/heads/${settings.sourceBranch}`;

			const actualRef = parseJson(data).ref;
			if (actualRef === expectedRef) {
				const update = onUpdate(log, timeStamp);
				if (update) {
					update.catch(onError);
				}
				return;
			}
			else {
				log.info(`Ignoring push to ${actualRef}, expected ${expectedRef}.`);
			}
			writeLog(log).catch(onError);
		} catch (error) {
			writeLog(log).then(() => onError(error)).catch(onError);
		}

		function onError(error: Error): void {
			server.close();
			reopenIssue(githubAccessToken, timeStamp, error).catch(issueError => {
				console.error(issueError.stack);
			}).then(() => {
				console.error(error.stack);
				process.exit(1);
			});
		}
	}
}

// Even if there are many changes to DefinitelyTyped in a row, we only perform one update at a time.
function updateOneAtATime(doOnce: (log: ArrayLog, timeStamp: string) => Promise<void>): (log: ArrayLog, timeStamp: string) => Promise<void> | undefined {
	let working = false;
	let anyUpdatesWhileWorking = false;

	return (log, timeStamp) => {
		if (working) {
			anyUpdatesWhileWorking = true;
			log.info(`Not starting update, because already performing one.`);
			return undefined;
		}
		else {
			working = false;
			anyUpdatesWhileWorking = false;
			return work();
		}

		async function work(): Promise<void> {
			log.info(`Starting update`);
			working = true;
			anyUpdatesWhileWorking = false;
			do {
				await doOnce(log, timeStamp);
				working = false;
			} while (anyUpdatesWhileWorking);
		}
	};
}

function checkSignature(key: string, data: string, actualSignature: string) {
	const expectedSignature = `sha1=${getDigest()}`;
	// Prevent timing attacks
	return stringEqualsConstantTime(expectedSignature, actualSignature);

	function getDigest(): string {
		const hmac = createHmac("sha1", key);
		hmac.write(data);
		return hmac.digest("hex");
	}

	function stringEqualsConstantTime(s1: string, s2: string): boolean {
		return bufferEqualsConstantTime(new Buffer(s1), new Buffer(s2));
	}
}
