import * as parser from './definition-parser';
import * as publisher from './definition-publisher';

import fs = require('fs');
import path = require('path');

const settings: PublishSettings = JSON.parse(fs.readFileSync('./settings.json', 'utf-8'));

const versionFile = 'versions.json';


const summaryLog: string[] = [];
const detailedLog: string[] = [];
const outcomes: { [s: string]: number } = {};
const kinds: { [s: string]: number } = {};

function recordKind(s: string) {
	kinds[s] = (kinds[s] || 0) + 1;
}

function recordOutcome(s: string) {
	outcomes[s] = (outcomes[s] || 0) + 1;
}

function processDir(folderPath: string, name: string) {
	detailedLog.push(`## ${name}`);

	const info = parser.getTypingInfo(folderPath);

	if (parser.isSuccess(info)) {
		detailedLog.push('### File Parse Succeeded');
		detailedLog.push(`Detected a ${info.data.kind} typing definition.`);
		detailedLog.push('```js');
		detailedLog.push(JSON.stringify(info.data, undefined, 4));
		detailedLog.push('```');
		recordOutcome(`Succeeded (${info.data.kind})`);
		recordKind(info.data.kind);

		detailedLog.push('### Publish');
		const publishLog = publisher.publish(info.data);
		for(const line of publishLog.log) {
			detailedLog.push(` > ${line}\r\n\r\n`);
		}
	} else if(parser.isFail(info)) {
		detailedLog.push('### File Parse Failed');
		switch (info.rejectionReason) {
			case parser.RejectionReason.BadFileFormat:
				recordOutcome('Failed: Bad file format');
				detailedLog.push('Bad file format');
				break;
			case parser.RejectionReason.ReferencePaths:
				recordOutcome('Failed: Reference paths not allowed');
				detailedLog.push('Reference paths are not allowed (use library references instead)');
				break;
			case parser.RejectionReason.TooManyFiles:
				recordOutcome('Failed: Too many files');
				detailedLog.push('Failed: Only one .d.ts file per folder is currently supported');
				break;
			default:
				recordOutcome('??');
		}
	}

	detailedLog.push('### Parser Log');
	for(const line of info.log) detailedLog.push('> ' + line + '\r\n');
	detailedLog.push('');
}

function main() {
	summaryLog.push('# Typing Publish Report Summary');
	summaryLog.push(`Started at ${(new Date()).toUTCString()}`);

	try {
		fs.mkdirSync(settings.outputPath);
	} catch(e) { }

	fs.readdir(settings.definitelyTypedPath, (err, paths) => {
		const folders = paths
			// Remove hidden paths
			.filter(s => s.substr(0, 1) !== '_' && s.substr(0, 1) !== '.')
			// Combine paths
			.map(s => ({ name: s, path: path.join(settings.definitelyTypedPath, s) }))
			// Remove non-folders
			.filter(s => fs.statSync(s.path).isDirectory());

		folders.sort();
		console.log(`Found ${folders.length} typings folders.`);

		folders.forEach(s => processDir(s.path, s.name));

		summaryLog.push('\r\n### Overall Results\r\n');

		summaryLog.push(' * Pass / fail');
		const outcomeKeys = Object.keys(outcomes);
		outcomeKeys.sort();
		outcomeKeys.forEach(k => {
			summaryLog.push(`   * ${k}: ${outcomes[k]}`);
		});

		summaryLog.push(' * Typing Kind');
		const typingKeys = Object.keys(kinds);
		typingKeys.sort();
		typingKeys.forEach(k => {
			summaryLog.push(`   * ${k}: ${kinds[k]}`);
		});

		const logmd = summaryLog.join('\r\n') + '\r\n\r\n# Detailed Report\r\n\r\n' + detailedLog.join('\r\n');
		fs.writeFile('log.md', logmd, 'utf-8');
	});
}

main();
