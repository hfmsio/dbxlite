/**
 * Unit tests for the shared compute-status probe (WS-B / B5).
 *
 * The point of this collaborator is that N badges cost one poll, so the
 * ref-counting and sharing are what these pin.
 */

import { CloudProxyUnavailableError } from "@ide/connectors";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	COMPUTE_POLL_INTERVAL_MS,
	getComputeProbe,
	type ComputeStatusSource,
} from "../compute-status-probe";

const running = () => ({ state: "running" as const, lastChecked: new Date() });

function sourceOf(impl?: () => Promise<{ state: string }>) {
	return {
		getComputeStatus: vi.fn(impl ?? (async () => running())),
	} as unknown as ComputeStatusSource & {
		getComputeStatus: ReturnType<typeof vi.fn>;
	};
}

/** Let the probe's in-flight fetch settle. */
const settle = () => vi.advanceTimersByTimeAsync(0);

describe("compute-status probe", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("fetches immediately on the first subscriber", async () => {
		const source = sourceOf();
		const listener = vi.fn();

		getComputeProbe(source, "WH").subscribe(listener);
		await settle();

		expect(source.getComputeStatus).toHaveBeenCalledWith("WH");
		expect(listener).toHaveBeenCalledWith(
			expect.objectContaining({ state: "running" }),
		);
	});

	it("polls on the interval while subscribed", async () => {
		const source = sourceOf();
		getComputeProbe(source, "WH-interval").subscribe(vi.fn());
		await settle();
		expect(source.getComputeStatus).toHaveBeenCalledTimes(1);

		await vi.advanceTimersByTimeAsync(COMPUTE_POLL_INTERVAL_MS);

		expect(source.getComputeStatus).toHaveBeenCalledTimes(2);
	});

	it("serves N subscribers from one poll", async () => {
		const source = sourceOf();
		const probe = getComputeProbe(source, "WH-shared");
		const a = vi.fn();
		const b = vi.fn();

		probe.subscribe(a);
		probe.subscribe(b);
		await settle();
		await vi.advanceTimersByTimeAsync(COMPUTE_POLL_INTERVAL_MS);

		// Two badges, still one round trip per tick.
		expect(source.getComputeStatus).toHaveBeenCalledTimes(2);
		expect(a).toHaveBeenCalled();
		expect(b).toHaveBeenCalled();
	});

	it("returns the same probe for the same provider and warehouse", () => {
		const source = sourceOf();

		expect(getComputeProbe(source, "WH-same")).toBe(
			getComputeProbe(source, "WH-same"),
		);
	});

	it("keeps separate probes per warehouse", () => {
		const source = sourceOf();

		expect(getComputeProbe(source, "WH-a")).not.toBe(
			getComputeProbe(source, "WH-b"),
		);
	});

	it("keeps separate probes per provider", () => {
		expect(getComputeProbe(sourceOf(), "WH")).not.toBe(
			getComputeProbe(sourceOf(), "WH"),
		);
	});

	it("replays the last known status to a late subscriber", async () => {
		const source = sourceOf();
		const probe = getComputeProbe(source, "WH-replay");
		probe.subscribe(vi.fn());
		await settle();
		source.getComputeStatus.mockClear();

		const late = vi.fn();
		probe.subscribe(late);

		expect(late).toHaveBeenCalledWith(
			expect.objectContaining({ state: "running" }),
		);
	});

	it("stops polling when the last subscriber leaves", async () => {
		const source = sourceOf();
		const probe = getComputeProbe(source, "WH-stop");
		const off = probe.subscribe(vi.fn());
		await settle();

		off();
		source.getComputeStatus.mockClear();
		await vi.advanceTimersByTimeAsync(COMPUTE_POLL_INTERVAL_MS * 3);

		expect(source.getComputeStatus).not.toHaveBeenCalled();
		expect(probe.isRunning).toBe(false);
	});

	it("keeps polling while any subscriber remains", async () => {
		const source = sourceOf();
		const probe = getComputeProbe(source, "WH-remain");
		const off = probe.subscribe(vi.fn());
		probe.subscribe(vi.fn());
		await settle();

		off();
		source.getComputeStatus.mockClear();
		await vi.advanceTimersByTimeAsync(COMPUTE_POLL_INTERVAL_MS);

		expect(source.getComputeStatus).toHaveBeenCalledTimes(1);
		expect(probe.subscriberCount).toBe(1);
	});

	it("refreshes when a query completes, catching an auto-resume", async () => {
		const source = sourceOf();
		getComputeProbe(source, "WH-query").subscribe(vi.fn());
		await settle();
		source.getComputeStatus.mockClear();

		window.dispatchEvent(new Event("dbxlite:query-completed"));
		await settle();

		expect(source.getComputeStatus).toHaveBeenCalledTimes(1);
	});

	it("suppresses polls during the quiet period after a user action", async () => {
		const source = sourceOf();
		const probe = getComputeProbe(source, "WH-quiet");
		probe.subscribe(vi.fn());
		await settle();
		source.getComputeStatus.mockClear();

		probe.quiet(60_000);
		await vi.advanceTimersByTimeAsync(COMPUTE_POLL_INTERVAL_MS);

		expect(source.getComputeStatus).not.toHaveBeenCalled();
	});

	it("refreshNow ends the quiet period", async () => {
		const source = sourceOf();
		const probe = getComputeProbe(source, "WH-refresh");
		probe.subscribe(vi.fn());
		await settle();
		source.getComputeStatus.mockClear();

		probe.quiet(60_000);
		await probe.refreshNow();

		expect(source.getComputeStatus).toHaveBeenCalledTimes(1);
	});

	it("reports unknown and stops polling once the cloud proxy is absent", async () => {
		const source = sourceOf(async () => {
			throw new CloudProxyUnavailableError("no proxy");
		});
		const probe = getComputeProbe(source, "WH-noproxy");
		const listener = vi.fn();
		probe.subscribe(listener);
		await settle();

		expect(listener).toHaveBeenCalledWith(
			expect.objectContaining({ state: "unknown" }),
		);
		source.getComputeStatus.mockClear();
		await vi.advanceTimersByTimeAsync(COMPUTE_POLL_INTERVAL_MS * 3);
		expect(source.getComputeStatus).not.toHaveBeenCalled();
	});

	it("keeps polling after an ordinary failure", async () => {
		let fail = true;
		const source = sourceOf(async () => {
			if (fail) throw new Error("permission denied");
			return running();
		});
		const listener = vi.fn();
		getComputeProbe(source, "WH-flaky").subscribe(listener);
		await settle();

		expect(listener).toHaveBeenCalledWith(
			expect.objectContaining({ state: "unknown" }),
		);
		fail = false;
		await vi.advanceTimersByTimeAsync(COMPUTE_POLL_INTERVAL_MS);

		expect(listener).toHaveBeenLastCalledWith(
			expect.objectContaining({ state: "running" }),
		);
	});

	it("does nothing for a provider without compute status", async () => {
		const source = {} as ComputeStatusSource;
		const listener = vi.fn();

		getComputeProbe(source, "WH-none").subscribe(listener);
		await settle();

		expect(listener).not.toHaveBeenCalled();
	});
});
