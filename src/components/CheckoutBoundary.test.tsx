import { lazy, Suspense } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CheckoutBoundary from "./CheckoutBoundary";

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function show(children: React.ReactNode) {
  return render(<MemoryRouter initialEntries={["/pay?access=private-token"]}>
    <Routes>
      <Route path="/pay" element={<CheckoutBoundary>{children}</CheckoutBoundary>} />
      <Route path="/support" element={<h1>Customer support</h1>} />
      <Route path="/" element={<h1>Home</h1>} />
    </Routes>
  </MemoryRouter>);
}

describe("checkout failure containment", () => {
  it("preserves a working checkout", () => {
    const { container } = show(<h1>Choose payment method</h1>);
    expect(screen.getByRole("heading", { name: "Choose payment method" })).toBeInTheDocument();
    expect(screen.queryByText("Checkout unavailable")).not.toBeInTheDocument();
    expect(container.querySelector(".public-site-shell")).not.toBeInTheDocument();
  });

  it.each(["Contact support", "Go home"])("offers %s without leaking errors or retrying payment", link => {
    const initialize = vi.fn(() => { throw new Error("private-provider-error"); });
    function BrokenCheckout() { initialize(); return null; }
    show(<BrokenCheckout />);
    const callsAfterFailure = initialize.mock.calls.length;
    expect(screen.getByRole("heading", { name: "Checkout unavailable" })).toBeInTheDocument();
    const main = screen.getByRole("main");
    expect(main).toHaveClass("public-document");
    expect(main.parentElement).toHaveClass("public-site-shell");
    expect(screen.getByText(/already submitted a payment/)).toHaveClass("public-document-lead");
    expect(document.body).not.toHaveTextContent(/private-token|private-provider-error/);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("link", { name: link }));
    expect(screen.getByRole("heading", { name: link === "Contact support" ? "Customer support" : "Home" })).toBeInTheDocument();
    expect(initialize).toHaveBeenCalledTimes(callsAfterFailure);
  });

  it("contains a failed checkout download", async () => {
    const BrokenDownload = lazy(() => Promise.reject(new Error("private-chunk-url")));
    show(<Suspense fallback={<p role="status">Loading checkout</p>}><BrokenDownload /></Suspense>);
    expect(await screen.findByRole("heading", { name: "Checkout unavailable" })).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("private-chunk-url");
  });
});
