import type React from "react";
import { createContext, useContext, useState } from "react";

const LockContext = createContext<{
	locked: boolean;
	lock: () => void;
	unlock: (pass: string) => Promise<boolean>;
}>({
	locked: true,
	lock: () => {},
	unlock: async () => false,
});

export function LockProvider({ children }: { children: React.ReactNode }) {
	const [locked, setLocked] = useState(true);
	const lock = () => setLocked(true);
	const unlock = async (passphrase: string) => {
		// for demo, just unlock if passphrase is non-empty and matches stored vault (if exists)
		const blob = localStorage.getItem("vault:meta");
		if (!blob) {
			setLocked(false);
			return true;
		}
		try {
			// try decrypt with EncryptionManager dynamically (avoid heavy imports here)
			const { EncryptionManager } = await import("@ide/storage");
			const em = new EncryptionManager();
			await em.decryptWithPassphrase(passphrase, blob);
			setLocked(false);
			return true;
		} catch (_e) {
			return false;
		}
	};
	return (
		<LockContext.Provider value={{ locked, lock, unlock }}>
			{children}
		</LockContext.Provider>
	);
}

export function useLock() {
	return useContext(LockContext);
}
