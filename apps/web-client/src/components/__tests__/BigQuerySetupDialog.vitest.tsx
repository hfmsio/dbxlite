/**
 * Tests for the BigQuery setup wizard.
 *
 * Focused on the things the old single-screen dialog got wrong: the steps that
 * block setup were absent, the secret was mandatory when the flow uses PKCE,
 * and failures surfaced as raw Google error codes.
 */

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	setupBigQuery: vi.fn().mockResolvedValue(undefined),
	setupBigQueryWithAccessToken: vi.fn().mockResolvedValue(undefined),
	getBigQueryProjects: vi.fn().mockResolvedValue([{ id: "p1" }]),
	executeQueryOnConnector: vi.fn().mockResolvedValue({ rows: [] }),
}));

vi.mock("../../services/streaming-query-service", () => ({
	queryService: mocks,
}));

import BigQuerySetupDialog from "../BigQuerySetupDialog";

const renderDialog = (over: Partial<Record<string, unknown>> = {}) => {
	const onClose = vi.fn();
	const onSuccess = vi.fn();
	const showToast = vi.fn();
	render(
		<BigQuerySetupDialog
			onClose={onClose}
			onSuccess={onSuccess}
			showToast={showToast}
			{...over}
		/>,
	);
	return { onClose, onSuccess, showToast };
};

const typeInto = (label: RegExp, value: string) =>
	fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe("BigQuerySetupDialog", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.setupBigQuery.mockResolvedValue(undefined);
		mocks.setupBigQueryWithAccessToken.mockResolvedValue(undefined);
		mocks.getBigQueryProjects.mockResolvedValue([{ id: "p1" }]);
		mocks.executeQueryOnConnector.mockResolvedValue({ rows: [] });
	});

	describe("the steps that used to be missing", () => {
		it("tells the user to configure the consent screen first", () => {
			renderDialog();

			expect(screen.getByText(/OAuth consent screen/i)).toBeTruthy();
		});

		it("tells the user to add themselves as a test user", () => {
			renderDialog();

			expect(screen.getByText(/test user/i)).toBeTruthy();
		});

		it("tells the user to enable the BigQuery API", () => {
			renderDialog();

			expect(screen.getByText(/BigQuery API/)).toBeTruthy();
		});

		it("warns about the unverified-app screen before they hit it", () => {
			renderDialog();

			expect(screen.getByText(/not verified/i)).toBeTruthy();
		});

		it("warns that the redirect URI is port-sensitive", () => {
			renderDialog();

			expect(screen.getByText(/including the port/i)).toBeTruthy();
		});

		it("offers a copy button for the redirect URI", () => {
			renderDialog();

			expect(screen.getByLabelText("Copy redirect URI")).toBeTruthy();
		});
	});

	describe("OAuth mode", () => {
		it("refuses to connect without a client id", () => {
			renderDialog();

			fireEvent.click(screen.getByText("Connect"));

			expect(screen.getByRole("alert").textContent).toMatch(/Client ID/);
			expect(mocks.setupBigQuery).not.toHaveBeenCalled();
		});

		it("connects without a client secret, since the flow uses PKCE", async () => {
			renderDialog();
			typeInto(/^Client ID$/, "abc.apps.googleusercontent.com");

			await act(async () => {
				fireEvent.click(screen.getByText("Connect"));
			});

			expect(mocks.setupBigQuery).toHaveBeenCalledWith(
				"abc.apps.googleusercontent.com",
				"",
				expect.any(AbortSignal),
			);
		});

		it("passes a supplied secret through", async () => {
			renderDialog();
			typeInto(/^Client ID$/, "abc");
			typeInto(/Client secret/, "GOCSPX-x");

			await act(async () => {
				fireEvent.click(screen.getByText("Connect"));
			});

			expect(mocks.setupBigQuery).toHaveBeenCalledWith(
				"abc",
				"GOCSPX-x",
				expect.any(AbortSignal),
			);
		});

		it("explains a redirect_uri_mismatch instead of echoing the code", async () => {
			mocks.setupBigQuery.mockRejectedValue(new Error("redirect_uri_mismatch"));
			renderDialog();
			typeInto(/^Client ID$/, "abc");

			await act(async () => {
				fireEvent.click(screen.getByText("Connect"));
			});

			const alert = screen.getByRole("alert").textContent ?? "";
			expect(alert).toContain("/oauth-callback");
			expect(alert).toMatch(/port-sensitive/);
		});

		it("explains access_denied as a missing test user", async () => {
			mocks.setupBigQuery.mockRejectedValue(new Error("access_denied"));
			renderDialog();
			typeInto(/^Client ID$/, "abc");

			await act(async () => {
				fireEvent.click(screen.getByText("Connect"));
			});

			expect(screen.getByRole("alert").textContent).toMatch(/test user/i);
		});
	});

	describe("token mode", () => {
		const switchToToken = () =>
			fireEvent.click(screen.getByText("Paste an access token"));

		it("shows the gcloud command to run", () => {
			renderDialog();
			switchToToken();

			expect(screen.getByText("gcloud auth print-access-token")).toBeTruthy();
		});

		it("says the token is short-lived rather than letting it surprise them", () => {
			renderDialog();
			switchToToken();

			expect(screen.getByText(/about an hour/i)).toBeTruthy();
		});

		it("refuses to connect without a token", () => {
			renderDialog();
			switchToToken();

			fireEvent.click(screen.getByText("Connect"));

			expect(mocks.setupBigQueryWithAccessToken).not.toHaveBeenCalled();
		});

		it("connects with the pasted token and never asks for a client id", async () => {
			renderDialog();
			switchToToken();
			fireEvent.change(screen.getByPlaceholderText("ya29...."), {
				target: { value: "ya29.abc" },
			});

			await act(async () => {
				fireEvent.click(screen.getByText("Connect"));
			});

			expect(mocks.setupBigQueryWithAccessToken).toHaveBeenCalledWith(
				"ya29.abc",
			);
			expect(mocks.setupBigQuery).not.toHaveBeenCalled();
		});
	});

	describe("preflight", () => {
		it("closes on a clean connection", async () => {
			const { onSuccess, onClose } = renderDialog();
			typeInto(/^Client ID$/, "abc");

			await act(async () => {
				fireEvent.click(screen.getByText("Connect"));
			});

			await waitFor(() => expect(onSuccess).toHaveBeenCalled());
			expect(onClose).toHaveBeenCalled();
		});

		it("stays open and reports which step failed when the API is off", async () => {
			// Auth succeeds, so the old dialog would have declared victory and
			// left the 403 to appear later against an unrelated action.
			mocks.getBigQueryProjects.mockResolvedValue([]);
			const { onSuccess } = renderDialog();
			typeInto(/^Client ID$/, "abc");

			await act(async () => {
				fireEvent.click(screen.getByText("Connect"));
			});

			await waitFor(() =>
				expect(screen.getByText(/not usable yet/i)).toBeTruthy(),
			);
			expect(screen.getByText(/Enable the BigQuery API/i)).toBeTruthy();
			expect(onSuccess).not.toHaveBeenCalled();
		});

		it("reports a permission failure against the test query", async () => {
			mocks.executeQueryOnConnector.mockRejectedValue(
				new Error("403 permission denied"),
			);
			renderDialog();
			typeInto(/^Client ID$/, "abc");

			await act(async () => {
				fireEvent.click(screen.getByText("Connect"));
			});

			await waitFor(() =>
				expect(screen.getByText(/BigQuery User/)).toBeTruthy(),
			);
		});
	});
});
