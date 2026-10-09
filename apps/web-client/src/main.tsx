import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";
import { installHostBridge, setMockLoader } from "@zibby-run/app-kit";
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import { createRoot } from "react-dom/client";
import App from "./App";
import { LockProvider } from "./state/lock";

// Monaco's worker ships in the bundle: Zibby serves no CDN, and a cross-origin
// worker URL is a fetch the host page will not make. Only the base editor
// worker is wired because the editor runs SQL alone - the SQL completions are
// registered on the main thread, and the json/css/html/typescript language
// workers were never reached.
self.MonacoEnvironment = {
	getWorker() {
		return new EditorWorker();
	},
};

// The Zibby host answers the handshake with the visitor's token, balance and
// per-action quote. A standalone `pnpm dev` page has no host to answer, so the
// mock bridge stands in and the AI panel talks to a canned stream instead of
// spending a visitor's credits. Both dev-only branches drop out of the
// production bundle.
if (import.meta.env.DEV) {
	setMockLoader(() => import("./services/ai/zibby-mock").then((m) => m.mockStreamZibbyAi));
	if ((window as unknown as Record<string, unknown>).__zibbyAiMock === undefined) {
		(window as unknown as Record<string, unknown>).__zibbyAiMock = true;
	}
}

if (import.meta.env.DEV && window.parent === window) {
	void import("@zibby-run/app-kit/mock").then((m) => m.installMockHostBridge());
} else {
	installHostBridge();
}

const container = document.getElementById("root")!;
const root = createRoot(container);
// Only mount Vercel Analytics on the canonical hosted domain. The same build
// is shipped via npm (npx dbxlite-ui) where /_vercel/* endpoints don't exist
// and the scripts would 404 with noisy console errors.
const isHosted = typeof window !== "undefined" &&
	(window.location.hostname === "sql.dbxlite.com" ||
	 window.location.hostname.endsWith(".dbxlite.com"));
root.render(
	<LockProvider>
		<App />
		{isHosted && <Analytics />}
		{isHosted && <SpeedInsights />}
	</LockProvider>,
);
