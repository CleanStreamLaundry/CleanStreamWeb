import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import PublicLegalPage from "./PublicLegalPage";

afterEach(cleanup);

function show(type: "privacy" | "terms") {
  return render(<MemoryRouter><PublicLegalPage type={type} /></MemoryRouter>);
}

describe("published legal documents", () => {
  it.each(["privacy", "terms"] as const)("%s has a letterhead, effective date and twelve numbered sections", (type) => {
    const { container } = show(type);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      type === "privacy" ? "Privacy Policy" : "Terms of Service",
    );
    expect(screen.getByRole("img", { name: "Clean Stream Laundry Solutions" })).toBeInTheDocument();
    expect(screen.getByText("Effective October 5, 2026")).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/draft|not approved|not yet active|does not replace current terms/i);
    expect(container.querySelector(".public-legal-notice")).toBeNull();
    const headings = screen.getAllByRole("heading", { level: 2 });
    expect(headings).toHaveLength(12);
    headings.forEach((heading, index) => expect(heading.textContent).toMatch(new RegExp(`^${index + 1}\\. `)));
    expect(container.querySelectorAll("section")).toHaveLength(12);
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Email support" })).toHaveAttribute("href", "mailto:support@cleanstreamlaundry.com");
    expect(container.textContent).not.toMatch(/newsletter|mailing address|under 13|intended for adults|10%|\$5/);
    expect(container.textContent).toContain("At or after the deadline, restoration is unavailable even if cleanup has not occurred.");
    expect(container.textContent).toContain("At that deadline, the remaining credit and reward progress are forfeited, except where applicable law prohibits forfeiture.");
    expect(container.textContent).toContain("Deletion does not convert credit into cash or entitle you to a refund.");
    expect(container.textContent).not.toContain("not forfeited because you delete your account");
  });

  it("separates unresolved vending from failure and preserves the exact refund boundaries", () => {
    const { container } = show("terms");
    const text = container.textContent ?? "";
    for (const phrase of [
      "An unconfirmed or timed-out request does not by itself establish",
      "For a confirmed failed or voided vend",
      "including exactly 48 hours",
      "Spending only promotional credit or a failed machine vend that was later reversed",
      "Earlier wallet use does not disqualify a later load",
      "Clean Stream absorbs the original processing fees",
      "Partial voluntary refunds and cash refunds of promotional credit are not offered",
      "The 48-hour unused-load restriction does not apply to those claims",
      "Purchases are nonrefundable except under the refund and claim policies",
      "is not available for cash withdrawal",
      "deletion itself is not a reason for approval",
      "Disputes follow section 11",
      "on the same calendar day as the affected use",
      "at the same location for the same amount, without an additional charge",
      "90 days after the request",
      "do not require arbitration, waive a jury trial, or waive class-action rights",
      "Nayax supports payments at participating machines",
    ]) expect(text).toContain(phrase);
  });

  it("discloses automatic Analytics and actual providers without inventing an opt-out", () => {
    const { container } = show("privacy");
    const text = container.textContent ?? "";
    for (const phrase of [
      "Analytics collection is automatic",
      "app-instance and installation identifiers",
      "only for operational reliability",
      "We do not use Analytics for advertising or customer profiling",
      "we do not share Analytics information for advertising",
      "wallet balances, funds or payment information, or support content",
      "Google sign-in",
      "Sign in with Apple",
      "Hide My Email",
      "OpenStreetMap",
      "Supabase",
      "Stripe",
      "Nayax",
      "Resend",
      "website hosting provider",
      "nonpromotional",
      "not a guarantee of immediate deletion",
    ]) expect(text).toContain(phrase);
    expect(text).not.toMatch(/in-app Analytics switch|separate Analytics opt-in|Settings or the update action|zero data|necessarily anonymous|Analytics opt-out|pending privacy cleanup|connection and retry|promising identical rights|unrestricted sharing/);
    expect(screen.getByRole("link", { name: "Delete your Clean Stream account" })).toHaveAttribute("href", "/account-deletion");
  });
});
