import { StrictMode } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import CreditsPage from "./CreditsPage";
import type { AdminContextValue } from "./admission";
import type { MachineIssueResolutionInput } from "./types";
import { machineIssueFixture, machineIssueResult } from "./machineIssueFixtures";

const mock = vi.hoisted(() => ({ context: null as unknown, review: vi.fn(), resolve: vi.fn(), credits: vi.fn(),
  locations: vi.fn(), legacy: vi.fn(), refresh: vi.fn() }));
vi.mock("./context", () => ({ useAdmin: () => mock.context }));
const caller = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const requestId = "33333333-3333-4333-8333-333333333333";
const key = `admin.machine-issue.pending.${caller}`;
const record = { id: 2041, requestId, resolution: "wallet_refund" as const };
const credit = { refund_id: 2041, transaction_id: "9914", amount: 999, customer_name: "Synthetic Customer", description: "Washer stopped",
  date: machineIssueFixture.receivedAt, status: "pending", admin_note: null, resolved_at: null, notification_sent_at: null };
function patch(value: Partial<AdminContextValue>) { mock.context = { ...(mock.context as AdminContextValue), ...value }; }
function view() { return render(<StrictMode><CreditsPage /></StrictMode>); }
async function open() {
  fireEvent.click(await screen.findByRole("button", { name: "Review" }));
  return screen.findByRole("combobox", { name: "Resolution" });
}
function attest(anotherLoad: "yes" | "no") {
  fireEvent.click(screen.getByRole("checkbox", { name: "Customer notified us while at the original location" }));
  fireEvent.change(screen.getByLabelText("Has the customer already completed another load? (Owner attestation)"), { target: { value: anotherLoad } });
}
async function submitWallet() {
  await open(); attest("yes");
  fireEvent.change(screen.getByLabelText("Resolution"), { target: { value: "wallet_refund" } });
  fireEvent.change(screen.getByLabelText("Resolution note"), { target: { value: "  Owner verified with customer  " } });
  fireEvent.click(screen.getByRole("button", { name: "Confirm wallet refund" }));
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }

