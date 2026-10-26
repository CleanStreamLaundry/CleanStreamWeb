import { createContext, useContext } from "react";
import type { Session } from "@supabase/supabase-js";
import type { AdminApi, Identity } from "./types";

export type StaffMfaStep = "enroll_totp" | "challenge_totp";
export interface StaffMfaAdmission {
  step: StaffMfaStep;
  session: Session;
}
export class AdminAdmissionError extends Error {
  constructor(message: string, readonly code: string, readonly nextStep?: string) {
    super(message);
    this.name = "AdminAdmissionError";
  }
}
export function mfaStep(error: unknown): StaffMfaStep | null {
  if (!(error instanceof AdminAdmissionError)) return null;
  return (error.code === "enroll_totp" || error.code === "challenge_totp") &&
    error.nextStep === error.code ? error.code : null;
}
export interface AdminContextValue {
  api: AdminApi;
  identity: Identity | null;
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
  preview: boolean;
}
export const AdminContext = createContext<AdminContextValue | null>(null);
export function useAdmin() {
  const value = useContext(AdminContext);
  if (!value) throw new Error("AdminProvider is required");
  return value;
}
