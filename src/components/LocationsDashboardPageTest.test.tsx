import { act, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import LocationsPage from "./LocationsDashboardPage";
import type { Location, Machine } from "../interfaces/LocationService";

// ─── Mock Child Modals ────────────────────────────────────────────────────────

vi.mock("./AddMachineModal", () => ({
  default: ({ isOpen }: { isOpen: boolean }) => (isOpen ? <div data-testid="add-machine-modal" /> : null),
}));

vi.mock("./AddLocationModal", () => ({
  default: ({ isOpen }: { isOpen: boolean }) => (isOpen ? <div data-testid="add-location-modal" /> : null),
}));

vi.mock("./DeleteMachineModal", () => ({
  default: ({ machine, onConfirm, onCancel }: { machine: Machine | null; onConfirm: () => void; onCancel: () => void }) =>
    machine ? (
      <div data-testid="delete-confirm-modal">
        <span data-testid="delete-machine-name">{machine.Name}</span>
        <button data-testid="confirm-delete-btn" onClick={onConfirm}>
          Confirm
        </button>
        <button data-testid="cancel-delete-btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    ) : null,
}));

vi.mock("./WasherRatesPanel", () => ({
  default: () => <div data-testid="washer-rates-panel" />,
}));

vi.mock("./CortinaConfigModal", () => ({
  default: () => null,
}));

// ─── Mock useLocations ────────────────────────────────────────────────────────

const mockGetLocations = vi.fn();
const mockGetMachines = vi.fn();
const mockFetchUserRole = vi.fn();
const mockDeleteMachine = vi.fn();

vi.mock("../di/container", () => ({
  useLocations: () => ({
    getLocations: mockGetLocations,
    getMachines: mockGetMachines,
    fetchUserRole: mockFetchUserRole,
    deleteMachine: mockDeleteMachine,
  }),
}));

// ─── Mock Data ────────────────────────────────────────────────────────────────

const mockLocations: Location[] = [
  {
    id: 1,
    Name: "Location A",
    Address: "123 Main St",
    Latitude: 40.71,
    Longitude: -74.0,
  },
  {
    id: 2,
    Name: "Location B",
    Address: "456 Elm St",
    Latitude: 34.05,
    Longitude: -118.24,
  },
];

const mockMachines: Machine[] = [
  {
    id: 1,
    Name: "Washer 1",
    Price: 2.5,
    Runtime: 30,
    Status: "Available",
    Location_ID: 1,
    Machine_type: "Washer",
    Weight_kg: 12,
  },
  {
    id: 2,
    Name: "Dryer 1",
    Price: 1.75,
    Runtime: 45,
    Status: "In Use",
    Location_ID: 1,
    Machine_type: "Dryer",
    Weight_kg: 16,
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

const getDeleteButtons = () => Array.from(document.querySelectorAll<HTMLButtonElement>("button.delete-button"));

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("LocationsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetLocations.mockResolvedValue(mockLocations);
    mockGetMachines.mockResolvedValue(mockMachines);
    mockFetchUserRole.mockResolvedValue("Admin");
    mockDeleteMachine.mockResolvedValue(undefined);
  });

  it.each([false, true])("ignores an older selection after departure and return (reject=%s)", async (reject) => {
    let finish!: () => void;
    mockGetMachines.mockImplementationOnce(() => new Promise<Machine[]>((resolve, fail) => {
      finish = () => reject ? fail(new Error("Obsolete")) : resolve(mockMachines);
    })).mockResolvedValue([]);
    render(<LocationsPage />);
    await screen.findByText("Location A");
    const select = screen.getByRole("combobox");
    fireEvent.change(select, { target: { value: "1" } });
    fireEvent.change(select, { target: { value: "2" } });
    fireEvent.change(select, { target: { value: "1" } });
    await act(async () => {});
    await act(async () => finish());
    expect(select).toHaveValue("1");
    expect(screen.queryByText("Washer 1")).not.toBeInTheDocument();
  });

  it("does not refresh an obsolete selection after delayed deletion", async () => {
    mockFetchUserRole.mockResolvedValue("Owner");
    let finish!: () => void;
    mockDeleteMachine.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
    const { unmount } = render(<LocationsPage />);
    await screen.findByText("Location A");
    const select = screen.getByRole("combobox");
    fireEvent.change(select, { target: { value: "1" } });
    await screen.findByText("Washer 1");
    fireEvent.click(getDeleteButtons()[0]!);
    fireEvent.click(screen.getByTestId("confirm-delete-btn"));
    mockGetMachines.mockResolvedValue([]);
    fireEvent.change(select, { target: { value: "2" } });
    fireEvent.change(select, { target: { value: "1" } });
    await act(async () => {});
    const calls = mockGetMachines.mock.calls.length;
    await act(async () => finish());
    expect(mockGetMachines).toHaveBeenCalledTimes(calls);
    expect(screen.queryByText("Washer 1")).not.toBeInTheDocument();
    unmount();
  });

  it("ignores a pending load after unmount and remount", async () => {
    let finish!: (machines: Machine[]) => void;
    mockGetMachines.mockImplementationOnce(() => new Promise<Machine[]>(resolve => { finish = resolve; }));
    const first = render(<LocationsPage />);
    await screen.findByText("Location A");
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "1" } });
    first.unmount();
    render(<LocationsPage />);
    await screen.findByText("Location A");
    await act(async () => finish(mockMachines));
    expect(screen.queryByText("Washer 1")).not.toBeInTheDocument();
  });

  // ── Rendering ─────────────────────────────────────────────────────────────

  describe("rendering", () => {
    it("renders the location select dropdown", async () => {
      render(<LocationsPage />);

      await waitFor(() => {
        expect(screen.getByRole("combobox")).toBeInTheDocument();
      });
    });

    it("renders the default select option", async () => {
      render(<LocationsPage />);

      await waitFor(() => {
        expect(screen.getByText("Select a location")).toBeInTheDocument();
      });
    });

    it("renders locations in the dropdown after fetching", async () => {
      render(<LocationsPage />);

      await waitFor(() => {
        expect(screen.getByText("Location A")).toBeInTheDocument();
        expect(screen.getByText("Location B")).toBeInTheDocument();
      });
    });

    it("renders the machines table with correct headers", async () => {
      render(<LocationsPage />);

      await waitFor(() => {
        expect(screen.getByText("Name")).toBeInTheDocument();
        expect(screen.getByText("Type")).toBeInTheDocument();
        expect(screen.getByText("Status")).toBeInTheDocument();
        expect(screen.getByText("Weight")).toBeInTheDocument();
      });
    });

    it("does not render a Price column header", async () => {
      render(<LocationsPage />);

      await waitFor(() => screen.getByText("Name"));

      expect(screen.queryByRole("columnheader", { name: "Price" })).not.toBeInTheDocument();
    });

    it("renders empty state message when no machines are loaded", async () => {
      render(<LocationsPage />);

      await waitFor(() => {
        expect(screen.getByText("No machines at this location.")).toBeInTheDocument();
      });
    });

    it("renders machine rows after selecting a location", async () => {
      render(<LocationsPage />);

      await waitFor(() => screen.getByText("Location A"));

      fireEvent.change(screen.getByRole("combobox"), { target: { value: "1" } });

      await waitFor(() => {
        expect(screen.getByText("Washer 1")).toBeInTheDocument();
        expect(screen.getByText("Dryer 1")).toBeInTheDocument();
      });
    });

    it("renders machine weight formatted as kg after selecting a location", async () => {
      render(<LocationsPage />);

      await waitFor(() => screen.getByText("Location A"));

      fireEvent.change(screen.getByRole("combobox"), { target: { value: "1" } });

      await waitFor(() => {
        expect(screen.getByText("12 kg")).toBeInTheDocument();
        expect(screen.getByText("16 kg")).toBeInTheDocument();
      });
    });

    it("does not render machine price in the table", async () => {
      render(<LocationsPage />);

      await waitFor(() => screen.getByText("Location A"));

      fireEvent.change(screen.getByRole("combobox"), { target: { value: "1" } });

      await waitFor(() => screen.getByText("Washer 1"));

      expect(screen.queryByText("$2.50")).not.toBeInTheDocument();
      expect(screen.queryByText("$1.75")).not.toBeInTheDocument();
    });

    it("renders machine type and status after selecting a location", async () => {
      render(<LocationsPage />);

      await waitFor(() => screen.getByText("Location A"));

      fireEvent.change(screen.getByRole("combobox"), { target: { value: "1" } });

      await waitFor(() => {
        expect(screen.getByText("Washer")).toBeInTheDocument();
        expect(screen.getByText("Available")).toBeInTheDocument();
        expect(screen.getByText("Dryer")).toBeInTheDocument();
        expect(screen.getByText("In Use")).toBeInTheDocument();
      });
    });
  });

  // ── Owner-only UI ─────────────────────────────────────────────────────────

  describe("owner role", () => {
    beforeEach(() => {
      mockFetchUserRole.mockResolvedValue("Owner");
    });

    it("shows add location button for Owner", async () => {
      render(<LocationsPage />);

      await waitFor(() => {
        expect(screen.getByText("Add Location:")).toBeInTheDocument();
      });
    });

    it("shows add machine button for Owner", async () => {
      render(<LocationsPage />);

      await waitFor(() => {
        expect(screen.getByText("Add Machine")).toBeInTheDocument();
      });
    });

    it("opens add location modal when add location button is clicked", async () => {
      render(<LocationsPage />);

      await waitFor(() => screen.getByText("Add Location:"));

      const addLocationSection = screen.getByText("Add Location:").closest(".sub-section");
      fireEvent.click(addLocationSection!.querySelector("button")!);

      expect(screen.getByTestId("add-location-modal")).toBeInTheDocument();
    });

    it("opens add machine modal when add machine button is clicked", async () => {
      render(<LocationsPage />);

      await waitFor(() => screen.getByText("Add Machine"));

      fireEvent.click(screen.getByText("Add Machine"));

      expect(screen.getByTestId("add-machine-modal")).toBeInTheDocument();
    });

    it("modal is absent before the add machine button is clicked", async () => {
      render(<LocationsPage />);

      await waitFor(() => screen.getByText("Add Machine"));

      expect(screen.queryByTestId("add-machine-modal")).not.toBeInTheDocument();
    });

    it("renders the Delete column header for Owner", async () => {
      render(<LocationsPage />);

      await waitFor(() => {
        expect(screen.getByText("Delete")).toBeInTheDocument();
      });
    });

    it("renders a delete button for each machine row for Owner", async () => {
      render(<LocationsPage />);

      await waitFor(() => screen.getByText("Location A"));

      fireEvent.change(screen.getByRole("combobox"), { target: { value: "1" } });

      await waitFor(() => screen.getByText("Washer 1"));

      const deleteButtons = getDeleteButtons();
      expect(deleteButtons.length).toBeGreaterThanOrEqual(2);
    });

    it("opens the delete confirm modal when a delete button is clicked", async () => {
      render(<LocationsPage />);

      await waitFor(() => screen.getByText("Location A"));

      fireEvent.change(screen.getByRole("combobox"), { target: { value: "1" } });

      await waitFor(() => screen.getByText("Washer 1"));

      const deleteButtons = getDeleteButtons();
      fireEvent.click(deleteButtons[0]!);

      expect(screen.getByTestId("delete-confirm-modal")).toBeInTheDocument();
    });

    it("shows the correct machine name in the delete confirm modal", async () => {
      render(<LocationsPage />);

      await waitFor(() => screen.getByText("Location A"));

      fireEvent.change(screen.getByRole("combobox"), { target: { value: "1" } });

      await waitFor(() => screen.getByText("Washer 1"));

      const deleteButtons = getDeleteButtons();
      fireEvent.click(deleteButtons[0]!);

      expect(screen.getByTestId("delete-machine-name").textContent).toBe("Washer 1");
    });

    it("delete confirm modal is absent before a delete button is clicked", async () => {
      render(<LocationsPage />);

      await waitFor(() => screen.getByText("Location A"));

      fireEvent.change(screen.getByRole("combobox"), { target: { value: "1" } });

      await waitFor(() => screen.getByText("Washer 1"));

      expect(screen.queryByTestId("delete-confirm-modal")).not.toBeInTheDocument();
    });

    it("closes the delete confirm modal when cancel is clicked", async () => {
      render(<LocationsPage />);

      await waitFor(() => screen.getByText("Location A"));

      fireEvent.change(screen.getByRole("combobox"), { target: { value: "1" } });

      await waitFor(() => screen.getByText("Washer 1"));

      const deleteButtons = getDeleteButtons();
      fireEvent.click(deleteButtons[0]!);

      expect(screen.getByTestId("delete-confirm-modal")).toBeInTheDocument();

      fireEvent.click(screen.getByTestId("cancel-delete-btn"));

      expect(screen.queryByTestId("delete-confirm-modal")).not.toBeInTheDocument();
    });

    it("calls deleteMachine with the correct machine id on confirm", async () => {
      render(<LocationsPage />);

      await waitFor(() => screen.getByText("Location A"));

      fireEvent.change(screen.getByRole("combobox"), { target: { value: "1" } });

      await waitFor(() => screen.getByText("Washer 1"));

      const deleteButtons = getDeleteButtons();
      fireEvent.click(deleteButtons[0]!);

      fireEvent.click(screen.getByTestId("confirm-delete-btn"));

      await waitFor(() => {
        expect(mockDeleteMachine).toHaveBeenCalledWith(mockMachines[0]!.id);
      });
    });

    it("closes the delete confirm modal after confirming deletion", async () => {
      render(<LocationsPage />);

      await waitFor(() => screen.getByText("Location A"));

      fireEvent.change(screen.getByRole("combobox"), { target: { value: "1" } });

      await waitFor(() => screen.getByText("Washer 1"));

      const deleteButtons = getDeleteButtons();
      fireEvent.click(deleteButtons[0]!);

      fireEvent.click(screen.getByTestId("confirm-delete-btn"));

      await waitFor(() => {
        expect(screen.queryByTestId("delete-confirm-modal")).not.toBeInTheDocument();
      });
    });

    it("refreshes machine list after confirming deletion", async () => {
      const updatedMachines: Machine[] = [mockMachines[1]!];
      mockGetMachines.mockResolvedValueOnce(mockMachines).mockResolvedValueOnce(updatedMachines);

      render(<LocationsPage />);

      await waitFor(() => screen.getByText("Location A"));

      fireEvent.change(screen.getByRole("combobox"), { target: { value: "1" } });

      await waitFor(() => screen.getByText("Washer 1"));

      const deleteButtons = getDeleteButtons();
      fireEvent.click(deleteButtons[0]!);

      fireEvent.click(screen.getByTestId("confirm-delete-btn"));

      await waitFor(() => {
        expect(screen.queryByText("Washer 1")).not.toBeInTheDocument();
        expect(screen.getByText("Dryer 1")).toBeInTheDocument();
      });
    });

    it("does not call deleteMachine when cancel is clicked", async () => {
      render(<LocationsPage />);

      await waitFor(() => screen.getByText("Location A"));

      fireEvent.change(screen.getByRole("combobox"), { target: { value: "1" } });

      await waitFor(() => screen.getByText("Washer 1"));

      const deleteButtons = getDeleteButtons();
      fireEvent.click(deleteButtons[0]!);

      fireEvent.click(screen.getByTestId("cancel-delete-btn"));

      expect(mockDeleteMachine).not.toHaveBeenCalled();
    });

    it("retains machine list when deleteMachine fails", async () => {
      mockDeleteMachine.mockRejectedValue(new Error("Delete failed"));

      render(<LocationsPage />);

      await waitFor(() => screen.getByText("Location A"));

      fireEvent.change(screen.getByRole("combobox"), { target: { value: "1" } });

      await waitFor(() => screen.getByText("Washer 1"));

      const deleteButtons = getDeleteButtons();
      fireEvent.click(deleteButtons[0]!);

      fireEvent.click(screen.getByTestId("confirm-delete-btn"));

      await waitFor(() => {
        expect(screen.queryByTestId("delete-confirm-modal")).not.toBeInTheDocument();
      });

      expect(screen.getByText("Washer 1")).toBeInTheDocument();
    });
  });

  // ── Non-owner role ────────────────────────────────────────────────────────

  describe("non-owner role", () => {
    it("does not show add location button for Admin", async () => {
      mockFetchUserRole.mockResolvedValue("Admin");
      render(<LocationsPage />);

      await waitFor(() => screen.getByText("Location A"));

      expect(screen.queryByText("Add Location:")).not.toBeInTheDocument();
    });

    it("does not show add machine button for Admin", async () => {
      mockFetchUserRole.mockResolvedValue("Admin");
      render(<LocationsPage />);

      await waitFor(() => screen.getByText("Location A"));

      expect(screen.queryByText("Add Machine")).not.toBeInTheDocument();
    });

    it("does not show owner controls when role is null", async () => {
      mockFetchUserRole.mockResolvedValue(null);
      render(<LocationsPage />);

      await waitFor(() => screen.getByText("Location A"));

      expect(screen.queryByText("Add Location:")).not.toBeInTheDocument();
      expect(screen.queryByText("Add Machine")).not.toBeInTheDocument();
    });

    it("does not render the Delete column header for Admin", async () => {
      mockFetchUserRole.mockResolvedValue("Admin");
      render(<LocationsPage />);

      await waitFor(() => screen.getByText("Location A"));

      expect(screen.queryByText("Delete")).not.toBeInTheDocument();
    });

    it("does not render delete buttons in machine rows for Admin", async () => {
      mockFetchUserRole.mockResolvedValue("Admin");
      render(<LocationsPage />);

      await waitFor(() => screen.getByText("Location A"));

      fireEvent.change(screen.getByRole("combobox"), { target: { value: "1" } });

      await waitFor(() => screen.getByText("Washer 1"));

      expect(document.querySelector("button.delete-button")).not.toBeInTheDocument();
    });
  });

  // ── Service calls ─────────────────────────────────────────────────────────

  describe("service calls", () => {
    it("calls getLocations on mount", async () => {
      render(<LocationsPage />);

      await waitFor(() => {
        expect(mockGetLocations).toHaveBeenCalledTimes(1);
      });
    });

    it("calls fetchUserRole on mount", async () => {
      render(<LocationsPage />);

      await waitFor(() => {
        expect(mockFetchUserRole).toHaveBeenCalledTimes(1);
      });
    });

    it("calls getMachines with the selected location id", async () => {
      render(<LocationsPage />);

      await waitFor(() => screen.getByText("Location A"));

      fireEvent.change(screen.getByRole("combobox"), { target: { value: "2" } });

      await waitFor(() => {
        expect(mockGetMachines).toHaveBeenCalledWith("2");
      });
    });

    it("does not call getMachines on mount", async () => {
      render(<LocationsPage />);

      await waitFor(() => screen.getByText("Location A"));

      expect(mockGetMachines).not.toHaveBeenCalled();
    });

    it("calls getMachines again when a different location is selected", async () => {
      render(<LocationsPage />);

      await waitFor(() => screen.getByText("Location A"));

      fireEvent.change(screen.getByRole("combobox"), { target: { value: "1" } });
      await waitFor(() => expect(mockGetMachines).toHaveBeenCalledWith("1"));

      fireEvent.change(screen.getByRole("combobox"), { target: { value: "2" } });
      await waitFor(() => expect(mockGetMachines).toHaveBeenCalledWith("2"));

      expect(mockGetMachines).toHaveBeenCalledTimes(2);
    });
  });

  // ── Error handling ────────────────────────────────────────────────────────

  describe("error handling", () => {
    it("renders empty dropdown when getLocations fails", async () => {
      mockGetLocations.mockRejectedValue(new Error("Failed to fetch"));
      render(<LocationsPage />);

      await waitFor(() => {
        expect(screen.queryByText("Location A")).not.toBeInTheDocument();
      });
    });

    it("still renders the Select a location placeholder when getLocations fails", async () => {
      mockGetLocations.mockRejectedValue(new Error("Failed to fetch"));
      render(<LocationsPage />);

      await waitFor(() => {
        expect(screen.getByText("Select a location")).toBeInTheDocument();
      });
    });

    it("renders empty machine table when getMachines fails", async () => {
      mockGetMachines.mockRejectedValue(new Error("Failed to fetch machines"));
      render(<LocationsPage />);

      await waitFor(() => screen.getByText("Location A"));

      fireEvent.change(screen.getByRole("combobox"), { target: { value: "1" } });

      await waitFor(() => {
        expect(screen.getByText("No machines at this location.")).toBeInTheDocument();
      });
    });

    it("retains previous machines when getMachines fails on a subsequent selection", async () => {
      mockGetMachines.mockResolvedValueOnce(mockMachines).mockRejectedValueOnce(new Error("Failed"));

      render(<LocationsPage />);

      await waitFor(() => screen.getByText("Location A"));

      fireEvent.change(screen.getByRole("combobox"), { target: { value: "1" } });
      await waitFor(() => screen.getByText("Washer 1"));

      fireEvent.change(screen.getByRole("combobox"), { target: { value: "2" } });

      await waitFor(() => {
        expect(screen.getByText("Washer 1")).toBeInTheDocument();
      });
    });
  });
});
