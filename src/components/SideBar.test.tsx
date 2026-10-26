import { act, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import SideBar from "../components/SideBar";
import { vi, describe, it, expect, beforeEach } from "vitest";

const mockNavigate = vi.fn();
const mockSignOut = vi.fn();
const mockFetchUserRole = vi.fn().mockResolvedValue("");
let mockLocationService = { fetchUserRole: mockFetchUserRole };

vi.mock("react-router-dom", async () => {
  const actual =
    await vi.importActual<typeof import("react-router-dom")>(
      "react-router-dom",
    );
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock("../di/container", () => ({
  useAuth: () => ({
    signOut: mockSignOut,
  }),
  useLocations: () => mockLocationService,
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("SideBar", () => {
  const renderComponent = () =>
    render(
      <MemoryRouter>
        <SideBar />
      </MemoryRouter>,
    );

  beforeEach(() => {
    vi.clearAllMocks();
    mockLocationService = { fetchUserRole: mockFetchUserRole };
    mockFetchUserRole.mockResolvedValue("");
  });

  it("does not reload the role for unchanged service identity", async () => {
    mockFetchUserRole.mockResolvedValue("Owner");
    const { rerender } = renderComponent();
    fireEvent.click(screen.getByLabelText("Open sidebar"));
    await screen.findByText("Employees");

    rerender(<MemoryRouter><SideBar /></MemoryRouter>);

    expect(mockFetchUserRole).toHaveBeenCalledTimes(1);
  });

  it.each(["Admin", null])("ignores an old Owner result after the current role becomes %s", async (role) => {
    const previous = deferred<string | null>();
    mockFetchUserRole.mockReturnValueOnce(previous.promise);
    const { rerender } = renderComponent();
    fireEvent.click(screen.getByLabelText("Open sidebar"));
    const replacement = vi.fn<() => Promise<string | null>>().mockResolvedValue(role);
    mockLocationService = { fetchUserRole: replacement };

    await act(async () => rerender(<MemoryRouter><SideBar /></MemoryRouter>));
    expect(replacement).toHaveBeenCalledTimes(1);
    await act(async () => previous.resolve("Owner"));

    expect(screen.queryByText("Employees")).not.toBeInTheDocument();
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
  });

  it("waits for signOut to finish before navigating", async () => {
    const pending = deferred<void>();
    mockSignOut.mockReturnValueOnce(pending.promise);
    renderComponent();
    fireEvent.click(screen.getByLabelText("Open sidebar"));
    fireEvent.click(screen.getByText("Sign Out"));

    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(mockNavigate).not.toHaveBeenCalled();
    await act(async () => pending.resolve());
    expect(mockNavigate).toHaveBeenCalledWith("/");
  });

  it("renders closed sidebar initially", () => {
    renderComponent();
    expect(screen.getByLabelText("Open sidebar")).toBeInTheDocument();
  });

  it("opens sidebar when toggle is clicked", () => {
    renderComponent();
    fireEvent.click(screen.getByLabelText("Open sidebar"));
    expect(screen.getByLabelText("Close sidebar")).toBeInTheDocument();
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
  });

  it("navigates to dashboard and closes sidebar", () => {
    renderComponent();
    fireEvent.click(screen.getByLabelText("Open sidebar"));
    fireEvent.click(screen.getByText("Dashboard"));
    expect(mockNavigate).toHaveBeenCalledWith("/home");
  });

  it("navigates to refunds", () => {
    renderComponent();
    fireEvent.click(screen.getByLabelText("Open sidebar"));
    fireEvent.click(screen.getByText("Refunds"));
    expect(mockNavigate).toHaveBeenCalledWith("/home/refunds");
  });

  it("navigates to locations", () => {
    renderComponent();
    fireEvent.click(screen.getByLabelText("Open sidebar"));
    fireEvent.click(screen.getByText("Locations"));
    expect(mockNavigate).toHaveBeenCalledWith("/home/locations");
  });

  it("calls signOut and redirects to root", async () => {
    mockSignOut.mockResolvedValue(undefined);
    renderComponent();
    fireEvent.click(screen.getByLabelText("Open sidebar"));
    fireEvent.click(screen.getByText("Sign Out"));
    expect(mockSignOut).toHaveBeenCalled();
  });

  it("redirects after signOut", async () => {
    mockSignOut.mockResolvedValue(undefined);
    renderComponent();
    fireEvent.click(screen.getByLabelText("Open sidebar"));
    fireEvent.click(screen.getByText("Sign Out"));
    await Promise.resolve();
    expect(mockNavigate).toHaveBeenCalledWith("/");
  });

  it("shows Employees button for Owner role", async () => {
    mockFetchUserRole.mockResolvedValue("Owner");
    renderComponent();
    fireEvent.click(screen.getByLabelText("Open sidebar"));
    await waitFor(() =>
      expect(screen.getByText("Employees")).toBeInTheDocument(),
    );
  });

  it("hides Employees button for non-Owner role", async () => {
    mockFetchUserRole.mockResolvedValue("Employee");
    renderComponent();
    fireEvent.click(screen.getByLabelText("Open sidebar"));
    await waitFor(() =>
      expect(screen.queryByText("Employees")).not.toBeInTheDocument(),
    );
  });
});
