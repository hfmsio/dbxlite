/// <reference types="vite/client" />

// App version injected at build/test time from package.json (see the
// __APP_VERSION__ define in vite.config.ts / vitest.config.ts).
declare const __APP_VERSION__: string;

// Vite worker imports
declare module "*?worker" {
	const workerConstructor: {
		new (): Worker;
	};
	export default workerConstructor;
}
