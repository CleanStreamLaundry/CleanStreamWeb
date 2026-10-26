import { describe, expect, it } from "vitest";
import { csvCell, recordsCsv } from "./csv";
describe("safe operational CSV exports", () => {
  it("omits financial and payment configuration columns for Manager inventory", () => {
    const row = { name: "Washer", capacity_kg: 10, price: 123.45, payment_enabled: true, payment_review_required: false, environment: "production" };
    const csv = recordsCsv("machines", [row], "Manager");
    expect(csv).toContain("Washer");
    expect(csv).not.toMatch(/Price|123.45|Payment configuration|Payment review|Environment|production/);
    expect(recordsCsv("machines", [row], "Owner")).toContain("123.45");
  });
  it("uses effective staff role names in Owner team exports", () => {
    expect(recordsCsv("team", [{ role: "Admin", portal_role: "Maintenance" }])).toContain('"Maintenance"');
    expect(recordsCsv("team", [{ role: "Admin" }])).toContain('"Manager"');
  });
  it("exports verified refund evidence and preserves zero net", () => {
    const csv = recordsCsv("transactions", [{ id: "load:1", voluntary_refund_id: "refund-1",
      voluntary_refund_status: "succeeded", refund_completed_at: "2026-09-30T12:00:00Z",
      payment_succeeded_at: "2026-09-29T12:00:00Z", environment_evidence: "stripe_success_event",
      amount_cents: 2000, gross_collection_cents: 2000, refunded_collection_cents: 2000, net_collection_cents: 0 }]);
    expect(csv).toContain('"Voluntary refund ID","Voluntary refund status","Confirmed refund time"');
    expect(csv).toContain('"refund-1","succeeded","2026-09-30T12:00:00Z","2026-09-29T12:00:00Z"');
    expect(csv).toContain('"2000","2000","2000","0"');
  });
  it("exports typed providers, exact cents and references without replacing unknown money with zero", () => {
    const csv = recordsCsv("transactions", [{
      id: "vend:one", category: "machine_collection", collection_provider: "stripe", vend_provider: "nayax", environment: "unknown",
      amount_cents: 101, gross_collection_cents: 101, refunded_collection_cents: null, net_collection_cents: null,
      nayax_transaction_reference: "987", reconciliation: "refund_or_outcome_unverified", collection_key: "stripe:intent:pi_one",
      payload: "PRIVATE_PROVIDER_PAYLOAD",
    }]);
    expect(csv).toContain('"Collection provider","Vend provider","Environment"');
    expect(csv).toContain('"101","101","",""');
    expect(csv).toContain('"stripe","nayax","unknown"');
    expect(csv).toContain("stripe:intent:pi_one");
    expect(csv).toContain('"987"');
    expect(csv).not.toContain("PRIVATE_PROVIDER_PAYLOAD");
  });
  it("neutralizes spreadsheet formulas even after leading whitespace", () => {
    for (const value of [
      "=1+2",
      "+cmd",
      "-formula",
      "@SUM(A1)",
      "  =HYPERLINK(1)",
      "\tPAYLOAD",
      "\rPAYLOAD",
      "\nPAYLOAD",
    ]) {
      expect(csvCell(value).startsWith("\"'")).toBe(true);
    }
    expect(csvCell(-3.5)).toBe('"-3.5"');
  });
  it("preserves commas, quotes, line breaks, nulls, and Unicode without leaking extra fields", () => {
    expect(csvCell('North, "Main"\nLaundry')).toBe(
      '"North, ""Main""\nLaundry"',
    );
    const csv = recordsCsv("maintenance", [
      {
        maint_id: "42",
        description: "Café washer",
        image_data: "SECRET_ATTACHMENT",
        client_access_token: "SECRET_TOKEN",
      },
    ]);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain("Café washer");
    expect(csv).not.toContain("SECRET");
    expect(csvCell(null)).toBe('""');
  });
});
