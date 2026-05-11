/**
 * Public API for the SQL completion subsystem.
 *
 * Consumers should import from this barrel rather than reaching into
 * individual modules. The module layout (context-detector,
 * alias-resolver, cte-extractor, suggestion-builder, dialects/) is an
 * implementation detail that may evolve.
 */

export {
	createCompletionProvider,
	type CompletionProviderDeps,
} from "./provider";

// Pure helpers exported for testing and potential reuse outside Monaco.
export {
	detectSQLContext,
	getContextualCompletions,
	type SQLContext,
} from "./context-detector";
export { parseCTENames } from "./cte-extractor";
export { parseTableAliases, type TableAlias } from "./alias-resolver";
export {
	getAllSQLCompletions,
	SQL_FUNCTIONS,
	SQL_KEYWORDS,
	SQL_SNIPPETS,
	type SQLCompletion,
} from "./static-completions";
export type { DialectKey, DialectSpec } from "./dialects/types";
export {
	getDialectOnlyLabels,
	getFunctionsForDialect,
	getKeywordsForDialect,
} from "./dialect-registry";
