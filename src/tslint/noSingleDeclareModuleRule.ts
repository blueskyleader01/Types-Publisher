import * as Lint from "tslint/lib/lint";
import * as ts from "typescript";

export class Rule extends Lint.Rules.AbstractRule {
	static metadata: Lint.IRuleMetadata = {
		ruleName: "no-single-declare-module",
		description: "Don't use an ambient module declaration if you can use an external module file.",
		rationale: "Cuts down on nesting",
		options: {},
		type: "style"
	};

	static FAILURE_STRING = "File has only 1 module declaration — write it as an external module.\n" +
		"If augmenting a single module, use `// tslint:disable-next-line:no-single-declare-module`.";

	apply(sourceFile: ts.SourceFile): Lint.RuleFailure[] {
		if (hasSoleModuleDeclaration(sourceFile)) {
			return this.applyWithWalker(new Walker(sourceFile, this.getOptions()));
		} else {
			return [];
		}
	}
}

// A walker is needed for `tslint:disable` to work.
class Walker extends Lint.RuleWalker {
	visitModuleDeclaration(node: ts.ModuleDeclaration) {
		this.fail(node, Rule.FAILURE_STRING);
	}

	private fail(node: ts.Node, message: string) {
		this.addFailure(this.createFailure(node.getStart(), node.getWidth(), message));
	}
}

function hasSoleModuleDeclaration({ statements }: ts.SourceFile): boolean {
	let moduleDecl: ts.ModuleDeclaration | undefined;
	for (const statement of statements) {
		if (statement.kind === ts.SyntaxKind.ModuleDeclaration) {
			const decl = statement as ts.ModuleDeclaration;
			if (decl.name.kind === ts.SyntaxKind.StringLiteral) {
				if (moduleDecl === undefined) {
					moduleDecl = decl;
				}
				else {
					// Has more than 1 declaration
					return false;
				}
			}
		}
	}
	return !!moduleDecl;
}
