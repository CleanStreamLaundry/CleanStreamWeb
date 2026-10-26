import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";
import MonthlyIncome from "./MonthlyIncome";
import * as container from "../di/container";

// Mock the CSS import
vi.mock("../styles/MonthlyIncome.css", () => ({}));

// Mock the container
vi.mock("../di/container", () => ({
    useTransactions: vi.fn(),
}));

describe("MonthlyIncome", () => {
    const mockGetLast30DaysRevenue = vi.fn<ReturnType<typeof container.useTransactions>["getLast30DaysRevenue"]>();

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(container.useTransactions, { partial: true }).mockReturnValue({
            getLast30DaysRevenue: mockGetLast30DaysRevenue,
        });
    });

    describe("Initial Rendering", () => {
        it("renders the component with correct labels", () => {
            mockGetLast30DaysRevenue.mockResolvedValue({
                dailyData: [],
                total: 0,
            });

            render(<MonthlyIncome />);

            expect(screen.getByText("30-Day Income")).toBeInTheDocument();
        });

        it("shows loading state initially", () => {
            mockGetLast30DaysRevenue.mockImplementation(
                () => new Promise(() => { }) // Never resolves
            );

            render(<MonthlyIncome />);

            expect(screen.getByText("Fetching...")).toBeInTheDocument();
            const loadingChart = document.querySelector(".mi-chart-loading");
            expect(loadingChart).toBeInTheDocument();
        });

        it("displays the date range label", () => {
            mockGetLast30DaysRevenue.mockResolvedValue({
                dailyData: [],
                total: 0,
            });

            render(<MonthlyIncome />);

            const dateElement = document.querySelector(".mi-date");
            expect(dateElement).toBeInTheDocument();
            expect(dateElement?.textContent).toMatch(/\w+ \d+ - \w+ \d+/);
        });
    });

    describe("Data Loading", () => {
        it("calls getLast30DaysRevenue on mount", async () => {
            mockGetLast30DaysRevenue.mockResolvedValue({
                dailyData: [],
                total: 0,
            });

            render(<MonthlyIncome />);

            await waitFor(() => {
                expect(mockGetLast30DaysRevenue).toHaveBeenCalledTimes(1);
            });
        });

        it("displays total revenue correctly", async () => {
            mockGetLast30DaysRevenue.mockResolvedValue({
                dailyData: [
                    { date: "2024-01-01", amount: 100 },
                    { date: "2024-01-02", amount: 200 },
                ],
                total: 300,
            });

            render(<MonthlyIncome />);

            await waitFor(() => {
                expect(screen.getByText("$300")).toBeInTheDocument();
            });
        });

        it("displays formatted currency without decimals", async () => {
            mockGetLast30DaysRevenue.mockResolvedValue({
                dailyData: [],
                total: 1234.56,
            });

            render(<MonthlyIncome />);

            await waitFor(() => {
                expect(screen.getByText("$1,235")).toBeInTheDocument();
            });
        });
    });

    describe("Error Handling", () => {
        it("shows error state when getLast30DaysRevenue is not available", async () => {
            vi.mocked(container.useTransactions, { partial: true }).mockReturnValue({});

            render(<MonthlyIncome />);

            await waitFor(() => {
                expect(screen.getByText("Failed to load")).toBeInTheDocument();
                expect(screen.getByText("Query failed")).toBeInTheDocument();
            });
        });

        it("shows error state when getLast30DaysRevenue returns null", async () => {
            mockGetLast30DaysRevenue.mockResolvedValue(null);

            render(<MonthlyIncome />);

            await waitFor(() => {
                expect(screen.getByText("Failed to load")).toBeInTheDocument();
                expect(screen.getByText("Query failed")).toBeInTheDocument();
            });
        });

        it("shows error state when getLast30DaysRevenue throws an error", async () => {
            mockGetLast30DaysRevenue.mockRejectedValue(
                new Error("Network error")
            );

            render(<MonthlyIncome />);

            await waitFor(() => {
                expect(screen.getByText("Failed to load")).toBeInTheDocument();
                expect(screen.getByText("Query failed")).toBeInTheDocument();
            });
        });

        it("displays error dot when there is an error", async () => {
            mockGetLast30DaysRevenue.mockResolvedValue(null);

            render(<MonthlyIncome />);

            await waitFor(() => {
                const errorDot = document.querySelector(".mi-dot.error-dot");
                expect(errorDot).toBeInTheDocument();
            });
        });
    });

    describe("Chart Rendering", () => {
        it("renders SVG chart with data", async () => {
            mockGetLast30DaysRevenue.mockResolvedValue({
                dailyData: [
                    { date: "2024-01-01", amount: 100 },
                    { date: "2024-01-02", amount: 200 },
                    { date: "2024-01-03", amount: 150 },
                ],
                total: 450,
            });

            render(<MonthlyIncome />);

            await waitFor(() => {
                const svg = document.querySelector(".mi-chart-svg");
                expect(svg).toBeInTheDocument();
            });
        });

        it("renders correct number of data points", async () => {
            const dailyData = Array.from({ length: 30 }, (_, i) => ({
                date: `2024-01-${String(i + 1).padStart(2, "0")}`,
                amount: Math.random() * 100,
            }));

            mockGetLast30DaysRevenue.mockResolvedValue({
                dailyData,
                total: dailyData.reduce((sum, d) => sum + d.amount, 0),
            });

            render(<MonthlyIncome />);

            await waitFor(() => {
                const points = document.querySelectorAll(".mi-point");
                expect(points).toHaveLength(30);
            });
        });

        it("renders area path", async () => {
            mockGetLast30DaysRevenue.mockResolvedValue({
                dailyData: [
                    { date: "2024-01-01", amount: 100 },
                    { date: "2024-01-02", amount: 200 },
                ],
                total: 300,
            });

            render(<MonthlyIncome />);

            await waitFor(() => {
                const areaPath = document.querySelector(".mi-area");
                expect(areaPath).toBeInTheDocument();
                expect(areaPath?.getAttribute("d")).toBeTruthy();
            });
        });

        it("renders line path", async () => {
            mockGetLast30DaysRevenue.mockResolvedValue({
                dailyData: [
                    { date: "2024-01-01", amount: 100 },
                    { date: "2024-01-02", amount: 200 },
                ],
                total: 300,
            });

            render(<MonthlyIncome />);

            await waitFor(() => {
                const linePath = document.querySelector(".mi-line");
                expect(linePath).toBeInTheDocument();
                expect(linePath?.getAttribute("d")).toBeTruthy();
            });
        });

        it("does not render chart when no data", async () => {
            mockGetLast30DaysRevenue.mockResolvedValue({
                dailyData: [],
                total: 0,
            });

            render(<MonthlyIncome />);

            await waitFor(() => {
                const points = document.querySelectorAll(".mi-point");
                expect(points).toHaveLength(0);
            });
        });
    });

    describe("Tooltip Interactions", () => {
        it("shows tooltip on mouse enter", async () => {
            mockGetLast30DaysRevenue.mockResolvedValue({
                dailyData: [
                    { date: "2024-01-01", amount: 100 },
                    { date: "2024-01-02", amount: 200 },
                ],
                total: 300,
            });

            render(<MonthlyIncome />);

            await waitFor(() => {
                const points = document.querySelectorAll(".mi-point");
                expect(points.length).toBeGreaterThan(0);
            });

            const firstPoint = document.querySelector(".mi-point");
            if (firstPoint) {
                const svgPoint = firstPoint as SVGCircleElement;
                // Mock getBoundingClientRect
                vi.spyOn(
                    svgPoint.ownerSVGElement!,
                    "getBoundingClientRect"
                ).mockReturnValue({
                    width: 400,
                    height: 100,
                    top: 0,
                    left: 0,
                    right: 400,
                    bottom: 100,
                    x: 0,
                    y: 0,
                    toJSON: () => ({}),
                });

                fireEvent.mouseEnter(firstPoint);

                await waitFor(() => {
                    expect(screen.getByText("2024-01-01")).toBeInTheDocument();
                    expect(screen.getByText("$100")).toBeInTheDocument();
                });
            }
        });

        it("hides tooltip on mouse leave", async () => {
            mockGetLast30DaysRevenue.mockResolvedValue({
                dailyData: [
                    { date: "2024-01-01", amount: 100 },
                    { date: "2024-01-02", amount: 200 },
                ],
                total: 300,
            });

            render(<MonthlyIncome />);

            await waitFor(() => {
                const points = document.querySelectorAll(".mi-point");
                expect(points.length).toBeGreaterThan(0);
            });

            const firstPoint = document.querySelector(".mi-point");
            if (firstPoint) {
                const svgPoint = firstPoint as SVGCircleElement;
                vi.spyOn(
                    svgPoint.ownerSVGElement!,
                    "getBoundingClientRect"
                ).mockReturnValue({
                    width: 400,
                    height: 100,
                    top: 0,
                    left: 0,
                    right: 400,
                    bottom: 100,
                    x: 0,
                    y: 0,
                    toJSON: () => ({}),
                });

                fireEvent.mouseEnter(firstPoint);

                await waitFor(() => {
                    expect(screen.getByText("2024-01-01")).toBeInTheDocument();
                });

                fireEvent.mouseLeave(firstPoint);

                await waitFor(() => {
                    expect(
                        screen.queryByText("2024-01-01")
                    ).not.toBeInTheDocument();
                });
            }
        });

        it("displays correct tooltip data for each point", async () => {
            mockGetLast30DaysRevenue.mockResolvedValue({
                dailyData: [
                    { date: "2024-01-01", amount: 100 },
                    { date: "2024-01-02", amount: 250 },
                ],
                total: 350,
            });

            render(<MonthlyIncome />);

            await waitFor(() => {
                const points = document.querySelectorAll(".mi-point");
                expect(points.length).toBe(2);
            });

            const points = document.querySelectorAll(".mi-point");

            // Mock getBoundingClientRect for both points
            points.forEach((point) => {
                const svgPoint = point as SVGCircleElement;

                vi.spyOn(
                    svgPoint.ownerSVGElement!,
                    "getBoundingClientRect"
                ).mockReturnValue({
                    width: 400,
                    height: 100,
                    top: 0,
                    left: 0,
                    right: 400,
                    bottom: 100,
                    x: 0,
                    y: 0,
                    toJSON: () => ({}),
                });
            });

            fireEvent.mouseEnter(points[1]!);

            await waitFor(() => {
                expect(screen.getByText("2024-01-02")).toBeInTheDocument();
                expect(screen.getByText("$250")).toBeInTheDocument();
            });
        });
    });

    describe("UI States", () => {
        it("shows live status dot when data is loaded", async () => {
            mockGetLast30DaysRevenue.mockResolvedValue({
                dailyData: [{ date: "2024-01-01", amount: 100 }],
                total: 100,
            });

            render(<MonthlyIncome />);

            await waitFor(() => {
                const liveDot = document.querySelector(".mi-dot:not(.error-dot)");
                expect(liveDot).toBeInTheDocument();
            });
        });

        it("renders card with proper structure", async () => {
            mockGetLast30DaysRevenue.mockResolvedValue({
                dailyData: [],
                total: 0,
            });

            render(<MonthlyIncome />);

            await waitFor(() => {
                const card = document.querySelector(".mi-card");
                expect(card).toBeInTheDocument();

                const glow = document.querySelector(".mi-glow");
                expect(glow).toBeInTheDocument();

                const divider = document.querySelector(".mi-divider");
                expect(divider).toBeInTheDocument();
            });
        });
    });

    describe("Edge Cases", () => {
        it("does not restore old settled income or hover on a source departure and return", async () => {
            mockGetLast30DaysRevenue.mockResolvedValueOnce({
                dailyData: [{ date: "2024-01-01", amount: 100 }], total: 100,
            });
            const { rerender } = render(<MonthlyIncome />);
            expect(await screen.findByText("$100")).toBeInTheDocument();
            fireEvent.mouseEnter(document.querySelector(".mi-point")!);
            expect(document.querySelector(".mi-tooltip")).not.toBeNull();
            vi.mocked(container.useTransactions, { partial: true }).mockReturnValue({
                getLast30DaysRevenue: vi.fn().mockImplementation(() => new Promise(() => {})),
            });
            rerender(<MonthlyIncome />);
            let finish!: () => void;
            mockGetLast30DaysRevenue.mockImplementationOnce(() => new Promise(resolve => {
                finish = () => resolve({ dailyData: [{ date: "2024-01-02", amount: 200 }], total: 200 });
            }));
            vi.mocked(container.useTransactions, { partial: true }).mockReturnValue({
                getLast30DaysRevenue: mockGetLast30DaysRevenue,
            });
            rerender(<MonthlyIncome />);
            expect(screen.queryByText("$100")).not.toBeInTheDocument();
            expect(document.querySelector(".mi-tooltip")).toBeNull();
            await act(async () => finish());
            expect(screen.getByText("$200")).toBeInTheDocument();
            expect(document.querySelector(".mi-tooltip")).toBeNull();
        });

        it.each([false, true])("ignores obsolete source completion (reject=%s)", async (reject) => {
            let finish!: () => void;
            mockGetLast30DaysRevenue.mockImplementation(() => new Promise((resolve, fail) => {
                finish = () => reject ? fail(new Error("Obsolete request"))
                    : resolve({ dailyData: [], total: 500 });
            }));
            const { rerender } = render(<MonthlyIncome />);
            vi.mocked(container.useTransactions, { partial: true }).mockReturnValue({
                getLast30DaysRevenue: vi.fn().mockResolvedValue({ dailyData: [], total: 200 }),
            });
            rerender(<MonthlyIncome />);
            expect(await screen.findByText("$200")).toBeInTheDocument();
            await act(async () => finish());
            expect(screen.getByText("$200")).toBeInTheDocument();
            expect(screen.queryByText("$500")).not.toBeInTheDocument();
            expect(screen.queryByText("Failed to load")).not.toBeInTheDocument();
        });

        it("handles single data point", async () => {
            mockGetLast30DaysRevenue.mockResolvedValue({
                dailyData: [{ date: "2024-01-01", amount: 100 }],
                total: 100,
            });

            render(<MonthlyIncome />);

            await waitFor(() => {
                const points = document.querySelectorAll(".mi-point");
                expect(points).toHaveLength(1);
                expect(points[0]).toHaveAttribute("cx", "50");
                expect(document.querySelector(".mi-chart-svg")?.innerHTML).not.toMatch(/NaN|Infinity/);
            });
        });

        it("handles zero amounts", async () => {
            mockGetLast30DaysRevenue.mockResolvedValue({
                dailyData: [
                    { date: "2024-01-01", amount: 0 },
                    { date: "2024-01-02", amount: 0 },
                ],
                total: 0,
            });

            render(<MonthlyIncome />);

            await waitFor(() => {
                expect(screen.getByText("$0")).toBeInTheDocument();
            });
        });

        it("handles large amounts", async () => {
            mockGetLast30DaysRevenue.mockResolvedValue({
                dailyData: [{ date: "2024-01-01", amount: 999999 }],
                total: 999999,
            });

            render(<MonthlyIncome />);

            await waitFor(() => {
                expect(screen.getByText("$999,999")).toBeInTheDocument();
            });
        });
    });
});