beforeEach(() => {
  vi.restoreAllMocks(); vi.resetAllMocks(); sessionStorage.clear();
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value() { this.setAttribute("open", ""); } });
  Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value() { this.removeAttribute("open"); } });
  mock.context = { api: { credits: mock.credits, locations: mock.locations, machineIssueReview: mock.review,
    resolveMachineIssue: mock.resolve, resolveCredit: mock.legacy },
    identity: { id: caller, role: "Owner", portalRole: "Owner", name: "Owner", email: "owner@example.invalid" },
    loading: false, error: "", preview: false, refresh: mock.refresh, signOut: vi.fn() };
  mock.credits.mockResolvedValue({ items: [credit], total: 1, page: 1, pageSize: 20 });
  mock.locations.mockResolvedValue([]);
  mock.review.mockResolvedValue(machineIssueFixture);
  mock.resolve.mockImplementation(async (_caller: string, input: MachineIssueResolutionInput) => machineIssueResult(input));
  mock.legacy.mockResolvedValue({}); mock.refresh.mockResolvedValue(undefined);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it.each(["Manager", "Maintenance"] as const)("denies %s before any financial fetch", role => {
  patch({ identity: { id: caller, role: "Admin", portalRole: role, name: role, email: "staff@example.invalid" } });
  view(); expect(screen.getByText("Active Owner access is required.")).toBeInTheDocument();
  expect(mock.credits).not.toHaveBeenCalled(); expect(mock.review).not.toHaveBeenCalled(); expect(mock.resolve).not.toHaveBeenCalled();
});
it("uses the server amount and split, never the claim's requested amount", async () => {
  view(); await open();
  const dialog = within(screen.getByRole("dialog"));
  expect(dialog.getByText("$3.50")).toBeInTheDocument();
  expect(dialog.getByText("$2.50")).toBeInTheDocument(); expect(dialog.getByText("$1.00")).toBeInTheDocument();
  expect(dialog.queryByText("$999.00")).not.toBeInTheDocument();
  expect(dialog.getByText("Owner attestations (not app-verified)")).toBeInTheDocument();
  expect(dialog.getByRole("option", { name: "Refund original wallet value" })).toBeDisabled();
  expect(dialog.getByRole("option", { name: "Start a same-price replacement" })).toBeDisabled();
});
it("persists only minimal references before refund and preserves the server split", async () => {
  mock.resolve.mockImplementation(async (owner: string, input: MachineIssueResolutionInput) => {
    expect(owner).toBe(caller);
    expect(JSON.parse(sessionStorage.getItem(key)!)).toEqual({ id: 2041, requestId: input.requestId, resolution: "wallet_refund" });
    return machineIssueResult(input);
  });
  view(); await submitWallet(); await screen.findByText(/Wallet refund confirmed\. Original paid/);
  expect(mock.resolve).toHaveBeenCalledExactlyOnceWith(caller, { id: 2041, requestId: expect.any(String), resolution: "wallet_refund",
    note: "Owner verified with customer", atLocation: true, anotherLoadCompleted: true }, expect.any(AbortSignal));
  expect(sessionStorage.getItem(key)).toBeNull(); expect(mock.legacy).not.toHaveBeenCalled();
});
it("starts only a server-listed replacement after the no-other-load attestation", async () => {
  view(); await open(); attest("no");
  expect(screen.getByRole("option", { name: "Refund original wallet value" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Resolution"), { target: { value: "replacement_vend" } });
  fireEvent.change(screen.getByLabelText("Resolution note"), { target: { value: "Customer waiting for another washer" } });
  expect(screen.getByRole("button", { name: "Request replacement start" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Replacement machine"), { target: { value: "12" } });
  fireEvent.click(screen.getByRole("button", { name: "Request replacement start" }));
  await screen.findByText("Replacement machine start confirmed by the server.");
  expect(mock.resolve.mock.calls[0][1]).toMatchObject({ resolution: "replacement_vend", anotherLoadCompleted: false, replacementMachineId: 12 });
});
it("resets a financial choice when Owner attestations change", async () => {
  view(); await open(); attest("yes");
  fireEvent.change(screen.getByLabelText("Resolution"), { target: { value: "wallet_refund" } });
  fireEvent.click(screen.getByRole("checkbox", { name: "Customer notified us while at the original location" }));
  expect(screen.getByLabelText("Resolution")).toHaveValue("manual_review");
  expect(screen.getByRole("option", { name: "Refund original wallet value" })).toBeDisabled();
});
it("honors disabled server capabilities despite Owner attestations", async () => {
  mock.review.mockResolvedValue({ ...machineIssueFixture, capabilities: { walletRefund: false, replacementVend: false },
    replacementMachines: [], replacementUnavailableReason: "Replacement service unavailable" });
  view(); await open(); attest("yes");
  expect(screen.getByRole("option", { name: "Refund original wallet value" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Has the customer already completed another load? (Owner attestation)"), { target: { value: "no" } });
  expect(screen.getByRole("option", { name: "Start a same-price replacement" })).toBeDisabled();
  expect(screen.getByText("Replacement service unavailable")).toBeInTheDocument();
  expect(mock.resolve).not.toHaveBeenCalled();
});
it("records ambiguous historical claims for manual review without guessing eligibility", async () => {
  mock.review.mockResolvedValue({ ...machineIssueFixture, amountCents: null, paidAmountCents: null, promoAmountCents: null,
    locationId: null, locationTimezone: null, transactionAt: null, sameDayEligible: false,
    capabilities: { walletRefund: false, replacementVend: false }, replacementMachines: [], manualReviewReason: "Historical location unavailable" });
  view(); await open(); attest("yes");
  expect(screen.getByRole("option", { name: "Refund original wallet value" })).toBeDisabled();
  expect(screen.getByRole("option", { name: "Start a same-price replacement" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Resolution note"), { target: { value: "Investigate historical evidence" } });
  fireEvent.click(screen.getByRole("button", { name: "Record manual review" }));
  await screen.findByText(/Manual review recorded\. The claim remains pending/);
  expect(mock.resolve.mock.calls[0][1].resolution).toBe("manual_review"); expect(sessionStorage.getItem(key)).toBeNull();
});
it.each(["pending", "support_required"] as const)("does not claim a start or unlock on %s", async state => {
  mock.resolve.mockImplementation(async (_caller: string, input: MachineIssueResolutionInput) => machineIssueResult(input, state));
  view(); await submitWallet();
  await screen.findByText(state === "pending" ? /Resolution is pending/ : /Resolution requires support/);
  expect(screen.queryByText(/Wallet refund confirmed/)).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Review" })).toBeDisabled(); expect(sessionStorage.getItem(key)).not.toBeNull();
});
it("does not call a pending replacement a completed start", async () => {
  mock.resolve.mockImplementation(async (_caller: string, input: MachineIssueResolutionInput) => machineIssueResult(input, "pending"));
  view(); await open(); attest("no");
  fireEvent.change(screen.getByLabelText("Resolution"), { target: { value: "replacement_vend" } });
  fireEvent.change(screen.getByLabelText("Replacement machine"), { target: { value: "12" } });
  fireEvent.change(screen.getByLabelText("Resolution note"), { target: { value: "Customer waiting" } });
  fireEvent.click(screen.getByRole("button", { name: "Request replacement start" }));
  await screen.findByText(/Resolution is pending/);
  expect(screen.queryByText("Replacement machine start confirmed by the server.")).not.toBeInTheDocument();
  expect(sessionStorage.getItem(key)).not.toBeNull(); expect(mock.resolve).toHaveBeenCalledOnce();
});
it("keeps unknown outcomes locked and checks status without replay", async () => {
  mock.resolve.mockRejectedValue(new Error("private transport detail"));
  view(); await submitWallet(); await screen.findByText(/Resolution outcome is unconfirmed/);
  expect(screen.queryByText("private transport detail")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Check machine issue status" }));
  await screen.findByText(/No matching receipt is confirmed/);
  expect(sessionStorage.getItem(key)).not.toBeNull();
  const input = mock.resolve.mock.calls[0][1] as MachineIssueResolutionInput;
  mock.review.mockResolvedValue(machineIssueResult(input).review);
  fireEvent.click(screen.getByRole("button", { name: "Check machine issue status" }));
  await screen.findByText(/Wallet refund confirmed\. Original paid/);
  expect(mock.resolve).toHaveBeenCalledOnce();
  expect(mock.review).toHaveBeenLastCalledWith(caller, 2041, input.requestId, expect.any(AbortSignal));
});
it("restores a manual-review request and clears only its matching recorded receipt", async () => {
  sessionStorage.setItem(key, JSON.stringify({ ...record, resolution: "manual_review" }));
  mock.review.mockResolvedValue(machineIssueResult({ ...record, resolution: "manual_review", atLocation: false, anotherLoadCompleted: false, note: "Unstored note" }).review);
  view(); fireEvent.click(screen.getByRole("button", { name: "Check machine issue status" }));
  await screen.findByText(/Manual review recorded/); expect(mock.resolve).not.toHaveBeenCalled(); expect(sessionStorage.getItem(key)).toBeNull();
});
it("rejects another request's receipt even when its financial resolution completed", async () => {
  sessionStorage.setItem(key, JSON.stringify(record));
  mock.review.mockResolvedValue(machineIssueResult({ ...record, requestId: other, atLocation: true, anotherLoadCompleted: true, note: "Other" }).review);
  view(); fireEvent.click(screen.getByRole("button", { name: "Check machine issue status" }));
  await screen.findByText(/No matching receipt is confirmed/); expect(sessionStorage.getItem(key)).not.toBeNull();
});
it("preserves pending recovery across unmount and ignores late completion", async () => {
  const response = deferred<ReturnType<typeof machineIssueResult>>(); mock.resolve.mockReturnValue(response.promise);
  const first = view(); await submitWallet();
  const input = mock.resolve.mock.calls[0][1] as MachineIssueResolutionInput;
  first.unmount(); expect((mock.resolve.mock.calls[0][2] as AbortSignal).aborted).toBe(true);
  view(); await act(async () => response.resolve(machineIssueResult(input)));
  expect(screen.queryByText(/Wallet refund confirmed/)).not.toBeInTheDocument();
  expect(sessionStorage.getItem(key)).not.toBeNull(); expect(mock.resolve).toHaveBeenCalledOnce();
});
it("isolates caller replacement and A-to-B-to-A late results", async () => {
  const response = deferred<ReturnType<typeof machineIssueResult>>(); mock.resolve.mockReturnValue(response.promise);
  const rendered = view(); await submitWallet();
  const input = mock.resolve.mock.calls[0][1] as MachineIssueResolutionInput;
  const original = (mock.context as AdminContextValue).identity;
  patch({ identity: { ...original!, id: other } }); rendered.rerender(<StrictMode><CreditsPage /></StrictMode>);
  expect(screen.queryByRole("region", { name: "Machine issue request recovery" })).not.toBeInTheDocument();
  expect((mock.resolve.mock.calls[0][2] as AbortSignal).aborted).toBe(true);
  patch({ identity: original }); rendered.rerender(<StrictMode><CreditsPage /></StrictMode>);
  await act(async () => response.resolve(machineIssueResult(input)));
  expect(screen.queryByText(/Wallet refund confirmed/)).not.toBeInTheDocument(); expect(sessionStorage.getItem(key)).not.toBeNull();
});
it("closes financial review when Owner admission changes", async () => {
  const rendered = view(); await open();
  patch({ identity: { id: caller, role: "Admin", portalRole: "Manager", name: "Manager", email: "staff@example.invalid" } });
  rendered.rerender(<StrictMode><CreditsPage /></StrictMode>);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument(); expect(mock.resolve).not.toHaveBeenCalled();
});
it("fails closed when storage is corrupted", async () => {
  sessionStorage.setItem(key, "broken"); view();
  await screen.findByText(/local machine issue request record is unavailable/);
  expect(await screen.findByRole("button", { name: "Review" })).toBeDisabled(); expect(mock.resolve).not.toHaveBeenCalled();
});
it("does not dispatch when the pending record cannot be persisted", async () => {
  vi.spyOn(Object.getPrototypeOf(sessionStorage), "setItem").mockImplementation(() => { throw new Error("storage blocked"); });
  view(); await submitWallet(); await screen.findByText(/No resolution was submitted/);
  expect(mock.resolve).not.toHaveBeenCalled();
});
it("retains the lock if completed receipt cleanup fails", async () => {
  vi.spyOn(Object.getPrototypeOf(sessionStorage), "removeItem").mockImplementation(() => { throw new Error("storage blocked"); });
  view(); await submitWallet(); await screen.findByText(/local request record could not be cleared/);
  expect(screen.getByRole("button", { name: "Review" })).toBeDisabled(); expect(sessionStorage.getItem(key)).not.toBeNull();
});
it("preserves the existing grandfathered approval workflow only after server policy review", async () => {
  mock.review.mockResolvedValue({ ...machineIssueFixture, policyVersion: "legacy_14_day" });
  view(); fireEvent.click(await screen.findByRole("button", { name: "Review" }));
  await screen.findByRole("dialog", { name: "Loyalty credit R2041" });
  fireEvent.click(screen.getByRole("button", { name: "Approve credit" }));
  await waitFor(() => expect(mock.legacy).toHaveBeenCalledExactlyOnceWith(2041, "approved", ""));
  expect(mock.resolve).not.toHaveBeenCalled();
});
it("does not expose legacy approval if policy inspection fails", async () => {
  mock.review.mockRejectedValue(new Error("unavailable")); view(); fireEvent.click(await screen.findByRole("button", { name: "Review" }));
  await screen.findByText(/server review is unavailable/);
  expect(screen.queryByRole("button", { name: "Approve credit" })).not.toBeInTheDocument(); expect(mock.legacy).not.toHaveBeenCalled();
});
it("shows synthetic review without allowing a real action in preview", async () => {
  patch({ preview: true }); view(); await open();
  expect(screen.getByRole("button", { name: "Record manual review" })).toBeDisabled();
  expect(mock.resolve).not.toHaveBeenCalled();
});
