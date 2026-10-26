import { vi } from "vitest";

vi.mock("../di/container", () => ({
    useRefunds: vi.fn(() => ({
        getRefunds: vi.fn(),
    })),
    useFunctions: vi.fn(() => ({
        callFunction: vi.fn(),
    })),
}));

import { act, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import RefundsPage from "./RefundsDashboardPage";;
import type { Refund } from "../interfaces/RefundService";
import { useRefunds, useFunctions } from "../di/container";

const mockRefunds: Refund[] = [
    {
        refundId: 1,
        id: "REF-001",
        customerId: "CUST-001",
        customerName: "John Doe",
        transactionId: "TXN-001",
        amount: 99.99,
        reason: "Product defective",
        date: "2024-01-15",
        status: "pending",
        attempts: 1,
    },
    {
        refundId: 2,
        id: "REF-002",
        customerId: "CUST-002",
        customerName: "Jane Smith",
        transactionId: "TXN-002",
        amount: 149.5,
        reason: "Not as described",
        date: "2024-01-14",
        status: "approved",
        attempts: 2,
    },
    {
        refundId: 3,
        id: "REF-003",
        customerId: "CUST-003",
        customerName: "Bob Johnson",
        transactionId: "TXN-003",
        amount: 75.0,
        reason: "Changed my mind",
        date: "2024-01-13",
        status: "denied",
        attempts: 1,
    },
];

describe("RefundsPage", () => {
    const mockGetRefunds = vi.fn();
    const mockCallFunction = vi.fn();

    const mockRefundService = {
        getRefunds: mockGetRefunds,
    };

    const mockFunctionService = {
        callFunction: mockCallFunction,
    };

    beforeEach(() => {
        vi.clearAllMocks();
        mockGetRefunds.mockResolvedValue(mockRefunds);
        mockCallFunction.mockImplementation((name: string) => Promise.resolve({
            success: true,
            status: name === "approveRefund" ? "approved" : "denied",
        }));
    });

    it.each([false, true])("ignores obsolete load completion (reject=%s)", async (reject) => {
        let finish!: () => void;
        mockGetRefunds.mockImplementationOnce(() => new Promise<Refund[]>((resolve, fail) => {
            finish = () => reject ? fail(new Error("Obsolete")) : resolve(mockRefunds);
        }));
        const { rerender } = render(<RefundsPage refundService={mockRefundService} functionService={mockFunctionService} />);
        rerender(<RefundsPage refundService={{ getRefunds: vi.fn().mockResolvedValue([]) }} functionService={mockFunctionService} />);
        expect(await screen.findByText("No loyalty credit requests in this category.")).toBeInTheDocument();
        await act(async () => finish());
        expect(screen.queryByText("REF-001")).not.toBeInTheDocument();
        expect(screen.queryByText("Failed to load refunds")).not.toBeInTheDocument();
    });

    it("does not resolve default services when injected services are provided", async () => {
        const { rerender } = render(
            <RefundsPage
                refundService={mockRefundService}
                functionService={mockFunctionService}
            />
        );

        expect(await screen.findByText("REF-001")).toBeInTheDocument();

        rerender(
            <RefundsPage
                refundService={mockRefundService}
                functionService={mockFunctionService}
            />
        );

        expect(useRefunds).not.toHaveBeenCalled();
        expect(useFunctions).not.toHaveBeenCalled();
    });

    it("renders the page title and subtitle", async () => {
        render(
            <RefundsPage
                refundService={mockRefundService}
                functionService={mockFunctionService}
            />
        );

        expect(screen.getByText("Loyalty Credit Requests")).toBeInTheDocument();
        expect(
            screen.getByText("Review requests to return value to a customer's loyalty balance")
        ).toBeInTheDocument();
    });

    it("loads and displays refunds", async () => {
        render(
            <RefundsPage
                refundService={mockRefundService}
                functionService={mockFunctionService}
            />
        );

        await waitFor(() => {
            expect(mockGetRefunds).toHaveBeenCalled();
        });

        expect(screen.getByText("REF-001")).toBeInTheDocument();
        expect(screen.getByText("John Doe")).toBeInTheDocument();
        expect(screen.getByText("$99.99")).toBeInTheDocument();
    });

    it("displays loading state initially", () => {
        render(
            <RefundsPage
                refundService={mockRefundService}
                functionService={mockFunctionService}
            />
        );

        expect(screen.getByText("Loading refunds...")).toBeInTheDocument();
    });

    it("displays error state when fetch fails", async () => {
        mockGetRefunds.mockRejectedValue(new Error("Network error"));

        render(
            <RefundsPage
                refundService={mockRefundService}
                functionService={mockFunctionService}
            />
        );

        await waitFor(() => {
            expect(screen.getByText("Failed to load refunds")).toBeInTheDocument();
        });
    });

    it("filters refunds by status", async () => {
        render(
            <RefundsPage
                refundService={mockRefundService}
                functionService={mockFunctionService}
            />
        );

        await waitFor(() => {
            expect(screen.getByText("REF-001")).toBeInTheDocument();
        });

        // Click pending filter
        const pendingButton = screen.getByRole("button", { name: /Pending/ });
        fireEvent.click(pendingButton);

        expect(screen.getByText("REF-001")).toBeInTheDocument();
        expect(screen.queryByText("REF-002")).not.toBeInTheDocument();
        expect(screen.queryByText("REF-003")).not.toBeInTheDocument();
    });

    it("closes modal when clicking close button", async () => {
        render(
            <RefundsPage
                refundService={mockRefundService}
                functionService={mockFunctionService}
            />
        );

        await waitFor(() => {
            expect(screen.getByText("REF-001")).toBeInTheDocument();
        });

        const respondButton = screen.getByRole("button", { name: "Respond" });
        fireEvent.click(respondButton);

        const closeButton = screen.getByRole("button", { name: "✕" });
        fireEvent.click(closeButton);

        await waitFor(() => {
            expect(screen.queryByText("Respond to Loyalty Credit Request")).not.toBeInTheDocument();
        });
    });

    it("selects approve action in modal", async () => {
        render(
            <RefundsPage
                refundService={mockRefundService}
                functionService={mockFunctionService}
            />
        );

        await waitFor(() => {
            expect(screen.getByText("REF-001")).toBeInTheDocument();
        });

        const respondButton = screen.getByRole("button", { name: "Respond" });
        fireEvent.click(respondButton);

        const approveButton = screen.getByRole("button", { name: "✓ Approve" });
        fireEvent.click(approveButton);

        expect(approveButton).toHaveClass("selected");
    });

    it("selects deny action in modal", async () => {
        render(
            <RefundsPage
                refundService={mockRefundService}
                functionService={mockFunctionService}
            />
        );

        await waitFor(() => {
            expect(screen.getByText("REF-001")).toBeInTheDocument();
        });

        const respondButton = screen.getByRole("button", { name: "Respond" });
        fireEvent.click(respondButton);

        const denyButton = screen.getByRole("button", { name: "✕ Deny" });
        fireEvent.click(denyButton);

        expect(denyButton).toHaveClass("selected");
    });

    it("submits approval successfully", async () => {
        render(
            <RefundsPage
                refundService={mockRefundService}
                functionService={mockFunctionService}
            />
        );

        await waitFor(() => {
            expect(screen.getByText("REF-001")).toBeInTheDocument();
        });

        const respondButton = screen.getByRole("button", { name: "Respond" });
        fireEvent.click(respondButton);

        const approveButton = screen.getByRole("button", { name: "✓ Approve" });
        fireEvent.click(approveButton);

        const submitButton = screen.getByRole("button", { name: "Submit" });
        fireEvent.click(submitButton);

        await waitFor(() => {
            expect(mockCallFunction).toHaveBeenCalledWith("approveRefund", {
                refundId: 1,
                note: "",
            });
        });

        expect(screen.getByText("Loyalty credit REF-001 approved.")).toBeInTheDocument();
    });

    it("submits denial with note successfully", async () => {
        render(
            <RefundsPage
                refundService={mockRefundService}
                functionService={mockFunctionService}
            />
        );

        await waitFor(() => {
            expect(screen.getByText("REF-001")).toBeInTheDocument();
        });

        const respondButton = screen.getByRole("button", { name: "Respond" });
        fireEvent.click(respondButton);

        const denyButton = screen.getByRole("button", { name: "✕ Deny" });
        fireEvent.click(denyButton);

        const noteInput = screen.getByPlaceholderText(
            "Add a note to the customer..."
        );
        fireEvent.change(noteInput, {
            target: { value: "Does not meet refund policy" },
        });

        const submitButton = screen.getByRole("button", { name: "Submit" });
        fireEvent.click(submitButton);

        await waitFor(() => {
            expect(mockCallFunction).toHaveBeenCalledWith("denyRefund", {
                refundId: 1,
                note: "Does not meet refund policy",
            });
        });

        expect(screen.getByText("Loyalty credit REF-001 denied.")).toBeInTheDocument();
    });

    it("shows error toast when submission fails", async () => {
        mockCallFunction.mockRejectedValue(new Error("API Error"));

        render(
            <RefundsPage
                refundService={mockRefundService}
                functionService={mockFunctionService}
            />
        );

        await waitFor(() => {
            expect(screen.getByText("REF-001")).toBeInTheDocument();
        });

        const respondButton = screen.getByRole("button", { name: "Respond" });
        fireEvent.click(respondButton);

        const approveButton = screen.getByRole("button", { name: "✓ Approve" });
        fireEvent.click(approveButton);

        const submitButton = screen.getByRole("button", { name: "Submit" });
        fireEvent.click(submitButton);

        await waitFor(() => {
            expect(
                screen.getByText("The loyalty credit was not completed. Please try again.")
            ).toBeInTheDocument();
        });

        const row = screen.getAllByText("REF-001")[0]?.closest("tr");
        expect(row).toHaveClass("status-row--pending");
    });

    it("disables submit button when no action selected", async () => {
        render(
            <RefundsPage
                refundService={mockRefundService}
                functionService={mockFunctionService}
            />
        );

        await waitFor(() => {
            expect(screen.getByText("REF-001")).toBeInTheDocument();
        });

        const respondButton = screen.getByRole("button", { name: "Respond" });
        fireEvent.click(respondButton);

        const submitButton = screen.getByRole("button", { name: "Submit" });
        expect(submitButton).toBeDisabled();
    });

    it("shows Resolved label for non-pending refunds", async () => {
        render(
            <RefundsPage
                refundService={mockRefundService}
                functionService={mockFunctionService}
            />
        );

        await waitFor(() => {
            expect(screen.getAllByText("Resolved")).toHaveLength(2);
        });
    });


    it("shows empty state when no refunds match filter", async () => {
        mockGetRefunds.mockResolvedValue([]);

        render(
            <RefundsPage
                refundService={mockRefundService}
                functionService={mockFunctionService}
            />
        );

        await waitFor(() => {
            expect(screen.getByText("No loyalty credit requests in this category.")).toBeInTheDocument();
        });
    });

    it("updates refund status in table after successful submission", async () => {
        render(
            <RefundsPage
                refundService={mockRefundService}
                functionService={mockFunctionService}
            />
        );

        await waitFor(() => {
            expect(screen.getByText("REF-001")).toBeInTheDocument();
        });

        // Initially pending
        const row = screen.getByText("REF-001").closest("tr");
        expect(row).toHaveClass("status-row--pending");

        const respondButton = screen.getByRole("button", { name: "Respond" });
        fireEvent.click(respondButton);

        const approveButton = screen.getByRole("button", { name: "✓ Approve" });
        fireEvent.click(approveButton);

        const submitButton = screen.getByRole("button", { name: "Submit" });
        fireEvent.click(submitButton);

        await waitFor(() => {
            const updatedRow = screen.getByText("REF-001").closest("tr");
            expect(updatedRow).toHaveClass("status-row--approved");
        });
    });
});
