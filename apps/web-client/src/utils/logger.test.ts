/**
 * Logger Tests
 * Tests for the structured logging utility
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { configureLogger, createLogger } from "./logger";

describe("logger", () => {
	let consoleDebugSpy: ReturnType<typeof vi.spyOn>;
	let consoleInfoSpy: ReturnType<typeof vi.spyOn>;
	let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
	let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		consoleDebugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
		consoleInfoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
		consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
		consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

		// Reset to default config (dev mode allows all levels)
		configureLogger({ minLevel: "debug", enableInProduction: false });
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("createLogger", () => {
		it("creates a logger with module prefix", () => {
			const logger = createLogger("TestModule");
			logger.info("test message");

			expect(consoleInfoSpy).toHaveBeenCalled();
			const call = consoleInfoSpy.mock.calls[0][0];
			expect(call).toContain("[TestModule]");
			expect(call).toContain("test message");
		});

		it("logs debug messages", () => {
			const logger = createLogger("Debug");
			logger.debug("debug message");

			expect(consoleDebugSpy).toHaveBeenCalled();
		});

		it("logs info messages", () => {
			const logger = createLogger("Info");
			logger.info("info message");

			expect(consoleInfoSpy).toHaveBeenCalled();
		});

		it("logs warn messages", () => {
			const logger = createLogger("Warn");
			logger.warn("warn message");

			expect(consoleWarnSpy).toHaveBeenCalled();
		});

		it("logs error messages", () => {
			const logger = createLogger("Error");
			logger.error("error message");

			expect(consoleErrorSpy).toHaveBeenCalled();
		});

		it("logs error with Error object", () => {
			const logger = createLogger("Error");
			const error = new Error("test error");
			logger.error("error occurred", error);

			expect(consoleErrorSpy).toHaveBeenCalled();
			expect(consoleErrorSpy.mock.calls[0][1]).toBe(error);
		});

		it("logs with additional data", () => {
			const logger = createLogger("Data");
			const data = { foo: "bar", count: 42 };
			logger.info("with data", data);

			expect(consoleInfoSpy).toHaveBeenCalledTimes(1);
			expect(consoleInfoSpy.mock.calls[0][1]).toEqual(data);
		});
	});

	describe("configureLogger", () => {
		it("respects minLevel setting", () => {
			configureLogger({ minLevel: "warn" });

			const logger = createLogger("MinLevel");
			logger.debug("debug");
			logger.info("info");
			logger.warn("warn");
			logger.error("error");

			expect(consoleDebugSpy).not.toHaveBeenCalled();
			expect(consoleInfoSpy).not.toHaveBeenCalled();
			expect(consoleWarnSpy).toHaveBeenCalled();
			expect(consoleErrorSpy).toHaveBeenCalled();
		});

		it("enables timestamps when configured", () => {
			configureLogger({ enableTimestamps: true });

			const logger = createLogger("Timestamps");
			logger.info("with timestamp");

			const call = consoleInfoSpy.mock.calls[0][0];
			// ISO timestamp format check
			expect(call).toMatch(/\[\d{4}-\d{2}-\d{2}/);
		});
	});

	describe("log levels hierarchy", () => {
		it("debug is lowest priority", () => {
			configureLogger({ minLevel: "debug" });
			const logger = createLogger("Hierarchy");

			logger.debug("d");
			logger.info("i");
			logger.warn("w");
			logger.error("e");

			expect(consoleDebugSpy).toHaveBeenCalledTimes(1);
			expect(consoleInfoSpy).toHaveBeenCalledTimes(1);
			expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
			expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
		});

		it("error is highest priority", () => {
			configureLogger({ minLevel: "error" });
			const logger = createLogger("Hierarchy");

			logger.debug("d");
			logger.info("i");
			logger.warn("w");
			logger.error("e");

			expect(consoleDebugSpy).not.toHaveBeenCalled();
			expect(consoleInfoSpy).not.toHaveBeenCalled();
			expect(consoleWarnSpy).not.toHaveBeenCalled();
			expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
		});
	});
});
