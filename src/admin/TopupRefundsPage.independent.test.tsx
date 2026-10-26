import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import TopupRefundsPage from "./TopupRefundsPage";
import { adminApi } from "./api";
import type { Identity, TopupRefund } from "./types";

const state = vi.hoisted(() => ({
  identity: null as Identity | null,
  invoke: vi.fn(),
  getSession: vi.fn(),
  listeners: new Set<(event: string) => void>(),
}));
vi.mock("./context", () => ({ useAdmin: () => ({ identity: state.identity, api: adminApi }) }));
vi.mock("../supabase/client", () => ({ getSupabaseClient: () => ({
  auth: {
    getSession: state.getSession,
    onAuthStateChange: (listener: (event: string) => void) => {
      state.listeners.add(listener);
      return { data: { subscription: { unsubscribe: () => state.listeners.delete(listener) } } };
    },
  },
  functions: { invoke: state.invoke },
}) }));

const owner = "00000000-0000-4000-8000-000000000001";
const record: TopupRefund = {
  id: "00000000-0000-4000-8000-000000000003", load_id: "9007199254740993",
  customer_id: "00000000-0000-4000-8000-000000000002", status: "requested",
  principal_cents: 2000, bonus_reserved_cents: 500, currency: "usd",
  requested_at: "2026-09-30T12:34:56.123456+00:00",
  payment_succeeded_at: "2026-09-29T12:34:56+00:00",
  reviewed_at: null, completed_at: null, policy_version: "unused-topup-v1",
  location_id: "9007199254740995", review_note: null,
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
type Reply = { data: { data: TopupRefund | TopupRefund[] } | null; error: null | { context: Response } };
const reply = (data: TopupRefund | TopupRefund[]): Reply => ({ data: { data }, error: null });
let history: TopupRefund[];
let actionReply: Reply | Promise<Reply>;
const actions = () => state.invoke.mock.calls.filter((call) => call[1].body.action !== "list");
const lists = () => state.invoke.mock.calls.filter((call) => call[1].body.action === "list");

beforeEach(() => {
  state.listeners.clear(); vi.clearAllMocks();
  state.identity = { id: owner, role: "Owner", name: "Synthetic Owner", email: "owner@synthetic.invalid" };
  state.getSession.mockResolvedValue({ data: { session: { user: { id: owner }, access_token: "synthetic-aal2" } }, error: null });
  history = [record]; actionReply = reply({ ...record, status: "pending" });
  state.invoke.mockImplementation(async (_name, options) => options.body.action === "list" ? reply(history) : actionReply);
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});
afterEach(() => { cleanup(); expect(state.listeners.size).toBe(0); });
async function open() {
  fireEvent.click((await screen.findAllByRole("button", { name: "Review" }))[0]!);
  return within(screen.getByRole("dialog"));
}

it.each(["approved", "pending", "unknown"] as const)("real API + UI never promotes %s to a completed payout", async (status) => {
  const pending = deferred<Reply>(); actionReply = pending.promise;
  render(<TopupRefundsPage />);
  const dialog = await open();
  expect(dialog.getByText(record.load_id)).toBeInTheDocument();
  expect(dialog.getByText(record.location_id!)).toBeInTheDocument();
  const form = dialog.getByRole("button", { name: "Approve refund" }).closest("form")!;
  act(() => { fireEvent.submit(form); fireEvent.submit(form); });
  await waitFor(() => expect(actions()).toHaveLength(1));
  expect(actions()[0]![1]).toMatchObject({ body: { id: record.id, action: "approve", note: "" }, headers: { Authorization: "Bearer synthetic-aal2" } });
  expect(Object.keys(actions()[0]![1].body).sort()).toEqual(["action", "id", "note"]);
  expect(screen.queryByText(/Stripe refund confirmed/)).not.toBeInTheDocument();
  history = [{ ...record, status }];
  await act(async () => pending.resolve(reply(history[0]!)));
  await waitFor(() => expect(lists()).toHaveLength(2));
  expect(screen.getByText(/Payout is not confirmed/)).toBeInTheDocument();
  const reopened = await open();
  expect(reopened.queryByLabelText("Decision")).not.toBeInTheDocument();
  expect(reopened.getByRole("button", { name: "Reconcile refund" })).toBeEnabled();
  expect(actions()).toHaveLength(1);
});

it("503 then pending history enables reconcile, never replaying approve", async () => {
  actionReply = { data: null, error: { context: new Response(JSON.stringify({ error: "refund_outcome_unknown", reconciliation_required: true }), { status: 503 }) } };
  render(<TopupRefundsPage />); const dialog = await open();
  history = [{ ...record, status: "unknown" }];
  fireEvent.click(dialog.getByRole("button", { name: "Approve refund" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(/unconfirmed.*reconcile/);
  await waitFor(() => expect(lists()).toHaveLength(2));
  expect(actions()).toHaveLength(1);
  const reconciler = await open();
  expect(reconciler.queryByRole("button", { name: "Approve refund" })).not.toBeInTheDocument();
  actionReply = reply({ ...record, status: "pending" });
  fireEvent.click(reconciler.getByRole("button", { name: "Reconcile refund" }));
  await waitFor(() => expect(actions()).toHaveLength(2));
  expect(actions().map((call) => call[1].body.action)).toEqual(["approve", "reconcile"]);
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
});

it.each(["session_invalid", "owner_or_location_forbidden", "refund_conflict"])("authoritative %s is not optimistic approval", async (error) => {
  actionReply = { data: null, error: { context: new Response(JSON.stringify({ error }), { status: 403 }) } };
  render(<TopupRefundsPage />); const dialog = await open();
  fireEvent.click(dialog.getByRole("button", { name: "Approve refund" }));
  await screen.findByRole("alert");
  expect(screen.queryByText(/Stripe refund confirmed/)).not.toBeInTheDocument();
  await waitFor(() => expect(lists()).toHaveLength(2));
  expect(actions()).toHaveLength(1);
});

it("keeps microsecond UTC and UUID cursor intact beyond page one, with no duplicate records", async () => {
  history = Array.from({ length: 100 }, (_, i) => ({ ...record, id: `00000000-0000-4000-8000-${String(300-i).padStart(12, "0")}` }));
  const cursor = history.at(-1)!;
  render(<TopupRefundsPage />);
  await screen.findByText(cursor.id);
  history = [{ ...record, id: "00000000-0000-4000-8000-000000000200" }];
  fireEvent.click(screen.getByRole("button", { name: "Next page" }));
  await screen.findByText(history[0]!.id);
  expect(lists().at(-1)![1].body).toEqual({ action: "list", before: record.requested_at, before_id: cursor.id });
  expect(screen.queryByText(cursor.id)).not.toBeInTheDocument();
  expect(screen.getAllByRole("button", { name: "Review" })).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
  await waitFor(() => expect(lists().at(-1)![1].body).toEqual({ action: "list" }));
  expect(screen.getByText("Page 1")).toBeInTheDocument();
});

it("A-B-A after dispatch discards processor success even if displayed identity ends unchanged", async () => {
  const pending = deferred<Reply>(); actionReply = pending.promise;
  render(<TopupRefundsPage />); const dialog = await open();
  fireEvent.click(dialog.getByRole("button", { name: "Approve refund" }));
  await waitFor(() => expect(actions()).toHaveLength(1));
  act(() => { for (const callback of state.listeners) { callback("SIGNED_OUT"); callback("SIGNED_IN"); } });
  await act(async () => pending.resolve(reply({ ...record, status: "succeeded", completed_at: "2026-09-30T13:00:00Z" })));
  expect(await screen.findByRole("alert")).toHaveTextContent("Owner session changed");
  expect(screen.queryByText(/Stripe refund confirmed/)).not.toBeInTheDocument();
  expect(actions()).toHaveLength(1);
});

it("unmount aborts a real API review and drops late completion without starting another list", async () => {
  const pending = deferred<Reply>(); actionReply = pending.promise;
  const view = render(<TopupRefundsPage />); const dialog = await open();
  fireEvent.click(dialog.getByRole("button", { name: "Approve refund" }));
  await waitFor(() => expect(actions()).toHaveLength(1));
  const signal = actions()[0]![1].signal as AbortSignal;
  view.unmount(); expect(signal.aborted).toBe(true);
  await act(async () => pending.resolve(reply({ ...record, status: "succeeded", completed_at: "2026-09-30T13:00:00Z" })));
  expect(lists()).toHaveLength(1); expect(actions()).toHaveLength(1);
});

it("uncertain write plus failed refresh cannot reopen a stale approve dialog", async () => {
  render(<TopupRefundsPage />); const dialog = await open();
  state.invoke.mockResolvedValue({ data: null, error: { context: new Response("{}", { status: 503 }) } });
  fireEvent.click(dialog.getByRole("button", { name: "Approve refund" }));
  await screen.findByRole("button", { name: "Retry history" });
  expect(screen.queryByRole("button", { name: "Review" })).not.toBeInTheDocument();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(actions()).toHaveLength(1);
});
