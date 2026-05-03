/**
 * Tests for ApiKeyInlineField (backlog AI-1).
 *
 * Covers:
 *  - Format validation per provider (loose regex; rejects obvious wrong-provider pastes)
 *  - Save path: format-valid → verify call → aiCredentialStore.save → onSaved fires
 *  - Verify-failure path: provider returns error chunk → save NOT attempted, onSaved NOT fired
 *  - Existing-key + showManagement: renders Configured + Remove
 */

import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ApiKeyInlineField from "../ApiKeyInlineField";

// Mock the AI services module so we control credential store + provider behavior.
const mockSave = vi.fn();
const mockLoad = vi.fn();
const mockStreamChat = vi.fn();

vi.mock("../../../services/ai", () => ({
	aiCredentialStore: {
		save: (...args: unknown[]) => mockSave(...args),
		load: (...args: unknown[]) => mockLoad(...args),
	},
	getCredentialKey: (type: string) => `ai-key-${type}`,
	getProvider: (type: string) => ({
		type,
		displayName:
			type === "gemini"
				? "Google Gemini"
				: type === "groq"
					? "Groq"
					: type === "openai"
						? "OpenAI"
						: "Anthropic",
		models: [{ id: `${type}-default`, name: "Default", contextWindow: 8000 }],
		streamChat: (...args: unknown[]) => mockStreamChat(...args),
	}),
}));

beforeEach(() => {
	mockSave.mockReset();
	mockLoad.mockReset();
	mockStreamChat.mockReset();
	mockLoad.mockResolvedValue(null);
});

afterEach(() => {
	vi.clearAllMocks();
});

describe("ApiKeyInlineField — format validation", () => {
	it.each([
		["openai", "sk-validlookingkey", true],
		["openai", "AIzaWrongPrefix", false],
		["anthropic", "sk-ant-validlooking", true],
		["anthropic", "sk-validlooking-not-anthropic", false],
		["gemini", "AIzaSyValidLooking", true],
		["gemini", "sk-wrongprefix", false],
		["groq", "gsk_validlooking", true],
		["groq", "sk-wrongprefix", false],
	] as const)("validates %s key %s → %s", async (provider, key, valid) => {
		render(<ApiKeyInlineField provider={provider} />);
		await waitFor(() => expect(screen.getByPlaceholderText(/Paste/)).toBeInTheDocument());

		const input = screen.getByPlaceholderText(/Paste/) as HTMLInputElement;
		fireEvent.change(input, { target: { value: key } });

		const saveBtn = screen.getByRole("button", { name: /save/i }) as HTMLButtonElement;
		expect(saveBtn.disabled).toBe(!valid);

		if (!valid) {
			expect(screen.getByText(/Doesn't look like/i)).toBeInTheDocument();
		}
	});
});

describe("ApiKeyInlineField — save path", () => {
	it("verifies, then saves, then fires onSaved on success", async () => {
		mockStreamChat.mockImplementation(async function* () {
			yield { type: "text", text: "OK" };
		});
		mockSave.mockResolvedValue(undefined);

		const onSaved = vi.fn();
		render(<ApiKeyInlineField provider="gemini" onSaved={onSaved} />);
		await waitFor(() => expect(screen.getByPlaceholderText(/Paste/)).toBeInTheDocument());

		fireEvent.change(screen.getByPlaceholderText(/Paste/), {
			target: { value: "AIzaTestKey" },
		});
		fireEvent.click(screen.getByRole("button", { name: /save/i }));

		await waitFor(() => expect(mockStreamChat).toHaveBeenCalled());
		await waitFor(() => expect(mockSave).toHaveBeenCalledWith("ai-key-gemini", "AIzaTestKey"));
		await waitFor(() => expect(onSaved).toHaveBeenCalled());
	});

	it("does NOT save and does NOT fire onSaved on verify failure", async () => {
		mockStreamChat.mockImplementation(async function* () {
			yield { type: "error", error: "401 Unauthorized" };
		});

		const onSaved = vi.fn();
		render(<ApiKeyInlineField provider="openai" onSaved={onSaved} />);
		await waitFor(() => expect(screen.getByPlaceholderText(/Paste/)).toBeInTheDocument());

		fireEvent.change(screen.getByPlaceholderText(/Paste/), {
			target: { value: "sk-bad" },
		});
		fireEvent.click(screen.getByRole("button", { name: /save/i }));

		await waitFor(() => expect(screen.getByText(/401 Unauthorized/)).toBeInTheDocument());
		expect(mockSave).not.toHaveBeenCalled();
		expect(onSaved).not.toHaveBeenCalled();
	});
});

describe("ApiKeyInlineField — existing-key management", () => {
	it("renders Configured + Remove when key exists and showManagement is true", async () => {
		mockLoad.mockResolvedValue("AIzaSavedKey");

		const onRemoved = vi.fn();
		render(<ApiKeyInlineField provider="gemini" showManagement onRemoved={onRemoved} />);

		await waitFor(() => expect(screen.getByText(/Configured/)).toBeInTheDocument());
		expect(screen.getByRole("button", { name: /remove/i })).toBeInTheDocument();

		fireEvent.click(screen.getByRole("button", { name: /remove/i }));
		await waitFor(() => expect(mockSave).toHaveBeenCalledWith("ai-key-gemini", null));
		await waitFor(() => expect(onRemoved).toHaveBeenCalled());
	});

	it("renders nothing when key exists and showManagement is false (compact mode)", async () => {
		mockLoad.mockResolvedValue("AIzaSavedKey");
		const { container } = render(<ApiKeyInlineField provider="gemini" />);
		// Wait for the async load to settle, then assert empty.
		await waitFor(() => expect(mockLoad).toHaveBeenCalled());
		expect(container.firstChild).toBeNull();
	});
});
