import { StrictMode } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AdminAdmissionError, type AdminContextValue } from "./admission";
import type { Member, StaffRoleChange } from "./types";
import TeamPage from "./TeamPage";

const mock = vi.hoisted(() => ({ context: null as unknown, setRole: vi.fn(), status: vi.fn(), accounts: vi.fn(), refresh: vi.fn(),
  team: vi.fn(), locations: vi.fn(), invite: vi.fn(), resend: vi.fn(), removeMember: vi.fn(), exportRecords: vi.fn() }));
vi.mock("./context", () => ({ useAdmin: () => mock.context }));
vi.mock("./api", async original => ({ ...await original<typeof import("./api")>(),
  staffRoleApi: { setRole: mock.setRole, status: mock.status },
  ownerManagementApi: { accounts: mock.accounts, setOwner: vi.fn(), status: vi.fn() } }));
const caller = "11111111-1111-4111-8111-111111111111";
const targetId = "22222222-2222-4222-8222-222222222222";
const requestId = "33333333-3333-4333-8333-333333333333";
const otherCaller = "44444444-4444-4444-8444-444444444444";
const key = `admin.staff-role.pending.${caller}`;
const member: Member = { user_id: targetId, role: "Admin", name: "Test Staff", email: "staff@example.invalid",
  location_id: 7, location_name: "Test location", assignment_count: 2, invitation_status: "invited", invited_at: null };
const record = { userId: targetId, portalRole: "Maintenance", requestId };
type Input = StaffRoleChange;
function patch(value: Partial<AdminContextValue>) { mock.context = { ...(mock.context as AdminContextValue), ...value }; }
function view() { return render(<StrictMode><TeamPage /></StrictMode>); }
function list(items = [member]) { return { items, total: items.length, page: 1, pageSize: 20 }; }
async function openChange() {
  fireEvent.click(await screen.findByRole("button", { name: "Change access" }));
  return screen.getByRole("dialog", { name: "Change access?" });
}
async function submit() {
  await openChange();
  fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "  Approved assignment change  " } });
  fireEvent.click(screen.getByRole("button", { name: "Confirm access change" }));
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }

beforeEach(() => {
  vi.restoreAllMocks(); vi.resetAllMocks();
  sessionStorage.removeItem(key);
  sessionStorage.removeItem(`admin.staff-role.pending.${otherCaller}`);
  sessionStorage.removeItem(`admin.owner-change.pending.${caller}`);
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value() { this.setAttribute("open", ""); } });
  Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value() { this.removeAttribute("open"); } });
  mock.context = { api: { team: mock.team, locations: mock.locations, invite: mock.invite, resend: mock.resend,
    removeMember: mock.removeMember, exportRecords: mock.exportRecords },
  identity: { id: caller, role: "Owner", portalRole: "Owner", name: "Owner", email: "owner@example.invalid" },
  preview: false, loading: false, error: "", refresh: mock.refresh, signOut: vi.fn() };
  mock.team.mockResolvedValue(list());
  mock.locations.mockResolvedValue([{ id: 7, Name: "Test location", Address: "Synthetic address" }]);
  mock.invite.mockResolvedValue({});
  mock.setRole.mockImplementation(async (_caller: string, input: Input) => ({
    userId: input.userId, portalRole: input.portalRole, requestId: input.requestId, changed: true,
  }));
  mock.refresh.mockResolvedValue(undefined);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it.each([undefined, "Manager"] as const)("keeps %s Manager Team access read-only and scoped", async portalRole => {
  patch({ identity: { id: caller, role: "Admin", ...(portalRole ? { portalRole } : {}), name: "Manager", email: "manager@example.invalid" } });
  view(); await screen.findByText("Test Staff");
  expect(screen.getByRole("cell", { name: "Manager" })).toBeInTheDocument();
  expect(screen.queryByRole("cell", { name: "Admin" })).not.toBeInTheDocument();
  for (const name of ["Invite team member", "Export CSV", "Change access", "Resend access email", "Remove location", "Refresh Owners"]) {
    expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
  }
  expect(screen.queryByRole("columnheader", { name: "Actions" })).not.toBeInTheDocument();
  expect(screen.queryByText("invited")).not.toBeInTheDocument();
  expect(mock.locations).not.toHaveBeenCalled();
  fireEvent.change(screen.getByRole("searchbox", { name: "Search team" }), { target: { value: "Staff" } });
  await waitFor(() => expect(mock.team).toHaveBeenLastCalledWith({ search: "Staff", page: 1 }));
  expect(mock.invite).not.toHaveBeenCalled(); expect(mock.setRole).not.toHaveBeenCalled(); expect(mock.accounts).not.toHaveBeenCalled();
});

