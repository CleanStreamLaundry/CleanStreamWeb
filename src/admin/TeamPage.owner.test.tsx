import { StrictMode } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AdminAdmissionError, type AdminContextValue } from "./admission";
import type { OwnerAccount, OwnerChange } from "./types";
import TeamPage from "./TeamPage";

const mock = vi.hoisted(() => ({ context: null as unknown, accounts: vi.fn(), setOwner: vi.fn(), status: vi.fn(), refresh: vi.fn() }));
vi.mock("./context", () => ({ useAdmin: () => mock.context }));
vi.mock("./api", async original => ({ ...await original<typeof import("./api")>(),
  ownerManagementApi: { accounts: mock.accounts, setOwner: mock.setOwner, status: mock.status } }));
const caller = "11111111-1111-4111-8111-111111111111";
const targetId = "22222222-2222-4222-8222-222222222222";
const target: OwnerAccount = { userId: targetId, name: "Additional Owner", email: "target@example.invalid", role: "Admin", locationIds: [7], ownerEligible: true, restriction: null };
function list(items = [target], page = 1, total = items.length) {
  return { items, page, total, pageSize: 25, activeOwnerCount: 2 };
}
function contextPatch(patch: Partial<AdminContextValue>) { mock.context = { ...(mock.context as AdminContextValue), ...patch }; }
function view() { return render(<StrictMode><TeamPage /></StrictMode>); }
async function lookup() {
  fireEvent.click(screen.getByRole("button", { name: "Refresh Owners" }));
  await screen.findByText(targetId);
}
async function confirmReady(role: "Admin" | "Owner" = "Admin") {
  mock.accounts.mockResolvedValue(list([{ ...target, role }]));
  await lookup();
  fireEvent.click(screen.getByRole("button", { name: role === "Owner" ? "Revoke Owner" : "Grant Owner" }));
  fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Approved additional Owner" } });
}
function confirm() { fireEvent.click(screen.getByRole("button", { name: "Confirm Owner change" })); }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }

beforeEach(() => {
  vi.restoreAllMocks();
  vi.resetAllMocks();
  sessionStorage.removeItem(`admin.owner-change.pending.${caller}`);
  sessionStorage.removeItem("admin.owner-change.pending.44444444-4444-4444-8444-444444444444");
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value() { this.setAttribute("open", ""); } });
  Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value() { this.removeAttribute("open"); } });
  mock.context = { api: {
    team: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 }),
    locations: vi.fn().mockResolvedValue([]),
  }, identity: { id: caller, role: "Owner", name: "Current Owner", email: "owner@example.invalid" },
  preview: false, loading: false, error: "", refresh: mock.refresh, signOut: vi.fn() };
  mock.accounts.mockResolvedValue(list());
  mock.setOwner.mockImplementation(async (_caller: string, input: OwnerChange) => ({
    userId: input.userId, requestId: input.requestId, role: input.owner ? "Owner" : "Admin", changed: true,
  }));
  mock.refresh.mockResolvedValue(undefined);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it.each(["Admin", "preview", "signed-out", "loading", "admission-error"])("offers no Owner controls for %s", mode => {
  if (mode === "Admin") contextPatch({ identity: { id: caller, role: "Admin", name: "Admin", email: "admin@example.invalid" } });
  if (mode === "preview") contextPatch({ preview: true });
  if (mode === "signed-out") contextPatch({ identity: null });
  if (mode === "loading") contextPatch({ loading: true });
  if (mode === "admission-error") contextPatch({ error: "MFA required" });
  view();
  expect(screen.queryByRole("region", { name: "Owner accounts" })).not.toBeInTheDocument();
  expect(mock.accounts).not.toHaveBeenCalled(); expect(mock.setOwner).not.toHaveBeenCalled();
});

it("looks up an exact account only after explicit submission", async () => {
  view();
  fireEvent.change(screen.getByLabelText("Existing account email or UUID"), { target: { value: " target@example.invalid " } });
  expect(mock.accounts).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Find account" }));
  await screen.findByText(targetId);
  expect(mock.accounts).toHaveBeenCalledExactlyOnceWith(caller, "target@example.invalid", 1, expect.any(AbortSignal));
});

it("disables self changes and ineligible grants but preserves another Owner revoke", async () => {
  mock.accounts.mockResolvedValue(list([
    { ...target, userId: caller, role: "Owner" },
    { ...target, ownerEligible: false, restriction: "email_unverified" },
    { ...target, userId: "44444444-4444-4444-8444-444444444444", role: "Owner", ownerEligible: false },
  ]));
  view(); await lookup();
  expect(screen.getAllByRole("button", { name: "Revoke Owner" })[0]).toBeDisabled();
  expect(screen.getAllByRole("button", { name: "Revoke Owner" })[1]).toBeEnabled();
  expect(screen.getByRole("button", { name: "Grant Owner" })).toBeDisabled();
  expect(screen.getByText("Another Owner must manage your Owner access.")).toBeInTheDocument();
});

