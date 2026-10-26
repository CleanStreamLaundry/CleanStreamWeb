import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AdminWorkspace } from "./AdminApp";
import { adminApi } from "./api";
import type { Identity } from "./types";

const mock = vi.hoisted(() => ({
  identity: vi.fn(), overview: vi.fn(), getSession: vi.fn(),
  inspect: vi.fn(), recover: vi.fn(), unsubscribe: vi.fn(), fetch: vi.fn(),
}));
vi.mock("./api", async (original) => ({
  ...await original<typeof import("./api")>(),
  adminApi: { identity: mock.identity, overview: mock.overview },
  customerMfaRecoveryApi: { inspect: mock.inspect, recover: mock.recover },
}));
vi.mock("../supabase/client", () => ({
  getSupabaseClient: () => ({ auth: {
    getSession: mock.getSession,
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: mock.unsubscribe } } }),
  } }),
}));

const owner: Identity = {
  id: "11111111-1111-4111-8111-111111111111", role: "Owner",
  name: "Synthetic Owner", email: "owner@example.invalid",
};

beforeEach(() => {
  vi.clearAllMocks();
  mock.identity.mockResolvedValue(owner);
  mock.getSession.mockResolvedValue({ data: { session: {
    access_token: "synthetic-owner-token", user: { id: owner.id },
  } }, error: null });
  mock.overview.mockResolvedValue({
    today: 0, total: 0, daily: [], hourly: [], pendingCredits: 0,
    openMaintenance: 0, locations: 0, machines: 0,
    updatedAt: "2026-09-30T12:00:00Z", financialScope: "Synthetic fixture",
  });
  mock.fetch.mockRejectedValue(new Error("Unexpected HTTP in offline route fixture"));
  vi.stubGlobal("fetch", mock.fetch);
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({
    matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn(),
  }));
});

afterEach(() => {
  cleanup();
  expect(mock.inspect).not.toHaveBeenCalled();
  expect(mock.recover).not.toHaveBeenCalled();
  expect(mock.fetch).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});

function show(preview = false) {
  const base = preview ? "/admin/preview" : "/home";
  render(<MemoryRouter initialEntries={[`${base}/account-recovery`]}>
    <Routes><Route path={`${base}/*`} element={<AdminWorkspace
      {...(preview ? { fixture: { api: adminApi, identity: owner } } : {})}
    />} /></Routes>
  </MemoryRouter>);
}

it("admits a verified Owner to the real recovery route and navigation without dispatch", async () => {
  show();
  expect(await screen.findByRole("heading", { name: "Account Recovery", level: 1 })).toBeInTheDocument();
  expect(screen.getByLabelText("Customer UUID")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Inspect customer" })).toBeDisabled();
  expect(screen.getByRole("link", { name: "Account Recovery" })).toHaveAttribute("href", "/home/account-recovery");
  expect(mock.identity).toHaveBeenCalledOnce();
  expect(mock.overview).not.toHaveBeenCalled();
});

it("denies an admitted Admin direct recovery access and hides its navigation", async () => {
  mock.identity.mockResolvedValue({ ...owner, role: "Admin" });
  show();
  expect(await screen.findByRole("heading", { name: "Overview", level: 1 })).toBeInTheDocument();
  expect(screen.queryByLabelText("Customer UUID")).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Account Recovery" })).not.toBeInTheDocument();
});

it("denies a customer identity before mounting the recovery workspace", async () => {
  mock.identity.mockResolvedValue({ ...owner, role: "User" });
  show();
  expect(await screen.findByRole("heading", { name: "Workspace access unavailable" })).toBeInTheDocument();
  expect(screen.queryByLabelText("Customer UUID")).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Account Recovery" })).not.toBeInTheDocument();
  expect(mock.overview).not.toHaveBeenCalled();
});

it("denies even the Owner preview direct route without Auth or recovery dispatch", async () => {
  show(true);
  expect(await screen.findByRole("heading", { name: "Overview", level: 1 })).toBeInTheDocument();
  expect(screen.queryByLabelText("Customer UUID")).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Account Recovery" })).not.toBeInTheDocument();
  expect(mock.getSession).not.toHaveBeenCalled();
  expect(mock.identity).not.toHaveBeenCalled();
});
