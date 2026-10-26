import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import EmployeePage from "./EmployeeDashboardPage";
import type { EmployeeRecord, EmployeeService } from "../interfaces/EmployeeService";
import type { Location, LocationService } from "../interfaces/LocationService";

const mocks = vi.hoisted(() => ({
  locations: {
    getLocations: vi.fn<LocationService["getLocations"]>(),
    fetchUserRole: vi.fn<LocationService["fetchUserRole"]>(),
  },
  employees: {
    fetchEmployees: vi.fn<EmployeeService["fetchEmployees"]>(),
    removeAdminLocation: vi.fn<EmployeeService["removeAdminLocation"]>(),
  },
}));

vi.mock("../di/container", () => ({
  useLocations: () => mocks.locations,
  useEmployee: () => mocks.employees,
}));
vi.mock("./AddEmployeeModal", () => ({
  default: ({ isOpen, onSuccess }: { isOpen: boolean; onSuccess: () => void }) =>
    isOpen ? <button onClick={onSuccess}>Simulate completed addition</button> : null,
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

const locations: Location[] = [{ id: 1, Name: "Branch", Address: "Fixture", Longitude: 0, Latitude: 0 }];
const alice: EmployeeRecord = { name: "Alice", email: "alice@example.invalid", locationID: 1 };
const bob: EmployeeRecord = { name: "Bob", email: "bob@example.invalid", locationID: 1 };

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Network prohibited"); }));
  mocks.locations.getLocations.mockResolvedValue(locations);
  mocks.locations.fetchUserRole.mockResolvedValue("Owner");
  mocks.employees.fetchEmployees.mockResolvedValue([alice, bob]);
  mocks.employees.removeAdminLocation.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("latest employee refresh must win within the same service lifetime", async () => {
  const older = deferred<EmployeeRecord[]>();
  mocks.employees.fetchEmployees
    .mockResolvedValueOnce([alice])
    .mockReturnValueOnce(older.promise)
    .mockResolvedValueOnce([alice, bob]);
  render(<EmployeePage />);
  await screen.findByText("Alice");
  fireEvent.click(screen.getByRole("button", { name: "Add Employee" }));
  fireEvent.click(screen.getByRole("button", { name: "Simulate completed addition" }));
  await waitFor(() => expect(mocks.employees.fetchEmployees).toHaveBeenCalledTimes(2));
  fireEvent.click(screen.getByRole("button", { name: "Simulate completed addition" }));
  await screen.findByText("Bob");
  await act(async () => older.resolve([alice]));
  expect(screen.queryByText("Bob")).toBeInTheDocument();
});

it("an old removal must not close a newer employee confirmation", async () => {
  const removal = deferred<void>();
  mocks.employees.removeAdminLocation.mockReturnValueOnce(removal.promise);
  render(<EmployeePage />);
  await screen.findByText("Alice");
  fireEvent.click(within(screen.getByText("Alice").closest("tr")!).getByRole("button"));
  fireEvent.click(screen.getByRole("button", { name: "Remove" }));
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  fireEvent.click(within(screen.getByText("Bob").closest("tr")!).getByRole("button"));
  await act(async () => removal.resolve());
  expect(screen.queryByRole("heading", { name: "Remove employee?" })).toBeInTheDocument();
  expect(mocks.employees.removeAdminLocation).toHaveBeenCalledExactlyOnceWith(alice.email);
  expect(screen.getByRole("heading", { name: "Remove employee?" }).parentElement).toHaveTextContent("Bob");
});

it.each(["locations", "employees"] as const)(
  "a refresh supersedes an initial load delayed at %s",
  async stage => {
    const initialLocations = deferred<Location[]>();
    const initialEmployees = deferred<EmployeeRecord[]>();
    if (stage === "locations") {
      mocks.locations.getLocations.mockReturnValueOnce(initialLocations.promise);
    } else {
      mocks.employees.fetchEmployees.mockReturnValueOnce(initialEmployees.promise);
    }
    render(<EmployeePage />);
    if (stage === "employees") {
      await waitFor(() => expect(mocks.employees.fetchEmployees).toHaveBeenCalledTimes(1));
    }
    fireEvent.click(screen.getByRole("button", { name: "Add Employee" }));
    fireEvent.click(screen.getByRole("button", { name: "Simulate completed addition" }));
    await screen.findByText("Bob");

    await act(async () => {
      if (stage === "locations") initialLocations.resolve(locations);
      else initialEmployees.resolve([alice]);
    });

    expect(screen.queryByText("Bob")).toBeInTheDocument();
    expect(mocks.locations.getLocations).toHaveBeenCalledTimes(2);
    expect(mocks.employees.fetchEmployees).toHaveBeenCalledTimes(stage === "locations" ? 1 : 2);
  },
);

it("an old removal must not close a canceled and reopened confirmation for the same employee", async () => {
  const removal = deferred<void>();
  mocks.employees.removeAdminLocation.mockReturnValueOnce(removal.promise);
  render(<EmployeePage />);
  await screen.findByText("Alice");
  fireEvent.click(within(screen.getByText("Alice").closest("tr")!).getByRole("button"));
  fireEvent.click(screen.getByRole("button", { name: "Remove" }));
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  fireEvent.click(within(screen.getByText("Alice").closest("tr")!).getByRole("button"));
  await act(async () => removal.resolve());

  expect(screen.queryByRole("heading", { name: "Remove employee?" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Remove employee?" }).parentElement).toHaveTextContent("Alice");
  expect(screen.getByRole("button", { name: "Remove" })).toBeEnabled();
  expect(mocks.employees.removeAdminLocation).toHaveBeenCalledExactlyOnceWith(alice.email);
});
