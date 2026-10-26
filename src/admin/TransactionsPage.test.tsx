import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { AdminApi, Identity, Transaction } from "./types";
import TransactionsPage from "./TransactionsPage";

const admin = vi.hoisted(() => ({
  identity: { id: "owner", role: "Owner" } as Identity,
  api: { transactions: vi.fn<AdminApi["transactions"]>(), locations: vi.fn<AdminApi["locations"]>(), exportRecords: vi.fn<AdminApi["exportRecords"]>() },
}));
vi.mock("./context", () => ({ useAdmin: () => admin }));
const row: Transaction = {
  id: "vend:one", date: "2026-09-30T12:00:00Z", source: "machine_payment", customer_name: "Guest", customer_email: null,
  location_id: 1, location_name: "North", machine_id: 1, machine_name: "Washer 1", amount: 999, amount_cents: 101, currency: "USD",
  payment_method: "card", channel: "web", status: "refunded", payment_status: "unconfirmed", reference: "CS-ONE",
  payment_reference: "pi_one", checkout_reference: null, refund_reference: "re_pending", ledger_id: "1", failure_message: null,
  completed_at: null, description: "Washer payment", category: "machine_collection", collection_provider: "stripe", vend_provider: "nayax",
  environment: "unknown", gross_collection_cents: 101, net_collection_cents: null, refunded_collection_cents: null,
  reconciliation: "refund_or_outcome_unverified", nayax_transaction_reference: "987", nayax_rrn: "rrn987",
};
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  admin.api.transactions.mockReset().mockResolvedValue({ items: [row], total: 1, page: 1, pageSize: 20 });
  admin.api.locations.mockReset().mockResolvedValue([]);
});
afterEach(cleanup);

it("shows distinct providers and unknown refunds with integer-cent amounts", async () => {
  render(<TransactionsPage />);
  expect(await screen.findByText("stripe / nayax")).toBeInTheDocument();
  expect(screen.getByText("$1.01")).toBeInTheDocument();
  expect(screen.queryByText("$999.00")).not.toBeInTheDocument();
  expect(screen.getByText(/Direct Nayax device payments: Not connected/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "View details" }));
  expect(screen.getByText("Net collection").nextElementSibling).toHaveTextContent("Unknown");
  expect(screen.getByText("Refunded collection").nextElementSibling).toHaveTextContent("Unknown");
  expect(screen.getByText("Nayax transaction").nextElementSibling).toHaveTextContent("987");
  expect(screen.getByText("Nayax RRN").nextElementSibling).toHaveTextContent("rrn987");
});

it("sends category filtering through the existing transactions API shape", async () => {
  render(<TransactionsPage />);
  await screen.findByText("stripe / nayax");
  fireEvent.change(screen.getByLabelText("Report category"), { target: { value: "wallet_funding" } });
  await waitFor(() => expect(admin.api.transactions).toHaveBeenLastCalledWith({ status: "all", page: 1, category: "wallet_funding" }));
});

it("shows confirmed voluntary refund evidence and exact zero net", async () => {
  admin.api.transactions.mockResolvedValue({ items: [{ ...row, source: "wallet_load", category: "wallet_funding",
    voluntary_refund_id: "refund-confirmed", voluntary_refund_status: "succeeded", refund_reference: "re_confirmed",
    refund_completed_at: "2026-09-30T12:00:00Z", environment: "production", environment_evidence: "stripe_success_event",
    refunded_collection_cents: 101, net_collection_cents: 0, reconciliation: "refunded_confirmed",
  }], total: 1, page: 1, pageSize: 20 });
  render(<TransactionsPage />); fireEvent.click(await screen.findByRole("button", { name: "View details" }));
  expect(screen.getByText("Net collection").nextElementSibling).toHaveTextContent("$0.00");
  expect(screen.getByText("Refunded collection").nextElementSibling).toHaveTextContent("$1.01");
  expect(screen.getByText("refund-confirmed")).toBeInTheDocument();
  expect(screen.getByText("Environment evidence").nextElementSibling).toHaveTextContent("stripe success event");
});
