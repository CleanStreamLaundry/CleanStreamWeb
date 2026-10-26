import { act, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { StrictMode } from "react";
import EmployeePage from "./EmployeeDashboardPage";

// ─── Mock Services ────────────────────────────────────────────────────────────

const mockGetLocations = vi.fn();
const mockFetchEmployees = vi.fn();
const mockFetchUserRole = vi.fn();
const mockRemoveAdminLocation = vi.fn();
let mockLocationService = { getLocations: mockGetLocations, fetchUserRole: mockFetchUserRole };
let mockEmployeeService = {
  fetchEmployees: mockFetchEmployees,
  assignAdminLocation: vi.fn(),
  removeAdminLocation: mockRemoveAdminLocation,
};

vi.mock("../di/container", () => ({
  useLocations: () => mockLocationService,
  useEmployee: () => mockEmployeeService,
}));

vi.mock("./AddEmployeeModal", () => ({
  default: ({ isOpen, onClose, onSuccess }: { isOpen: boolean; onClose: () => void; onSuccess: () => void }) =>
    isOpen ? (
      <div data-testid="add-employee-modal">
        <button onClick={onClose}>Close</button>
        <button onClick={onSuccess}>Submit</button>
      </div>
    ) : null,
}));

vi.mock("./DeleteEmployeeModal", () => ({
  default: ({ employee, onConfirm, onCancel }: { employee: { email: string } | null; onConfirm: () => void; onCancel: () => void }) =>
    employee ? (
      <div data-testid="delete-employee-modal">
        <button onClick={onConfirm}>Confirm Delete</button>
        <button onClick={onCancel}>Cancel Delete</button>
      </div>
    ) : null,
}));

// ─── Mock Data ────────────────────────────────────────────────────────────────

const mockLocations = [
  { id: 1, Name: "Downtown Branch" },
  { id: 2, Name: "Northside Branch" },
];

const mockEmployees = [
  { name: "Alice Smith", email: "alice@example.com", locationID: 1 },
  { name: "Bob Jones", email: "bob@example.com", locationID: 2 },
];

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

const replacementEmployees = [
  { name: "Carol White", email: "carol@example.com", locationID: 7 },
];

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("EmployeePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLocationService = { getLocations: mockGetLocations, fetchUserRole: mockFetchUserRole };
    mockEmployeeService = {
      fetchEmployees: mockFetchEmployees,
      assignAdminLocation: vi.fn(),
      removeAdminLocation: mockRemoveAdminLocation,
    };
    mockGetLocations.mockResolvedValue(mockLocations);
    mockFetchEmployees.mockResolvedValue(mockEmployees);
    mockFetchUserRole.mockResolvedValue("Admin");
    mockRemoveAdminLocation.mockResolvedValue(undefined);
  });

  describe("load lifetime", () => {
    it("loads once for stable services across renders and modal toggles", async () => {
      const { rerender } = render(<EmployeePage />);
      await screen.findByText("Alice Smith");
      fireEvent.click(screen.getByRole("button", { name: /add employee/i }));
      fireEvent.click(screen.getByRole("button", { name: "Close" }));
      rerender(<EmployeePage />);

      expect(mockGetLocations).toHaveBeenCalledTimes(1);
      expect(mockFetchEmployees).toHaveBeenCalledTimes(1);
      expect(mockFetchUserRole).toHaveBeenCalledTimes(1);
    });

    it.each(["Admin", null])("ignores old rows and Owner role after replacement returns %s", async (role) => {
      const oldRows = deferred<typeof mockEmployees>();
      const oldRole = deferred<string | null>();
      mockFetchEmployees.mockReturnValueOnce(oldRows.promise);
      mockFetchUserRole.mockReturnValueOnce(oldRole.promise);
      const { rerender } = render(<EmployeePage />);
      await waitFor(() => expect(mockFetchEmployees).toHaveBeenCalledWith([1, 2]));
      const getLocations = vi.fn().mockResolvedValue([{ id: 7, Name: "New Branch" }]);
      const fetchEmployees = vi.fn().mockResolvedValue(replacementEmployees);
      mockLocationService = { getLocations, fetchUserRole: vi.fn().mockResolvedValue(role) };
      mockEmployeeService = { ...mockEmployeeService, fetchEmployees };

      rerender(<EmployeePage />);
      await screen.findByText("Carol White");
      await act(async () => { oldRows.resolve(mockEmployees); oldRole.resolve("Owner"); });

      expect(screen.getByText("Carol White")).toBeInTheDocument();
      expect(screen.queryByText("Alice Smith")).not.toBeInTheDocument();
      expect(screen.queryByText("Delete")).not.toBeInTheDocument();
      expect(fetchEmployees).toHaveBeenCalledExactlyOnceWith([7]);
      expect(getLocations.mock.invocationCallOrder[0]).toBeLessThan(fetchEmployees.mock.invocationCallOrder[0]!);
    });

    it("reloads when only the employee service changes", async () => {
      const { rerender } = render(<EmployeePage />);
      await screen.findByText("Alice Smith");
      const fetchEmployees = vi.fn().mockResolvedValue(replacementEmployees);
      mockEmployeeService = { ...mockEmployeeService, fetchEmployees };

      rerender(<EmployeePage />);
      await screen.findByText("Carol White");

      expect(mockGetLocations).toHaveBeenCalledTimes(2);
      expect(fetchEmployees).toHaveBeenCalledExactlyOnceWith([1, 2]);
    });

    it("does not start the old employee query after a service change during locations loading", async () => {
      const oldLocations = deferred<typeof mockLocations>();
      mockGetLocations.mockReturnValueOnce(oldLocations.promise);
      const { rerender } = render(<EmployeePage />);
      const fetchEmployees = vi.fn().mockResolvedValue(replacementEmployees);
      mockLocationService = {
        getLocations: vi.fn().mockResolvedValue([{ id: 7, Name: "New Branch" }]),
        fetchUserRole: vi.fn().mockResolvedValue("Admin"),
      };
      mockEmployeeService = { ...mockEmployeeService, fetchEmployees };

      rerender(<EmployeePage />);
      await screen.findByText("Carol White");
      await act(async () => oldLocations.resolve(mockLocations));

      expect(mockFetchEmployees).not.toHaveBeenCalled();
      expect(fetchEmployees).toHaveBeenCalledExactlyOnceWith([7]);
      expect(screen.getByText("Carol White")).toBeInTheDocument();
    });

    it("ignores an old add-success refresh after services change", async () => {
      const oldRefresh = deferred<typeof mockEmployees>();
      mockFetchEmployees.mockResolvedValueOnce(mockEmployees).mockReturnValueOnce(oldRefresh.promise);
      const { rerender } = render(<EmployeePage />);
      await screen.findByText("Alice Smith");
      fireEvent.click(screen.getByRole("button", { name: /add employee/i }));
      fireEvent.click(screen.getByRole("button", { name: "Submit" }));
      await waitFor(() => expect(mockFetchEmployees).toHaveBeenCalledTimes(2));
      mockEmployeeService = { ...mockEmployeeService, fetchEmployees: vi.fn().mockResolvedValue(replacementEmployees) };

      rerender(<EmployeePage />);
      await screen.findByText("Carol White");
      await act(async () => oldRefresh.resolve(mockEmployees));

      expect(screen.getByText("Carol White")).toBeInTheDocument();
      expect(screen.queryByText("Alice Smith")).not.toBeInTheDocument();
      expect(screen.getByTestId("add-employee-modal")).toBeInTheDocument();
    });

    it("does not refresh or close a newer confirmation after an old removal completes", async () => {
      const oldRemoval = deferred<void>();
      mockRemoveAdminLocation.mockReturnValueOnce(oldRemoval.promise);
      mockFetchUserRole.mockResolvedValue("Owner");
      const { rerender } = render(<EmployeePage />);
      await screen.findByText("Alice Smith");
      await waitFor(() => expect(document.querySelectorAll(".delete-button")).toHaveLength(2));
      fireEvent.click(document.querySelectorAll(".delete-button")[0]!);
      fireEvent.click(screen.getByRole("button", { name: "Confirm Delete" }));
      const getLocations = vi.fn().mockResolvedValue([{ id: 7, Name: "New Branch" }]);
      const removeAdminLocation = vi.fn();
      mockLocationService = { getLocations, fetchUserRole: vi.fn().mockResolvedValue("Owner") };
      mockEmployeeService = { ...mockEmployeeService, fetchEmployees: vi.fn().mockResolvedValue(replacementEmployees), removeAdminLocation };

      rerender(<EmployeePage />);
      await screen.findByText("Carol White");
      fireEvent.click(screen.getByRole("button", { name: "Cancel Delete" }));
      fireEvent.click(document.querySelectorAll(".delete-button")[0]!);
      await act(async () => oldRemoval.resolve());

      expect(screen.getByTestId("delete-employee-modal")).toBeInTheDocument();
      expect(screen.getByText("Carol White")).toBeInTheDocument();
      expect(mockRemoveAdminLocation).toHaveBeenCalledExactlyOnceWith("alice@example.com");
      expect(removeAdminLocation).not.toHaveBeenCalled();
      expect(mockGetLocations).toHaveBeenCalledTimes(1);
      expect(getLocations).toHaveBeenCalledTimes(1);
    });

    it("keeps only the active StrictMode effect result", async () => {
      render(<StrictMode><EmployeePage /></StrictMode>);
      await screen.findByText("Alice Smith");

      expect(mockGetLocations).toHaveBeenCalledTimes(2);
      expect(mockFetchEmployees).toHaveBeenCalledExactlyOnceWith([1, 2]);
    });
  });

  // ── Rendering ─────────────────────────────────────────────────────────────

  describe("rendering", () => {
    it("renders the Add Employee button", () => {
      render(<EmployeePage />);

      expect(screen.getByRole("button", { name: /add employee/i })).toBeInTheDocument();
    });

    it("renders the table headers", () => {
      render(<EmployeePage />);

      expect(screen.getByText("Name")).toBeInTheDocument();
      expect(screen.getByText("Email")).toBeInTheDocument();
      expect(screen.getByText("Location ID")).toBeInTheDocument();
    });

    it("renders the empty state row before data loads", () => {
      mockFetchEmployees.mockReturnValue(new Promise(() => {}));

      render(<EmployeePage />);

      expect(screen.getByText("No employees at this time.")).toBeInTheDocument();
    });

    it("renders employee rows after data loads", async () => {
      render(<EmployeePage />);

      await waitFor(() => {
        expect(screen.getByText("Alice Smith")).toBeInTheDocument();
        expect(screen.getByText("Bob Jones")).toBeInTheDocument();
      });
    });

    it("renders employee emails", async () => {
      render(<EmployeePage />);

      await waitFor(() => {
        expect(screen.getByText("alice@example.com")).toBeInTheDocument();
        expect(screen.getByText("bob@example.com")).toBeInTheDocument();
      });
    });

    it("renders employee location IDs", async () => {
      render(<EmployeePage />);

      await waitFor(() => {
        expect(screen.getByText("1")).toBeInTheDocument();
        expect(screen.getByText("2")).toBeInTheDocument();
      });
    });

    it("does not render the empty state row when employees are loaded", async () => {
      render(<EmployeePage />);

      await waitFor(() => {
        expect(screen.queryByText("No employees at this time.")).not.toBeInTheDocument();
      });
    });

    it("renders the empty state when fetchEmployees returns an empty array", async () => {
      mockFetchEmployees.mockResolvedValue([]);

      render(<EmployeePage />);

      await waitFor(() => {
        expect(screen.getByText("No employees at this time.")).toBeInTheDocument();
      });
    });
  });

  // ── Role-based rendering ──────────────────────────────────────────────────

  describe("role-based rendering", () => {
    it("does not render the Delete column header for non-Owner roles", async () => {
      mockFetchUserRole.mockResolvedValue("Admin");

      render(<EmployeePage />);

      await waitFor(() => {
        expect(screen.queryByText("Delete")).not.toBeInTheDocument();
      });
    });

    it("renders the Delete column header for Owner role", async () => {
      mockFetchUserRole.mockResolvedValue("Owner");

      render(<EmployeePage />);

      await waitFor(() => {
        expect(screen.getByText("Delete")).toBeInTheDocument();
      });
    });

    it("does not render delete buttons for non-Owner roles", async () => {
      mockFetchUserRole.mockResolvedValue("Admin");

      render(<EmployeePage />);

      await waitFor(() => {
        expect(screen.queryAllByRole("button", { name: /delete/i })).toHaveLength(0);
      });
    });

    it("renders a delete button for each employee when role is Owner", async () => {
      mockFetchUserRole.mockResolvedValue("Owner");

      render(<EmployeePage />);

      await waitFor(() => {
        // lucide Trash2 icons render without accessible text so we target by class
        const deleteButtons = document.querySelectorAll(".delete-button");
        expect(deleteButtons).toHaveLength(mockEmployees.length);
      });
    });
  });

  // ── Data Fetching ─────────────────────────────────────────────────────────

  describe("data fetching", () => {
    it("calls getLocations on mount", async () => {
      render(<EmployeePage />);

      await waitFor(() => {
        expect(mockGetLocations).toHaveBeenCalledTimes(1);
      });
    });

    it("calls fetchUserRole on mount", async () => {
      render(<EmployeePage />);

      await waitFor(() => {
        expect(mockFetchUserRole).toHaveBeenCalledTimes(1);
      });
    });

    it("calls fetchEmployees with location IDs derived from getLocations", async () => {
      render(<EmployeePage />);

      await waitFor(() => {
        expect(mockFetchEmployees).toHaveBeenCalledWith([1, 2]);
      });
    });

    it("calls fetchEmployees with an empty array when there are no locations", async () => {
      mockGetLocations.mockResolvedValue([]);

      render(<EmployeePage />);

      await waitFor(() => {
        expect(mockFetchEmployees).toHaveBeenCalledWith([]);
      });
    });
  });

  // ── Add Employee Modal ────────────────────────────────────────────────────

  describe("add employee modal interaction", () => {
    it("does not render the modal on initial load", () => {
      render(<EmployeePage />);

      expect(screen.queryByTestId("add-employee-modal")).not.toBeInTheDocument();
    });

    it("opens the modal when the Add Employee button is clicked", () => {
      render(<EmployeePage />);

      fireEvent.click(screen.getByRole("button", { name: /add employee/i }));

      expect(screen.getByTestId("add-employee-modal")).toBeInTheDocument();
    });

    it("closes the modal when onClose is triggered", () => {
      render(<EmployeePage />);

      fireEvent.click(screen.getByRole("button", { name: /add employee/i }));
      fireEvent.click(screen.getByRole("button", { name: "Close" }));

      expect(screen.queryByTestId("add-employee-modal")).not.toBeInTheDocument();
    });

    it("refetches employees when onSuccess is triggered", async () => {
      render(<EmployeePage />);

      await waitFor(() => expect(mockFetchEmployees).toHaveBeenCalledTimes(1));

      fireEvent.click(screen.getByRole("button", { name: /add employee/i }));
      fireEvent.click(screen.getByRole("button", { name: "Submit" }));

      await waitFor(() => {
        expect(mockFetchEmployees).toHaveBeenCalledTimes(2);
      });
    });

    it("keeps the modal open after onSuccess is triggered", async () => {
      render(<EmployeePage />);

      fireEvent.click(screen.getByRole("button", { name: /add employee/i }));
      fireEvent.click(screen.getByRole("button", { name: "Submit" }));

      await waitFor(() => {
        expect(screen.getByTestId("add-employee-modal")).toBeInTheDocument();
      });
    });
  });

  // ── Delete Employee Modal ─────────────────────────────────────────────────

  describe("delete employee modal interaction", () => {
    beforeEach(() => {
      mockFetchUserRole.mockResolvedValue("Owner");
    });

    it("does not render the delete modal on initial load", async () => {
      render(<EmployeePage />);

      await waitFor(() => expect(mockFetchEmployees).toHaveBeenCalled());

      expect(screen.queryByTestId("delete-employee-modal")).not.toBeInTheDocument();
    });

    it("opens the delete modal when a delete button is clicked", async () => {
      render(<EmployeePage />);

      await waitFor(() => {
        expect(document.querySelectorAll(".delete-button")).toHaveLength(mockEmployees.length);
      });

      fireEvent.click(document.querySelectorAll(".delete-button")[0]!);

      expect(screen.getByTestId("delete-employee-modal")).toBeInTheDocument();
    });

    it("closes the delete modal when onCancel is triggered", async () => {
      render(<EmployeePage />);

      await waitFor(() => {
        expect(document.querySelectorAll(".delete-button")).toHaveLength(mockEmployees.length);
      });

      fireEvent.click(document.querySelectorAll(".delete-button")[0]!);
      fireEvent.click(screen.getByRole("button", { name: "Cancel Delete" }));

      expect(screen.queryByTestId("delete-employee-modal")).not.toBeInTheDocument();
    });

    it("calls removeAdminLocation with the selected employee's email on confirm", async () => {
      render(<EmployeePage />);

      await waitFor(() => {
        expect(document.querySelectorAll(".delete-button")).toHaveLength(mockEmployees.length);
      });

      fireEvent.click(document.querySelectorAll(".delete-button")[0]!);
      fireEvent.click(screen.getByRole("button", { name: "Confirm Delete" }));

      await waitFor(() => {
        expect(mockRemoveAdminLocation).toHaveBeenCalledWith(mockEmployees[0]!.email);
      });
    });

    it("refetches employees after a successful deletion", async () => {
      render(<EmployeePage />);

      await waitFor(() => expect(mockFetchEmployees).toHaveBeenCalledTimes(1));
      await waitFor(() => {
        expect(document.querySelectorAll(".delete-button")).toHaveLength(mockEmployees.length);
      });

      fireEvent.click(document.querySelectorAll(".delete-button")[0]!);
      fireEvent.click(screen.getByRole("button", { name: "Confirm Delete" }));

      await waitFor(() => {
        expect(mockFetchEmployees).toHaveBeenCalledTimes(2);
      });
    });

    it("closes the delete modal after confirming deletion", async () => {
      render(<EmployeePage />);

      await waitFor(() => {
        expect(document.querySelectorAll(".delete-button")).toHaveLength(mockEmployees.length);
      });

      fireEvent.click(document.querySelectorAll(".delete-button")[0]!);
      fireEvent.click(screen.getByRole("button", { name: "Confirm Delete" }));

      await waitFor(() => {
        expect(screen.queryByTestId("delete-employee-modal")).not.toBeInTheDocument();
      });
    });

    it("closes the delete modal even when removeAdminLocation throws", async () => {
      mockRemoveAdminLocation.mockRejectedValueOnce(new Error("Delete failed"));

      render(<EmployeePage />);

      await waitFor(() => {
        expect(document.querySelectorAll(".delete-button")).toHaveLength(mockEmployees.length);
      });

      fireEvent.click(document.querySelectorAll(".delete-button")[0]!);
      fireEvent.click(screen.getByRole("button", { name: "Confirm Delete" }));

      await waitFor(() => {
        expect(screen.queryByTestId("delete-employee-modal")).not.toBeInTheDocument();
      });
    });
  });
});
