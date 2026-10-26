import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import { StrictMode } from "react";
import { BrowserRouter, Link, MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminProvider, useAdmin } from "./context";
import AuthPages from "./AuthPages";
type AuthCallback = (event: string, session?: { user: { id: string } } | null) => void;
const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  identity: vi.fn(),
  signOut: vi.fn(),
  callback: undefined as AuthCallback | undefined,
  unsubscribe: vi.fn(),
  login: vi.fn(),
  reset: vi.fn(),
  update: vi.fn(),
  verify: vi.fn(),
}));
vi.mock("../supabase/client", () => ({
  getSupabaseClient: () => ({
    auth: {
      getSession: mocks.session,
      signOut: mocks.signOut,
      onAuthStateChange: (fn: AuthCallback) => {
        mocks.callback = fn;
        return { data: { subscription: { unsubscribe: mocks.unsubscribe } } };
      },
      signInWithPassword: mocks.login,
      resetPasswordForEmail: mocks.reset,
      updateUser: mocks.update,
      verifyOtp: mocks.verify,
    },
  }),
}));
vi.mock("./api", () => ({ adminApi: { identity: mocks.identity } }));
function Probe() {
  const state = useAdmin();
  return (
    <>
      <span>
        {state.loading ? "checking" : (state.identity?.role ?? "signed out")}
      </span>
      {state.error && <p role="alert">{state.error}</p>}
      <button onClick={() => void state.signOut()}>Sign out</button>
    </>
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState(null, "", "/");
  mocks.session.mockResolvedValue({
    data: { session: { user: { id: "owner" } } },
    error: null,
  });
  mocks.identity.mockResolvedValue({
    id: "owner",
    name: "Owner",
    email: "owner@example.com",
    role: "Owner",
  });
  mocks.signOut.mockResolvedValue({ error: null });
  mocks.reset.mockResolvedValue({ error: null });
  mocks.update.mockResolvedValue({ error: null });
  mocks.login.mockResolvedValue({ error: null });
  mocks.verify.mockResolvedValue({ error: null });
});
it("restores the server-verified role and fails closed on a profile lookup error", async () => {
  mocks.identity.mockRejectedValue(new Error("Access verification failed"));
  render(
    <AdminProvider>
      <Probe />
    </AdminProvider>,
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Access verification failed",
  );
  expect(screen.getByText("signed out")).toBeInTheDocument();
});
it("sign-out invalidates an in-flight identity request", async () => {
  let resolve!: (value: unknown) => void;
  mocks.identity.mockReturnValue(
    new Promise((r) => {
      resolve = r;
    }),
  );
  render(
    <AdminProvider>
      <Probe />
    </AdminProvider>,
  );
  await waitFor(() => expect(mocks.identity).toHaveBeenCalled());
  await act(async () => {
    mocks.callback?.("SIGNED_OUT");
    resolve({ role: "Owner" });
  });
  expect(screen.getByText("signed out")).toBeInTheDocument();
});
it("session expiry clears a previously loaded identity", async () => {
  render(
    <AdminProvider>
      <Probe />
    </AdminProvider>,
  );
  expect(await screen.findByText("Owner")).toBeInTheDocument();
  act(() => mocks.callback?.("SIGNED_OUT"));
  expect(screen.getByText("signed out")).toBeInTheDocument();
});
it("background token validation preserves mounted work until access is denied", async () => {
  render(
    <AdminProvider>
      <Probe />
    </AdminProvider>,
  );
  expect(await screen.findByText("Owner")).toBeInTheDocument();
  let reject!: (error: Error) => void;
  mocks.identity.mockImplementationOnce(
    () =>
      new Promise((_, fail) => {
        reject = fail;
      }),
  );
  await act(async () => mocks.callback?.("TOKEN_REFRESHED"));
  expect(screen.getByText("Owner")).toBeInTheDocument();
  expect(screen.queryByText("checking")).not.toBeInTheDocument();
  await act(async () => reject(new Error("Access revoked")));
  expect(screen.getByText("signed out")).toBeInTheDocument();
});
it("recovery uses the admin callback and does not disclose account existence", async () => {
  mocks.session.mockResolvedValue({ data: { session: null }, error: null });
  render(
    <MemoryRouter initialEntries={["/admin/forgot-password"]}>
      <AdminProvider>
        <AuthPages />
      </AdminProvider>
    </MemoryRouter>,
  );
  fireEvent.change(screen.getByLabelText("Email address"), {
    target: { value: "owner@example.com" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));
  expect(await screen.findByText(/If an account exists/)).toBeInTheDocument();
  expect(mocks.reset).toHaveBeenCalledWith("owner@example.com", {
    redirectTo: expect.stringContaining("/admin/reset-password"),
  });
});
it("expired setup links cannot submit a password", async () => {
  mocks.session.mockResolvedValue({ data: { session: null }, error: null });
  render(
    <MemoryRouter initialEntries={["/admin/accept-invite"]}>
      <AdminProvider>
        <AuthPages />
      </AdminProvider>
    </MemoryRouter>,
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(/expired/);
  expect(
    screen.queryByRole("button", { name: "Save password" }),
  ).not.toBeInTheDocument();
  expect(mocks.update).not.toHaveBeenCalled();
});

it.each([null, { id: "customer", role: "User" }])(
  "rejects a missing or denied role response",
  async (identity) => {
    mocks.identity.mockResolvedValue(identity);
    render(
      <AdminProvider>
        <Probe />
      </AdminProvider>,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "does not have admin portal access",
    );
    expect(screen.getByText("signed out")).toBeInTheDocument();
  },
);

it("accepts an invitation token and requires matching passwords", async () => {
  window.history.replaceState(
    null,
    "",
    "/admin/accept-invite?token_hash=synthetic-token&type=invite",
  );
  render(
    <MemoryRouter initialEntries={["/admin/accept-invite"]}>
      <AdminProvider>
        <AuthPages />
      </AdminProvider>
    </MemoryRouter>,
  );
  const password = await screen.findByLabelText(/New password/);
  await waitFor(() =>
    expect(mocks.verify).toHaveBeenCalledWith({
      token_hash: "synthetic-token",
      type: "invite",
    }),
  );
  expect(window.location.search).toBe("");
  fireEvent.change(password, { target: { value: "synthetic-test-password" } });
  fireEvent.change(screen.getByLabelText("Confirm password"), {
    target: { value: "does-not-match" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save password" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "passwords do not match",
  );
  expect(mocks.update).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Confirm password"), {
    target: { value: "synthetic-test-password" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save password" }));
  await waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(1));
});

const authPaths = {
  login: "/admin",
  recovery: "/admin/forgot-password",
  invite: "/admin/accept-invite?token_hash=synthetic-invite-a&type=invite",
  nextInvite: "/admin/accept-invite?token_hash=synthetic-invite-b&type=invite",
  nextSetup: "/admin/reset-password?token_hash=synthetic-recovery-b&type=recovery",
  queryError: "/admin/accept-invite?error=synthetic-expired",
  hashError: "/admin/accept-invite#error=synthetic-expired",
  loginQuery: "/admin?view=synthetic#hint",
  support: "/support?view=synthetic#latest",
};
type FakeAuthResult = { error: Error | null };
const fakeSession = { data: { session: { user: { id: "owner" } } }, error: null };
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
function DocumentRouteProbe() {
  const location = useLocation();
  return <>
    <output data-testid="document-route">{location.pathname + location.search + location.hash}</output>
    {Object.entries(authPaths).map(([name, to]) => <Link key={name} to={to}>Visit {name}</Link>)}
  </>;
}
function showDocumentAuth(path: string, strict = false) {
  window.history.replaceState(null, "", path);
  const view = <BrowserRouter>
    <Routes>
      <Route path="/admin/*" element={<AdminProvider><AuthPages /></AdminProvider>} />
      <Route path="/home" element={<h1>Fixture home</h1>} />
      <Route path="/support" element={<h1>Fixture support</h1>} />
    </Routes>
    <DocumentRouteProbe />
  </BrowserRouter>;
  return render(strict ? <StrictMode>{view}</StrictMode> : view);
}
async function visit(name: keyof typeof authPaths) {
  await act(async () => { fireEvent.click(screen.getByRole("link", { name: `Visit ${name}` })); });
}
function signIn() {
  fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "fixture@example.invalid" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "synthetic-password" } });
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
}
function savePassword() {
  fireEvent.change(screen.getByLabelText(/New password/), { target: { value: "synthetic-password" } });
  fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "synthetic-password" } });
  fireEvent.click(screen.getByRole("button", { name: "Save password" }));
}

