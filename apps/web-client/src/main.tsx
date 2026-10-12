import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import { createRoot } from "react-dom/client";
import App from "./App";
import { LockProvider } from "./state/lock";

// Monaco's worker ships with the app rather than from a CDN. A page that is
// cross-origin isolated (the COOP/COEP headers DuckDB needs) refuses to build
// a Worker from another origin, and Monaco then silently runs its language
// services on the main thread and freezes the UI.
//
// Every editor in the app is `language: "sql"`, which has no language service
// worker of its own, so the generic editor worker is the only one Monaco can
// ask for. Bundling the json/css/html/typescript workers as well would add
// 8 MB to the build for code that can never run.
self.MonacoEnvironment = {
	getWorker: () => new EditorWorker(),
};

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