it.each(["Admin", "Owner"] as const)("confirms exact target, reason and expected %s role before one mutation", async role => {
  view(); await confirmReady(role);
  const dialog = screen.getByRole("dialog");
  expect(within(dialog).getByText(/target@example.invalid/)).toHaveTextContent(targetId);
  expect(mock.setOwner).not.toHaveBeenCalled();
  confirm();
  await screen.findByText(/Owner change confirmed/);
  expect(mock.setOwner).toHaveBeenCalledExactlyOnceWith(caller, {
    userId: targetId, owner: role !== "Owner", expectedRole: role,
    requestId: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/),
    note: "Approved additional Owner",
  }, expect.any(AbortSignal));
  expect(screen.queryByRole("button", { name: "Grant Owner" })).not.toBeInTheDocument();
});

it("requires a reason and allows cancellation without changing roles", async () => {
  view(); await lookup();
  fireEvent.click(screen.getByRole("button", { name: "Grant Owner" }));
  expect(screen.getByRole("button", { name: "Confirm Owner change" })).toBeDisabled();
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));
  expect(mock.setOwner).not.toHaveBeenCalled();
});

it("shows last-owner denial and requires fresh inspection", async () => {
  mock.setOwner.mockRejectedValue(new AdminAdmissionError("raw internal message", "owner_last_required"));
  view(); await confirmReady("Owner"); confirm();
  await screen.findByText("Another eligible Owner must remain. Owner access was not removed.");
  expect(screen.queryByText("raw internal message")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Revoke Owner" })).not.toBeInTheDocument();
  expect(mock.setOwner).toHaveBeenCalledOnce();
});

it("never retries an unknown mutation or treats missing receipt as safe retry", async () => {
  mock.setOwner.mockRejectedValue(new Error("network outcome unknown"));
  mock.status.mockResolvedValueOnce({ state: "not_found" });
  view(); await confirmReady(); confirm();
  await screen.findByRole("button", { name: "Check request status" });
  await waitFor(() => expect(screen.getByRole("button", { name: "Check request status" })).toBeEnabled());
  const input = mock.setOwner.mock.calls[0]![1] as OwnerChange;
  fireEvent.click(screen.getByRole("button", { name: "Check request status" }));
  await screen.findByText(/does not mean it is safe to retry/);
  expect(screen.getByRole("button", { name: "Refresh Owners" })).toBeDisabled();
  expect(mock.setOwner).toHaveBeenCalledOnce();
  expect(mock.status).toHaveBeenCalledWith(caller, input.requestId, expect.any(AbortSignal));
  mock.status.mockResolvedValueOnce({ state: "completed", result: { userId: targetId, role: "Owner", requestId: input.requestId, changed: true } });
  fireEvent.click(screen.getByRole("button", { name: "Check request status" }));
  await screen.findByText(/Owner change confirmed/);
  expect(mock.setOwner).toHaveBeenCalledOnce();
});

it("blocks duplicate submission and discards completion after caller replacement", async () => {
  const reply = deferred<unknown>();
  mock.setOwner.mockReturnValue(reply.promise);
  const rendered = view(); await confirmReady(); confirm();
  expect(screen.getByRole("button", { name: "Saving..." })).toBeDisabled();
  contextPatch({ identity: { id: "44444444-4444-4444-8444-444444444444", role: "Owner", name: "Other", email: "other@example.invalid" } });
  rendered.rerender(<StrictMode><TeamPage /></StrictMode>);
  const input = mock.setOwner.mock.calls[0]![1] as OwnerChange;
  expect((mock.setOwner.mock.calls[0]![2] as AbortSignal).aborted).toBe(true);
  await act(async () => { reply.resolve({ userId: targetId, role: "Owner", requestId: input.requestId, changed: true }); });
  expect(screen.queryByText(/Owner change confirmed/)).not.toBeInTheDocument();
  expect(mock.setOwner).toHaveBeenCalledOnce();
});

it("revalidates canonical admission on MFA denial without automatic mutation retry", async () => {
  mock.setOwner.mockRejectedValue(new AdminAdmissionError("MFA required", "challenge_totp", "challenge_totp"));
  view(); await confirmReady(); confirm();
  await waitFor(() => expect(mock.refresh).toHaveBeenCalledOnce());
  expect(mock.setOwner).toHaveBeenCalledOnce();
});

it("preserves existing location-admin invite controls", async () => {
  view();
  fireEvent.click(screen.getByRole("button", { name: "Invite team member" }));
  expect(await screen.findByRole("dialog", { name: "Invite team member" })).toBeInTheDocument();
  expect(mock.setOwner).not.toHaveBeenCalled();
});

it.each(["unknown", "in-flight"])("restores the same caller's %s request after leave/return without redispatch", async phase => {
  const reply = deferred<unknown>();
  if (phase === "unknown") mock.setOwner.mockRejectedValue(new Error("unconfirmed"));
  else mock.setOwner.mockReturnValue(reply.promise);
  const first = view(); await confirmReady(); confirm();
  if (phase === "unknown") await screen.findByText(/outcome is unconfirmed/);
  const input = mock.setOwner.mock.calls[0]![1] as OwnerChange;
  expect(JSON.parse(sessionStorage.getItem(`admin.owner-change.pending.${caller}`)!)).toEqual({
    userId: targetId, owner: true, requestId: input.requestId,
  });
  first.unmount();
  view();
  expect(screen.getByText(`Unconfirmed request: ${input.requestId}`)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Refresh Owners" })).toBeDisabled();
  expect(mock.setOwner).toHaveBeenCalledOnce(); expect(mock.status).not.toHaveBeenCalled();
  await act(async () => { reply.resolve({ userId: targetId, role: "Owner", requestId: input.requestId, changed: true }); });
  expect(screen.queryByText(/Owner change confirmed/)).not.toBeInTheDocument();
  mock.status.mockResolvedValueOnce({ state: "completed", result: { userId: targetId, role: "Owner", requestId: input.requestId, changed: true } });
  fireEvent.click(screen.getByRole("button", { name: "Check request status" }));
  await screen.findByText(/Owner change confirmed/);
  expect(sessionStorage.getItem(`admin.owner-change.pending.${caller}`)).toBeNull();
  expect(mock.setOwner).toHaveBeenCalledOnce();
});

it("does not expose a departed caller's persisted request to another Owner", () => {
  sessionStorage.setItem(`admin.owner-change.pending.${caller}`, JSON.stringify({
    userId: targetId, owner: true, requestId: "33333333-3333-4333-8333-333333333333",
  }));
  contextPatch({ identity: { id: "44444444-4444-4444-8444-444444444444", role: "Owner", name: "Other", email: "other@example.invalid" } });
  view();
  expect(screen.queryByRole("button", { name: "Check request status" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Refresh Owners" })).toBeEnabled();
  expect(mock.status).not.toHaveBeenCalled();
});

it.each(["malformed", "unreadable"])("blocks new mutations when the local pending record is %s", mode => {
  if (mode === "malformed") sessionStorage.setItem(`admin.owner-change.pending.${caller}`, "broken");
  else {
    const prototype = Object.getPrototypeOf(sessionStorage) as Storage;
    const getItem = prototype.getItem;
    vi.spyOn(prototype, "getItem").mockImplementation(function (this: Storage, key: string) {
      if (this === sessionStorage && key === `admin.owner-change.pending.${caller}`) throw new Error("storage unavailable");
      return getItem.call(this, key);
    });
  }
  view();
  expect(screen.getByText(/local Owner request record is unavailable/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Refresh Owners" })).toBeDisabled();
  expect(mock.setOwner).not.toHaveBeenCalled();
});

it("does not dispatch when the pending receipt cannot be persisted", async () => {
  view(); await confirmReady();
  const prototype = Object.getPrototypeOf(sessionStorage) as Storage;
  const setItem = prototype.setItem;
  vi.spyOn(prototype, "setItem").mockImplementation(function (this: Storage, key: string, value: string) {
    if (this === sessionStorage && key === `admin.owner-change.pending.${caller}`) throw new Error("storage full");
    return setItem.call(this, key, value);
  });
  confirm();
  expect(screen.getByText(/No change was submitted/)).toBeInTheDocument();
  expect(mock.setOwner).not.toHaveBeenCalled();
});

it("keeps mutation locked if a confirmed receipt cannot be cleared locally", async () => {
  view(); await confirmReady();
  const prototype = Object.getPrototypeOf(sessionStorage) as Storage;
  const removeItem = prototype.removeItem;
  const remove = vi.spyOn(prototype, "removeItem").mockImplementation(function (this: Storage, key: string) {
    if (this === sessionStorage && key === `admin.owner-change.pending.${caller}`) throw new Error("storage unavailable");
    return removeItem.call(this, key);
  });
  confirm();
  await screen.findByText(/local Owner request record could not be cleared/);
  expect(mock.setOwner).toHaveBeenCalledOnce();
  expect(screen.getByRole("button", { name: "Refresh Owners" })).toBeDisabled();
  expect(sessionStorage.getItem(`admin.owner-change.pending.${caller}`)).not.toBeNull();
  remove.mockRestore();
});