describe("auth page document and attempt ownership", () => {
  beforeEach(() => {
    for (const mock of [mocks.session, mocks.identity, mocks.login, mocks.reset, mocks.update, mocks.verify]) mock.mockReset();
    mocks.session.mockResolvedValue(fakeSession);
    // Keep provider-driven redirects out of tests of AuthPages' own navigation.
    mocks.identity.mockResolvedValue(null);
    for (const mock of [mocks.login, mocks.reset, mocks.update, mocks.verify]) mock.mockResolvedValue({ error: null });
    mocks.callback = undefined;
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    window.history.replaceState(null, "", "/");
  });

  it("does not let late OTP success rewrite a newer route or begin a stale session read", async () => {
    const old = deferred<FakeAuthResult>();
    mocks.verify.mockReturnValue(old.promise);
    showDocumentAuth(authPaths.invite);
    await waitFor(() => expect(mocks.verify).toHaveBeenCalledTimes(1));
    await visit("support");
    const sessionReads = mocks.session.mock.calls.length;
    await act(async () => old.resolve({ error: null }));
    expect(window.location.pathname + window.location.search + window.location.hash).toBe(authPaths.support);
    expect(screen.getByTestId("document-route")).toHaveTextContent(authPaths.support);
    expect(mocks.session).toHaveBeenCalledTimes(sessionReads);
  });

  it("does not erase a newer actual document callback before the router observes it", async () => {
    const old = deferred<FakeAuthResult>();
    mocks.verify.mockReturnValue(old.promise);
    showDocumentAuth(authPaths.invite);
    await waitFor(() => expect(mocks.verify).toHaveBeenCalledTimes(1));
    window.history.pushState(null, "", authPaths.nextInvite);
    await act(async () => old.resolve({ error: null }));
    expect(window.location.pathname + window.location.search).toBe(authPaths.nextInvite);
    expect(screen.queryByRole("button", { name: "Save password" })).not.toBeInTheDocument();
  });

  it("verifies a changed token on the same setup pathname instead of reusing the old success", async () => {
    showDocumentAuth(authPaths.invite);
    await screen.findByLabelText(/New password/);
    const next = deferred<FakeAuthResult>();
    mocks.verify.mockReturnValueOnce(next.promise);
    await visit("nextInvite");
    await waitFor(() => expect(mocks.verify).toHaveBeenCalledWith({ token_hash: "synthetic-invite-b", type: "invite" }));
    expect(screen.queryByRole("button", { name: "Save password" })).not.toBeInTheDocument();
    await act(async () => next.resolve({ error: new Error("New synthetic link denied") }));
    expect(await screen.findByRole("alert")).toHaveTextContent("New synthetic link denied");
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it.each(["queryError", "hashError"] as const)("denies a same-path %s callback after an earlier valid link", async destination => {
    showDocumentAuth(authPaths.invite);
    await screen.findByLabelText(/New password/);
    await visit(destination);
    expect(screen.queryByRole("button", { name: "Save password" })).not.toBeInTheDocument();
    expect(await screen.findByRole("alert")).toHaveTextContent(/expired/);
    expect(mocks.verify).toHaveBeenCalledTimes(1);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("preserves email and visibility while clearing only pathname-owned form fields and messages", async () => {
    mocks.login.mockResolvedValue({ error: new Error("Synthetic denied login") });
    showDocumentAuth(authPaths.login);
    signIn();
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    await visit("loginQuery");
    expect(screen.getByLabelText("Password")).toHaveValue("synthetic-password");
    expect(screen.getByLabelText("Password")).toHaveAttribute("type", "text");
    expect(screen.getByRole("alert")).toHaveTextContent(/couldn’t sign you in/);
    await visit("recovery");
    expect(screen.getByLabelText("Email address")).toHaveValue("fixture@example.invalid");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));
    await screen.findByText(/If an account exists/);
    await visit("login");
    expect(screen.getByLabelText("Email address")).toHaveValue("fixture@example.invalid");
    expect(screen.getByLabelText("Password")).toHaveValue("");
    expect(screen.getByLabelText("Password")).toHaveAttribute("type", "text");
    expect(screen.queryByText(/If an account exists/)).not.toBeInTheDocument();
  });

  it("keeps a new page's pending submit independent of an older recovery request", async () => {
    const old = deferred<FakeAuthResult>();
    const current = deferred<FakeAuthResult>();
    mocks.reset.mockReturnValue(old.promise);
    mocks.login.mockReturnValue(current.promise);
    showDocumentAuth(authPaths.recovery);
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "fixture@example.invalid" } });
    fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));
    await visit("login");
    expect(screen.getByRole("button", { name: /Sign in|Please wait/ })).toBeEnabled();
    signIn();
    await act(async () => old.resolve({ error: null }));
    expect(screen.getByRole("button", { name: /Please wait/ })).toBeDisabled();
    expect(screen.queryByText(/If an account exists/)).not.toBeInTheDocument();
    await act(async () => current.resolve({ error: new Error("Synthetic denied login") }));
    expect(screen.getByRole("alert")).toHaveTextContent(/couldn’t sign you in/);
  });

  it.each(["success", "error"] as const)("does not apply late recovery %s to the login page", async outcome => {
    const old = deferred<FakeAuthResult>();
    mocks.reset.mockReturnValue(old.promise);
    showDocumentAuth(authPaths.recovery);
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "fixture@example.invalid" } });
    fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));
    await visit("login");
    await act(async () => old.resolve({ error: outcome === "error" ? new Error("Old synthetic recovery error") : null }));
    expect(screen.queryByText(/If an account exists/)).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled();
  });

  it("does not refresh or navigate after a login finishes on a departed page", async () => {
    const old = deferred<FakeAuthResult>();
    mocks.login.mockReturnValue(old.promise);
    showDocumentAuth(authPaths.login);
    await waitFor(() => expect(mocks.identity).toHaveBeenCalledTimes(1));
    signIn();
    await visit("support");
    const reads = mocks.session.mock.calls.length;
    await act(async () => old.resolve({ error: null }));
    expect(window.location.pathname + window.location.search + window.location.hash).toBe(authPaths.support);
    expect(mocks.session).toHaveBeenCalledTimes(reads);
  });

  it("does not refresh or navigate after an old password update finishes", async () => {
    const old = deferred<FakeAuthResult>();
    mocks.update.mockReturnValue(old.promise);
    showDocumentAuth(authPaths.invite);
    await screen.findByLabelText(/New password/);
    savePassword();
    await visit("support");
    const reads = mocks.session.mock.calls.length;
    await act(async () => old.resolve({ error: null }));
    expect(window.location.pathname + window.location.search + window.location.hash).toBe(authPaths.support);
    expect(mocks.session).toHaveBeenCalledTimes(reads);
  });

  it("rechecks page ownership after the awaited provider refresh before navigating", async () => {
    showDocumentAuth(authPaths.login);
    await waitFor(() => expect(mocks.identity).toHaveBeenCalledTimes(1));
    const oldRefresh = deferred<null>();
    mocks.identity.mockReturnValueOnce(oldRefresh.promise);
    signIn();
    await waitFor(() => expect(mocks.identity).toHaveBeenCalledTimes(2));
    await visit("recovery");
    await act(async () => oldRefresh.resolve(null));
    expect(window.location.pathname).toBe(authPaths.recovery);
    expect(screen.getByRole("button", { name: "Send reset link" })).toBeEnabled();
  });

  it("already prevents a stale session read from enabling a different setup page", async () => {
    const oldSession = deferred<typeof fakeSession>();
    const newVerify = deferred<FakeAuthResult>();
    mocks.session.mockResolvedValueOnce(fakeSession).mockReturnValueOnce(oldSession.promise);
    mocks.verify.mockResolvedValueOnce({ error: null }).mockReturnValueOnce(newVerify.promise);
    showDocumentAuth(authPaths.invite);
    await waitFor(() => expect(mocks.session).toHaveBeenCalledTimes(2));
    await visit("nextSetup");
    await waitFor(() => expect(mocks.verify).toHaveBeenCalledTimes(2));
    await act(async () => oldSession.resolve(fakeSession));
    expect(screen.queryByRole("button", { name: "Save password" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Request a new link" })).not.toBeInTheDocument();
    await act(async () => newVerify.resolve({ error: new Error("Current synthetic setup error") }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Current synthetic setup error");
  });

  it.each([
    "/admin/reset-password?code=synthetic-pkce-code",
    "/admin/reset-password#access_token=synthetic-access&refresh_token=synthetic-refresh&expires_in=3600&token_type=bearer&type=recovery",
  ])("accepts mocked SDK-owned callback cleanup without doing a second exchange: %s", async path => {
    mocks.session.mockImplementation(async () => {
      window.history.replaceState(window.history.state, "", "/admin/reset-password");
      return fakeSession;
    });
    showDocumentAuth(path);
    expect(await screen.findByLabelText(/New password/)).toBeInTheDocument();
    expect(window.location.search + window.location.hash).toBe("");
    expect(mocks.verify).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("does not dispatch the same one-time verification twice during StrictMode setup", async () => {
    const first = deferred<FakeAuthResult>();
    mocks.verify.mockReturnValueOnce(first.promise).mockResolvedValue({ error: new Error("Synthetic token already consumed") });
    showDocumentAuth(authPaths.invite, true);
    await act(async () => first.resolve({ error: null }));
    expect(mocks.verify).toHaveBeenCalledTimes(1);
    expect(await screen.findByLabelText(/New password/)).toBeInTheDocument();
  });

  it("does not revive an old login after departure and return to the same form", async () => {
    const old = deferred<FakeAuthResult>();
    const latest = deferred<FakeAuthResult>();
    mocks.login.mockReturnValueOnce(old.promise).mockReturnValueOnce(latest.promise);
    showDocumentAuth(authPaths.login);
    await waitFor(() => expect(mocks.identity).toHaveBeenCalledTimes(1));
    signIn();
    await visit("recovery");
    await visit("login");
    expect(screen.getByLabelText("Password")).toHaveValue("");
    signIn();
    const reads = mocks.session.mock.calls.length;
    await act(async () => old.resolve({ error: null }));
    expect(window.location.pathname).toBe(authPaths.login);
    expect(mocks.session).toHaveBeenCalledTimes(reads);
    expect(screen.getByRole("button", { name: "Please wait…" })).toBeDisabled();
    await act(async () => latest.resolve({ error: new Error("Current synthetic login denial") }));
    expect(screen.getByRole("alert")).toHaveTextContent("We couldn’t sign you in. Check your email and password.");
    expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled();
  });

  it.each(["success", "error"] as const)("ignores old OTP %s while a new same-path callback owns verification", async outcome => {
    const old = deferred<FakeAuthResult>();
    const latest = deferred<FakeAuthResult>();
    mocks.verify.mockReturnValueOnce(old.promise).mockReturnValueOnce(latest.promise);
    showDocumentAuth(authPaths.invite);
    await waitFor(() => expect(mocks.verify).toHaveBeenCalledTimes(1));
    await visit("nextInvite");
    expect(mocks.verify).toHaveBeenCalledTimes(2);
    expect(mocks.verify).toHaveBeenLastCalledWith({ token_hash: "synthetic-invite-b", type: "invite" });
    const reads = mocks.session.mock.calls.length;
    await act(async () => old.resolve({ error: outcome === "error" ? new Error("Obsolete synthetic OTP error") : null }));
    expect(window.location.pathname + window.location.search).toBe(authPaths.nextInvite);
    expect(mocks.session).toHaveBeenCalledTimes(reads);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save password" })).not.toBeInTheDocument();
    await act(async () => latest.resolve({ error: new Error("Current synthetic OTP error") }));
    expect(screen.getByRole("alert")).toHaveTextContent("Current synthetic OTP error");
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("does not let a previous setup submit complete into a new callback", async () => {
    const old = deferred<FakeAuthResult>();
    mocks.update.mockReturnValueOnce(old.promise);
    showDocumentAuth(authPaths.invite);
    await screen.findByLabelText(/New password/);
    savePassword();
    const latest = deferred<FakeAuthResult>();
    mocks.verify.mockReturnValueOnce(latest.promise);
    await visit("nextInvite");
    const reads = mocks.session.mock.calls.length;
    await act(async () => old.resolve({ error: null }));
    expect(window.location.pathname + window.location.search).toBe(authPaths.nextInvite);
    expect(mocks.session).toHaveBeenCalledTimes(reads);
    expect(screen.queryByRole("button", { name: "Save password" })).not.toBeInTheDocument();
    await act(async () => latest.resolve({ error: null }));
    expect(await screen.findByLabelText(/New password/)).toHaveValue("synthetic-password");
    expect(screen.getByLabelText("Confirm password")).toHaveValue("synthetic-password");
    expect(screen.getByRole("button", { name: "Save password" })).toBeEnabled();
    expect(mocks.update).toHaveBeenCalledTimes(1);
  });

  it("handles a native SDK-style hash removal notification without replaying OTP or clearing drafts", async () => {
    showDocumentAuth("/admin/reset-password?view=synthetic#access_token=synthetic-access&refresh_token=synthetic-refresh&expires_in=3600&token_type=bearer&type=recovery");
    await screen.findByLabelText(/New password/);
    fireEvent.change(screen.getByLabelText(/New password/), { target: { value: "synthetic-password" } });
    fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "synthetic-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    const reads = mocks.session.mock.calls.length;
    // Assignment emits the native hash/popstate notification used by BrowserRouter.
    await act(async () => { window.location.hash = ""; });
    await waitFor(() => expect(screen.getByTestId("document-route").textContent).toBe("/admin/reset-password?view=synthetic"));
    expect(await screen.findByLabelText(/New password/)).toHaveValue("synthetic-password");
    expect(screen.getByLabelText(/New password/)).toHaveAttribute("type", "text");
    expect(screen.getByLabelText("Confirm password")).toHaveValue("synthetic-password");
    expect(screen.getByRole("button", { name: "Save password" })).toBeEnabled();
    expect(mocks.session).toHaveBeenCalledTimes(reads + 1);
    expect(mocks.verify).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("keeps a same-path noncallback navigation owned by the pending login", async () => {
    const pending = deferred<FakeAuthResult>();
    mocks.login.mockReturnValueOnce(pending.promise);
    showDocumentAuth(authPaths.login);
    signIn();
    await visit("loginQuery");
    expect(screen.getByLabelText("Password")).toHaveValue("synthetic-password");
    expect(screen.getByRole("button", { name: "Please wait…" })).toBeDisabled();
    fireEvent.submit(screen.getByLabelText("Password").closest("form")!);
    expect(mocks.login).toHaveBeenCalledTimes(1);
    await act(async () => pending.resolve({ error: new Error("Synthetic login error") }));
    expect(screen.getByRole("alert")).toHaveTextContent("We couldn’t sign you in. Check your email and password.");
    expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled();
  });

  it.each(["login", "invite"] as const)("preserves the current successful %s navigation contract", async page => {
    showDocumentAuth(authPaths[page]);
    await waitFor(() => expect(mocks.identity).toHaveBeenCalledTimes(1));
    if (page === "invite") {
      await screen.findByLabelText(/New password/);
      savePassword();
      expect(mocks.update).toHaveBeenCalledWith({ password: "synthetic-password" });
    } else {
      signIn();
      expect(mocks.login).toHaveBeenCalledWith({ email: "fixture@example.invalid", password: "synthetic-password" });
    }
    expect(await screen.findByRole("heading", { name: "Fixture home" })).toBeInTheDocument();
    expect(mocks.identity).toHaveBeenCalledTimes(2);
  });

  it("retains a current rejected recovery error and ignores a rejected obsolete request", async () => {
    let rejectOld!: (error: Error) => void;
    mocks.reset.mockReturnValueOnce(new Promise<FakeAuthResult>((_, reject) => { rejectOld = reject; }));
    showDocumentAuth(authPaths.recovery);
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "fixture@example.invalid" } });
    fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));
    await visit("login");
    await visit("recovery");
    mocks.reset.mockRejectedValueOnce(new Error("Current synthetic recovery error"));
    fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Current synthetic recovery error");
    await act(async () => rejectOld(new Error("Obsolete synthetic recovery error")));
    expect(screen.getByRole("alert")).toHaveTextContent("Current synthetic recovery error");
    expect(screen.getByRole("button", { name: "Send reset link" })).toBeEnabled();
  });
});

describe.each([false, true])("provider request lifetime (StrictMode %s)", strict => {
  beforeEach(() => {
    for (const mock of [mocks.session, mocks.identity, mocks.signOut, mocks.unsubscribe]) mock.mockReset();
    mocks.callback = undefined;
    mocks.session.mockResolvedValue(fakeSession);
    mocks.identity.mockResolvedValue({ id: "owner", name: "Owner", email: "owner@example.com", role: "Owner" });
    mocks.signOut.mockResolvedValue({ error: null });
  });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  function showProvider() {
    const view = renderHook(() => useAdmin(), {
      reactStrictMode: strict,
      wrapper: ({ children }) => <AdminProvider>{children}</AdminProvider>,
    });
    expect(mocks.callback).toBeTypeOf("function");
    return view;
  }

  it("does not dispatch identity when a session resolves after unmount", async () => {
    const session = deferred<typeof fakeSession>();
    mocks.session.mockReturnValue(session.promise);
    const view = showProvider();
    await waitFor(() => expect(mocks.session).toHaveBeenCalledTimes(1));
    expect(mocks.identity).not.toHaveBeenCalled();
    view.unmount();
    expect(mocks.unsubscribe).toHaveBeenCalledTimes(strict ? 2 : 1);
    await act(async () => session.resolve(fakeSession));
    expect(mocks.session).toHaveBeenCalledTimes(1);
    expect(mocks.identity).not.toHaveBeenCalled();
  });

  it("does not run an auth refresh queued before unmount", async () => {
    const view = showProvider();
    await waitFor(() => expect(view.result.current.identity?.id).toBe("owner"));
    const reads = mocks.session.mock.calls.length;
    const identities = mocks.identity.mock.calls.length;
    act(() => {
      mocks.callback?.("TOKEN_REFRESHED", fakeSession.data.session);
      view.unmount();
    });
    await act(async () => {});
    expect(mocks.unsubscribe).toHaveBeenCalledTimes(strict ? 2 : 1);
    expect(mocks.session).toHaveBeenCalledTimes(reads);
    expect(mocks.identity).toHaveBeenCalledTimes(identities);
  });

  it("does not dispatch identity for a session invalidated by SIGNED_OUT", async () => {
    const session = deferred<typeof fakeSession>();
    mocks.session.mockReturnValue(session.promise);
    const view = showProvider();
    act(() => mocks.callback?.("SIGNED_OUT", null));
    expect(view.result.current.identity).toBeNull();
    expect(view.result.current.loading).toBe(false);
    await act(async () => session.resolve(fakeSession));
    expect(mocks.identity).not.toHaveBeenCalled();
    expect(view.result.current.identity).toBeNull();
    expect(view.result.current.loading).toBe(false);
    expect(view.result.current.error).toBe("");
  });

  it("does not reopen loading from a refresh queued before SIGNED_OUT", async () => {
    const view = showProvider();
    await waitFor(() => expect(view.result.current.identity?.id).toBe("owner"));
    const session = deferred<{ data: { session: null }; error: null }>();
    mocks.session.mockReturnValue(session.promise);
    const reads = mocks.session.mock.calls.length;
    const identities = mocks.identity.mock.calls.length;
    act(() => {
      mocks.callback?.("TOKEN_REFRESHED", fakeSession.data.session);
      mocks.callback?.("SIGNED_OUT", null);
    });
    expect(view.result.current.loading).toBe(false);
    await act(async () => {});
    const loadingAfterQueuedWork = view.result.current.loading;
    await act(async () => session.resolve({ data: { session: null }, error: null }));
    expect(loadingAfterQueuedWork).toBe(false);
    expect(mocks.session).toHaveBeenCalledTimes(reads);
    expect(mocks.identity).toHaveBeenCalledTimes(identities);
    expect(view.result.current.identity).toBeNull();
    expect(view.result.current.error).toBe("");
  });

  it.each([false, true])("coalesces an A-B-A burst without losing the latest session (sign-out boundaries %s)", async signOutBetween => {
    const view = showProvider();
    await waitFor(() => expect(view.result.current.identity?.id).toBe("owner"));
    const reads = mocks.session.mock.calls.length;
    const identities = mocks.identity.mock.calls.length;
    let currentId = "owner";
    mocks.session.mockImplementation(async () => ({ data: { session: { user: { id: currentId } } }, error: null }));
    mocks.identity.mockImplementation(async () => ({
      id: currentId, role: currentId === "owner" ? "Owner" : "Admin",
      name: currentId, email: "synthetic@example.invalid",
    }));
    act(() => {
      for (const id of ["owner", "second", "owner"]) {
        if (signOutBetween) mocks.callback?.("SIGNED_OUT", null);
        currentId = id;
        mocks.callback?.("SIGNED_IN", { user: { id } });
      }
    });
    await act(async () => {});
    expect(mocks.session).toHaveBeenCalledTimes(reads + 1);
    expect(mocks.identity).toHaveBeenCalledTimes(identities + 1);
    expect(view.result.current.identity?.id).toBe("owner");
    expect(view.result.current.identity?.role).toBe("Owner");
    expect(view.result.current.loading).toBe(false);
    expect(view.result.current.error).toBe("");
    await act(async () => {
      currentId = "second";
      mocks.callback?.("SIGNED_IN", { user: { id: currentId } });
    });
    expect(mocks.session).toHaveBeenCalledTimes(reads + 2);
    expect(mocks.identity).toHaveBeenCalledTimes(identities + 2);
    expect(view.result.current.identity?.id).toBe("second");
    expect(view.result.current.identity?.role).toBe("Admin");
    expect(view.result.current.loading).toBe(false);
  });

  it("keeps a valid background refresh quiet, reports its session error, and permits retry", async () => {
    const view = showProvider();
    await waitFor(() => expect(view.result.current.identity?.id).toBe("owner"));
    const session = deferred<{ data: { session: null }; error: Error }>();
    mocks.session.mockReturnValueOnce(session.promise);
    const reads = mocks.session.mock.calls.length;
    const identities = mocks.identity.mock.calls.length;
    await act(async () => mocks.callback?.("TOKEN_REFRESHED", fakeSession.data.session));
    expect(mocks.session).toHaveBeenCalledTimes(reads + 1);
    expect(view.result.current.identity?.id).toBe("owner");
    expect(view.result.current.loading).toBe(false);
    await act(async () => session.resolve({ data: { session: null }, error: new Error("Current synthetic session failure") }));
    expect(view.result.current.identity).toBeNull();
    expect(view.result.current.loading).toBe(false);
    expect(view.result.current.error).toBe("Current synthetic session failure");
    expect(mocks.identity).toHaveBeenCalledTimes(identities);
    await act(async () => view.result.current.refresh());
    expect(mocks.session).toHaveBeenCalledTimes(reads + 2);
    expect(mocks.identity).toHaveBeenCalledTimes(identities + 1);
    expect(view.result.current.identity?.id).toBe("owner");
    expect(view.result.current.error).toBe("");
    expect(view.result.current.loading).toBe(false);
  });

  it("preserves sign-out error rejection without running an older queued refresh", async () => {
    const view = showProvider();
    await waitFor(() => expect(view.result.current.identity?.id).toBe("owner"));
    const reads = mocks.session.mock.calls.length;
    const identities = mocks.identity.mock.calls.length;
    const failure = new Error("Synthetic sign-out failure");
    mocks.signOut.mockResolvedValueOnce({ error: failure });
    await act(async () => {
      mocks.callback?.("TOKEN_REFRESHED", fakeSession.data.session);
      await expect(view.result.current.signOut()).rejects.toSatisfy((error: Error) =>
        error.cause === failure &&
        error.message === "Unable to sign out. Your session may still be active. Retry sign out.",
      );
    });
    expect(mocks.signOut).toHaveBeenCalledTimes(1);
    expect(mocks.session).toHaveBeenCalledTimes(reads);
    expect(mocks.identity).toHaveBeenCalledTimes(identities);
    expect(screen.getByRole("heading", { name: "Sign-out incomplete" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry sign out" })).toBeEnabled();
  });
});
