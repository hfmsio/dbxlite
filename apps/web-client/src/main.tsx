import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { LockProvider } from "./state/lock";

// Monaco version must match package.json
const MONACO_VERSION = "0.54.0";
const MONACO_CDN = `https://cdn.jsdelivr.net/npm/monaco-editor@${MONACO_VERSION}/min/vs`;

// Configure Monaco Editor workers via CDN for proxy compatibility
self.MonacoEnvironment = {
	getWorkerUrl(_: string, label: string) {
		if (label === "json") {
			return `${MONACO_CDN}/language/json/json.worker.js`;
		}
		if (label === "css" || label === "scss" || label === "less") {
			return `${MONACO_CDN}/language/css/css.worker.js`;
		}
		if (label === "html" || label === "handlebars" || label === "razor") {
			return `${MONACO_CDN}/language/html/html.worker.js`;
		}
		if (label === "typescript" || label === "javascript") {
			return `${MONACO_CDN}/language/typescript/ts.worker.js`;
		}
		return `${MONACO_CDN}/editor/editor.worker.js`;
	},
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
