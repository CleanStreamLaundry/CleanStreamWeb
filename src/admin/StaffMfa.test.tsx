import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Link, MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { StaffMfaAdmission } from "./admission";
import type { TotpFactor } from "./mfa";
import StaffMfaBoundary from "./StaffMfa";

const mocks = vi.hoisted(() => ({ attempt: vi.fn(), qr: vi.fn() }));
vi.mock("./mfa", () => ({ staffMfaAttempt: mocks.attempt }));
vi.mock("qrcode", () => ({ default: { toDataURL: mocks.qr } }));
vi.mock("../supabase/client", () => ({ getSupabaseClient: () => ({}) }));
const enrollment = { id: "new-factor", secret: "synthetic-secret", uri: "otpauth://totp/test?secret=synthetic" };
function attempt() {
  let active = true;
  return {
    current: () => active,
    close: vi.fn(() => { active = false; }),
    supported: vi.fn(() => true),
    factors: vi.fn<() => Promise<TotpFactor[]>>().mockResolvedValue([]),
    enroll: vi.fn().mockResolvedValue(enrollment),
    verify: vi.fn<(id: string, code: string) => Promise<void>>().mockResolvedValue(undefined),
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
function admission(step: StaffMfaAdmission["step"] = "enroll_totp", token = "A"): StaffMfaAdmission {
  return { step, session: { access_token: token, refresh_token: "synthetic", expires_in: 3600,
    token_type: "bearer", user: { id: token, aud: "authenticated", app_metadata: {},
      user_metadata: {}, created_at: "2026-01-01T00:00:00Z" } } };
}
const refresh = vi.fn<() => Promise<void>>();
const signOut = vi.fn<() => Promise<void>>();
function view(value = admission(), path = "/admin") {
  return <MemoryRouter initialEntries={[path]}>
    <Link to="/admin/elsewhere">Leave</Link>
    <StaffMfaBoundary admission={value} refresh={refresh} signOut={signOut}>
      <p>Protected or recovery child</p>
    </StaffMfaBoundary>
  </MemoryRouter>;
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.attempt.mockImplementation(attempt);
  mocks.qr.mockResolvedValue("data:image/png;base64,c3ludGhldGlj");
  refresh.mockResolvedValue(undefined);
  signOut.mockResolvedValue(undefined);
});
afterEach(cleanup);

it("withholds workspace and mutation controls while loading, then displays factor-load failure", async () => {
  const run = attempt();
  const pending = deferred<TotpFactor[]>();
  run.factors.mockReturnValue(pending.promise);
  mocks.attempt.mockReturnValueOnce(run);
  render(view());
  expect(screen.queryByText("Protected or recovery child")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Set up authenticator" })).not.toBeInTheDocument();
  await act(async () => { pending.reject(new Error("unavailable")); });
  expect(await screen.findByRole("alert")).toHaveTextContent("Unable to load your authenticators");
  expect(screen.getByRole("button", { name: "Retry access check" })).toBeEnabled();
});
it("keeps retry, sign-out and recovery available on unsupported clients without mutation controls", async () => {
  const run = attempt();
  run.supported.mockReturnValue(false);
  mocks.attempt.mockReturnValueOnce(run);
  render(view());
  expect(await screen.findByRole("alert")).toHaveTextContent("portal version or browser");
  expect(screen.queryByRole("button", { name: "Set up authenticator" })).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Authenticator code")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Retry access check" }));
  await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
  fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
  expect(signOut).toHaveBeenCalledOnce();
  expect(screen.getByRole("link", { name: "Account recovery support" })).toHaveAttribute("href", "/support");
  expect(run.enroll).not.toHaveBeenCalled();
  expect(run.verify).not.toHaveBeenCalled();
});
it("shows recovery guidance when challenge admission has no verified factor", async () => {
  render(view(admission("challenge_totp")));
  expect(await screen.findByRole("alert")).toHaveTextContent("No verified authenticator");
  expect(screen.queryByLabelText("Authenticator code")).not.toBeInTheDocument();
});
it("renders enrollment QR/key, bounds code entry, blocks duplicate submit and rechecks admission after success", async () => {
  const run = attempt();
  const verified = deferred<void>();
  run.verify.mockReturnValue(verified.promise);
  mocks.attempt.mockReturnValueOnce(run);
  render(view());
  fireEvent.click(await screen.findByRole("button", { name: "Set up authenticator" }));
  expect(await screen.findByLabelText("Setup key")).toHaveValue(enrollment.secret);
  expect(screen.getByRole("img", { name: "Authenticator setup QR code" })).toHaveAttribute("src", "data:image/png;base64,c3ludGhldGlj");
  expect(mocks.qr).toHaveBeenCalledWith(enrollment.uri, { width: 240, margin: 2 });
  const input = screen.getByLabelText("Authenticator code");
  expect(screen.getByRole("button", { name: "Verify" })).toBeDisabled();
  fireEvent.change(input, { target: { value: "12a34567" } });
  expect(input).toHaveValue("123456");
  fireEvent.click(screen.getByRole("button", { name: "Verify" }));
  fireEvent.submit(input.closest("form")!);
  expect(run.verify).toHaveBeenCalledExactlyOnceWith("new-factor", "123456");
  expect(screen.getByRole("button", { name: "Verifying..." })).toBeDisabled();
  expect(input).toBeDisabled();
  expect(refresh).not.toHaveBeenCalled();
  await act(async () => { verified.resolve(undefined); });
  expect(refresh).toHaveBeenCalledOnce();
  expect(screen.queryByLabelText("Setup key")).not.toBeInTheDocument();
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
});
it("selects a verified factor, clears its previous code and preserves retry after verification failure", async () => {
  const run = attempt();
  run.factors.mockResolvedValue([{ id: "one", friendly_name: "Phone" }, { id: "two", friendly_name: "Backup" }]);
  run.verify.mockRejectedValue(new Error("Check your code and try again."));
  mocks.attempt.mockReturnValueOnce(run);
  render(view(admission("challenge_totp")));
  const input = await screen.findByLabelText("Authenticator code");
  fireEvent.change(input, { target: { value: "111111" } });
  fireEvent.change(screen.getByLabelText("Authenticator"), { target: { value: "two" } });
  expect(input).toHaveValue("");
  fireEvent.change(input, { target: { value: "222222" } });
  fireEvent.click(screen.getByRole("button", { name: "Verify" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Check your code");
  expect(run.verify).toHaveBeenCalledExactlyOnceWith("two", "222222");
  expect(screen.getByRole("button", { name: "Verify" })).toBeEnabled();
  expect(refresh).not.toHaveBeenCalled();
});
it("discards a late enrollment result after route departure", async () => {
  const run = attempt();
  const pending = deferred<typeof enrollment>();
  run.enroll.mockReturnValue(pending.promise);
  mocks.attempt.mockReturnValueOnce(run);
  render(view());
  fireEvent.click(await screen.findByRole("button", { name: "Set up authenticator" }));
  fireEvent.click(screen.getByRole("link", { name: "Leave" }));
  expect(run.close).toHaveBeenCalledOnce();
  await act(async () => { pending.resolve(enrollment); });
  expect(screen.queryByLabelText("Setup key")).not.toBeInTheDocument();
  expect(mocks.qr).not.toHaveBeenCalled();
  expect(refresh).not.toHaveBeenCalled();
});
it.each(["forgot-password", "reset-password", "accept-invite"])("preserves the %s recovery/setup route", (path) => {
  render(view(admission(), `/admin/${path}`));
  expect(screen.getByText("Protected or recovery child")).toBeInTheDocument();
  expect(mocks.attempt).not.toHaveBeenCalled();
});
it("clears enrollment secrets when the captured account token changes", async () => {
  const run = attempt();
  mocks.attempt.mockReturnValueOnce(run);
  const rendered = render(view());
  fireEvent.click(await screen.findByRole("button", { name: "Set up authenticator" }));
  expect(await screen.findByLabelText("Setup key")).toHaveValue(enrollment.secret);
  rendered.rerender(view(admission("enroll_totp", "B")));
  expect(run.close).toHaveBeenCalledOnce();
  expect(screen.queryByLabelText("Setup key")).not.toBeInTheDocument();
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
  await screen.findByRole("button", { name: "Set up authenticator" });
});

it("keeps manual setup and verification usable after local QR generation fails", async () => {
  const run = attempt();
  mocks.attempt.mockReturnValueOnce(run);
  mocks.qr.mockRejectedValueOnce(new Error("local bitmap unavailable"));
  render(view());
  fireEvent.click(await screen.findByRole("button", { name: "Set up authenticator" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Enter the setup key in your authenticator");
  expect(screen.getByLabelText("Setup key")).toHaveValue(enrollment.secret);
  expect(screen.getByLabelText("Setup key")).toHaveAttribute("readonly");
  expect(screen.queryByRole("img", { name: "Authenticator setup QR code" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Set up authenticator" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Retry access check" }));
  await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
  expect(screen.getByLabelText("Setup key")).toHaveValue(enrollment.secret);
  const code = screen.getByLabelText("Authenticator code");
  await waitFor(() => expect(code).toBeEnabled());
  fireEvent.change(code, { target: { value: "123456" } });
  fireEvent.click(screen.getByRole("button", { name: "Verify" }));
  await waitFor(() => expect(refresh).toHaveBeenCalledTimes(2));
  expect(run.verify).toHaveBeenCalledExactlyOnceWith(enrollment.id, "123456");
  expect(run.enroll).toHaveBeenCalledOnce();
  expect(mocks.qr).toHaveBeenCalledOnce();
  expect(screen.queryByLabelText("Setup key")).not.toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
it("clears a manual setup key on departure while local QR generation is pending", async () => {
  const run = attempt();
  const bitmap = deferred<string>();
  mocks.attempt.mockReturnValueOnce(run);
  mocks.qr.mockReturnValueOnce(bitmap.promise);
  render(view());
  fireEvent.click(await screen.findByRole("button", { name: "Set up authenticator" }));
  expect(await screen.findByLabelText("Setup key")).toHaveValue(enrollment.secret);
  fireEvent.click(screen.getByRole("link", { name: "Leave" }));
  expect(run.close).toHaveBeenCalledOnce();
  await act(async () => { bitmap.reject(new Error("late bitmap failure")); });
  expect(screen.queryByLabelText("Setup key")).not.toBeInTheDocument();
  expect(screen.queryByRole("img", { name: "Authenticator setup QR code" })).not.toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(run.verify).not.toHaveBeenCalled();
  expect(refresh).not.toHaveBeenCalled();
});
it("does not restore the setup key or QR image after account replacement during generation", async () => {
  const run = attempt();
  const bitmap = deferred<string>();
  mocks.attempt.mockReturnValueOnce(run);
  mocks.qr.mockReturnValueOnce(bitmap.promise);
  const rendered = render(view());
  fireEvent.click(await screen.findByRole("button", { name: "Set up authenticator" }));
  expect(await screen.findByLabelText("Setup key")).toHaveValue(enrollment.secret);
  rendered.rerender(view(admission("enroll_totp", "B")));
  await act(async () => { bitmap.resolve("data:image/png;base64,c3ludGhldGlj"); });
  expect(run.close).toHaveBeenCalledOnce();
  expect(screen.queryByLabelText("Setup key")).not.toBeInTheDocument();
  expect(screen.queryByRole("img", { name: "Authenticator setup QR code" })).not.toBeInTheDocument();
  expect(run.verify).not.toHaveBeenCalled();
  expect(refresh).not.toHaveBeenCalled();
});
