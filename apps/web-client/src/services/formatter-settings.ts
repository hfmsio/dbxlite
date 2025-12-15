/**
 * Formatter Settings Store
 *
 * Manages user preferences for data type formatting and display alignment
 */

import type { FormatterOptions } from "../utils/formatters";
import { createLogger } from "../utils/logger";

const logger = createLogger("FormatterSettings");

export interface TypeAlignmentSettings {
	numeric: "left" | "center" | "right";
	string: "left" | "center" | "right";
	boolean: "left" | "center" | "right";
	temporal: "left" | "center" | "right";
	binary: "left" | "center" | "right";
	complex: "left" | "center" | "right";
	null: "left" | "center" | "right";
}

export interface FormatterSettings {
	dateFormat: FormatterOptions["dateFormat"];
	timeFormat: FormatterOptions["timeFormat"];
	timestampTimezone: "auto" | "utc" | "local";
	timezoneFormat: "offset" | "short" | "long" | "none";
	decimalPlaces: number;
	nullDisplay: string;
	booleanDisplay: FormatterOptions["booleanDisplay"];
	timestampPrecision: FormatterOptions["timestampPrecision"];
	alignment: TypeAlignmentSettings;
	copyDelimiter: "tab" | "comma" | "pipe" | "space";
	copyWithHeaders: boolean;
	maxUserLimitRows: number;
}

const DEFAULT_FORMATTER_SETTINGS: FormatterSettings = {
	dateFormat: "iso",
	timeFormat: "24h",
	timestampTimezone: "local",
	timezoneFormat: "short",
	decimalPlaces: 2,
	nullDisplay: "NULL",
	booleanDisplay: "text",
	timestampPrecision: "seconds",
	copyDelimiter: "tab",
	copyWithHeaders: true,
	maxUserLimitRows: 10000,
	alignment: {
		numeric: "right",
		string: "left",
		boolean: "center",
		temporal: "left",
		binary: "left",
		complex: "left",
		null: "center",
	},
};

const STORAGE_KEY = "dbxlite-formatter-settings";

class FormatterSettingsStore {
	private settings: FormatterSettings;
	private listeners: Set<(settings: FormatterSettings) => void> = new Set();

	constructor() {
		this.settings = this.loadSettings();
	}

	private loadSettings(): FormatterSettings {
		try {
			const stored = localStorage.getItem(STORAGE_KEY);
			if (stored) {
				const parsed = JSON.parse(stored);
				// Merge with defaults to ensure all fields exist
				return {
					...DEFAULT_FORMATTER_SETTINGS,
					...parsed,
					alignment: {
						...DEFAULT_FORMATTER_SETTINGS.alignment,
						...(parsed.alignment || {}),
					},
				};
			}
		} catch (e) {
			logger.error("Failed to load formatter settings", e);
		}
		return DEFAULT_FORMATTER_SETTINGS;
	}

	private saveSettings() {
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
			this.notifyListeners();
		} catch (e) {
			logger.error("Failed to save formatter settings", e);
		}
	}

	private notifyListeners() {
		this.listeners.forEach((listener) => listener(this.settings));
	}

	getSettings(): FormatterSettings {
		return { ...this.settings };
	}

	getFormatterOptions(): FormatterOptions {
		return {
			dateFormat: this.settings.dateFormat,
			timeFormat: this.settings.timeFormat,
			timestampTimezone: this.settings.timestampTimezone,
			timezoneFormat: this.settings.timezoneFormat,
			decimalPlaces: this.settings.decimalPlaces,
			nullDisplay: this.settings.nullDisplay,
			booleanDisplay: this.settings.booleanDisplay,
			timestampPrecision: this.settings.timestampPrecision,
		};
	}

	updateSettings(updates: Partial<FormatterSettings>) {
		this.settings = {
			...this.settings,
			...updates,
			alignment: {
				...this.settings.alignment,
				...(updates.alignment || {}),
			},
		};
		this.saveSettings();
	}

	updateAlignment(
		typeCategory: keyof TypeAlignmentSettings,
		alignment: "left" | "center" | "right",
	) {
		this.settings.alignment[typeCategory] = alignment;
		this.saveSettings();
	}

	resetToDefaults() {
		this.settings = { ...DEFAULT_FORMATTER_SETTINGS };
		this.saveSettings();
	}

	subscribe(listener: (settings: FormatterSettings) => void): () => void {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}
}

export const formatterSettings = new FormatterSettingsStore();

/**
 * Database Timezone Tracker
 * Tracks the current timezone setting in DuckDB for "auto" timezone mode.
 * This is set when DuckDB initializes and can be updated when SET timezone is detected.
 */
class DatabaseTimezoneStore {
	private timezone: string;
	private listeners: Set<(tz: string) => void> = new Set();

	constructor() {
		// Default to browser's local timezone (same as what we set in DuckDB on init)
		this.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
	}

	getTimezone(): string {
		return this.timezone;
	}

	setTimezone(tz: string) {
		if (tz !== this.timezone) {
			this.timezone = tz;
			this.notifyListeners();
		}
	}

	private notifyListeners() {
		this.listeners.forEach((listener) => listener(this.timezone));
	}

	subscribe(listener: (tz: string) => void): () => void {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}
}

export const databaseTimezone = new DatabaseTimezoneStore();