it("does not load Team when rendered for Maintenance", () => {
  patch({ identity: { id: caller, role: "Admin", portalRole: "Maintenance", name: "Maintenance", email: "maintenance@example.invalid" } });
  view();
  expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
  expect(mock.team).not.toHaveBeenCalled(); expect(mock.locations).not.toHaveBeenCalled();
});

it.each(["Manager", "Maintenance"] as const)("invites with explicit %s access and no Owner option", async role => {
  view(); fireEvent.click(screen.getByRole("button", { name: "Invite team member" }));
  const dialog = screen.getByRole("dialog");
  expect(within(dialog).getByLabelText("Access role")).toHaveValue("Manager");
  expect(within(dialog).queryByRole("option", { name: "Owner" })).not.toBeInTheDocument();
  fireEvent.change(within(dialog).getByLabelText("Email address"), { target: { value: "invite@example.invalid" } });
  fireEvent.change(within(dialog).getByLabelText("Access role"), { target: { value: role } });
  fireEvent.click(await within(dialog).findByRole("checkbox", { name: /Test location/ }));
  fireEvent.click(within(dialog).getByRole("button", { name: "Send invitation" }));
  await waitFor(() => expect(mock.invite).toHaveBeenCalledExactlyOnceWith("invite@example.invalid", [7], role));
});

it("offers role changes only for other nonOwner staff and names portal roles", async () => {
  mock.team.mockResolvedValue(list([
    member, { ...member, user_id: otherCaller, portal_role: "Maintenance", name: "Maintenance Staff" },
    { ...member, user_id: caller, name: "Self" },
    { ...member, user_id: requestId, role: "Owner", name: "Other Owner" },
  ]));
  view(); await screen.findByText("Test Staff");
  expect(screen.getAllByRole("button", { name: "Change access" })).toHaveLength(2);
  for (const name of ["Self", "Other Owner"]) {
    const row = screen.getByText(name).closest("tr")!;
    expect(within(row).queryByRole("button", { name: "Change access" })).not.toBeInTheDocument();
  }
  expect(screen.getByRole("cell", { name: "Maintenance" })).toBeInTheDocument();
});

