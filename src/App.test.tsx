import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

vi.mock("./components/CortinaPayPage", () => ({
  default: () => <h1>Payment route</h1>,
}));
vi.mock("./admin/AdminApp", () => ({
  AdminAuth: () => <h1>Admin authentication route</h1>,
  AdminWorkspace: () => <h1>Admin workspace route</h1>,
}));
vi.mock("./admin/Preview", () => ({
  default: () => <h1>Admin preview route</h1>,
}));

function renderPath(path: string) {
  window.history.replaceState({}, "", path);
  return render(<App />);
}

beforeEach(() => {
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Unexpected network request")));
});

afterEach(() => {
  cleanup();
  window.history.replaceState({}, "", "/");
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("public missing routes", () => {
  it.each(["/missing", "/support/missing", "/pay/missing"])(
    "renders a recoverable public 404 at %s",
    (path) => {
      renderPath(path);

      expect(screen.getByRole("banner")).toBeInTheDocument();
      expect(screen.getByRole("contentinfo")).toBeInTheDocument();
      const main = within(screen.getByRole("main"));
      expect(main.getByRole("heading", { level: 1, name: "Page not found" })).toBeInTheDocument();
      expect(main.getByRole("link", { name: "Go home" })).toHaveAttribute("href", "/");
      expect(main.getByRole("link", { name: "Contact support" })).toHaveAttribute("href", "/support");
      expect(window.location.pathname).toBe(path);
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it("does not reflect URL values or redirect a missing route", () => {
    renderPath("/unknown-token?access=private-query#%E0%A4%A");

    expect(screen.getByRole("heading", { name: "Page not found" })).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("unknown-token");
    expect(document.body).not.toHaveTextContent("private-query");
    expect(window.location.pathname).toBe("/unknown-token");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("navigates to support and back to the missing route, then home", async () => {
    renderPath("/missing");
    fireEvent.click(within(screen.getByRole("main")).getByRole("link", { name: "Contact support" }));
    expect(await screen.findByRole("heading", { name: "Clean Stream support" })).toBeInTheDocument();
    expect(window.location.pathname).toBe("/support");

    await act(async () => { window.history.back(); });
    await waitFor(() => expect(window.location.pathname).toBe("/missing"));
    expect(screen.getByRole("heading", { name: "Page not found" })).toBeInTheDocument();

    fireEvent.click(within(screen.getByRole("main")).getByRole("link", { name: "Go home" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Clean Stream Laundry" })).toBeInTheDocument();
    expect(window.location.pathname).toBe("/");
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("existing route ownership", () => {
  it.each([
    ["/", "Clean Stream Laundry"],
    ["/support", "Clean Stream support"],
    ["/privacy", "Privacy Policy"],
    ["/terms", "Terms of Service"],
    ["/account-deletion", "Delete your Clean Stream account"],
    ["/newsletter", "Newsletter preferences"],
    ["/pay?machine=fixture-machine", "Payment route"],
    ["/admin/missing", "Admin authentication route"],
    ["/home/missing", "Admin workspace route"],
    ["/admin/preview/missing", "Admin preview route"],
  ])("preserves %s", async (path, heading) => {
    renderPath(path);

    expect(await screen.findByRole("heading", { level: 1, name: heading })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Page not found" })).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });
});
