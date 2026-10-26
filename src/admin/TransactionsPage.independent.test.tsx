import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import TransactionsPage from "./TransactionsPage";
import { recordsCsv } from "./csv";
import type { AdminApi, Identity, Transaction } from "./types";

const admin = vi.hoisted(() => ({
  identity: { id: "synthetic-owner", role: "Owner" } as Identity,
  api: { transactions: vi.fn<AdminApi["transactions"]>(), locations: vi.fn<AdminApi["locations"]>() },
}));
vi.mock("./context", () => ({ useAdmin: () => admin }));
const funding: Transaction = {
  id: "load:1", date: "2026-01-01T04:59:59.123456Z", source: "wallet_load",
  customer_name: "Synthetic Customer", customer_email: null, location_id: 1, location_name: "Synthetic North",
  machine_id: null, machine_name: null, amount: 20, amount_cents: 2000, currency: "USD",
  payment_method: "card", channel: "app", status: "recorded", payment_status: "unconfirmed",
  reference: "SYNTHETIC-PENDING", payment_reference: "pi_synthetic_1", checkout_reference: null,
  refund_reference: null, ledger_id: "1", failure_message: null, completed_at: null,
  description: "Synthetic funding", category: "wallet_funding", collection_provider: "stripe", vend_provider: "none",
  environment: "production", environment_evidence: "stripe_success_event",
  gross_collection_cents: 2000, refunded_collection_cents: null, net_collection_cents: null,
  reconciliation: "refund_or_outcome_unverified", voluntary_refund_id: "synthetic-refund-1",
  refund_completed_at: null, payment_succeeded_at: "2026-01-01T04:59:58.123456Z",
};
beforeEach(() => {
  vi.clearAllMocks(); admin.api.locations.mockResolvedValue([]);
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});
afterEach(cleanup);

it.each(["pending", "unknown"] as const)("paginated reporting distinguishes %s from confirmed zero and preserves separate dates in CSV", async (status) => {
  const unresolved: Transaction = { ...funding, voluntary_refund_status: status };
  const confirmed: Transaction = { ...funding, id: "load:2", reference: "SYNTHETIC-CONFIRMED",
    voluntary_refund_id: "synthetic-refund-2", voluntary_refund_status: "succeeded",
    payment_status: "refunded", refund_reference: "re_synthetic_2", reconciliation: "refunded_confirmed",
    refunded_collection_cents: 2000, net_collection_cents: 0, refund_completed_at: "2026-01-02T05:01:00.654321Z" };
  admin.api.transactions.mockImplementation(async (filters) => ({
    items: [filters.page === 2 ? confirmed : unresolved], total: 21, page: filters.page ?? 1, pageSize: 20,
  }));
  const view = render(<TransactionsPage />);
  await screen.findByText("SYNTHETIC-PENDING");
  expect(screen.getByText("Dec 31, 2025, 11:59 PM")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "View details" }));
  let dialog = within(screen.getByRole("dialog"));
  expect(dialog.getByText("Voluntary refund status").nextElementSibling).toHaveTextContent(status);
  expect(dialog.getByText("Refunded collection").nextElementSibling).toHaveTextContent("Unknown");
  expect(dialog.getByText("Net collection").nextElementSibling).toHaveTextContent("Unknown");
  expect(dialog.getByText("Confirmed refund time").nextElementSibling).toHaveTextContent("Not confirmed");
  fireEvent.click(dialog.getByRole("button", { name: "Close" }));
  fireEvent.click(screen.getByRole("button", { name: "Next page" }));
  await screen.findByText("SYNTHETIC-CONFIRMED");
  expect(admin.api.transactions).toHaveBeenLastCalledWith({ status: "all", page: 2 });
  expect(screen.queryByText("SYNTHETIC-PENDING")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "View details" }));
  dialog = within(screen.getByRole("dialog"));
  expect(dialog.getByText("Refunded collection").nextElementSibling).toHaveTextContent("$20.00");
  expect(dialog.getByText("Net collection").nextElementSibling).toHaveTextContent("$0.00");
  expect(dialog.getByText("Confirmed refund time").nextElementSibling).toHaveTextContent("Jan 2, 2026, 12:01 AM");
  const csv = recordsCsv("transactions", [{ ...unresolved }, { ...confirmed }]);
  expect(csv).toContain(`"synthetic-refund-1","${status}","","${funding.payment_succeeded_at}","2000","2000","",""`);
  expect(csv).toContain(`"synthetic-refund-2","succeeded","${confirmed.refund_completed_at}","${funding.payment_succeeded_at}","2000","2000","2000","0"`);
  expect(csv.match(/2026-01-01T04:59:59.123456Z/g)).toHaveLength(2);
  expect(view.container.querySelectorAll("tbody tr")).toHaveLength(1);
});
