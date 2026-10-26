import { act, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SupabaseClient } from "@supabase/supabase-js";
import type { Maintenance } from "../interfaces/MaintenanceService";
import MaintenanceDashboardPage from "./MaintenanceDashboardPage";
import * as diContainer from "../di/container";
import * as supabaseClient from "../supabase/client";

// Mocking the modules
vi.mock("../di/container");
vi.mock("../supabase/client");

const mockMaintenances: Maintenance[] = [
  {
    maint_id: "1",
    user_id: "USER-001",
    category: "Plumbing",
    description: "Leaky faucet",
    created_at: "2024-03-20T10:00:00Z",
    location: "Kitchen",
    image_data: "example.com/img.jpg",
  },
  {
    maint_id: "2",
    user_id: "USER-002",
    category: "Electrical",
    description: "Light out",
    created_at: "2024-03-21T11:30:00Z",
    location: "Hallway",
    image_data: "https://example.com/direct.jpg",
  },
];

describe("MaintenanceDashboardPage", () => {
  const mockGetMaintenances = vi.fn<ReturnType<typeof diContainer.useMaintenance>["getMaintenances"]>();
  const mockClient = new SupabaseClient('https://example.invalid', 'test-key', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: vi.fn<typeof fetch>().mockRejectedValue(new Error('Unexpected SDK fetch')) },
  });
  const mockGetSession = vi.spyOn(mockClient.auth, 'getSession');
  const mockFetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unexpected fetch'));

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup DI Container mock
    vi.mocked(diContainer.useMaintenance).mockReturnValue({
      getMaintenances: mockGetMaintenances,
    });

    vi.mocked(supabaseClient.getSupabaseClient).mockReturnValue(mockClient);

    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it.each([false, true])("ignores obsolete load completion (reject=%s)", async (reject) => {
    let finish!: () => void;
    mockGetMaintenances.mockImplementationOnce(() => new Promise((resolve, fail) => {
      finish = () => reject ? fail(new Error("Obsolete")) : resolve(mockMaintenances);
    }));
    const { rerender } = render(<MaintenanceDashboardPage />);
    vi.mocked(diContainer.useMaintenance).mockReturnValue({ getMaintenances: vi.fn().mockResolvedValue([]) });
    rerender(<MaintenanceDashboardPage />);
    expect(await screen.findByText(/No maintenance records/)).toBeInTheDocument();
    await act(async () => finish());
    expect(screen.queryByText("Leaky faucet")).not.toBeInTheDocument();
    expect(screen.queryByText("Failed to load maintenance requests")).not.toBeInTheDocument();
  });

  it("renders loading state then data", async () => {
    mockGetMaintenances.mockResolvedValue(mockMaintenances);
    render(<MaintenanceDashboardPage />);
    expect(screen.getByText(/loading maintenance reports/i)).toBeInTheDocument();
    const firstRow = await screen.findByText("Leaky faucet");
    expect(firstRow).toBeInTheDocument();
  });

  it("handles the 'View' button with and without http prefix", async () => {
    mockGetMaintenances.mockResolvedValue(mockMaintenances);
    const windowSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    render(<MaintenanceDashboardPage />);

    const viewButtons = await screen.findAllByText("View");

    fireEvent.click(viewButtons[0]!);
    expect(windowSpy).toHaveBeenCalledWith("https://example.com/img.jpg", "_blank");

    fireEvent.click(viewButtons[1]!);
    expect(windowSpy).toHaveBeenCalledWith("https://example.com/direct.jpg", "_blank");
  });

  it("successfully deletes a record", async () => {
    // 1. Setup mocks to match the Dashboard's manual fetch logic
    mockGetMaintenances.mockResolvedValue(mockMaintenances);
    mockGetSession.mockResolvedValue({ 
      data: { session: {
        access_token: 'fake-token',
        refresh_token: 'fake-refresh-token',
        expires_in: 3600,
        token_type: 'bearer',
        user: { id: 'USER-001', app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: '2024-03-20T10:00:00Z' },
      } },
      error: null,
    });
    mockFetch.mockResolvedValue(new Response(null, { status: 200 }));

    render(<MaintenanceDashboardPage />);
    const deleteButtons = await screen.findAllByText("Delete");

    // 2. Trigger delete
    fireEvent.click(deleteButtons[0]!);

    // 3. Assert that the FETCH was called (matching the Dashboard code)
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('delete-maintenance'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ id: "1" })
        })
      );
    });

    expect(screen.queryByText("Leaky faucet")).not.toBeInTheDocument();
  });

  it("handles delete failure (no session)", async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    mockGetMaintenances.mockResolvedValue(mockMaintenances);
    mockGetSession.mockResolvedValue({ data: { session: null }, error: null });

    render(<MaintenanceDashboardPage />);
    const deleteButtons = await screen.findAllByText("Delete");
    fireEvent.click(deleteButtons[0]!);

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith("Could not delete record.");
    });
  });

  it("displays empty state when no records exist", async () => {
    mockGetMaintenances.mockResolvedValue([]);
    render(<MaintenanceDashboardPage />);
    const emptyMsg = await screen.findByText(/No maintenance records found/i);
    expect(emptyMsg).toBeInTheDocument();
  });
});
