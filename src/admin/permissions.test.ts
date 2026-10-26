import { describe, expect, it } from "vitest";
import { canAccessPage, portalRole } from "./permissions";
import type { Identity, PortalRole } from "./types";
const identity: Identity = { id: "staff", name: "Staff", email: "staff@example.invalid", role: "Admin" };
describe("portal permissions", () => {
  it("maps existing Admins to Manager without changing the Auth role", () => {
    expect(portalRole(identity)).toBe("Manager");
    expect(canAccessPage(identity, "/employees")).toBe(true);
    expect(canAccessPage(identity, "/transactions")).toBe(false);
  });
  it.each(["unknown", "Owner"])("denies invalid Admin portal role %s", role => {
    const invalid = { ...identity, portalRole: role as PortalRole };
    expect(portalRole(invalid)).toBeNull();
    expect(canAccessPage(invalid, "/maintenance")).toBe(false);
  });
  it("denies inconsistent Owner identity and missing identity", () => {
    expect(portalRole({ ...identity, role: "Owner", portalRole: "Manager" })).toBeNull();
    expect(canAccessPage(null, "")).toBe(false);
  });
  it("preserves full Owner access", () => {
    expect(canAccessPage({ ...identity, role: "Owner", portalRole: "Owner" }, "/transactions")).toBe(true);
  });
});
