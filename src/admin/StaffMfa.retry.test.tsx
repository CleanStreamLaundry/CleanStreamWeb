import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AdminProvider } from "./AdminProvider";
import { AdminAdmissionError, type StaffMfaStep } from "./admission";

// Composition regression: real Provider, StaffMfa, and MFA transport. Only the
// SDK session boundary, backend admission, HTTP and bitmap generation are faked.
const mocks = vi.hoisted(() => ({
  session: vi.fn(), identity: vi.fn(), refreshBound: vi.fn(), qr: vi.fn(),
  listeners: new Set<(event: string) => void>(),
}));
vi.mock("../supabase/client", () => ({ getSupabaseClient: () => ({ auth: {
  getSession: mocks.session,
  supportsSessionBoundRefresh: () => true,
  refreshSessionIfCurrent: mocks.refreshBound,
  onAuthStateChange: (callback: (event: string) => void) => {
    mocks.listeners.add(callback);
    return { data: { subscription: { unsubscribe: () => { mocks.listeners.delete(callback); } } } };
  },
} }) }));
vi.mock("./api", () => ({ adminApi: { identity: mocks.identity } }));
vi.mock("qrcode", () => ({ default: { toDataURL: mocks.qr } }));
const origin = "https://staff-retry.invalid";
const session = { access_token: "captured-A", refresh_token: "synthetic", token_type: "bearer", expires_in: 3600,
  user: { id: "A", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" } };
let step: StaffMfaStep;
let failFirstRead: boolean;
const factorReads: string[] = [];
const fakeHttp: typeof fetch = async (input, init) => {
  const url = new URL(String(input));
  if (url.origin !== origin) throw new Error("Unexpected network destination");
  expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer captured-A");
  if (url.pathname === "/auth/v1/user") {
    factorReads.push(url.pathname);
    if (failFirstRead && factorReads.length === 1) return Response.json({ error: "temporary" }, { status: 503 });
    return Response.json({ id: "A", factors: step === "enroll_totp" ? [] : [
      { id: "verified-A", factor_type: "totp", status: "verified", friendly_name: "Phone" },
    ] });
  }
  if (url.pathname === "/auth/v1/factors") return Response.json({ id: "enrolled-A", totp: {
    secret: "synthetic-secret", uri: "otpauth://totp/test?secret=synthetic",
  } });
  throw new Error(`Unexpected fake HTTP route: ${url.pathname}`);
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.listeners.clear();
  mocks.session.mockResolvedValue({ data: { session }, error: null });
  mocks.qr.mockResolvedValue("data:image/png;base64,c3ludGhldGlj");
  factorReads.length = 0;
  failFirstRead = false;
  vi.stubGlobal("fetch", fakeHttp);
  vi.stubEnv("VITE_SUPABASE_URL", origin);
  vi.stubEnv("VITE_ANON_KEY", "synthetic-public-key");
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
function mount(next: StaffMfaStep) {
  step = next;
  mocks.identity.mockImplementation(async () => { throw new AdminAdmissionError("MFA required", step, step); });
  render(<MemoryRouter><AdminProvider><p>Workspace child</p></AdminProvider></MemoryRouter>);
}
it.each(["enroll_totp", "challenge_totp"] as const)("retries failed factors under unchanged %s admission", async (next) => {
  failFirstRead = true;
  mount(next);
  expect(await screen.findByRole("alert")).toHaveTextContent("Unable to load your authenticators");
  expect(factorReads).toHaveLength(1);
  expect(screen.queryByText("Workspace child")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Retry access check" }));
  await waitFor(() => expect(mocks.identity).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(factorReads).toHaveLength(2));
  if (next === "enroll_totp") expect(await screen.findByRole("button", { name: "Set up authenticator" })).toBeEnabled();
  else expect(await screen.findByLabelText("Authenticator code")).toBeEnabled();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.queryByText("Workspace child")).not.toBeInTheDocument();
});
it.each(["enroll_totp", "challenge_totp"] as const)("retains the %s draft on background refresh and access retry", async (next) => {
  mount(next);
  if (next === "enroll_totp") {
    fireEvent.click(await screen.findByRole("button", { name: "Set up authenticator" }));
    expect(await screen.findByLabelText("Setup key")).toHaveValue("synthetic-secret");
  }
  const input = await screen.findByLabelText("Authenticator code");
  fireEvent.change(input, { target: { value: "123" } });
  await act(async () => {
    for (const callback of Array.from(mocks.listeners)) callback("TOKEN_REFRESHED");
  });
  await waitFor(() => expect(mocks.identity).toHaveBeenCalledTimes(2));
  expect(screen.getByLabelText("Authenticator code")).toBe(input);
  expect(input).toHaveValue("123");
  fireEvent.click(screen.getByRole("button", { name: "Retry access check" }));
  await waitFor(() => expect(mocks.identity).toHaveBeenCalledTimes(3));
  expect(screen.getByLabelText("Authenticator code")).toBe(input);
  expect(input).toHaveValue("123");
  expect(factorReads).toHaveLength(1);
  if (next === "enroll_totp") {
    expect(screen.getByLabelText("Setup key")).toHaveValue("synthetic-secret");
    expect(screen.getByRole("img", { name: "Authenticator setup QR code" })).toBeInTheDocument();
  }
});
