import type { Identity, PortalRole } from "./types";

export function portalRole(identity: Identity | null): PortalRole | null {
  if (!identity) return null;
  if (identity.role === "Owner") {
    return !identity.portalRole || identity.portalRole === "Owner" ? "Owner" : null;
  }
  if (identity.role !== "Admin") return null;
  if (!identity.portalRole) return "Manager";
  return ["Manager", "Maintenance"].includes(identity.portalRole) ? identity.portalRole : null;
}

export function canAccessPage(identity: Identity | null, path: string): boolean {
  const role = portalRole(identity);
  if (!role) return false;
  if (role === "Owner") return true;
  if (path === "/maintenance") return true;
  return role === "Manager" && ["", "/locations", "/employees"].includes(path);
}
