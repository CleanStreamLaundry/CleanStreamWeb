// src/data/repositories/RefundRepository.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SupabaseClient } from "@supabase/supabase-js";
import { RefundRepository } from "./RefundRepository";

const createMockClient = () => {
    const mockFetch = vi.fn<typeof fetch>().mockRejectedValue(new Error('Unexpected fetch'));
    const client = new SupabaseClient('https://example.invalid', 'test-key', {
        accessToken: async () => 'test-token',
        global: { fetch: mockFetch },
    });
    const query = client.from('Refunds');
    const filter = query.select();
    const mockFrom = vi.spyOn(client, 'from').mockReturnValue(query);
    const mockSelect = vi.spyOn(query, 'select').mockReturnValue(filter);
    const mockGte = vi.spyOn(filter, 'gte');
    return { client, mockFetch, mockFrom, mockSelect, mockGte };
};

describe("RefundRepository", () => {
    let repo: RefundRepository;
    let mockFrom: ReturnType<typeof createMockClient>['mockFrom'];
    let mockSelect: ReturnType<typeof createMockClient>['mockSelect'];
    let mockGte: ReturnType<typeof createMockClient>['mockGte'];
    let mockFetch: ReturnType<typeof createMockClient>['mockFetch'];

    beforeEach(() => {
        const mocks = createMockClient();
        ({ mockFrom, mockSelect, mockGte, mockFetch } = mocks);
        repo = new RefundRepository(mocks.client);
    });

    it("should fetch refunds and map them correctly", async () => {
        const mockData = [
            {
                refund_id: 1,
                transaction_id: "T123",
                amount: 50,
                description: "Test refund",
                date: "2026-03-27",
                status: "pending",
                profiles: {
                    id: "U123",
                    full_name: "John Doe",
                    refund_attempts: 2,
                },
            },
        ];

        mockFetch.mockResolvedValue(Response.json(mockData));

        const result = await repo.getRefunds();

        expect(mockFrom).toHaveBeenCalledWith("Refunds");
        expect(mockSelect).toHaveBeenCalled();
        expect(mockGte).toHaveBeenCalled();
        expect(result).toEqual([
            {
                refundId: 1,
                id: "R1",
                customerName: "John Doe",
                customerId: "U123",
                transactionId: "T123",
                amount: 50,
                reason: "Test refund",
                date: "2026-03-27",
                status: "pending",
                attempts: 2,
            },
        ]);
    });

    it("should throw an error if Supabase returns an error", async () => {
        const mockError = new Error("Database error");
        mockFetch.mockResolvedValue(Response.json({ message: mockError.message }, { status: 400 }));

        await expect(repo.getRefunds()).rejects.toThrow("Database error");
    });

    it("should throw an error if data is null without error", async () => {
        mockFetch.mockResolvedValue(Response.json(null));

        await expect(repo.getRefunds()).rejects.toThrow();
    });
});
