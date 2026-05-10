/**
 * OAuth callback handler page.
 *
 * Both Snowflake and BigQuery redirect their OAuth popup here after the user
 * grants consent. (Snowflake's redirect URI is `/oauth-callback.html`;
 * BigQuery's is `/oauth-callback`, but Vite's MPA fuzzy-match resolves both
 * to this same file, so we handle both flows in one place.)
 *
 * The page extracts `code` + `state` from the URL and writes them to BOTH
 * connector-specific localStorage keys so each parent (Snowflake's
 * connector waiting on SNOWFLAKE_*; BigQuery's connector waiting on
 * `bigquery_oauth_response`) sees the value. Each parent's checkLocalStorage
 * matches its own state; the non-owning parent reads, fails the state
 * comparison, and ignores. No conflict.
 *
 * Plus BroadcastChannel + postMessage for parents that prefer real-time
 * signals, and a keepalive that re-writes localStorage every 500ms for ~3s
 * in case the parent's poll happens between writes.
 */

import {
	SNOWFLAKE_OAUTH_BROADCAST_CHANNEL,
	SNOWFLAKE_OAUTH_ERROR_KEY,
	SNOWFLAKE_OAUTH_RESPONSE_KEY,
} from "../utils/oauth-constants"

// BigQuery uses these keys (not exported as constants because BQ predates
// the Snowflake refactor; keeping inline here).
const BIGQUERY_OAUTH_RESPONSE_KEY = "bigquery_oauth_response"
const BIGQUERY_OAUTH_ERROR_KEY = "bigquery_oauth_error"

declare global {
	interface Window {
		// Keep callback minimal; no shared globals.
	}
}

const params = new URLSearchParams(window.location.search)
const code = params.get("code")
const state = params.get("state")
const error = params.get("error")
const errorDescription = params.get("error_description")

const spinner = document.getElementById("spinner")
const status = document.getElementById("status")

const setStatus = (text: string, klass?: "success" | "error") => {
	if (status) {
		status.textContent = text
		if (klass) status.className = klass
	}
	if (spinner && klass) spinner.style.display = "none"
}

// Write to both Snowflake and BigQuery keys. The non-owning parent's
// checkLocalStorage will fail its state comparison and ignore; the owning
// parent's listener matches state and resolves.
const writeResponse = (data: string) => {
	try { localStorage.setItem(SNOWFLAKE_OAUTH_RESPONSE_KEY, data) } catch {}
	try {
		localStorage.setItem(
			BIGQUERY_OAUTH_RESPONSE_KEY,
			// BigQuery's parent expects `{type:"oauth_code", code, state, timestamp}`
			// shape; Snowflake's expects `{code, state, timestamp}`. Wrap the same
			// values in the BQ-specific shape.
			JSON.stringify({
				type: "oauth_code",
				code: JSON.parse(data).code,
				state: JSON.parse(data).state,
				timestamp: Date.now(),
			}),
		)
	} catch {}
}

const writeError = (msg: string) => {
	try { localStorage.setItem(SNOWFLAKE_OAUTH_ERROR_KEY, msg) } catch {}
	try { localStorage.setItem(BIGQUERY_OAUTH_ERROR_KEY, msg) } catch {}
}

// Delivery preference: window.opener.postMessage(targetOrigin) is the
// safest channel because the message is scoped to the opener and the
// origin is enforced by the browser. localStorage + BroadcastChannel
// remain as fallbacks for cases where window.opener is null (popup
// blocked + redirect, or top-level navigation reuse).
//
// When postMessage succeeds, we still write to localStorage so the
// opener's local-storage listener path (originally the only path) keeps
// working. We DO clear the storage keys eagerly on `unload` so the auth
// code doesn't sit in localStorage longer than necessary.
const haveOpener = typeof window.opener !== "undefined" && window.opener !== null

const clearLocalStorageKeys = () => {
	for (const k of [
		SNOWFLAKE_OAUTH_RESPONSE_KEY,
		SNOWFLAKE_OAUTH_ERROR_KEY,
		BIGQUERY_OAUTH_RESPONSE_KEY,
		BIGQUERY_OAUTH_ERROR_KEY,
	]) {
		try { localStorage.removeItem(k) } catch {}
	}
}
window.addEventListener("unload", clearLocalStorageKeys)

// NB: do NOT write to localStorage up front. The previous version did
// `writeResponse(...)` here unconditionally, which meant the auth code
// briefly sat in localStorage even when postMessage was about to deliver
// it directly. We now write only in the fallback branches below.

if (error) {
	const msg = errorDescription || error
	setStatus(`Authentication failed: ${msg}`, "error")

	// Primary: opener postMessage (scoped to opener + origin).
	let delivered = false
	if (haveOpener) {
		try {
			window.opener!.postMessage(
				{ type: "oauth_error", error: msg, state },
				window.location.origin,
			)
			delivered = true
		} catch {}
	}

	// Fallback channels — only emit if postMessage was unavailable.
	if (!delivered) {
		writeError(msg)
		if (typeof BroadcastChannel !== "undefined") {
			try {
				const ch = new BroadcastChannel(SNOWFLAKE_OAUTH_BROADCAST_CHANNEL)
				ch.postMessage({ type: "oauth_error", error: msg, state })
				setTimeout(() => ch.close(), 1000)
			} catch {}
		}
	}

	setTimeout(() => window.close(), 3000)
} else if (code && state) {
	setStatus("Authentication successful. Closing…", "success")

	const responseData = JSON.stringify({ code, state, timestamp: Date.now() })

	// Primary: opener postMessage. If the opener is present and same-
	// origin, this is the only channel we need.
	let delivered = false
	if (haveOpener) {
		try {
			window.opener!.postMessage(
				{ type: "oauth_code", code, state },
				window.location.origin,
			)
			delivered = true
		} catch {}
	}

	if (delivered) {
		// Opener got the code. Skip localStorage / BroadcastChannel writes
		// to minimise the surface where the auth code sits at rest. We
		// already wrote once above for the brief window before the opener
		// pulls it via the message; the unload listener clears it.
		setTimeout(() => window.close(), 250)
	} else {
		// Fallback channels for popup-blocked / opener-unavailable cases.
		writeResponse(responseData)
		if (typeof BroadcastChannel !== "undefined") {
			try {
				const ch = new BroadcastChannel(SNOWFLAKE_OAUTH_BROADCAST_CHANNEL)
				ch.postMessage({ type: "oauth_code", code, state })
				setTimeout(() => ch.close(), 1000)
			} catch {}
		}

		// Keepalive: re-write every 500ms for ~3s so the opener's
		// localStorage poll picks it up.
		let attempts = 0
		const ka = setInterval(() => {
			attempts++
			writeResponse(responseData)
			if (attempts >= 6) {
				clearInterval(ka)
				window.close()
			}
		}, 500)
	}
} else {
	setStatus("Missing authorization code. Please try again.", "error")
	setTimeout(() => window.close(), 3000)
}
