import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AdminProvider, useAdmin } from "./context";
import { AdminAdmissionError, type StaffMfaAdmission } from "./admission";

type Callback = (event: string, session?: { user: { id: string } }) => void;
const mocks = vi.hoisted(() => ({ session: vi.fn(), identity: vi.fn(), signOut: vi.fn(), callback: undefined as Callback | undefined }));
vi.mock("../supabase/client", () => ({ getSupabaseClient: () => ({ auth: {
  getSession: mocks.session, signOut: mocks.signOut, onAuthStateChange: (callback: Callback) => {
    mocks.callback = callback; return { data: { subscription: { unsubscribe: vi.fn() } } };
  },
} }) }));
vi.mock("./api", () => ({ adminApi: { identity: mocks.identity } }));
vi.mock("./StaffMfa", () => ({ default: ({ admission, signOut }: { admission: StaffMfaAdmission; signOut: () => Promise<void> }) => <>
  <p>{admission.step}</p><button onClick={() => { void signOut().catch(() => {}); }}>Sign out</button>
</> }));
let controls: ReturnType<typeof useAdmin>;
function Protected() {
  const context = useAdmin();
  useEffect(() => { controls = context; }, [context]);
  const { identity, error, loading, signOut } = context;
  return <>{identity ? <p>Protected workspace</p> : <p>{loading ? "Checking" : "No access"}</p>}{error && <p>{error}</p>}
    <button onClick={() => { void signOut().catch(() => {}); }}>Sign out</button>
  </>;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue({ data: { session: { access_token: "A", user: { id: "A" } } }, error: null });
  mocks.identity.mockResolvedValue({ id: "A", role: "Owner" });
  mocks.signOut.mockResolvedValue({ error: null });
});
afterEach(cleanup);
it.each(["enroll_totp", "challenge_totp"])("withholds protected children on server %s", async (step) => {
  mocks.identity.mockRejectedValue(new AdminAdmissionError("MFA required", step, step));
  render(<AdminProvider><Protected /></AdminProvider>);
  expect(await screen.findByText(step)).toBeInTheDocument();
  expect(screen.queryByText("Protected workspace")).not.toBeInTheDocument();
});
it("requires matching server identity even when the returned role is Owner", async () => {
  mocks.identity.mockResolvedValue({ id: "B", role: "Owner" });
  render(<AdminProvider><Protected /></AdminProvider>);
  expect(await screen.findByText("This account does not have admin portal access.")).toBeInTheDocument();
  expect(screen.queryByText("Protected workspace")).not.toBeInTheDocument();
});
it("does not publish an old MFA denial after a replacement event", async () => {
  let reject!: (reason: unknown) => void;
  mocks.identity.mockReturnValueOnce(new Promise((_, fail) => { reject = fail; }));
  render(<AdminProvider><Protected /></AdminProvider>);
  await waitFor(() => expect(mocks.identity).toHaveBeenCalledTimes(1));
  await act(async () => {
    mocks.session.mockResolvedValue({ data: { session: { access_token: "B", user: { id: "B" } } }, error: null });
    mocks.identity.mockResolvedValue({ id: "B", role: "Admin" });
    mocks.callback?.("SIGNED_IN", { user: { id: "B" } });
    reject(new AdminAdmissionError("MFA required", "enroll_totp", "enroll_totp"));
  });
  expect(await screen.findByText("Protected workspace")).toBeInTheDocument();
  expect(screen.queryByText("enroll_totp")).not.toBeInTheDocument();
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
it("keeps a failed MFA sign-out visible after the MFA form unmounts and retries without restoring access", async () => {
  mocks.identity.mockRejectedValue(new AdminAdmissionError("MFA required", "challenge_totp", "challenge_totp"));
  const pending = deferred<{ error: Error | null }>();
  mocks.signOut.mockReturnValueOnce(pending.promise);
  render(<AdminProvider><Protected /></AdminProvider>);
  await screen.findByText("challenge_totp");
  fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
  expect(screen.queryByText("challenge_totp")).not.toBeInTheDocument();
  expect(screen.queryByText("Protected workspace")).not.toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("Signing out");
  expect(screen.getByRole("button", { name: "Signing out..." })).toBeDisabled();
  await act(async () => { pending.resolve({ error: new Error("network failed") }); });
  expect(await screen.findByRole("alert")).toHaveTextContent("Your session may still be active");
  expect(screen.getByRole("link", { name: "Account recovery support" })).toHaveAttribute("href", "/support");
  mocks.signOut.mockImplementationOnce(async () => {
    mocks.session.mockResolvedValue({ data: { session: null }, error: null });
    mocks.callback?.("SIGNED_OUT");
    return { error: null };
  });
  fireEvent.click(screen.getByRole("button", { name: "Retry sign out" }));
  expect(await screen.findByText("No access")).toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.queryByText("Protected workspace")).not.toBeInTheDocument();
  expect(mocks.signOut).toHaveBeenCalledTimes(2);
});
it("handles thrown sign-out failures and blocks old-session revalidation while retry is needed", async () => {
  mocks.signOut.mockRejectedValueOnce(new Error("offline"));
  render(<AdminProvider><Protected /></AdminProvider>);
  await screen.findByText("Protected workspace");
  const refresh = controls.refresh;
  fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
  expect(screen.queryByText("Protected workspace")).not.toBeInTheDocument();
  await screen.findByRole("alert");
  mocks.session.mockClear();
  mocks.identity.mockClear();
  await act(async () => {
    await refresh();
    mocks.callback?.("TOKEN_REFRESHED", { user: { id: "A" } });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  expect(mocks.session).not.toHaveBeenCalled();
  expect(mocks.identity).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Retry sign out" })).toBeEnabled();
  expect(screen.queryByText("Protected workspace")).not.toBeInTheDocument();
});
it("ignores an admission response started before the sign-out attempt", async () => {
  render(<AdminProvider><Protected /></AdminProvider>);
  await screen.findByText("Protected workspace");
  const admission = deferred<{ id: string; role: string }>();
  const logout = deferred<{ error: Error }>();
  mocks.identity.mockReturnValueOnce(admission.promise);
  mocks.signOut.mockReturnValueOnce(logout.promise);
  let refreshing!: Promise<void>;
  act(() => { refreshing = controls.refresh(); });
  await waitFor(() => expect(mocks.identity).toHaveBeenCalledTimes(2));
  fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
  await act(async () => {
    admission.resolve({ id: "A", role: "Owner" });
    await refreshing;
    logout.resolve({ error: new Error("offline") });
  });
  expect(await screen.findByRole("alert")).toHaveTextContent("Unable to sign out");
  expect(screen.queryByText("Protected workspace")).not.toBeInTheDocument();
});
it("deduplicates pending sign-out calls even before the UI rerenders", async () => {
  render(<AdminProvider><Protected /></AdminProvider>);
  await screen.findByText("Protected workspace");
  const pending = deferred<{ error: null }>();
  mocks.signOut.mockReturnValueOnce(pending.promise);
  const signOut = controls.signOut;
  let first!: Promise<void>;
  let second!: Promise<void>;
  act(() => { first = signOut(); second = signOut(); });
  expect(mocks.signOut).toHaveBeenCalledOnce();
  await act(async () => {
    mocks.session.mockResolvedValue({ data: { session: null }, error: null });
    pending.resolve({ error: null });
    await Promise.all([first, second]);
  });
  expect(screen.queryByText("Protected workspace")).not.toBeInTheDocument();
  expect(screen.getByText("No access")).toBeInTheDocument();
});
it("does not publish old sign-out failure over a newly admitted replacement account", async () => {
  render(<AdminProvider><Protected /></AdminProvider>);
  await screen.findByText("Protected workspace");
  const pending = deferred<{ error: Error }>();
  mocks.signOut.mockReturnValueOnce(pending.promise);
  fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
  await act(async () => {
    mocks.session.mockResolvedValue({ data: { session: { access_token: "B", user: { id: "B" } } }, error: null });
    mocks.identity.mockResolvedValue({ id: "B", role: "Admin" });
    mocks.callback?.("SIGNED_IN", { user: { id: "B" } });
  });
  await screen.findByText("Protected workspace");
  await act(async () => { pending.resolve({ error: new Error("old failure") }); });
  expect(controls.identity?.id).toBe("B");
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Retry sign out" })).not.toBeInTheDocument();
});
it("does not replace a completed SIGNED_OUT event with a late failure", async () => {
  render(<AdminProvider><Protected /></AdminProvider>);
  await screen.findByText("Protected workspace");
  const pending = deferred<{ error: Error }>();
  mocks.signOut.mockReturnValueOnce(pending.promise);
  fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
  await act(async () => {
    mocks.session.mockResolvedValue({ data: { session: null }, error: null });
    mocks.callback?.("SIGNED_OUT");
    pending.resolve({ error: new Error("late failure") });
  });
  expect(screen.getByText("No access")).toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.queryByText("Protected workspace")).not.toBeInTheDocument();
});
