/// <reference types="vite/client" />

// Vite worker imports
declare module "*?worker" {
	const workerConstructor: {
		new (): Worker;
	};
	export default workerConstructor;
}
