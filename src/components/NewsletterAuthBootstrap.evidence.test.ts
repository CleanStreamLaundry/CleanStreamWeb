import { createElement } from "react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import App from "../App";

const boundary = vi.hoisted(() => {
  let releasePayment!: () => void;
  const paymentReady = new Promise<void>((resolve) => { releasePayment = resolve; });
  return {
    payment: vi.fn(), admin: vi.fn(), preview: vi.fn(), supabase: vi.fn(), sdk: vi.fn(),
    paymentReady, releasePayment, allowPayment: false,
  };
});

// Factories, not rendered-component spies: eager evaluation must fail even if
// the wrong page never mounts. Do not clear these calls after importing App.
vi.mock("./CortinaPayPage", async () => {
  boundary.payment();
  if (!boundary.allowPayment) throw new Error("Payment module evaluated before payment navigation");
  await boundary.paymentReady;
  return { default: () => createElement("h1", null, "Payment lazy boundary") };
});
vi.mock("../admin/AdminApp", () => {
  boundary.admin();
  return {
    AdminAuth: () => createElement("h1", null, "Admin auth lazy boundary"),
    AdminWorkspace: () => createElement("h1", null, "Admin workspace lazy boundary"),
  };
});
vi.mock("../admin/Preview", () => {
  boundary.preview();
  return { default: () => createElement("h1", null, "Admin preview lazy boundary") };
});
vi.mock("../supabase/client", () => {
  boundary.supabase();
  throw new Error("Public bootstrap imported the Auth singleton");
});
vi.mock("@supabase/supabase-js", () => {
  boundary.sdk();
  throw new Error("Public bootstrap imported the Supabase SDK");
});

afterEach(() => {
  cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs();
  window.history.replaceState({}, "", "/");
});

it("actual App keeps newsletter bootstrap Auth-free and loads payment/Admin only on their routes", async () => {
  const requests = vi.fn<typeof fetch>().mockRejectedValue(new Error("Unexpected network request"));
  const storage = {
    getItem: vi.fn(() => JSON.stringify({ access_token: "synthetic-expired", refresh_token: "synthetic-refresh", expires_at: 1 })),
    setItem: vi.fn(), removeItem: vi.fn(),
  };
  vi.stubGlobal("fetch", requests); vi.stubGlobal("localStorage", storage);
  vi.stubEnv("VITE_SUPABASE_URL", "https://newsletter-fixture.invalid");
  vi.stubEnv("VITE_ANON_KEY", "public-test-key");
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  const publicBoundaries = () => {
    expect(boundary.payment).not.toHaveBeenCalled();
    expect(boundary.admin).not.toHaveBeenCalled();
    expect(boundary.preview).not.toHaveBeenCalled();
  };
  const noAuthOrTraffic = () => {
    expect(boundary.supabase).not.toHaveBeenCalled(); expect(boundary.sdk).not.toHaveBeenCalled();
    expect(storage.getItem).not.toHaveBeenCalled(); expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.removeItem).not.toHaveBeenCalled(); expect(requests).not.toHaveBeenCalled();
  };
  const navigate = (path: string) => act(() => {
    window.history.pushState({}, "", path);
    window.dispatchEvent(new PopStateEvent("popstate", { state: window.history.state }));
  });

  publicBoundaries(); noAuthOrTraffic();
  window.history.replaceState({}, "", `/newsletter#action=confirm&token=${"a".repeat(64)}`);
  render(createElement(App));
  expect(screen.getByRole("button", { name: "Confirm subscription" })).toBeEnabled();
  expect(window.location.hash).toBe("");
  await act(async () => { await Promise.resolve(); });
  publicBoundaries(); noAuthOrTraffic();
  navigate("/support");
  expect(screen.getByRole("heading", { name: "Clean Stream support" })).toBeInTheDocument();
  publicBoundaries(); noAuthOrTraffic();

  boundary.allowPayment = true;
  navigate("/pay?machine=synthetic-machine");
  expect(await screen.findByText("Loading checkout...")).toBeInTheDocument();
  expect(screen.queryByText("Loading your workspace…")).not.toBeInTheDocument();
  await waitFor(() => expect(boundary.payment).toHaveBeenCalledTimes(1));
  expect(boundary.admin).not.toHaveBeenCalled(); expect(boundary.preview).not.toHaveBeenCalled();
  await act(async () => { boundary.releasePayment(); });
  expect(await screen.findByRole("heading", { name: "Payment lazy boundary" })).toBeInTheDocument();
  noAuthOrTraffic();

  navigate("/admin/login");
  expect(await screen.findByRole("heading", { name: "Admin auth lazy boundary" })).toBeInTheDocument();
  expect(boundary.admin).toHaveBeenCalledTimes(1); expect(boundary.preview).not.toHaveBeenCalled();
  navigate("/home");
  expect(await screen.findByRole("heading", { name: "Admin workspace lazy boundary" })).toBeInTheDocument();
  expect(boundary.admin).toHaveBeenCalledTimes(1);
  navigate("/admin/preview");
  expect(await screen.findByRole("heading", { name: "Admin preview lazy boundary" })).toBeInTheDocument();
  expect(boundary.preview).toHaveBeenCalledTimes(1); noAuthOrTraffic();
});
