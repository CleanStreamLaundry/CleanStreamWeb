import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import App from "./App";

const routes = [
  ["/", "Clean Stream Laundry"],
  ["/support", "Clean Stream support"],
  ["/privacy", "Privacy Policy"],
  ["/terms", "Terms of Service"],
  ["/account-deletion", "Delete your Clean Stream account"],
  ["/newsletter", "Newsletter preferences"],
] as const;

beforeEach(() => {
  vi.stubEnv("VITE_SUPABASE_URL", "");
  vi.stubEnv("VITE_ANON_KEY", "");
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Unexpected network request")));
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  window.history.replaceState({}, "", "/");
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it.each(routes)("direct public route %s renders without configured services", (path, title) => {
  window.history.replaceState({}, "", path);
  render(<App />);

  expect(screen.getByRole("heading", { name: title, level: 1 })).toBeInTheDocument();
  expect(screen.getAllByRole("main")).toHaveLength(1);
  expect(fetch).not.toHaveBeenCalled();
});

it("published wallet terms preserve the approved voluntary refund conditions", () => {
  window.history.replaceState({}, "", "/terms");
  render(<App />);

  expect(screen.getByText("Effective October 5, 2026")).toBeInTheDocument();
  expect(document.body).not.toHaveTextContent(/draft|not approved|not yet active|does not replace current terms/i);
  expect(screen.getByText(/no later than 48 hours after successful funding/)).toHaveTextContent("including exactly 48 hours");
  expect(screen.getByText(/No wallet spending may have occurred after that load/)).toHaveTextContent("failed machine vend that was later reversed");
  expect(screen.getByText(/An Owner reviews timely requests/)).toHaveTextContent("Clean Stream absorbs the original processing fees");
  expect(screen.getByText(/These voluntary conditions/)).toHaveTextContent("machine failures, duplicate charges, or other payment errors");
  expect(fetch).not.toHaveBeenCalled();
});

it("published privacy and deletion policies distinguish recovery, forfeiture and existing claim rights", () => {
  for (const path of ["/privacy", "/account-deletion"]) {
    window.history.replaceState({}, "", path);
    render(<App />);

    expect(screen.getByText("Effective October 5, 2026")).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/draft|not approved|not yet active|does not replace current terms/i);
    if (path === "/privacy") {
      expect(screen.getByText(/A deletion request places your account in pending deletion/)).toHaveTextContent("Signing in alone does not restore the account");
      expect(screen.getByText(/By voluntarily requesting account deletion/)).toHaveTextContent("except where applicable law prohibits forfeiture");
    } else {
      expect(screen.getByText("Account deletion and recovery")).toBeInTheDocument();
      expect(screen.getByText("A deletion request places your account in pending deletion and restricts ordinary app access. You may explicitly restore the original account and its wallet links after verifying ownership and completing any required multi-factor authentication, before the server-set deadline 90 days after the deletion request. Signing in alone does not restore the account. Restoration does not reset refund deadlines or re-enable optional messages. At or after the deadline, restoration is unavailable even if cleanup has not occurred.")).toBeInTheDocument();
      expect(screen.getByText(/By voluntarily requesting deletion/)).toHaveTextContent("Deletion creates no right to a payout or refund");
      expect(screen.getByText(/After the recovery period/)).toHaveTextContent("Timely refund requests and machine claims remain subject to their existing eligibility rules");
    }
    expect(document.body).not.toHaveTextContent(/seven years|two years|not normally restored/);
    cleanup();
  }
  expect(fetch).not.toHaveBeenCalled();
});

it("published privacy policy separates operational Analytics from optional messaging and necessary email", () => {
  window.history.replaceState({}, "", "/privacy");
  render(<App />);

  expect(screen.getByText("Effective October 5, 2026")).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "6. Mobile Analytics" })).toBeInTheDocument();
  expect(document.body).toHaveTextContent("operational reliability");
  expect(document.body).toHaveTextContent("we do not share Analytics information for advertising");
  expect(document.body).toHaveTextContent("We do not use Analytics for advertising or customer profiling");
  expect(document.body).not.toHaveTextContent(/Optional Google Analytics|turning analytics off/);
  expect(screen.getByText(/Push notifications use Firebase Cloud Messaging/)).toHaveTextContent("require a separate opt-in and device permission");
  expect(screen.getByText(/Firebase Remote Config provides app-version/)).toHaveTextContent("maintenance information");
  expect(screen.getByRole("heading", { name: "7. Notifications, configuration, and nonpromotional messages" })).toBeInTheDocument();
  expect(screen.getByText(/We use Resend/)).toHaveTextContent("nonpromotional");
  expect(document.body).not.toHaveTextContent("remain disabled during development");
  expect(fetch).not.toHaveBeenCalled();
});

it("every public internal link resolves through the actual router or a present home section", () => {
  const knownPaths = new Map<string, string>(routes);
  for (const [path] of routes) {
    window.history.replaceState({}, "", path);
    render(<App />);
    const hrefs = [...new Set(screen.getAllByRole("link")
      .map((link) => link.getAttribute("href")!))];
    cleanup();

    for (const href of hrefs) {
      const target = new URL(href, new URL(path, window.location.origin));
      if (target.origin !== window.location.origin) continue;
      expect(knownPaths.has(target.pathname), href).toBe(true);
      window.history.replaceState({}, "", target.pathname);
      render(<App />);
      expect(screen.getByRole("heading", {
        name: knownPaths.get(target.pathname)!, level: 1,
      })).toBeInTheDocument();
      if (target.hash) {
        expect(document.getElementById(decodeURIComponent(target.hash.slice(1))), href).not.toBeNull();
      }
      cleanup();
    }
  }
  expect(fetch).not.toHaveBeenCalled();
});

it("a direct missing route preserves the URL and offers working support navigation", async () => {
  window.history.replaceState({}, "", "/missing-cleanstream-page?detail=private");
  render(<App />);
  expect(screen.getByRole("heading", { name: "Page not found" })).toBeInTheDocument();
  expect(window.location.pathname).toBe("/missing-cleanstream-page");
  expect(document.body).not.toHaveTextContent("detail=private");
  fireEvent.click(screen.getByRole("link", { name: "Contact support" }));
  expect(await screen.findByRole("heading", { name: "Clean Stream support" })).toBeInTheDocument();
  expect(window.location.pathname).toBe("/support");
  expect(fetch).not.toHaveBeenCalled();
});

it("the no-login deletion resource provides a correctly encoded email request", () => {
  window.history.replaceState({}, "", "/account-deletion");
  render(<App />);
  const link = screen.getAllByRole("link", { name: "support@cleanstreamlaundry.com" })
    .find((element) => element.getAttribute("href")?.includes("?subject="));
  expect(link).toBeDefined();
  const target = new URL(link!.getAttribute("href")!);
  expect(target.protocol).toBe("mailto:");
  expect(target.pathname).toBe("support@cleanstreamlaundry.com");
  expect(target.searchParams.get("subject")).toBe("Clean Stream account deletion");
  const phone = screen.getByRole("link", { name: "(765) 610-2114" });
  expect(phone).toHaveAttribute("href", "tel:+17656102114");
  expect(fetch).not.toHaveBeenCalled();
});
