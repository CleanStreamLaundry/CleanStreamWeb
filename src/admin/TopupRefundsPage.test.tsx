import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import TopupRefundsPage from "./TopupRefundsPage";
import type { AdminApi, Identity, TopupRefund } from "./types";

const admin = vi.hoisted(() => ({ identity: null as Identity | null, api: {
  topupRefunds: vi.fn<AdminApi["topupRefunds"]>(), reviewTopupRefund: vi.fn<AdminApi["reviewTopupRefund"]>(),
} }));
vi.mock("./context", () => ({ useAdmin: () => admin }));
const record: TopupRefund = {
  id: "00000000-0000-4000-8000-000000000001", load_id: "12", customer_id: "customer",
  status: "requested", principal_cents: 2000, bonus_reserved_cents: 500, currency: "usd",
  requested_at: "2026-09-30T12:00:00Z", payment_succeeded_at: "2026-09-30T11:00:00Z",
  reviewed_at: null, completed_at: null, policy_version: "unused-topup-v1", location_id: null, review_note: null,
};
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
beforeEach(() => {
  admin.identity = { id: "owner", role: "Owner", name: "Owner", email: "owner@example.com" };
  admin.api = { topupRefunds: vi.fn().mockResolvedValue([record]), reviewTopupRefund: vi.fn().mockResolvedValue({ ...record, status: "pending" }) };
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});
afterEach(cleanup);
const open = async () => { fireEvent.click(await screen.findByRole("button", { name: "Review" })); return within(screen.getByRole("dialog")); };

