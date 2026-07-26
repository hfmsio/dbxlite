/**
 * Single import surface for the connection-lifecycle collaborators.
 *
 * The lifecycle classes need concrete connector constructors and the credential
 * store type. Routing them through one module keeps each lifecycle file's
 * imports about what it orchestrates rather than where the pieces live, and
 * gives tests one place to stub.
 */

export { BigQueryConnector, SnowflakeConnector } from "@ide/connectors";
export type { CloudConnector } from "@ide/connectors";
export type { EncryptedCredentialStore } from "@ide/storage";
