/**
 * BigQuery setup preflight and error mapping.
 *
 * Two jobs, both aimed at the same failure: setup that *appears* to succeed
 * and then produces an opaque 403 somewhere unrelated.
 *
 * 1. `runPreflight` verifies, after connecting, that the pieces the connector
 *    actually needs are in place, and reports which specific step failed.
 * 2. `explainOAuthFailure` turns Google's terse error codes into the concrete
 *    thing the user got wrong, because "access_denied" tells nobody anything.
 *
 * Deliberately UI-free so it can be unit tested and reused by the CLI.
 */

/** A single verifiable claim about the user's Google Cloud setup. */
export interface PreflightCheck {
	id: "projects" | "query";
	label: string;
	status: "ok" | "failed" | "skipped";
	/** What the user should do. Present only when status is "failed". */
	remedy?: string;
	detail?: string;
}

export interface PreflightResult {
	ok: boolean;
	checks: PreflightCheck[];
}

/** The slice of the query service preflight needs. */
export interface PreflightTarget {
	getBigQueryProjects(): Promise<Array<{ id: string }>>;
	executeQueryOnConnector(
		connectorType: "bigquery",
		sql: string,
	): Promise<unknown>;
}

/**
 * Verify the connection can do the two things everything else depends on:
 * see at least one project, and run a trivial query against it.
 *
 * Ordered, and the query check is skipped when there is no project to run it
 * against — reporting "query failed" when the real problem is "no projects"
 * sends people down the wrong path.
 */
export async function runPreflight(
	target: PreflightTarget,
): Promise<PreflightResult> {
	const checks: PreflightCheck[] = [];

	let firstProject: string | null = null;
	try {
		const projects = await target.getBigQueryProjects();
		if (projects.length === 0) {
			checks.push({
				id: "projects",
				label: "Find your BigQuery projects",
				status: "failed",
				remedy:
					"No projects came back. Enable the BigQuery API on the project you want to query, then reconnect.",
			});
		} else {
			firstProject = projects[0].id;
			checks.push({
				id: "projects",
				label: "Find your BigQuery projects",
				status: "ok",
				detail: `${projects.length} project${projects.length === 1 ? "" : "s"} visible`,
			});
		}
	} catch (error) {
		checks.push({
			id: "projects",
			label: "Find your BigQuery projects",
			status: "failed",
			remedy: explainApiFailure(error),
			detail: messageOf(error),
		});
	}

	if (!firstProject) {
		checks.push({
			id: "query",
			label: "Run a test query",
			status: "skipped",
			detail: "Needs a visible project first",
		});
		return { ok: false, checks };
	}

	try {
		await target.executeQueryOnConnector("bigquery", "SELECT 1 AS ok");
		checks.push({
			id: "query",
			label: "Run a test query",
			status: "ok",
			detail: `Ran against ${firstProject}`,
		});
	} catch (error) {
		checks.push({
			id: "query",
			label: "Run a test query",
			status: "failed",
			remedy: explainApiFailure(error),
			detail: messageOf(error),
		});
	}

	return { ok: checks.every((c) => c.status === "ok"), checks };
}

/**
 * Map an OAuth failure to the setup step that caused it.
 *
 * Every string here corresponds to a step in the setup wizard, so the user is
 * pointed at a screen they have already seen rather than at Google's docs.
 */
export function explainOAuthFailure(error: unknown): string {
	const message = messageOf(error).toLowerCase();

	if (message.includes("redirect_uri_mismatch")) {
		return `The redirect URI does not match. Add exactly ${window.location.origin}/oauth-callback to your OAuth client's Authorized redirect URIs. It is port-sensitive, so a different dev server port needs its own entry.`;
	}
	if (message.includes("access_denied")) {
		return "Google refused the sign-in. If your OAuth consent screen is still in Testing, add your own Google account under Audience as a test user.";
	}
	if (message.includes("invalid_client")) {
		return "Google did not recognise the client. Check the Client ID was copied whole, and that the client is a Web application type.";
	}
	if (message.includes("invalid_grant")) {
		return "The authorization expired before it was exchanged. Try connecting again.";
	}
	if (message.includes("admin_policy_enforced")) {
		return "Your Google Workspace admin blocks this app. They need to allow it, or use an account outside the organisation.";
	}
	if (message.includes("org_internal")) {
		return "The OAuth client is limited to your organisation. Sign in with an account in that organisation, or set the consent screen's user type to External.";
	}
	return messageOf(error);
}

/** Map an API failure to the enable-this-API or grant-this-role remedy. */
export function explainApiFailure(error: unknown): string {
	const message = messageOf(error).toLowerCase();

	if (
		message.includes("has not been used") ||
		message.includes("service_disabled") ||
		message.includes("api is not enabled")
	) {
		return "The BigQuery API is not enabled on this project. Enable it in the API Library, wait a minute, then retry.";
	}
	if (message.includes("403") || message.includes("permission")) {
		return "Your account is signed in but lacks permission. You need at least BigQuery User on the project.";
	}
	if (message.includes("401") || message.includes("unauthenticated")) {
		return "The credential was rejected. If you pasted an access token it has likely expired; generate a new one.";
	}
	if (message.includes("billing")) {
		return "This project has no billing account. BigQuery queries need billing enabled, even within the free tier.";
	}
	return messageOf(error);
}

function messageOf(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
