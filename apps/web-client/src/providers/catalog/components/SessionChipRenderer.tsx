/**
 * SessionChipRenderer — renders one SessionContextChip with provider-aware
 * dropdown wiring.
 *
 * Extracted from CatalogExplorer so the same component can power the topbar
 * popover (Header) and other future surfaces (e.g., a per-tab context strip).
 *
 * Wraps the chip in DropdownChip when the provider supports the corresponding
 * switch (compute / catalog / schema / role-with-reconnect). Otherwise renders
 * a static chip.
 */

import { useMemo } from "react"
import type {
	CatalogProvider,
	CatalogProviderHostHandlers,
	SessionContextChip,
} from "../types"
import ComputeStatusBadge from "./ComputeStatusBadge"
import DropdownChip from "./DropdownChip"

interface Props {
	chip: SessionContextChip
	provider: CatalogProvider
	host: CatalogProviderHostHandlers
	/** Current database value, used to wire the schema-switch dropdown. */
	currentDatabase?: string
}

export default function SessionChipRenderer({
	chip,
	provider,
	host,
	currentDatabase,
}: Props) {
	const baseChip = (
		<span
			title={`${chip.tooltip}\n\nCurrent ${chip.label}: ${chip.value}`}
			style={{
				display: "inline-flex",
				alignItems: "center",
				gap: 4,
				padding: "2px 6px",
				background: "var(--bg-secondary)",
				borderRadius: 4,
				color: chip.muted ? "var(--text-muted)" : "var(--text-primary)",
				fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
				fontSize: 10.5,
				lineHeight: 1.4,
				whiteSpace: "nowrap",
			}}
		>
			{/* Icon-only label keeps the chip row compact; the full label
			    lives in the title attribute / tooltip above. */}
			<span
				aria-label={chip.label}
				style={{ fontFamily: "system-ui, sans-serif" }}
			>
				{chip.icon}
			</span>
			<span
				style={{
					maxWidth: 140,
					overflow: "hidden",
					textOverflow: "ellipsis",
				}}
			>
				{chip.value}
			</span>
		</span>
	)

	const dropdownConfig = useMemo(() => {
		if (
			chip.id === "compute" &&
			provider.listAvailableComputeOptions &&
			provider.setComputeContext
		) {
			return {
				ariaLabel: `Switch ${chip.label}`,
				loadOptions: async () => {
					const opts = await provider.listAvailableComputeOptions!()
					return opts.map((o) => ({
						value: o.name,
						secondary: [o.size, o.state].filter(Boolean).join(" · "),
					}))
				},
				onSelect: async (warehouse: string) => {
					try {
						await provider.setComputeContext!({ warehouse })
						host.showToast?.(`Switched warehouse to ${warehouse}`, "success")
					} catch (err) {
						host.showToast?.(
							err instanceof Error ? err.message : "Switch failed",
							"error",
						)
					}
				},
			}
		}
		if (
			chip.id === "catalog" &&
			provider.listCatalogs &&
			provider.setDataContext
		) {
			const term = provider.catalogTerm?.singular ?? "database"
			return {
				ariaLabel: `Switch default ${term}`,
				loadOptions: async () => {
					const cats = await provider.listCatalogs()
					return cats.map((c) => ({ value: c.name, label: c.name }))
				},
				onSelect: async (catalog: string) => {
					try {
						await provider.setDataContext!(catalog)
						host.showToast?.(`Default database set to ${catalog}`, "success")
					} catch (err) {
						host.showToast?.(
							err instanceof Error ? err.message : "Switch failed",
							"error",
						)
					}
				},
			}
		}
		if (
			chip.id === "schema" &&
			provider.listSchemas &&
			provider.setDataContext &&
			currentDatabase &&
			currentDatabase !== "(none)"
		) {
			return {
				ariaLabel: `Switch default schema in ${currentDatabase}`,
				loadOptions: async () => {
					const ss = await provider.listSchemas(currentDatabase)
					return ss.map((s) => ({ value: s.name, label: s.name }))
				},
				onSelect: async (schema: string) => {
					try {
						await provider.setDataContext!(currentDatabase, schema)
						host.showToast?.(`Default schema set to ${schema}`, "success")
					} catch (err) {
						host.showToast?.(
							err instanceof Error ? err.message : "Switch failed",
							"error",
						)
					}
				},
			}
		}
		if (chip.id === "role" && provider.listAvailableRoles) {
			if (provider.requiresReconnectForRoleSwitch) {
				return {
					ariaLabel: "Switch role (requires reconnect)",
					loadOptions: async () => {
						const roles = await provider.listAvailableRoles!()
						return roles.map((r) => ({
							value: r,
							label: r,
							secondary: r === chip.value ? "current" : undefined,
						}))
					},
					onSelect: async (role: string) => {
						if (role === chip.value) return
						const ok = window.confirm(
							`Switching role to ${role} requires reconnecting (OAuth scope is locked to one role).\n\nReconnect now?`,
						)
						if (!ok) return
						host.openConnectionEdit?.()
						host.showToast?.(`Reconnect with role: ${role}`, "info")
					},
				}
			}
		}
		return null
	}, [chip, provider, host, currentDatabase])

	const showComputeBadge =
		chip.id === "compute" && !!provider.getComputeStatus

	const wrapped = dropdownConfig ? (
		<DropdownChip
			loadOptions={dropdownConfig.loadOptions}
			onSelect={dropdownConfig.onSelect}
			currentValue={chip.value}
			ariaLabel={dropdownConfig.ariaLabel}
			reloadKey={chip.value}
		>
			{baseChip}
		</DropdownChip>
	) : (
		baseChip
	)

	if (!showComputeBadge) return wrapped
	return (
		<span
			style={{
				display: "inline-flex",
				alignItems: "center",
				gap: 4,
			}}
		>
			{wrapped}
			<ComputeStatusBadge provider={provider} label={chip.label} />
		</span>
	)
}
