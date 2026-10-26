import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from "vitest";
import { render, screen, waitFor, within, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import RefundsPage from "../components/RefundsDashboardPage";
import TodayRevenue from "../components/TodayRevenue";
import MonthlyIncome from "../components/MonthlyIncome";
import LocationsPage from "../components/LocationsDashboardPage";
import AddLocationModal from "../components/AddLocationModal";
import AddMachineModal from "../components/AddMachineModal";
import EmployeePage from "../components/EmployeeDashboardPage";
import { useEmployee } from "../di/container";
import type { LocationService, Machine, Location } from "../interfaces/LocationService";
import type { CoordinateService } from "../interfaces/CoordinateService";
import type { EmployeeService } from "../interfaces/EmployeeService";
import type { TransactionRepository } from "../supabase/repositories/TranscationRepository";

vi.mock("../di/container", () => ({
    useTransactions: vi.fn(),
    useRefunds: vi.fn(),
    useFunctions: vi.fn(),
    useCoordinates: vi.fn(),
    useLocations: vi.fn(),
    useEmployee: vi.fn(),
}));

vi.mock("../supabase/client", () => ({
    getSupabaseClient: vi.fn(),
}));

import { useTransactions, useLocations, useCoordinates } from "../di/container";


const buildDailyData = (days = 30, amountPerDay = 100) => {
    const result: { date: string; amount: number }[] = [];
    const today = new Date();
    for (let i = days - 1; i >= 0; i--) {
        const d = new Date();
        d.setDate(today.getDate() - i);
        result.push({ date: d.toISOString().split("T")[0]!, amount: amountPerDay });
    }
    return result;
};


describe("RefundsPage UI (Integration with mocks)", () => {
    it("approves a refund and updates the correct row", async () => {
        const user = userEvent.setup();

        const mockRefund = {
            refundId: 1,
            id: "R1",
            transactionId: 130,
            customerId: "acf8e5f3-03f5-4e2a-a120-fcd10ca64e1a",
            customerName: "John Doe",
            attempts: 1,
            amount: 2,
            reason: "test",
            date: new Date().toISOString(),
            status: "pending" as const,
        };

        const getRefunds = vi.fn().mockResolvedValue([mockRefund]);
        const callFunction = vi.fn().mockResolvedValue({ success: true, status: "approved" });

        render(
            <RefundsPage
                refundService={{ getRefunds }}
                functionService={{ callFunction }}
            />
        );

        const row = await screen.findByText("John Doe");
        const tableRow = row.closest("tr")!;
        const rowUtils = within(tableRow);

        expect(rowUtils.getByText("Pending")).toBeInTheDocument();

        await user.click(rowUtils.getByRole("button", { name: /respond/i }));

        const modalEl = document.querySelector(".modal") as HTMLElement;
        const modalUtils = within(modalEl);

        await user.click(modalUtils.getByRole("button", { name: /approve/i }));
        await user.click(modalUtils.getByRole("button", { name: /submit/i }));

        await waitFor(() => {
            expect(callFunction).toHaveBeenCalledWith("approveRefund", {
                refundId: 1,
                note: "",
            });
        });

        await waitFor(() => {
            expect(rowUtils.getByText("Approved")).toBeInTheDocument();
        });

        await waitFor(() => {
            const toastEl = document.querySelector(".toast") as HTMLElement;
            expect(toastEl).toBeInTheDocument();
            expect(toastEl).toHaveTextContent(/approved/i);
        });
    });

    it("denies a refund and updates the correct row", async () => {
        const user = userEvent.setup();

        const mockRefund = {
            refundId: 2,
            id: "R2",
            transactionId: 200,
            customerId: "user-2",
            customerName: "Jane Smith",
            attempts: 2,
            amount: 5,
            reason: "another test",
            date: new Date().toISOString(),
            status: "pending" as const,
        };

        const getRefunds = vi.fn().mockResolvedValue([mockRefund]);
        const callFunction = vi.fn().mockResolvedValue({ success: true, status: "denied" });

        render(
            <RefundsPage
                refundService={{ getRefunds }}
                functionService={{ callFunction }}
            />
        );

        const row = await screen.findByText("Jane Smith");
        const tableRow = row.closest("tr")!;
        const rowUtils = within(tableRow);

        expect(rowUtils.getByText("Pending")).toBeInTheDocument();

        await user.click(rowUtils.getByRole("button", { name: /respond/i }));

        const modalEl = document.querySelector(".modal") as HTMLElement;
        const modalUtils = within(modalEl);

        await user.click(modalUtils.getByRole("button", { name: /deny/i }));
        await user.click(modalUtils.getByRole("button", { name: /submit/i }));

        await waitFor(() => {
            expect(callFunction).toHaveBeenCalledWith("denyRefund", {
                refundId: 2,
                note: "",
            });
        });

        await waitFor(() => {
            expect(rowUtils.getByText("Denied")).toBeInTheDocument();
        });
    });
});

describe("TodayRevenue UI", () => {
    let consoleErrorSpy: MockInstance<typeof console.error>;

    beforeEach(() => {
        vi.clearAllMocks();
        consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
        consoleErrorSpy.mockRestore();
    });

    const getRevenueEl = () =>
        document.querySelector(".dr-amount") as HTMLElement;

    it("displays revenue when fetch succeeds", async () => {
        vi.mocked(useTransactions, { partial: true }).mockReturnValue({
            getTodayRevenue: vi.fn<TransactionRepository["getTodayRevenue"]>().mockResolvedValue(123.45),
        });

        render(<TodayRevenue />);

        expect(document.querySelector(".dr-amount.loading")).toBeInTheDocument();

        await waitFor(() => {
            expect(getRevenueEl()).toHaveTextContent("$123.45");
        });
    });

    it("displays error state when fetch returns null", async () => {
        vi.mocked(useTransactions, { partial: true }).mockReturnValue({
            getTodayRevenue: vi.fn<TransactionRepository["getTodayRevenue"]>().mockResolvedValue(null),
        });

        render(<TodayRevenue />);

        await waitFor(() => {
            expect(screen.getByText("Failed to load")).toBeInTheDocument();
        });
    });

    it("displays error state when fetch throws", async () => {
        vi.mocked(useTransactions, { partial: true }).mockReturnValue({
            getTodayRevenue: vi.fn<TransactionRepository["getTodayRevenue"]>().mockRejectedValue(new Error("Network error")),
        });

        render(<TodayRevenue />);

        await waitFor(() => {
            expect(screen.getByText("Failed to load")).toBeInTheDocument();
        });
    });

    it("retains the initial revenue across rerenders without another read", async () => {
        const getTodayRevenue = vi.fn<TransactionRepository["getTodayRevenue"]>().mockResolvedValue(50.0);
        vi.mocked(useTransactions, { partial: true }).mockReturnValue({
            getTodayRevenue,
        });

        const { rerender } = render(<TodayRevenue />);

        await waitFor(() => {
            expect(getRevenueEl()).toHaveTextContent("$50.00");
        });

        rerender(<TodayRevenue />);
        expect(getRevenueEl()).toHaveTextContent("$50.00");
        expect(screen.getByText("Today")).toBeInTheDocument();
        expect(screen.queryByText(/Live|UTC/)).not.toBeInTheDocument();
        expect(getTodayRevenue).toHaveBeenCalledOnce();
    });

    it("finishes the initial read without leaving a background refresh timer", async () => {
        const getTodayRevenue = vi.fn<TransactionRepository["getTodayRevenue"]>().mockResolvedValue(0);
        vi.mocked(useTransactions, { partial: true }).mockReturnValue({
            getTodayRevenue,
        });

        vi.useFakeTimers();
        try {
            const { unmount } = render(<TodayRevenue />);
            await act(async () => { await vi.advanceTimersByTimeAsync(0); });
            expect(getRevenueEl()).toHaveTextContent("$0.00");
            await act(async () => { await vi.advanceTimersByTimeAsync(120000); });
            expect(getTodayRevenue).toHaveBeenCalledOnce();
            expect(vi.getTimerCount()).toBe(0);
            unmount();
            expect(vi.getTimerCount()).toBe(0);
        } finally {
            vi.useRealTimers();
        }
    });
});

describe("MonthlyIncome UI", () => {
    let consoleErrorSpy: MockInstance<typeof console.error>;

    beforeEach(() => {
        vi.clearAllMocks();
        consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
        consoleErrorSpy.mockRestore();
    });

    const getAmountEl = () =>
        document.querySelector(".mi-amount") as HTMLElement;

    const getChartEl = () =>
        document.querySelector(".mi-chart") as HTMLElement;

    it("shows loading state initially", async () => {
        vi.mocked(useTransactions, { partial: true }).mockReturnValue({
            getLast30DaysRevenue: vi.fn<TransactionRepository["getLast30DaysRevenue"]>().mockReturnValue(new Promise(() => {})),
        });

        render(<MonthlyIncome />);

        expect(document.querySelector(".mi-chart-loading")).toBeInTheDocument();
        expect(getAmountEl()).toBeNull();
    });

    it("displays total and chart when fetch succeeds", async () => {
        const dailyData = buildDailyData(30, 200);  // 30 days × $200 = $6,000

        vi.mocked(useTransactions, { partial: true }).mockReturnValue({
            getLast30DaysRevenue: vi.fn<TransactionRepository["getLast30DaysRevenue"]>().mockResolvedValue({
                dailyData,
                total: 6000,
            }),
        });

        render(<MonthlyIncome />);

        await waitFor(() => {
            expect(getAmountEl()).toHaveTextContent("$6,000");
        });

        expect(getChartEl()).toBeInTheDocument();
        expect(document.querySelector(".mi-chart-loading")).toBeNull();
    });

    it("renders one SVG data point per day", async () => {
        const dailyData = buildDailyData(30, 50);

        vi.mocked(useTransactions, { partial: true }).mockReturnValue({
            getLast30DaysRevenue: vi.fn<TransactionRepository["getLast30DaysRevenue"]>().mockResolvedValue({ dailyData, total: 1500 }),
        });

        render(<MonthlyIncome />);

        await waitFor(() => {
            const points = document.querySelectorAll(".mi-point");
            expect(points).toHaveLength(30);
        });
    });

    it("displays the correct date range label", async () => {
        vi.mocked(useTransactions, { partial: true }).mockReturnValue({
            getLast30DaysRevenue: vi.fn<TransactionRepository["getLast30DaysRevenue"]>().mockResolvedValue({
                dailyData: buildDailyData(30, 0),
                total: 0,
            }),
        });

        render(<MonthlyIncome />);

        const dateEl = document.querySelector(".mi-date") as HTMLElement;
        expect(dateEl).toBeInTheDocument();
        expect(dateEl.textContent).toMatch(/\w{3} \d+ - \w{3} \d+/);
    });

    it("displays $0 total when all days have zero revenue", async () => {
        vi.mocked(useTransactions, { partial: true }).mockReturnValue({
            getLast30DaysRevenue: vi.fn<TransactionRepository["getLast30DaysRevenue"]>().mockResolvedValue({
                dailyData: buildDailyData(30, 0),
                total: 0,
            }),
        });

        render(<MonthlyIncome />);

        await waitFor(() => {
            expect(getAmountEl()).toHaveTextContent("$0");
        });
    });


    it("displays error state when fetch returns null", async () => {
        vi.mocked(useTransactions, { partial: true }).mockReturnValue({
            getLast30DaysRevenue: vi.fn<TransactionRepository["getLast30DaysRevenue"]>().mockResolvedValue(null),
        });

        render(<MonthlyIncome />);

        await waitFor(() => {
            expect(screen.getByText("Failed to load")).toBeInTheDocument();
        });

        expect(getAmountEl()).toBeNull();
        expect(getChartEl()).toBeNull();
    });

    it("displays error state when fetch throws", async () => {
        vi.mocked(useTransactions, { partial: true }).mockReturnValue({
            getLast30DaysRevenue: vi.fn<TransactionRepository["getLast30DaysRevenue"]>().mockRejectedValue(new Error("Network error")),
        });

        render(<MonthlyIncome />);

        await waitFor(() => {
            expect(screen.getByText("Failed to load")).toBeInTheDocument();
        });
    });

    it("shows error footer dot when fetch fails", async () => {
        vi.mocked(useTransactions, { partial: true }).mockReturnValue({
            getLast30DaysRevenue: vi.fn<TransactionRepository["getLast30DaysRevenue"]>().mockResolvedValue(null),
        });

        render(<MonthlyIncome />);

        await waitFor(() => {
            const dot = document.querySelector(".mi-dot") as HTMLElement;
            expect(dot).toHaveClass("error-dot");
        });
    });

    it("shows 'Query failed' footer text when fetch fails", async () => {
        vi.mocked(useTransactions, { partial: true }).mockReturnValue({
            getLast30DaysRevenue: vi.fn<TransactionRepository["getLast30DaysRevenue"]>().mockResolvedValue(null),
        });

        render(<MonthlyIncome />);

        await waitFor(() => {
            expect(screen.getByText("Query failed")).toBeInTheDocument();
        });
    });

    it("displays error when getLast30DaysRevenue is not available in context", async () => {
        vi.mocked(useTransactions, { partial: true }).mockReturnValue({});

        render(<MonthlyIncome />);

        await waitFor(() => {
            expect(screen.getByText("Failed to load")).toBeInTheDocument();
        });

        expect(screen.getByText("Query failed")).toBeInTheDocument();
        expect(getAmountEl()).toBeNull();
        expect(getChartEl()).toBeNull();
        expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it("shows 'Last 30 days' footer text on success", async () => {
        vi.mocked(useTransactions, { partial: true }).mockReturnValue({
            getLast30DaysRevenue: vi.fn<TransactionRepository["getLast30DaysRevenue"]>().mockResolvedValue({
                dailyData: buildDailyData(30, 100),
                total: 3000,
            }),
        });

        render(<MonthlyIncome />);

        await waitFor(() => {
            expect(screen.getByText("Last 30 days")).toBeInTheDocument();
        });
    });

    it("shows 'Fetching...' footer text while loading", () => {
        vi.mocked(useTransactions, { partial: true }).mockReturnValue({
            getLast30DaysRevenue: vi.fn<TransactionRepository["getLast30DaysRevenue"]>().mockReturnValue(new Promise(() => {})),
        });

        render(<MonthlyIncome />);

        expect(screen.getByText("Fetching...")).toBeInTheDocument();
    });

    it("shows tooltip with date and amount on data point hover", async () => {
        const user = userEvent.setup();
        const dailyData = buildDailyData(30, 300);

        vi.mocked(useTransactions, { partial: true }).mockReturnValue({
            getLast30DaysRevenue: vi.fn<TransactionRepository["getLast30DaysRevenue"]>().mockResolvedValue({ dailyData, total: 9000 }),
        });

        render(<MonthlyIncome />);

        await waitFor(() => {
            expect(document.querySelectorAll(".mi-point")).toHaveLength(30);
        });

        const firstPoint = document.querySelector(".mi-point") as SVGCircleElement;
        await user.hover(firstPoint);

        await waitFor(() => {
            const tooltip = document.querySelector(".mi-tooltip") as HTMLElement;
            expect(tooltip).toBeInTheDocument();
            expect(tooltip.querySelector(".mi-tooltip-date")).toHaveTextContent(dailyData[0]!.date);
            expect(tooltip.querySelector(".mi-tooltip-amount")).toHaveTextContent("$300");
        });
    });

    it("hides tooltip when mouse leaves a data point", async () => {
        const user = userEvent.setup();
        const dailyData = buildDailyData(30, 300);

        vi.mocked(useTransactions, { partial: true }).mockReturnValue({
            getLast30DaysRevenue: vi.fn<TransactionRepository["getLast30DaysRevenue"]>().mockResolvedValue({ dailyData, total: 9000 }),
        });

        render(<MonthlyIncome />);

        await waitFor(() => {
            expect(document.querySelectorAll(".mi-point")).toHaveLength(30);
        });

        const firstPoint = document.querySelector(".mi-point") as SVGCircleElement;
        await user.hover(firstPoint);

        await waitFor(() => {
            expect(document.querySelector(".mi-tooltip")).toBeInTheDocument();
        });

        await user.unhover(firstPoint);

        await waitFor(() => {
            expect(document.querySelector(".mi-tooltip")).toBeNull();
        });
    });
});

const mockLocations = [
    { id: 1, Name: "Downtown Laundromat", Address: "123 Main St, Chicago, IL", Latitude: 41.8827, Longitude: -87.6233 },
    { id: 2, Name: "Uptown Wash", Address: "456 Oak Ave, Chicago, IL", Latitude: 41.9742, Longitude: -87.6575 },
];

const mockMachines: Machine[] = [
    {
        id: 1,
        Name: "Washer #1",
        Price: 2.5,
        Runtime: 30,
        Machine_type: "Washer",
        Status: "idle",
        Weight_kg: 30,
        Location_ID: 1,
    },
    {
        id: 2,
        Name: "Dryer #1",
        Price: 2.5,
        Runtime: 30,
        Machine_type: "Dryer",
        Status: "running",
        Weight_kg: 45,
        Location_ID: 1,
    },
];

const getAddLocationBtn = () =>
    document.querySelector('button[name="Add location button"]') as HTMLElement;

const getAddMachineBtn = () =>
    document.querySelector(".machine-description button") as HTMLElement;

// Returns the modal card element.
const getModalCard = () =>
    document.querySelector(".modal-card") as HTMLElement;

const getModalTitle = () =>
    document.querySelector(".modal-card .top-section p") as HTMLElement;

describe("LocationsPage UI (Integration with mocks)", () => {
    let consoleErrorSpy: MockInstance<typeof console.error>;

    beforeEach(() => {
        vi.clearAllMocks();
        consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
        consoleErrorSpy.mockRestore();
    });

    const setupLocationService = (overrides: Partial<LocationService> = {}) => {
        vi.mocked(useLocations, { partial: true }).mockReturnValue({
            getLocations: vi.fn<LocationService["getLocations"]>().mockResolvedValue(mockLocations),
            getMachines: vi.fn<LocationService["getMachines"]>().mockResolvedValue(mockMachines),
            addLocations: vi.fn<LocationService["addLocations"]>().mockResolvedValue(undefined),
            addMachines: vi.fn<LocationService["addMachines"]>().mockResolvedValue(undefined),
            fetchUserRole: vi.fn<LocationService["fetchUserRole"]>().mockResolvedValue("Owner"),
            getWasherSizeRates: vi.fn<LocationService["getWasherSizeRates"]>().mockResolvedValue([]),
            saveWasherSizeRate: vi.fn<LocationService["saveWasherSizeRate"]>().mockResolvedValue(undefined),
            saveCortinaConfig: vi.fn<LocationService["saveCortinaConfig"]>().mockResolvedValue(undefined),
            ...overrides,
        });
    };

    it("renders the location select dropdown on load", async () => {
        setupLocationService();
        render(<LocationsPage />);

        await waitFor(() => {
            expect(screen.getByRole("option", { name: "Downtown Laundromat" })).toBeInTheDocument();
            expect(screen.getByRole("option", { name: "Uptown Wash" })).toBeInTheDocument();
        });
    });

    it("shows 'Add Location' button for Owner role", async () => {
        setupLocationService();
        render(<LocationsPage />);

        await waitFor(() => {
            expect(getAddLocationBtn()).toBeInTheDocument();
        });
    });

    it("hides 'Add Location' button for non-Owner role", async () => {
        setupLocationService({ fetchUserRole: vi.fn<LocationService["fetchUserRole"]>().mockResolvedValue("Employee") });
        render(<LocationsPage />);

        await waitFor(() => {
            expect(screen.getByRole("option", { name: "Downtown Laundromat" })).toBeInTheDocument();
        });

        expect(getAddLocationBtn()).toBeNull();
    });

    it("fetches and displays machines when a location is selected", async () => {
        const user = userEvent.setup();
        setupLocationService();
        render(<LocationsPage />);

        await waitFor(() => {
            expect(screen.getByRole("option", { name: "Downtown Laundromat" })).toBeInTheDocument();
        });

        await user.selectOptions(screen.getByRole("combobox"), "1");

        await waitFor(() => {
            expect(screen.getByText("Washer #1")).toBeInTheDocument();
            expect(screen.getByText("Dryer #1")).toBeInTheDocument();
        });
    });

    it("shows 'No machines at this location' when machine list is empty", async () => {
        const user = userEvent.setup();
        setupLocationService({ getMachines: vi.fn<LocationService["getMachines"]>().mockResolvedValue([]) });
        render(<LocationsPage />);

        await waitFor(() => {
            expect(screen.getByRole("option", { name: "Downtown Laundromat" })).toBeInTheDocument();
        });

        await user.selectOptions(screen.getByRole("combobox"), "1");

        await waitFor(() => {
            expect(screen.getByText("No machines at this location.")).toBeInTheDocument();
        });
    });

    it("displays machine data correctly after selecting a location", async () => {
        const user = userEvent.setup();
        setupLocationService();
        render(<LocationsPage />);

        await waitFor(() => {
            expect(screen.getByRole("option", { name: "Downtown Laundromat" })).toBeInTheDocument();
        });

        await user.selectOptions(screen.getByRole("combobox"), "1");

        const washerRow = await screen.findByText("Washer #1");
        const dryerRow = await screen.findByText("Dryer #1");

        const washerTr = washerRow.closest("tr")!;
        const dryerTr = dryerRow.closest("tr")!;

        expect(washerTr).toHaveTextContent("Washer");
        expect(washerTr).toHaveTextContent("30 kg");

        expect(dryerTr).toHaveTextContent("Dryer");
        expect(dryerTr).toHaveTextContent("45 kg");
    });

    it("opens the Add Machine modal when the page button is clicked", async () => {
        const user = userEvent.setup();
        setupLocationService();
        render(<LocationsPage />);

        await waitFor(() => {
            expect(getAddMachineBtn()).toBeInTheDocument();
        });

        await user.click(getAddMachineBtn());

        await waitFor(() => {
            expect(getModalCard()).toBeInTheDocument();
            expect(getModalTitle()).toHaveTextContent("Add Machine");
        });
    });

    it("opens the Add Location modal when the page button is clicked", async () => {
        const user = userEvent.setup();
        setupLocationService();
        render(<LocationsPage />);

        await waitFor(() => {
            expect(getAddLocationBtn()).toBeInTheDocument();
        });

        await user.click(getAddLocationBtn());

        await waitFor(() => {
            expect(getModalCard()).toBeInTheDocument();
            expect(getModalTitle()).toHaveTextContent("Add Location");
        });
    });

    it("logs an error when getLocations fails", async () => {
        setupLocationService({
            getLocations: vi.fn<LocationService["getLocations"]>().mockRejectedValue(new Error("Fetch failed")),
        });
        render(<LocationsPage />);

        await waitFor(() => {
            expect(consoleErrorSpy).toHaveBeenCalledWith(
                "Failed to fetch locations:",
                expect.any(Error)
            );
        });
    });

    it("logs an error when getMachines fails", async () => {
        const user = userEvent.setup();
        setupLocationService({
            getMachines: vi.fn<LocationService["getMachines"]>().mockRejectedValue(new Error("Machine fetch failed")),
        });
        render(<LocationsPage />);

        await waitFor(() => {
            expect(screen.getByRole("option", { name: "Downtown Laundromat" })).toBeInTheDocument();
        });

        await user.selectOptions(screen.getByRole("combobox"), "1");

        await waitFor(() => {
            expect(consoleErrorSpy).toHaveBeenCalledWith(
                "Failed to fetch machines:",
                expect.any(Error)
            );
        });
    });
});

describe("AddLocationModal UI (Integration with mocks)", () => {
    const defaultCoordinates = { lat: 41.8827, lon: -87.6233 };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    const setupServices = (overrides: {
        getCoordinates?: CoordinateService["getCoordinates"];
        addLocations?: LocationService["addLocations"];
    } = {}) => {
        vi.mocked(useCoordinates).mockReturnValue({
            getCoordinates: overrides.getCoordinates ?? vi.fn<CoordinateService["getCoordinates"]>().mockResolvedValue(defaultCoordinates),
        });
        vi.mocked(useLocations, { partial: true }).mockReturnValue({
            addLocations: overrides.addLocations ?? vi.fn<LocationService["addLocations"]>().mockResolvedValue(undefined),
        });
    };

    const getSubmitBtn = () =>
        document.querySelector(".modal-card .btn-submit") as HTMLElement;

    const fillForm = async (user: ReturnType<typeof userEvent.setup>) => {
        await user.type(screen.getByLabelText(/location name/i), "My Laundromat");
        await user.type(screen.getByLabelText(/street address/i), "123 Main St");
        await user.type(screen.getByLabelText(/city/i), "Chicago");
        await user.selectOptions(screen.getByLabelText(/state/i), "IL");
        await user.type(screen.getByLabelText(/zip code/i), "60601");
    };

    const fillAndSubmit = async (user: ReturnType<typeof userEvent.setup>) => {
        await fillForm(user);
        await user.click(getSubmitBtn());
    };

    it("renders all form fields when open", () => {
        setupServices();
        render(<AddLocationModal isOpen onClose={vi.fn()} />);

        expect(screen.getByLabelText(/location name/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/street address/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/city/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/state/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/zip code/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/country/i)).toBeInTheDocument();
    });

    it("does not render when isOpen is false", () => {
        setupServices();
        render(<AddLocationModal isOpen={false} onClose={vi.fn()} />);

        expect(document.querySelector(".modal-card")).toBeNull();
    });

    it("shows success state after a valid submission", async () => {
        const user = userEvent.setup();
        setupServices();
        render(<AddLocationModal isOpen onClose={vi.fn()} />);

        await fillAndSubmit(user);

        await waitFor(() => {
            expect(screen.getByText("Location Added!")).toBeInTheDocument();
        });
    });

    it("calls addLocations with correct payload", async () => {
        const user = userEvent.setup();
        const addLocations = vi.fn<LocationService["addLocations"]>().mockResolvedValue(undefined);
        setupServices({ addLocations });
        render(<AddLocationModal isOpen onClose={vi.fn()} />);

        await fillAndSubmit(user);

        await waitFor(() => {
            expect(addLocations).toHaveBeenCalledWith(
                expect.objectContaining({
                    Name: "My Laundromat",
                    Address: expect.stringContaining("123 Main St"),
                    Latitude: defaultCoordinates.lat,
                    Longitude: defaultCoordinates.lon,
                })
            );
        });
    });

    it("shows error banner when coordinate lookup returns null", async () => {
        const user = userEvent.setup();
        setupServices({ getCoordinates: vi.fn<CoordinateService["getCoordinates"]>().mockResolvedValue(null) });
        render(<AddLocationModal isOpen onClose={vi.fn()} />);

        await fillAndSubmit(user);

        await waitFor(() => {
            expect(screen.getByText(/could not find coordinates/i)).toBeInTheDocument();
        });
    });

    it("shows error banner when addLocations returns an error string", async () => {
        const user = userEvent.setup();
        setupServices({ addLocations: vi.fn<LocationService["addLocations"]>().mockResolvedValue("Location already exists") });
        render(<AddLocationModal isOpen onClose={vi.fn()} />);

        await fillAndSubmit(user);

        await waitFor(() => {
            expect(screen.getByText("Location already exists")).toBeInTheDocument();
        });
    });

    it("shows error banner when addLocations throws", async () => {
        const user = userEvent.setup();
        setupServices({ addLocations: vi.fn<LocationService["addLocations"]>().mockRejectedValue(new Error("Server error")) });
        render(<AddLocationModal isOpen onClose={vi.fn()} />);

        await fillAndSubmit(user);

        await waitFor(() => {
            expect(screen.getByText("Server error")).toBeInTheDocument();
        });
    });

    it("clears error banner on retry after failure", async () => {
        const user = userEvent.setup();
        const addLocations = vi.fn<LocationService["addLocations"]>()
            .mockResolvedValueOnce("First attempt failed")
            .mockResolvedValueOnce(undefined);
        setupServices({ addLocations });
        render(<AddLocationModal isOpen onClose={vi.fn()} />);

        await fillAndSubmit(user);
        await waitFor(() => {
            expect(screen.getByText("First attempt failed")).toBeInTheDocument();
        });

        await user.click(getSubmitBtn());
        await waitFor(() => {
            expect(screen.queryByText("First attempt failed")).toBeNull();
        });
    });

    it("calls onClose when the close button is clicked", async () => {
        const user = userEvent.setup();
        const onClose = vi.fn();
        setupServices();
        render(<AddLocationModal isOpen onClose={onClose} />);

        await user.click(screen.getByRole("button", { name: /close modal/i }));

        expect(onClose).toHaveBeenCalledOnce();
    });

    it("calls onClose when clicking the backdrop", async () => {
        const user = userEvent.setup();
        const onClose = vi.fn();
        setupServices();
        render(<AddLocationModal isOpen onClose={onClose} />);

        const backdrop = document.querySelector(".modal-backdrop") as HTMLElement;
        await user.click(backdrop);

        expect(onClose).toHaveBeenCalledOnce();
    });

    it("resets form fields after closing", async () => {
        const user = userEvent.setup();
        setupServices();
        const { rerender } = render(<AddLocationModal isOpen onClose={vi.fn()} />);

        await user.type(screen.getByLabelText(/location name/i), "Temp Name");
        await user.click(screen.getByRole("button", { name: /close modal/i }));

        rerender(<AddLocationModal isOpen onClose={vi.fn()} />);

        expect(screen.getByLabelText<HTMLInputElement>(/location name/i).value).toBe("");
    });
});

describe("AddMachineModal UI (Integration with mocks)", () => {
    const defaultLocations = [
        { id: 1, name: "Downtown Laundromat" },
        { id: 2, name: "Uptown Wash" },
    ];
    const defaultMachineTypes = ["Washer", "Dryer"];

    beforeEach(() => {
        vi.clearAllMocks();
    });

    const setupLocationService = (overrides: Partial<LocationService> = {}) => {
        vi.mocked(useLocations, { partial: true }).mockReturnValue({
            addMachines: vi.fn<LocationService["addMachines"]>().mockResolvedValue(undefined),
            getWasherSizeRates: vi.fn<LocationService["getWasherSizeRates"]>().mockResolvedValue([
                { id: 12, location_id: 1, size_label: "Small", capacity_kg: 3, price_cents: 250, is_active: true, review_required: false },
            ]),
            ...overrides,
        });
    };

    const getModal = () => document.querySelector(".modal-card") as HTMLElement;
    const getSubmitBtn = () =>
        document.querySelector(".modal-card .btn-submit") as HTMLElement;

    const fillAndSubmit = async (user: ReturnType<typeof userEvent.setup>) => {
        const modal = getModal();

        await user.type(within(modal).getByLabelText(/machine name/i), "Washer #5");

        await user.clear(within(modal).getByLabelText(/weight/i));
        await user.type(within(modal).getByLabelText(/weight/i), "3");

        await user.clear(within(modal).getByLabelText(/run time/i));
        await user.type(within(modal).getByLabelText(/run time/i), "30");

        await user.selectOptions(within(modal).getByLabelText(/machine type/i), "Washer");
        await user.selectOptions(within(modal).getByLabelText(/location/i), "1");
        await waitFor(() => within(modal).getByRole("option", { name: "Small · 3 kg · $2.50" }));
        await user.selectOptions(within(modal).getByLabelText(/washer size/i), "12");

        await user.click(getSubmitBtn());
    };

    it("renders all form fields when open", () => {
        setupLocationService();
        render(
            <AddMachineModal
                isOpen
                onClose={vi.fn()}
                machineTypes={defaultMachineTypes}
                locations={defaultLocations}
            />
        );

        const modal = getModal();

        expect(within(modal).getByLabelText(/machine name/i)).toBeInTheDocument();
        expect(within(modal).getByLabelText(/weight/i)).toBeInTheDocument();
        expect(within(modal).getByLabelText(/run time/i)).toBeInTheDocument();
        expect(within(modal).getByLabelText(/machine type/i)).toBeInTheDocument();
        expect(within(modal).getByLabelText(/location/i)).toBeInTheDocument();
    });

    it("does not render when isOpen is false", () => {
        setupLocationService();
        render(
            <AddMachineModal
                isOpen={false}
                onClose={vi.fn()}
                machineTypes={defaultMachineTypes}
                locations={defaultLocations}
            />
        );

        expect(getModal()).toBeNull();
    });

    it("populates machine type options from props", () => {
        setupLocationService();
        render(
            <AddMachineModal
                isOpen
                onClose={vi.fn()}
                machineTypes={defaultMachineTypes}
                locations={defaultLocations}
            />
        );

        const modal = getModal();
        expect(within(modal).getByRole("option", { name: "Washer" })).toBeInTheDocument();
        expect(within(modal).getByRole("option", { name: "Dryer" })).toBeInTheDocument();
    });

    it("populates location options from props", () => {
        setupLocationService();
        render(
            <AddMachineModal
                isOpen
                onClose={vi.fn()}
                machineTypes={defaultMachineTypes}
                locations={defaultLocations}
            />
        );

        const modal = getModal();
        expect(within(modal).getByRole("option", { name: "Downtown Laundromat" })).toBeInTheDocument();
        expect(within(modal).getByRole("option", { name: "Uptown Wash" })).toBeInTheDocument();
    });

    it("shows success state after a valid submission", async () => {
        const user = userEvent.setup();
        setupLocationService();

        render(
            <AddMachineModal
                isOpen
                onClose={vi.fn()}
                machineTypes={defaultMachineTypes}
                locations={defaultLocations}
            />
        );

        await fillAndSubmit(user);

        await waitFor(() => {
            expect(screen.getByText("Machine Added!")).toBeInTheDocument();
        });
    });

    it("calls addMachines with correct payload", async () => {
        const user = userEvent.setup();
        const addMachines = vi.fn<LocationService["addMachines"]>().mockResolvedValue(undefined);
        setupLocationService({ addMachines });

        render(
            <AddMachineModal
                isOpen
                onClose={vi.fn()}
                machineTypes={defaultMachineTypes}
                locations={defaultLocations}
            />
        );

        await fillAndSubmit(user);

        await waitFor(() => {
            expect(addMachines).toHaveBeenCalledWith(
                expect.objectContaining({
                    Name: "Washer #5",
                    Machine_type: "Washer",
                    Location_ID: 1,
                    Status: "idle",
                })
            );
        });
    });

    it("calls onSuccess callback after successful submission", async () => {
        const user = userEvent.setup();
        const onSuccess = vi.fn();
        setupLocationService();

        render(
            <AddMachineModal
                isOpen
                onClose={vi.fn()}
                onSuccess={onSuccess}
                machineTypes={defaultMachineTypes}
                locations={defaultLocations}
            />
        );

        await fillAndSubmit(user);

        await waitFor(() => {
            expect(onSuccess).toHaveBeenCalledOnce();
        });
    });

    it("shows error banner when addMachines returns an error string", async () => {
        const user = userEvent.setup();
        setupLocationService({
            addMachines: vi.fn<LocationService["addMachines"]>().mockResolvedValue("Machine name already taken"),
        });

        render(
            <AddMachineModal
                isOpen
                onClose={vi.fn()}
                machineTypes={defaultMachineTypes}
                locations={defaultLocations}
            />
        );

        await fillAndSubmit(user);

        await waitFor(() => {
            expect(within(getModal()).getByText("Machine name already taken")).toBeInTheDocument();
        });
    });

    it("shows error banner when addMachines throws", async () => {
        const user = userEvent.setup();
        setupLocationService({
            addMachines: vi.fn<LocationService["addMachines"]>().mockRejectedValue(new Error("Network error")),
        });

        render(
            <AddMachineModal
                isOpen
                onClose={vi.fn()}
                machineTypes={defaultMachineTypes}
                locations={defaultLocations}
            />
        );

        await fillAndSubmit(user);

        await waitFor(() => {
            expect(within(getModal()).getByText("Network error")).toBeInTheDocument();
        });
    });

    it("calls onClose when the close button is clicked", async () => {
        const user = userEvent.setup();
        const onClose = vi.fn();
        setupLocationService();

        render(
            <AddMachineModal
                isOpen
                onClose={onClose}
                machineTypes={defaultMachineTypes}
                locations={defaultLocations}
            />
        );

        await user.click(within(getModal()).getByRole("button", { name: /close modal/i }));

        expect(onClose).toHaveBeenCalledOnce();
    });

    it("calls onClose when clicking the backdrop", async () => {
        const user = userEvent.setup();
        const onClose = vi.fn();
        setupLocationService();

        render(
            <AddMachineModal
                isOpen
                onClose={onClose}
                machineTypes={defaultMachineTypes}
                locations={defaultLocations}
            />
        );

        const backdrop = document.querySelector(".modal-backdrop") as HTMLElement;
        await user.click(backdrop);

        expect(onClose).toHaveBeenCalledOnce();
    });

    it("resets form after closing", async () => {
        const user = userEvent.setup();
        setupLocationService();

        const { rerender } = render(
            <AddMachineModal
                isOpen
                onClose={vi.fn()}
                machineTypes={defaultMachineTypes}
                locations={defaultLocations}
            />
        );

        await user.type(within(getModal()).getByLabelText(/machine name/i), "Temp Machine");
        await user.click(within(getModal()).getByRole("button", { name: /close modal/i }));

        rerender(
            <AddMachineModal
                isOpen
                onClose={vi.fn()}
                machineTypes={defaultMachineTypes}
                locations={defaultLocations}
            />
        );

        expect(within(getModal()).getByLabelText<HTMLInputElement>(/machine name/i).value).toBe("");
    });
});

describe("EmployeePage UI (Integration with mocks)", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    const mockLocations: Location[] = [
        { id: 1, Name: "Location A", Address: "123 Main St", Latitude: 41.8827, Longitude: -87.6233 },
        { id: 2, Name: "Location B", Address: "456 Oak Ave", Latitude: 41.9742, Longitude: -87.6575 },
    ];

    const mockEmployees = [
        { name: "John Doe", email: "john@test.com", locationID: 1 },
        { name: "Jane Smith", email: "jane@test.com", locationID: 2 },
    ];

    const setupServices = ({
                               employees = mockEmployees,
                               locations = mockLocations,
                           } = {}) => {
        vi.mocked(useLocations, { partial: true }).mockReturnValue({
            getLocations: vi.fn<LocationService["getLocations"]>().mockResolvedValue(locations),
            fetchUserRole: vi.fn<LocationService["fetchUserRole"]>().mockResolvedValue("Owner"),
        });

        vi.mocked(useEmployee, { partial: true }).mockReturnValue({
            fetchEmployees: vi.fn<EmployeeService["fetchEmployees"]>().mockResolvedValue(employees),
            assignAdminLocation: vi.fn<EmployeeService["assignAdminLocation"]>().mockResolvedValue(undefined),
        });
    };

    const openAddEmployeeModal = async (user: ReturnType<typeof userEvent.setup>) => {
        await act(async () => {
            await user.click(screen.getByRole("button", { name: /add employee/i }));
        });
    };

    const fillEmployeeForm = async (modalUtils: ReturnType<typeof within>, user: ReturnType<typeof userEvent.setup>) => {
        await act(async () => {
            await user.type(modalUtils.getByLabelText(/employee email/i), "new@test.com");
            await user.selectOptions(modalUtils.getByLabelText(/location/i), "1");
        });
    };

    const submitEmployeeForm = async (modalUtils: ReturnType<typeof within>, user: ReturnType<typeof userEvent.setup>) => {
        await act(async () => {
            await user.click(modalUtils.getByRole("button", { name: /add employee/i }));
        });
    };

    it("opens Add Employee modal when button is clicked", async () => {
        const user = userEvent.setup();
        setupServices();

        render(<EmployeePage />);

        await openAddEmployeeModal(user);

        await waitFor(() => {
            expect(screen.getAllByText("Add Employee").length).toBeGreaterThan(0);
        });
    });

    it("refreshes employee list after successful add", async () => {
        const user = userEvent.setup();

        const fetchEmployees = vi.fn<EmployeeService["fetchEmployees"]>()
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce(mockEmployees);

        vi.mocked(useLocations, { partial: true }).mockReturnValue({
            getLocations: vi.fn<LocationService["getLocations"]>().mockResolvedValue(mockLocations),
            fetchUserRole: vi.fn<LocationService["fetchUserRole"]>().mockResolvedValue("Owner"),
        });

        vi.mocked(useEmployee, { partial: true }).mockReturnValue({
            fetchEmployees,
            assignAdminLocation: vi.fn<EmployeeService["assignAdminLocation"]>().mockResolvedValue(undefined),
        });

        render(<EmployeePage />);

        await waitFor(() => {
            expect(screen.getByText("No employees at this time.")).toBeInTheDocument();
        });

        await openAddEmployeeModal(user);

        const modal = document.querySelector(".modal-card") as HTMLElement;
        const modalUtils = within(modal);

        await fillEmployeeForm(modalUtils, user);
        await submitEmployeeForm(modalUtils, user);

        await waitFor(() => {
            expect(fetchEmployees).toHaveBeenCalledTimes(2);
        });

        await waitFor(() => {
            expect(screen.getByText("John Doe")).toBeInTheDocument();
        });
    });
});
