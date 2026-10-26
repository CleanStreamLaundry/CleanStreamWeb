import { StrictMode } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminContextValue } from "./admission";
import type { CustomerMfaRecoveryReceipt } from "./types";
import { CustomerMfaRecoveryError } from "./api";
import CustomerMfaRecoveryPage from "./CustomerMfaRecoveryPage";

const mock = vi.hoisted(() => ({ context: null as unknown, inspect: vi.fn(), recover: vi.fn(), signOut: vi.fn() }));
vi.mock("./context", () => ({ useAdmin: () => mock.context }));
vi.mock("./api", async (original) => ({ ...await original<typeof import("./api")>(), customerMfaRecoveryApi: { inspect: mock.inspect, recover: mock.recover } }));
const owner = "11111111-1111-4111-8111-111111111111";
const target = "22222222-2222-4222-8222-222222222222";
const other = "44444444-4444-4444-8444-444444444444";
const receipt: CustomerMfaRecoveryReceipt = { target_user_id: target, recovery_id: null, support_case: null, state: "not_started", reenrollment_required: false };
const pending: CustomerMfaRecoveryReceipt = { ...receipt, recovery_id: "33333333-3333-4333-8333-333333333333", support_case: "CASE-123", state: "removal_pending", reenrollment_required: true };
const removed: CustomerMfaRecoveryReceipt = { ...pending, state: "reenrollment_required" };
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((r) => { resolve = r; }); return { promise, resolve }; }
function Navigation() {
  const navigate = useNavigate();
  return <><button onClick={() => navigate("/elsewhere")}>Leave route</button><button onClick={() => navigate(-1)}>Return route</button><CustomerMfaRecoveryPage /></>;
}
function view() { return render(<StrictMode><MemoryRouter initialEntries={["/home/account-recovery"]}><Navigation /></MemoryRouter></StrictMode>); }
function rerenderView(rendered: ReturnType<typeof view>) { rendered.rerender(<StrictMode><MemoryRouter initialEntries={["/home/account-recovery"]}><Navigation /></MemoryRouter></StrictMode>); }
function contextPatch(patch: Partial<AdminContextValue>) { mock.context = { ...(mock.context as AdminContextValue), ...patch }; }
async function inspectCustomer(id = target) {
  fireEvent.change(screen.getByLabelText("Customer UUID"), { target: { value: id } });
  fireEvent.click(screen.getByRole("button", { name: "Inspect customer" }));
  await screen.findByRole("region", { name: "Recovery inspection" });
}
function attest() { fireEvent.click(screen.getByRole("checkbox")); }
function caseReference(value = "CASE-123") { fireEvent.change(screen.getByLabelText(/Support case reference/), { target: { value } }); }
function review() { fireEvent.click(screen.getByRole("button", { name: "Review MFA recovery" })); }
function confirm() { fireEvent.click(screen.getByRole("button", { name: "Confirm MFA recovery" })); }
async function ready() { await inspectCustomer(); caseReference(); attest(); review(); }

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value() { this.setAttribute("open", ""); } });
  Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value() { this.removeAttribute("open"); } });
  mock.context = { api: {}, identity: { id: owner, role: "Owner", name: "Owner", email: "owner@example.invalid" }, preview: false, loading: false, error: "", refresh: vi.fn(), signOut: mock.signOut };
  mock.inspect.mockResolvedValue(receipt);
  mock.recover.mockResolvedValue(removed);
  mock.signOut.mockResolvedValue(undefined);
});
afterEach(cleanup);