it("does not query for an Admin or missing identity", () => {
  admin.identity!.role = "Admin";
  const view = render(<TopupRefundsPage />);
  expect(screen.getByRole("alert")).toHaveTextContent("Owner access required");
  admin.identity = null; view.rerender(<TopupRefundsPage />);
  expect(admin.api.topupRefunds).not.toHaveBeenCalled();
});
it("explains reservations and prevents duplicate approval without optimistic payout", async () => {
  const pending = deferred<TopupRefund>(); admin.api.reviewTopupRefund.mockReturnValue(pending.promise);
  render(<StrictMode><TopupRefundsPage /></StrictMode>);
  const dialog = await open();
  expect(dialog.getByText(/no payout is confirmed/)).toBeInTheDocument();
  expect(dialog.getByText("$5.00")).toBeInTheDocument();
  fireEvent.change(dialog.getByLabelText(/Review note/), { target: { value: "Verified unused" } });
  expect(dialog.getByLabelText(/Review note/)).toHaveAttribute("maxlength", "2000");
  const form = dialog.getByRole("button", { name: "Approve refund" }).closest("form")!;
  fireEvent.submit(form); fireEvent.submit(form);
  expect(admin.api.reviewTopupRefund).toHaveBeenCalledTimes(1);
  expect(admin.api.reviewTopupRefund).toHaveBeenCalledWith("owner", record.id, "approve", "Verified unused", expect.any(AbortSignal));
  expect(dialog.getByRole("button", { name: "Submitting..." })).toBeDisabled();
  expect(dialog.getByRole("button", { name: "Close dialog" })).toBeDisabled();
  expect(screen.queryByText(/Stripe refund confirmed/)).not.toBeInTheDocument();
  await act(async () => pending.resolve({ ...record, status: "pending" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.getByText(/Payout is not confirmed/)).toBeInTheDocument();
  await waitFor(() => expect(admin.api.topupRefunds).toHaveBeenCalledTimes(2));
  expect(screen.getByText("requested")).toBeInTheDocument();
});
it("denies only a requested refund and re-reads server history", async () => {
  admin.api.reviewTopupRefund.mockResolvedValue({ ...record, status: "denied" });
  render(<TopupRefundsPage />); const dialog = await open();
  fireEvent.change(dialog.getByLabelText("Decision"), { target: { value: "deny" } });
  fireEvent.click(dialog.getByRole("button", { name: "Deny request" }));
  expect(await screen.findByText(/Request denied. The wallet reservation was released/)).toBeInTheDocument();
  expect(admin.api.reviewTopupRefund).toHaveBeenCalledWith("owner", record.id, "deny", "", expect.any(AbortSignal));
});
it.each(["approved", "pending", "unknown"] as const)("only reconciles %s; discloses possible idempotent dispatch", async (status) => {
  admin.api.topupRefunds.mockResolvedValue([{ ...record, status }]);
  render(<TopupRefundsPage />); const dialog = await open();
  expect(dialog.queryByLabelText("Decision")).not.toBeInTheDocument();
  expect(dialog.getByText(/may submit the existing approved refund/)).toBeInTheDocument();
  fireEvent.click(dialog.getByRole("button", { name: "Reconcile refund" }));
  expect(admin.api.reviewTopupRefund).toHaveBeenCalledWith("owner", record.id, "reconcile", "", expect.any(AbortSignal));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
});
it.each(["succeeded", "denied", "failed", "canceled"] as const)("terminal %s is read-only", async (status) => {
  admin.api.topupRefunds.mockResolvedValue([{ ...record, status, completed_at: status === "succeeded" ? record.requested_at : null }]);
  render(<TopupRefundsPage />); const dialog = await open();
  expect(dialog.queryByRole("textbox")).not.toBeInTheDocument();
  expect(dialog.queryByRole("button", { name: /refund|request/i })).not.toBeInTheDocument();
  if (status === "succeeded") expect(dialog.getByText(/Stripe refund confirmed/)).toBeInTheDocument();
});
it("never claims completion for succeeded without a completion timestamp", async () => {
  admin.api.topupRefunds.mockResolvedValue([{ ...record, status: "succeeded" }]);
  render(<TopupRefundsPage />); const dialog = await open();
  expect(dialog.queryByText(/Stripe refund confirmed/)).not.toBeInTheDocument();
  expect(dialog.getByText("Not confirmed")).toBeInTheDocument();
});
it("uncertain mutation closes stale review, reloads and never automatically retries", async () => {
  admin.api.reviewTopupRefund.mockRejectedValue(new Error("Outcome unknown; refresh and reconcile."));
  render(<TopupRefundsPage />); const dialog = await open();
  fireEvent.click(dialog.getByRole("button", { name: "Approve refund" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Outcome unknown");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  await waitFor(() => expect(admin.api.topupRefunds).toHaveBeenCalledTimes(2));
  expect(admin.api.reviewTopupRefund).toHaveBeenCalledTimes(1);
});
it("uses the stable timestamp/id cursor and can return to the first page", async () => {
  const rows = Array.from({ length: 100 }, (_, i) => ({ ...record, id: `refund-${100-i}` }));
  admin.api.topupRefunds.mockResolvedValueOnce(rows).mockResolvedValueOnce([]).mockResolvedValueOnce(rows);
  render(<TopupRefundsPage />); await screen.findByText("refund-1");
  fireEvent.click(screen.getByRole("button", { name: "Next page" }));
  expect(await screen.findByText("No top-up refund requests")).toBeInTheDocument();
  expect(admin.api.topupRefunds).toHaveBeenLastCalledWith("owner", { before: record.requested_at, before_id: "refund-1" });
  expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Previous page" }));
  await screen.findByText("refund-1"); expect(admin.api.topupRefunds).toHaveBeenLastCalledWith("owner", null);
});
it("history failures are not empty history and support explicit retry", async () => {
  admin.api.topupRefunds.mockRejectedValueOnce(new Error("MFA required")).mockResolvedValueOnce([]);
  render(<TopupRefundsPage />);
  expect(await screen.findByRole("alert")).toHaveTextContent("MFA required");
  expect(screen.queryByText("No top-up refund requests")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Retry history" }));
  await screen.findByText("No top-up refund requests");
});
it.each(["account", "role", "api", "unmount"])("aborts review and ignores late completion across %s change", async (change) => {
  const pending = deferred<TopupRefund>(); admin.api.reviewTopupRefund.mockReturnValue(pending.promise);
  const view = render(<TopupRefundsPage />); const dialog = await open();
  fireEvent.click(dialog.getByRole("button", { name: "Approve refund" }));
  const signal = admin.api.reviewTopupRefund.mock.calls[0]![4]!;
  if (change === "unmount") view.unmount();
  else {
    if (change === "account") admin.identity = { ...admin.identity!, id: "second" };
    if (change === "role") admin.identity = { ...admin.identity!, role: "Admin" };
    if (change === "api") admin.api = { ...admin.api, topupRefunds: vi.fn().mockResolvedValue([]) };
    view.rerender(<TopupRefundsPage />);
    if (change === "account") { admin.identity = { ...admin.identity!, id: "owner" }; view.rerender(<TopupRefundsPage />); }
  }
  expect(signal.aborted).toBe(true);
  await act(async () => pending.resolve({ ...record, status: "succeeded", completed_at: record.requested_at }));
  expect(screen.queryByText(/Stripe refund confirmed/)).not.toBeInTheDocument();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
