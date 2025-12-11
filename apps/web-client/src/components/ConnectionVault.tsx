import { CredentialStore, EncryptionManager } from "@ide/storage";
import { useEffect, useState } from "react";
import { useLock } from "../state/lock";

const store = new CredentialStore();
const em = new EncryptionManager();

export default function ConnectionVault() {
	const [keys, setKeys] = useState<string[]>([]);
	const [passphrase, setPassphrase] = useState("");
	const [exportBlob, setExportBlob] = useState("");
	const { locked } = useLock();

	useEffect(() => {
		setKeys(store.listKeys());
	}, []);

	const exportAll = async () => {
		if (!passphrase) {
			console.warn("Please enter a passphrase first");
			return;
		}
		if (!confirm("Export all credentials encrypted with this passphrase?"))
			return;
		const all: { [key: string]: unknown } = {};
		for (const k of store.listKeys()) {
			all[k] = await store.load(k);
		}
		const blob = await em.encryptWithPassphrase(
			passphrase,
			JSON.stringify(all),
		);
		setExportBlob(blob);
	};

	const importBlob = async () => {
		if (!exportBlob) {
			console.warn("Please paste the export blob first");
			return;
		}
		if (!passphrase) {
			console.warn("Please enter a passphrase first");
			return;
		}
		try {
			const txt = await em.decryptWithPassphrase(passphrase, exportBlob);
			const obj = JSON.parse(txt);
			for (const k of Object.keys(obj)) {
				await store.save(k, obj[k]);
			}
			setKeys(store.listKeys());
			console.log("Credentials imported successfully");
		} catch (e) {
			console.error(`Failed to import: ${String(e)}`);
		}
	};

	const removeKey = async (k: string) => {
		if (!confirm(`Remove credential: ${k}?`)) return;
		await store.save(k, null);
		setKeys(store.listKeys());
	};

	const copy = async (k: string) => {
		const v = await store.load(k);
		if (!v) {
			console.warn("No value to copy for this credential");
			return;
		}
		const text = JSON.stringify(v);
		// Attempt clipboard; fallback to textarea selection
		try {
			await navigator.clipboard.writeText(text);
			console.log("Credential copied to clipboard");
		} catch (_e) {
			// fallback: create temporary textarea
			const ta = document.createElement("textarea");
			ta.value = text;
			document.body.appendChild(ta);
			ta.select();
			try {
				document.execCommand("copy");
				console.log("Credential copied to clipboard (fallback)");
			} catch (_err) {
				console.error("Copy failed; credential is available in the textarea above");
			}
			ta.remove();
		}
	};

	return (
		<div
			style={{
				padding: 12,
				border: "1px solid #ddd",
				borderRadius: 8,
				background: "#fff",
			}}
		>
			<h3>Connection Vault</h3>
			<div style={{ marginBottom: 8 }}>
				{locked ? (
					<div>
						Vault is locked — unlock via Security Settings to view credentials.
					</div>
				) : null}
			</div>
			{!locked && (
				<>
					<div>
						<label>Export/Import passphrase</label>
						<input
							value={passphrase}
							onChange={(e) => setPassphrase(e.target.value)}
							type="password"
						/>
					</div>
					<div style={{ marginTop: 8 }}>
						<button onClick={exportAll}>Export All (encrypted)</button>
						<button onClick={importBlob} style={{ marginLeft: 8 }}>
							Import
						</button>
					</div>
					<div style={{ marginTop: 8 }}>
						<textarea
							rows={6}
							value={exportBlob}
							onChange={(e) => setExportBlob(e.target.value)}
							style={{ width: "100%" }}
						/>
					</div>
					<h4>Saved credentials</h4>
					<ul>
						{keys.map((k) => (
							<li key={k}>
								{k} <button onClick={() => copy(k)}>Copy</button>{" "}
								<button onClick={() => removeKey(k)}>Remove</button>
							</li>
						))}
					</ul>
				</>
			)}
		</div>
	);
}
