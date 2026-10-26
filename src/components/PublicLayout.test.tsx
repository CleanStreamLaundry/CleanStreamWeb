import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import PublicLayout from "./PublicLayout";
import PublicHomePage from "./PublicHomePage";
import SupportPage from "./SupportPage";
import PublicLegalPage from "./PublicLegalPage";

const originalScrollIntoView = Object.getOwnPropertyDescriptor(Element.prototype, "scrollIntoView");
const scrollIntoView = vi.fn(function (this: Element) {
  expect(this.isConnected).toBe(true);
});

function renderLayout(initialEntry = "/support") {
  const router = createMemoryRouter([
    {
      element: <PublicLayout />,
      children: [
        { path: "/", element: <PublicHomePage /> },
        { path: "/support", element: <SupportPage /> },
        { path: "/privacy", element: <PublicLegalPage type="privacy" /> },
      ],
    },
  ], { initialEntries: [initialEntry] });
  render(<RouterProvider router={router} />);
  return router;
}

function expectSectionScroll(id: string) {
  expect(scrollIntoView).toHaveBeenLastCalledWith({ behavior: "instant", block: "start" });
  expect(scrollIntoView.mock.contexts.at(-1)).toBe(document.getElementById(id));
}

beforeAll(() => {
  Object.defineProperty(Element.prototype, "scrollIntoView", {
    configurable: true,
    value: scrollIntoView,
  });
});

afterAll(() => {
  if (originalScrollIntoView) {
    Object.defineProperty(Element.prototype, "scrollIntoView", originalScrollIntoView);
  } else {
    Reflect.deleteProperty(Element.prototype, "scrollIntoView");
  }
});