it("requires a reason, supports cancel, and rejects an unchanged role", async () => {
  view(); await openChange();
  expect(screen.getByRole("button", { name: "Confirm access change" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Reviewed" } });
  fireEvent.change(screen.getByLabelText("New access"), { target: { value: "Manager" } });
  expect(screen.getByRole("button", { name: "Confirm access change" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(mock.setRole).not.toHaveBeenCalled();
});

it("persists only caller-bound references before dispatch and confirms the expected legacy Manager role", async () => {
  mock.setRole.mockImplementation(async (id: string, input: Input) => {
    expect(id).toBe(caller);
    expect(JSON.parse(sessionStorage.getItem(key)!)).toEqual({ userId: targetId, portalRole: "Maintenance", requestId: input.requestId });
    return { userId: targetId, portalRole: "Maintenance", requestId: input.requestId, changed: true };
  });
  view(); await submit();
  await screen.findByText(/Access change confirmed/);
  expect(mock.setRole).toHaveBeenCalledExactlyOnceWith(caller, {
    userId: targetId, portalRole: "Maintenance", expectedPortalRole: "Manager", requestId: expect.any(String), note: "Approved assignment change",
  }, expect.any(AbortSignal));
  expect(sessionStorage.getItem(key)).toBeNull();
});

it("changes Maintenance to Manager using the exposed portal role", async () => {
  mock.team.mockResolvedValue(list([{ ...member, portal_role: "Maintenance" }]));
  view(); await submit(); await screen.findByText(/Access change confirmed/);
  expect(mock.setRole.mock.calls[0]![1]).toMatchObject({ expectedPortalRole: "Maintenance", portalRole: "Manager" });
});

it("keeps unknown outcomes locked through missing status and resolves only a matching receipt", async () => {
  mock.setRole.mockRejectedValue(new Error("private transport details"));
  mock.status.mockResolvedValue({ state: "not_found" });
  view(); await submit(); await screen.findByText(/Access change outcome is unconfirmed/);
  expect(screen.queryByText("private transport details")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Change access" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Check access request status" }));
  await screen.findByText(/does not mean it is safe to retry/);
  const input = mock.setRole.mock.calls[0]![1] as Input;
  expect(mock.status).toHaveBeenCalledWith(caller, input.requestId, expect.any(AbortSignal));
  mock.status.mockResolvedValue({ state: "completed", result: { ...input, changed: true } });
  fireEvent.click(screen.getByRole("button", { name: "Check access request status" }));
  await screen.findByText(/Access change confirmed/);
  expect(mock.setRole).toHaveBeenCalledOnce();
});

it.each(["userId", "requestId", "portalRole"] as const)("rejects mismatching status %s", async field => {
  sessionStorage.setItem(key, JSON.stringify(record));
  mock.status.mockResolvedValue({ state: "completed", result: { ...record, changed: true, [field]: field === "portalRole" ? "Manager" : otherCaller } });
  view(); fireEvent.click(screen.getByRole("button", { name: "Check access request status" }));
  await screen.findByText(/No matching completed change/);
  expect(sessionStorage.getItem(key)).not.toBeNull();
  expect(mock.setRole).not.toHaveBeenCalled();
});

it("retains a pending request when the mutation returns a mismatching receipt", async () => {
  mock.setRole.mockImplementation(async (_caller: string, input: Input) => ({ ...input, requestId: otherCaller, changed: true }));
  view(); await submit(); await screen.findByText(/No matching completed change/);
  expect(sessionStorage.getItem(key)).not.toBeNull();
  expect(screen.getByRole("button", { name: "Change access" })).toBeDisabled();
});

it("preserves recovery when the status request fails", async () => {
  sessionStorage.setItem(key, JSON.stringify(record));
  mock.status.mockRejectedValue(new Error("Unavailable"));
  view(); fireEvent.click(screen.getByRole("button", { name: "Check access request status" }));
  await screen.findByText(/Access change status is unavailable/);
  expect(sessionStorage.getItem(key)).not.toBeNull(); expect(mock.setRole).not.toHaveBeenCalled();
});

it("recovers after unmount without repeating a pending mutation or adopting its late result", async () => {
  const reply = deferred<unknown>(); mock.setRole.mockReturnValue(reply.promise);
  const first = view(); await submit();
  expect(screen.getByRole("button", { name: "Check access request status" })).toBeDisabled();
  const input = mock.setRole.mock.calls[0]![1] as Input;
  const signal = mock.setRole.mock.calls[0]![2] as AbortSignal;
  first.unmount(); expect(signal.aborted).toBe(true);
  view();
  expect(screen.getByText(`Unconfirmed access request: ${input.requestId}`)).toBeInTheDocument();
  await act(async () => { reply.resolve({ ...input, changed: true }); });
  expect(screen.queryByText(/Access change confirmed/)).not.toBeInTheDocument();
  expect(sessionStorage.getItem(key)).not.toBeNull(); expect(mock.setRole).toHaveBeenCalledOnce();
});

it("aborts on caller replacement and keeps the departed caller's request private", async () => {
  const reply = deferred<unknown>(); mock.setRole.mockReturnValue(reply.promise);
  const rendered = view(); await submit();
  const input = mock.setRole.mock.calls[0]![1] as Input;
  patch({ identity: { id: otherCaller, role: "Owner", portalRole: "Owner", name: "Other", email: "other@example.invalid" } });
  rendered.rerender(<StrictMode><TeamPage /></StrictMode>);
  expect((mock.setRole.mock.calls[0]![2] as AbortSignal).aborted).toBe(true);
  expect(screen.queryByRole("button", { name: "Check access request status" })).not.toBeInTheDocument();
  await act(async () => { reply.resolve({ ...input, changed: true }); });
  expect(screen.queryByText(/Access change confirmed/)).not.toBeInTheDocument();
  expect(sessionStorage.getItem(key)).not.toBeNull();
});

it("closes an open role dialog if admission becomes read-only", async () => {
  const rendered = view(); await openChange();
  patch({ identity: { id: caller, role: "Admin", portalRole: "Manager", name: "Manager", email: "manager@example.invalid" } });
  rendered.rerender(<StrictMode><TeamPage /></StrictMode>);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument(); expect(mock.setRole).not.toHaveBeenCalled();
});

it.each(["preview", "loading", "admission-error"])("hides role controls during %s", async mode => {
  if (mode === "preview") patch({ preview: true });
  if (mode === "loading") patch({ loading: true });
  if (mode === "admission-error") patch({ error: "MFA required" });
  view(); await screen.findByText("Test Staff");
  expect(screen.queryByRole("button", { name: "Change access" })).not.toBeInTheDocument();
});

it.each(["malformed", "unreadable"])("fails closed on %s local recovery storage", async mode => {
  if (mode === "malformed") sessionStorage.setItem(key, "broken");
  else {
    const prototype = Object.getPrototypeOf(sessionStorage) as Storage;
    const getItem = prototype.getItem;
    vi.spyOn(prototype, "getItem").mockImplementation(function (this: Storage, storageKey: string) {
      if (this === sessionStorage && storageKey === key) throw new Error("Unavailable");
      return getItem.call(this, storageKey);
    });
  }
  view(); await screen.findByText("Test Staff");
  expect(screen.getByText(/local access request record is unavailable/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Change access" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Refresh Owners" })).toBeEnabled();
  expect(mock.setRole).not.toHaveBeenCalled();
});

it("does not dispatch if recovery cannot be persisted", async () => {
  view(); await openChange();
  const prototype = Object.getPrototypeOf(sessionStorage) as Storage;
  const setItem = prototype.setItem;
  vi.spyOn(prototype, "setItem").mockImplementation(function (this: Storage, storageKey: string, value: string) {
    if (this === sessionStorage && storageKey === key) throw new Error("Unavailable");
    return setItem.call(this, storageKey, value);
  });
  fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Approved" } });
  fireEvent.click(screen.getByRole("button", { name: "Confirm access change" }));
  await screen.findByText(/No change was submitted/); expect(mock.setRole).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Change access" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Refresh Owners" })).toBeEnabled();
  expect(sessionStorage.getItem(key)).toBeNull();
});

