import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import TodayRevenue from "./TodayRevenue";

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockGetTodayRevenue = vi.fn();

vi.mock("../di/container", () => ({
    useTransactions: () => ({
        getTodayRevenue: mockGetTodayRevenue,
    }),
}));

vi.mock("../styles/TodayRevenue.css", () => ({}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

const renderComponent = () => render(<TodayRevenue />);

// Gets the full text content of the amount div by joining all digit spans
const getAmountText = () => {
    const amount = document.querySelector(".dr-amount");
    return amount?.textContent ?? "";
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("TodayRevenue", () => {

    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("loading state", () => {

        it("shows fetching text while loading", () => {
            mockGetTodayRevenue.mockResolvedValue(new Promise(() => {}));
            renderComponent();

            expect(screen.getByText("Fetching...")).toBeDefined();
        });

        it("shows the Daily Revenue label", () => {
            mockGetTodayRevenue.mockResolvedValue(new Promise(() => {}));
            renderComponent();

            expect(screen.getByText("Daily Revenue")).toBeDefined();
        });

    });

    describe("success state", () => {

        it("displays formatted revenue after loading", async () => {
            mockGetTodayRevenue.mockResolvedValue(150.5);
            renderComponent();

            await waitFor(() => {
                expect(getAmountText()).toBe("$150.50");
            });
        });

        it("displays $0.00 when revenue is 0", async () => {
            mockGetTodayRevenue.mockResolvedValue(0);
            renderComponent();

            await waitFor(() => {
                expect(getAmountText()).toBe("$0.00");
            });
        });

        it("labels the initial read without claiming live or UTC updates", async () => {
            mockGetTodayRevenue.mockResolvedValue(100);
            renderComponent();

            await waitFor(() => {
                expect(screen.getByText("Today")).toBeDefined();
                expect(screen.queryByText(/Live|UTC/)).toBeNull();
            });
        });

        it("calls getTodayRevenue once on mount", async () => {
            mockGetTodayRevenue.mockResolvedValue(100);
            renderComponent();

            await waitFor(() => expect(mockGetTodayRevenue).toHaveBeenCalledTimes(1));
        });

        it("formats large revenue amounts correctly", async () => {
            mockGetTodayRevenue.mockResolvedValue(12345.67);
            renderComponent();

            await waitFor(() => {
                expect(getAmountText()).toBe("$12,345.67");
            });
        });

        it("retains the initial result when the component rerenders", async () => {
            mockGetTodayRevenue.mockResolvedValue(100);
            const { rerender } = renderComponent();
            await waitFor(() => expect(getAmountText()).toBe("$100.00"));
            rerender(<TodayRevenue />);
            expect(getAmountText()).toBe("$100.00");
            expect(mockGetTodayRevenue).toHaveBeenCalledTimes(1);
        });

        it("does not fetch on focus or visibility events", async () => {
            mockGetTodayRevenue.mockResolvedValue(100);
            renderComponent();
            await waitFor(() => expect(getAmountText()).toBe("$100.00"));
            window.dispatchEvent(new Event("focus"));
            document.dispatchEvent(new Event("visibilitychange"));
            expect(mockGetTodayRevenue).toHaveBeenCalledTimes(1);
            expect(getAmountText()).toBe("$100.00");
        });

    });

    describe("error state", () => {

        it("shows failed to load when getTodayRevenue returns null", async () => {
            mockGetTodayRevenue.mockResolvedValue(null);
            renderComponent();

            await waitFor(() => {
                expect(screen.getByText("Failed to load")).toBeDefined();
            });
        });

        it("shows Query failed footer when there is an error", async () => {
            mockGetTodayRevenue.mockResolvedValue(null);
            renderComponent();

            await waitFor(() => {
                expect(screen.getByText("Query failed")).toBeDefined();
            });
        });

        it("shows failed to load when getTodayRevenue throws", async () => {
            const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
            mockGetTodayRevenue.mockRejectedValue(new Error("Network error"));
            renderComponent();

            await waitFor(() => {
                expect(screen.getByText("Failed to load")).toBeDefined();
            });

            consoleSpy.mockRestore();
        });

        it("shows error-dot class on footer dot when there is an error", async () => {
            mockGetTodayRevenue.mockResolvedValue(null);
            renderComponent();

            await waitFor(() => {
                const dot = document.querySelector(".dr-dot");
                expect(dot?.classList.contains("error-dot")).toBe(true);
            });
        });

    });

    describe("when getTodayRevenue is not available", () => {

        it("shows failed to load when repository method is missing", async () => {
            const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

            mockGetTodayRevenue.mockImplementation(() => {
                throw new Error("not available");
            });

            renderComponent();

            await waitFor(() => {
                expect(screen.getByText("Failed to load")).toBeDefined();
            });

            consoleSpy.mockRestore();
        });

    });

});