beforeEach(() => {
  scrollIntoView.mockClear();
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("PublicLayout navigation scrolling", () => {
  it("moves keyboard focus into a new hash-free page before the next Tab", async () => {
    renderLayout("/");
    const user = userEvent.setup();
    for (let index = 0; index < 5; index += 1) await user.tab();
    expect(screen.getByRole("link", { name: "Support" })).toHaveFocus();

    await user.keyboard("{Enter}");

    expect(document.getElementById("public-content")).toHaveFocus();
    expect(screen.getByRole("heading", { name: "Clean Stream support" })).toBeInTheDocument();
    await user.tab();
    expect(screen.getByRole("link", { name: /^Call\s*\(765\) 610-2114$/ })).toHaveFocus();
  });

  it("preserves focus on initial load and query-only navigation", async () => {
    const router = renderLayout();
    expect(document.body).toHaveFocus();
    const user = userEvent.setup();
    await user.tab();
    const skip = screen.getByRole("link", { name: "Skip to content" });
    expect(skip).toHaveFocus();

    await act(() => router.navigate("/support?topic=payment"));

    expect(skip).toHaveFocus();
  });

  it("leaves same-document and routed section-hash focus unchanged", async () => {
    const router = renderLayout();
    const user = userEvent.setup();
    for (let index = 0; index < 3; index += 1) await user.tab();
    const services = screen.getByRole("link", { name: "Services" });
    expect(services).toHaveFocus();
    await user.keyboard("{Enter}");
    expectSectionScroll("services");
    expect(services).toHaveFocus();

    await user.tab();
    const locations = screen.getByRole("link", { name: "Locations" });
    await user.keyboard("{Enter}");
    expectSectionScroll("locations");
    expect(locations).toHaveFocus();

    await act(() => router.navigate("/support"));
    expect(document.getElementById("public-content")).toHaveFocus();
  });

  it("offers a keyboard-first skip link to the current page content", async () => {
    renderLayout();
    await userEvent.setup().tab();
    const skip = screen.getByRole("link", { name: "Skip to content" });
    expect(skip).toHaveFocus();
    expect(skip).toHaveAttribute("href", "#public-content");
    const target = document.getElementById("public-content");
    expect(target).toHaveAttribute("tabindex", "-1");
    expect(target).toContainElement(screen.getByRole("main"));
  });

  it("preserves a single content destination across public navigation", async () => {
    const router = renderLayout();
    await act(() => router.navigate("/privacy"));
    expect(document.querySelectorAll("#public-content")).toHaveLength(1);
    expect(document.getElementById("public-content")).toContainElement(
      screen.getByRole("heading", { name: "Privacy Policy", level: 1 }),
    );
  });

  it.each([
    ["Services", "services"],
    ["Locations", "locations"],
  ])("scrolls from support to the committed %s section", async (label, id) => {
    const router = renderLayout();
    vi.mocked(window.scrollTo).mockClear();

    fireEvent.click(screen.getByRole("link", { name: label }));
    await screen.findByRole("heading", { name: "Clean Stream Laundry", level: 1 });

    expect(router.state.location.pathname).toBe("/");
    expect(router.state.location.hash).toBe(`#${id}`);
    expectSectionScroll(id);
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(window.scrollTo).not.toHaveBeenCalled();
  });

  it("scrolls between hashes on the same page", async () => {
    renderLayout("/#services");
    expectSectionScroll("services");

    fireEvent.click(screen.getByRole("link", { name: "Locations" }));

    await waitFor(() => expectSectionScroll("locations"));
    expect(scrollIntoView).toHaveBeenCalledTimes(2);
    expect(window.scrollTo).not.toHaveBeenCalled();
  });

  it("scrolls again when the current hash link is clicked", async () => {
    renderLayout("/#services");
    scrollIntoView.mockClear();

    fireEvent.click(screen.getByRole("link", { name: "Services" }));

    await waitFor(() => expectSectionScroll("services"));
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it("decodes an initial hash before looking up the element by ID", () => {
    renderLayout("/#loc%61tions");
    expectSectionScroll("locations");
    expect(window.scrollTo).not.toHaveBeenCalled();
  });

  it.each(["#missing", "#missing%5B", "#%E0%A4%A", "#"])(
    "ignores an unknown or malformed hash %s without throwing",
    (hash) => {
      expect(() => renderLayout(`/${hash}`)).not.toThrow();
      expect(screen.getByRole("heading", { name: "Clean Stream Laundry", level: 1 })).toBeInTheDocument();
      expect(scrollIntoView).not.toHaveBeenCalled();
      expect(window.scrollTo).not.toHaveBeenCalled();
    },
  );

  it("resets to the top when navigating to a page without a hash", async () => {
    const router = renderLayout("/#locations");
    scrollIntoView.mockClear();

    await act(() => router.navigate("/privacy"));

    expect(window.scrollTo).toHaveBeenCalledExactlyOnceWith({ top: 0, left: 0, behavior: "instant" });
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("resets to the top when the home link clears the current hash", async () => {
    renderLayout("/#locations");
    fireEvent.click(screen.getByRole("link", { name: "Clean Stream Laundry home" }));

    await waitFor(() => {
      expect(window.scrollTo).toHaveBeenCalledExactlyOnceWith({ top: 0, left: 0, behavior: "instant" });
    });
  });

  it("does not reset the scroll position for a query-only navigation", async () => {
    const router = renderLayout();
    vi.mocked(window.scrollTo).mockClear();

    await act(() => router.navigate("/support?topic=payment"));

    expect(window.scrollTo).not.toHaveBeenCalled();
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("handles back and forward visits to section hashes", async () => {
    const router = renderLayout();
    await act(() => router.navigate("/#services"));
    await act(() => router.navigate("/#locations"));
    await act(() => router.navigate("/support"));
    scrollIntoView.mockClear();
    vi.mocked(window.scrollTo).mockClear();

    await act(() => router.navigate(-1));
    expectSectionScroll("locations");
    await act(() => router.navigate(-1));
    expectSectionScroll("services");
    await act(() => router.navigate(1));
    expectSectionScroll("locations");
    expect(scrollIntoView).toHaveBeenCalledTimes(3);
    expect(window.scrollTo).not.toHaveBeenCalled();
  });
});
