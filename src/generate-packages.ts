import * as common from './lib/common';
import * as generator from './lib/package-generator';

const typeData = <common.TypesDataFile>common.readDataFile(common.typesDataFilename);

if (typeData === undefined) {
	console.log('Run parse-definitions first!');
} else {
	const log: string[] = [];
	Object.keys(typeData).forEach(packageName => {
		const typing = typeData[packageName];
		const result = generator.generatePackage(typing);
		log.push(` * ${packageName}`);
		result.log.forEach(line => log.push(`   * ${line}`));
	});
	Object.keys(typeData).forEach(packageName => {
		const typing = typeData[packageName];
		generator.shrinkwrap(typing);
	});
	common.writeLogSync('package-generator.md', log);
}
