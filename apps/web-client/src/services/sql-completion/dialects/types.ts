/**
 * Dialect registry types.
 *
 * Each dialect contributes *additions* on top of the ANSI base
 * (`static-completions.ts`): keywords and functions that don't exist in
 * ANSI SQL or are dialect-specific enough that surfacing them on the
 * wrong engine would be misleading.
 *
 * `signatures` is reserved for a future release (hover docs / parameter
 * hints). Shape is forward-compatible with overloads and ordered
 * parameters so populating it later doesn't break the registry contract.
 */

import type { SQLCompletion } from "../static-completions";

export type DialectKey = "duckdb" | "bigquery" | "snowflake";

export interface DialectSpec {
	/** Keywords this dialect adds on top of ANSI. */
	keywords: SQLCompletion[];
	/** Functions this dialect adds on top of ANSI. */
	functions: SQLCompletion[];
	/**
	 * Reserved for hover-documentation and parameter hints in a future
	 * release. Unused in v1 / Phase 2.
	 */
	signatures?: Record<string, { label: string; parameters?: string[] }>;
}