it("keeps the request locked when local receipt removal fails", async () => {
  view(); await openChange();
  const prototype = Object.getPrototypeOf(sessionStorage) as Storage;
  const removeItem = prototype.removeItem;
  vi.spyOn(prototype, "removeItem").mockImplementation(function (this: Storage, storageKey: string) {
    if (this === sessionStorage && storageKey === key) throw new Error("Unavailable");
    return removeItem.call(this, storageKey);
  });
  fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Approved" } });
  fireEvent.click(screen.getByRole("button", { name: "Confirm access change" }));
  await screen.findByText(/local access request record could not be cleared/);
  expect(screen.getByRole("button", { name: "Change access" })).toBeDisabled(); expect(sessionStorage.getItem(key)).not.toBeNull();
  expect(screen.getByRole("button", { name: "Refresh Owners" })).toBeEnabled();
});

it("refreshes admission on denial without automatic mutation retry", async () => {
  mock.setRole.mockRejectedValue(new AdminAdmissionError("MFA required", "challenge_totp", "challenge_totp"));
  view(); await submit(); await waitFor(() => expect(mock.refresh).toHaveBeenCalledOnce());
  expect(mock.setRole).toHaveBeenCalledOnce(); expect(sessionStorage.getItem(key)).not.toBeNull();
});
