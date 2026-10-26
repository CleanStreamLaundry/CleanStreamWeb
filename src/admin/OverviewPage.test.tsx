import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminApi, Identity, Overview } from "./types";
import OverviewPage from "./OverviewPage";

const admin = vi.hoisted(() => ({
  identity: null as Identity | null,
  api: { overview: vi.fn<AdminApi["overview"]>() },
}));
vi.mock("./context", () => ({ useAdmin: () => admin }));

const original: Overview = {
  reporting: {
    version: 1, currency: "USD", environment: "unknown", scope: "Assigned locations.",
    nayaxDirect: { availability: "not_connected", lastSyncAt: null, transactionCount: null, netCollectionCents: null },
    stripe: { availability: "local_records_only", lastSyncAt: null },
    confirmedCollectionCents: 56789, walletSpendCents: 400, promoSpendCents: 150, promoIssuedCents: 500,
    operationalVendCents: 850, unresolvedRecords: 2,
    buckets: [{ category: "unknown_legacy", provider: "unknown", environment: "unknown", currency: "USD", records: 2, amountCents: 1200, grossCollectionCents: null, refundedCollectionCents: null, netCollectionCents: null, unresolvedRecords: 2 }],
  },
  today: 123.45, total: 567.89,
  daily: [{ date: "2026-09-28", amount: 123.45 }], hourly: [1, 2, 3],
  pendingCredits: 2, openMaintenance: 3, locations: 1, machines: 4,
  updatedAt: "2026-09-28T12:00:00Z", financialScope: "Assigned locations.",
};
function deferred() {
  let resolve!: (value: Overview) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<Overview>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
const page = () => <MemoryRouter><OverviewPage base="/home" /></MemoryRouter>;

beforeEach(() => {
  admin.identity = { id: "owner", role: "Owner", name: "Owner", email: "owner@example.com" };
  admin.api.overview.mockReset().mockResolvedValue(original);
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("Overview quiet refresh", () => {
  it("shows gross, refunded and net independently for verified funding", async () => {
    admin.api.overview.mockResolvedValue({ ...original, total: 0, reporting: { ...original.reporting!,
      environment: "mixed", confirmedCollectionCents: 0, buckets: [{ category: "wallet_funding", provider: "stripe",
        environment: "production", currency: "USD", records: 1, amountCents: 2000, grossCollectionCents: 2000,
        refundedCollectionCents: 2000, netCollectionCents: 0, unresolvedRecords: 0 }] } });
    render(page());
    const bucket = (await screen.findByText("wallet funding")).closest("tr")!;
    expect(bucket).toHaveTextContent("stripe / production");
    expect(bucket.querySelectorAll("td")[4]).toHaveTextContent("$20.00");
    expect(bucket.querySelectorAll("td")[5]).toHaveTextContent("$20.00");
    expect(bucket.querySelectorAll("td")[6]).toHaveTextContent("$0.00");
  });
  it("separates disconnected device coverage, unknown legacy, wallet and operational values", async () => {
    render(page());
    expect(await screen.findByText("Direct Nayax device payments: Not connected")).toBeInTheDocument();
    expect(screen.getByText(/Transactions: Unknown/)).toHaveTextContent("Last sync: Never");
    expect(screen.getByText("Wallet spend · USD").nextElementSibling).toHaveTextContent("$4.00");
    expect(screen.getByText("Promo used within wallet spend · USD").nextElementSibling).toHaveTextContent("$1.50");
    expect(screen.getByText("Started vend value · USD").nextElementSibling).toHaveTextContent("$8.50");
    expect(screen.getByText("unknown legacy").closest("tr")).toHaveTextContent("Unknown");
    expect(screen.getByText(/Historical environment may be unknown/)).toBeInTheDocument();
  });

  it("fails closed with an older backend instead of relabeling legacy totals as cash", async () => {
    const legacy = { ...original };
    delete legacy.reporting;
    admin.api.overview.mockResolvedValue(legacy);
    render(page());
    expect(await screen.findByText(/Typed reporting is unavailable/)).toBeInTheDocument();
    expect(screen.queryByText("$567.89")).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Daily recorded payments" })).not.toBeInTheDocument();
  });
  it("uses the full loader only before the first usable response", async () => {
    const pending = deferred();
    admin.api.overview.mockReturnValue(pending.promise);
    render(page());
    expect(screen.getByText("Loading workspace…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh" })).toBeDisabled();
    await act(async () => pending.resolve(original));
    expect(screen.queryByText("Loading workspace…")).not.toBeInTheDocument();
    expect(screen.getByText("$567.89")).toBeInTheDocument();
  });

  it("keeps chart nodes, open details, and the success timestamp during refresh and retry errors", async () => {
    const refresh = deferred();
    const retry = deferred();
    admin.api.overview.mockResolvedValueOnce(original).mockReturnValueOnce(refresh.promise).mockReturnValueOnce(retry.promise);
    render(page());
    await screen.findByText("$567.89");
    const chart = screen.getByRole("group", { name: "Daily recorded payments" });
    const details = screen.getAllByText("View data table")[0]!.closest("details")!;
    details.open = true;
    const timestamp = screen.getByText(/Updated/).textContent;
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(screen.getByText("$567.89")).toBeInTheDocument();
    expect(screen.queryByText("Loading workspace…")).not.toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Daily recorded payments" })).toBe(chart);
    expect(details.open).toBe(true);
    expect(screen.getByText(/Updated/).textContent).toBe(timestamp);
    expect(screen.getByRole("button", { name: "Refresh" })).toBeDisabled();
    await act(async () => refresh.reject(new Error("Network unavailable")));
    expect(screen.getByRole("alert")).toHaveTextContent("Network unavailable");
    expect(screen.getByText("$567.89")).toBeInTheDocument();
    expect(screen.getByText(/Updated/).textContent).toBe(timestamp);
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Daily recorded payments" })).toBe(chart);
    await act(async () => retry.resolve({ ...original, total: 999, updatedAt: "2026-09-29T12:00:00Z" }));
    expect(screen.getByText("$999.00")).toBeInTheDocument();
    expect(screen.getByText(/Updated/).textContent).not.toBe(timestamp);
    expect(details.open).toBe(true);
    expect(admin.api.overview).toHaveBeenCalledTimes(3);
  });

  it.each(["account", "role"])("hides the old overview on %s change and rejects its late refresh", async (change) => {
    const old = deferred();
    const next = deferred();
    admin.api.overview.mockResolvedValueOnce(original).mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise);
    const { rerender } = render(page());
    await screen.findByText("$567.89");
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(admin.api.overview).toHaveBeenCalledTimes(2));
    admin.identity = change === "account" ? { ...admin.identity!, id: "second" } : { ...admin.identity!, role: "Admin" };
    rerender(page());
    expect(screen.queryByText("$567.89")).not.toBeInTheDocument();
    expect(screen.getByText("Loading workspace…")).toBeInTheDocument();
    await act(async () => old.resolve({ ...original, total: 888 }));
    expect(screen.queryByText("$888.00")).not.toBeInTheDocument();
    expect(screen.getByText("Loading workspace…")).toBeInTheDocument();
    await act(async () => next.resolve({ ...original, total: 111 }));
    if (change === "account") expect(screen.getByText("$111.00")).toBeInTheDocument();
    else {
      expect(screen.queryByText("$111.00")).not.toBeInTheDocument();
      expect(screen.getByText("Open maintenance")).toBeInTheDocument();
    }
  });

  it("keeps initial failures distinct from empty or cached data", async () => {
    admin.api.overview.mockRejectedValue(new Error("Initial load failed"));
    render(page());
    expect(await screen.findByRole("alert")).toHaveTextContent("Initial load failed");
    expect(screen.queryByText("Recorded payments today")).not.toBeInTheDocument();
    expect(screen.queryByText("No recorded payments")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh" })).toBeEnabled();
  });

  it("does not schedule polling or add focus/visibility refresh requests", async () => {
    vi.useFakeTimers();
    render(page());
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(screen.getByText("$567.89")).toBeInTheDocument();
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      document.dispatchEvent(new Event("visibilitychange"));
      await vi.advanceTimersByTimeAsync(600000);
    });
    expect(admin.api.overview).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