describe("Owner customer MFA recovery", () => {
  it.each(["Admin", "preview", "signed-out", "loading"])("does not expose requests for %s", (mode) => {
    if (mode === "Admin") contextPatch({ identity: { id: owner, role: "Admin", name: "Admin", email: "admin@example.invalid" } });
    if (mode === "preview") contextPatch({ preview: true });
    if (mode === "signed-out") contextPatch({ identity: null });
    if (mode === "loading") contextPatch({ loading: true });
    view(); expect(screen.queryByLabelText("Customer UUID")).not.toBeInTheDocument();
    expect(mock.inspect).not.toHaveBeenCalled(); expect(mock.recover).not.toHaveBeenCalled();
  });
  it("requires explicit valid nonself UUID inspection, with no mount request", async () => {
    view(); expect(mock.inspect).not.toHaveBeenCalled();
    for (const value of ["", "customer@example.invalid", owner]) {
      fireEvent.change(screen.getByLabelText("Customer UUID"), { target: { value } });
      expect(screen.getByRole("button", { name: "Inspect customer" })).toBeDisabled();
    }
    await inspectCustomer();
    expect(mock.inspect).toHaveBeenCalledExactlyOnceWith(owner, target, expect.any(AbortSignal));
    expect(mock.recover).not.toHaveBeenCalled();
  });
  it("requires case, external attestation and a separate confirmation; exact target/case remain visible", async () => {
    view(); await inspectCustomer();
    const action = screen.getByRole("button", { name: "Review MFA recovery" }); expect(action).toBeDisabled();
    caseReference(); expect(action).toBeDisabled(); attest(); expect(action).toBeEnabled(); review();
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(target)).toBeInTheDocument(); expect(within(dialog).getByText("CASE-123")).toBeInTheDocument();
    expect(mock.recover).not.toHaveBeenCalled(); confirm();
    await screen.findByText(/Account recovery is not complete/);
    expect(mock.recover).toHaveBeenCalledExactlyOnceWith(owner, target, "CASE-123", true, expect.any(AbortSignal));
    expect(screen.queryByRole("button", { name: "Review MFA recovery" })).not.toBeInTheDocument();
  });
  it("cancels without recovery", async () => {
    view(); await ready(); fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(); expect(mock.recover).not.toHaveBeenCalled();
  });
  it("clears attestation on support-case changes", async () => {
    view(); await inspectCustomer(); caseReference(); attest(); caseReference("CASE-456");
    expect(screen.getByRole("checkbox")).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Review MFA recovery" })).toBeDisabled();
  });
  it("invalidates inspection and attestation when target changes", async () => {
    view(); await inspectCustomer(); caseReference(); attest();
    fireEvent.change(screen.getByLabelText("Customer UUID"), { target: { value: other } });
    expect(screen.queryByRole("region", { name: "Recovery inspection" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Review MFA recovery" })).not.toBeInTheDocument();
    expect(mock.recover).not.toHaveBeenCalled();
  });
  it("rejects a control character case before review", async () => {
    view(); await inspectCustomer(); caseReference("CASE\x7f123"); attest();
    expect(screen.getByRole("button", { name: "Review MFA recovery" })).toBeDisabled();
  });
  it("blocks double dispatch and modal dismissal while recovery is pending", async () => {
    const wait = deferred<CustomerMfaRecoveryReceipt>(); mock.recover.mockReturnValue(wait.promise);
    view(); await ready(); const button = screen.getByRole("button", { name: "Confirm MFA recovery" });
    fireEvent.click(button); fireEvent.click(button);
    expect(mock.recover).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Close dialog" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    fireEvent(screen.getByRole("dialog"), new Event("cancel", { bubbles: true, cancelable: true }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await act(async () => wait.resolve(removed));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("requires inspect, renewed attestation and deliberate same-case retry after unknown outcome", async () => {
    mock.recover.mockRejectedValueOnce(new CustomerMfaRecoveryError("recovery_unavailable"));
    view(); await ready(); confirm(); await screen.findByText(/The outcome is unconfirmed/);
    expect(screen.getByLabelText("Customer UUID")).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Review MFA recovery" })).not.toBeInTheDocument();
    expect(mock.recover).toHaveBeenCalledOnce();
    mock.inspect.mockResolvedValueOnce(pending);
    fireEvent.click(screen.getByRole("button", { name: "Inspect customer" }));
    await screen.findByRole("region", { name: "Recovery inspection" });
    expect(screen.getByLabelText(/Support case reference/)).toHaveValue("CASE-123");
    expect(screen.getByLabelText(/Support case reference/)).toBeDisabled();
    expect(screen.getByRole("checkbox")).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Review MFA recovery" })).toBeDisabled();
    attest(); review(); confirm(); await screen.findByText(/Account recovery is not complete/);
    expect(mock.recover).toHaveBeenCalledTimes(2);
    expect(mock.recover.mock.calls.map((call) => call.slice(0, 4))).toEqual([[owner, target, "CASE-123", true], [owner, target, "CASE-123", true]]);
  });
  it("retains same case even when post-unknown inspection reports not_started", async () => {
    mock.recover.mockRejectedValueOnce(new Error("PRIVATE")); view(); await ready(); confirm();
    await screen.findByText(/The outcome is unconfirmed/);
    fireEvent.click(screen.getByRole("button", { name: "Inspect customer" })); await screen.findByRole("region", { name: "Recovery inspection" });
    expect(screen.getByLabelText(/Support case reference/)).toHaveValue("CASE-123");
    expect(screen.getByLabelText(/Support case reference/)).toBeDisabled(); expect(screen.queryByText("PRIVATE")).not.toBeInTheDocument();
    expect(mock.recover).toHaveBeenCalledOnce();
  });
  it("never replaces an uncertain attempt with a different inspected case", async () => {
    mock.recover.mockRejectedValueOnce(new CustomerMfaRecoveryError("recovery_unavailable")); view(); await ready(); confirm();
    await screen.findByText(/The outcome is unconfirmed/); mock.inspect.mockResolvedValueOnce({ ...pending, support_case: "OTHER-CASE" });
    fireEvent.click(screen.getByRole("button", { name: "Inspect customer" })); await screen.findByText(/recorded case differs/);
    expect(screen.getByLabelText(/Support case reference/)).toHaveValue("CASE-123");
    expect(screen.getByRole("checkbox")).toBeDisabled(); expect(mock.recover).toHaveBeenCalledOnce();
  });
  it("uses an already pending server case and retains it after failed reinspection", async () => {
    mock.inspect.mockResolvedValueOnce(pending); view(); await inspectCustomer();
    expect(screen.getByLabelText(/Support case reference/)).toHaveValue("CASE-123");
    expect(screen.getByLabelText(/Support case reference/)).toBeDisabled();
    mock.inspect.mockRejectedValueOnce(new CustomerMfaRecoveryError("recovery_unavailable"));
    fireEvent.click(screen.getByRole("button", { name: "Inspect customer" })); await screen.findByText(/The outcome is unconfirmed/);
    expect(screen.getByLabelText("Customer UUID")).toBeDisabled(); expect(mock.recover).not.toHaveBeenCalled();
  });
  it.each(["fresh_sign_in_required", "session_invalid", "session_changed"] as const)("offers real sign-out without automatic replay for %s", async (code) => {
    mock.inspect.mockRejectedValue(new CustomerMfaRecoveryError(code)); view();
    fireEvent.change(screen.getByLabelText("Customer UUID"), { target: { value: target } });
    fireEvent.click(screen.getByRole("button", { name: "Inspect customer" }));
    const signOut = await screen.findByRole("button", { name: "Sign out to sign in again" });
    expect(screen.getByRole("button", { name: "Inspect customer" })).toBeDisabled();
    fireEvent.click(signOut); await waitFor(() => expect(mock.signOut).toHaveBeenCalledOnce());
    expect(mock.inspect).toHaveBeenCalledOnce(); expect(mock.recover).not.toHaveBeenCalled();
  });
  it("contains sign-out failure and preserves the fresh-signin gate", async () => {
    mock.inspect.mockRejectedValue(new CustomerMfaRecoveryError("fresh_sign_in_required")); mock.signOut.mockRejectedValue(new Error("PRIVATE")); view();
    fireEvent.change(screen.getByLabelText("Customer UUID"), { target: { value: target } });
    fireEvent.click(screen.getByRole("button", { name: "Inspect customer" }));
    fireEvent.click(await screen.findByRole("button", { name: "Sign out to sign in again" }));
    await screen.findByText(/Unable to sign out/); expect(screen.getByRole("button", { name: "Inspect customer" })).toBeDisabled();
    expect(screen.queryByText("PRIVATE")).not.toBeInTheDocument();
  });
  it.each(["account", "role", "preview", "api", "route", "unmount"])("aborts and discards a pending recovery after %s change", async (change) => {
    const wait = deferred<CustomerMfaRecoveryReceipt>(); mock.recover.mockReturnValue(wait.promise);
    const rendered = view(); await ready(); confirm();
    const signal = mock.recover.mock.calls[0]?.[4] as AbortSignal;
    if (change === "unmount") rendered.unmount();
    else if (change === "route") { fireEvent.click(screen.getByRole("button", { name: "Leave route" })); fireEvent.click(screen.getByRole("button", { name: "Return route" })); }
    else {
      const original = mock.context;
      if (change === "account") contextPatch({ identity: { id: other, role: "Owner", name: "Other", email: "other@example.invalid" } });
      if (change === "role") contextPatch({ identity: { id: owner, role: "Admin", name: "Admin", email: "admin@example.invalid" } });
      if (change === "preview") contextPatch({ preview: true });
      if (change === "api") contextPatch({ api: {} as AdminContextValue["api"] });
      rerenderView(rendered); mock.context = original; rerenderView(rendered);
    }
    expect(signal.aborted).toBe(true); await act(async () => wait.resolve(removed));
    expect(screen.queryByText(/Account recovery is not complete/)).not.toBeInTheDocument();
    expect(mock.recover).toHaveBeenCalledOnce(); expect(mock.signOut).not.toHaveBeenCalled();
  });
  it("discards late inspection after route departure and return", async () => {
    const wait = deferred<CustomerMfaRecoveryReceipt>(); mock.inspect.mockReturnValue(wait.promise); view();
    fireEvent.change(screen.getByLabelText("Customer UUID"), { target: { value: target } }); fireEvent.click(screen.getByRole("button", { name: "Inspect customer" }));
    const signal = mock.inspect.mock.calls[0]?.[2] as AbortSignal;
    fireEvent.click(screen.getByRole("button", { name: "Leave route" })); fireEvent.click(screen.getByRole("button", { name: "Return route" }));
    await act(async () => wait.resolve(pending)); expect(signal.aborted).toBe(true);
    expect(screen.queryByRole("region", { name: "Recovery inspection" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Customer UUID")).toHaveValue("");
  });
});
