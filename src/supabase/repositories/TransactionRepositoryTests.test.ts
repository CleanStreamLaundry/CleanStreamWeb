import { describe, it, expect, vi } from "vitest";

import { SupabaseClient } from "@supabase/supabase-js";
import {TransactionRepository} from "./TranscationRepository";

// ─── Mock Client Factory ─────────────────────────────────────────────────────

type TransactionRow = {
    amount: string | null;
    description?: string;
    created_at?: string;
};

const createMockClient = (result: { data: TransactionRow[] | null; error: { message: string } | null }) => {
    const mockFetch = vi.fn<typeof fetch>().mockResolvedValue(
        Response.json(result.error ?? result.data, { status: result.error ? 400 : 200 }),
    );
    const client = new SupabaseClient('https://example.invalid', 'test-key', {
        accessToken: async () => 'test-token',
        global: { fetch: mockFetch },
    });
    const query = client.from('transactions');
    const filter = query.select();
    vi.spyOn(client, 'from').mockReturnValue(query);
    const chain = {
        select: vi.spyOn(query, 'select').mockReturnValue(filter),
        gte: vi.spyOn(filter, 'gte'),
        lte: vi.spyOn(filter, 'lte'),
        not: vi.spyOn(filter, 'not'),
    };

    return {
        client,
        chain,
    };
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("TransactionRepository", () => {

    describe("getTodayRevenue", () => {

        it("returns the correct sum of transaction amounts", async () => {
            const { client } = createMockClient({
                data: [
                    { amount: "15.0", description: "Laundry" },
                    { amount: "25.0", description: "Dry Clean" },
                    { amount: "10.0", description: "Wash" },
                ],
                error: null,
            });

            const repo = new TransactionRepository(client);
            const result = await repo.getTodayRevenue();

            expect(result).toBe(50);
        });

        it("returns 0 when there are no transactions", async () => {
            const { client } = createMockClient({ data: [], error: null });

            const repo = new TransactionRepository(client);
            const result = await repo.getTodayRevenue();

            expect(result).toBe(0);
        });

        it("returns 0 when data is null", async () => {
            const { client } = createMockClient({ data: null, error: null });

            const repo = new TransactionRepository(client);
            const result = await repo.getTodayRevenue();

            expect(result).toBe(0);
        });

        it("returns null when there is a supabase error", async () => {
            const { client } = createMockClient({
                data: null,
                error: { message: "Database error" },
            });

            const repo = new TransactionRepository(client);
            const result = await repo.getTodayRevenue();

            expect(result).toBeNull();
        });

        it("skips rows with invalid amount values", async () => {
            const { client } = createMockClient({
                data: [
                    { amount: "20.0", description: "Laundry" },
                    { amount: "invalid", description: "Wash" },
                    { amount: null, description: "Dry Clean" },
                ],
                error: null,
            });

            const repo = new TransactionRepository(client);
            const result = await repo.getTodayRevenue();

            expect(result).toBe(20);
        });

        it("queries the transactions table", async () => {
            const { client } = createMockClient({ data: [], error: null });

            const repo = new TransactionRepository(client);
            await repo.getTodayRevenue();

            expect(client.from).toHaveBeenCalledWith("transactions");
        });

        it("filters out loyalty payment descriptions", async () => {
            const { client, chain } = createMockClient({ data: [], error: null });

            const repo = new TransactionRepository(client);
            await repo.getTodayRevenue();

            expect(chain.not).toHaveBeenCalledWith(
                "description",
                "in",
                '("Loyalty payment on Dryer","Loyalty payment on Washer")'
            );
        });

        it("applies date range filters for today", async () => {
            const { client, chain } = createMockClient({ data: [], error: null });

            const repo = new TransactionRepository(client);
            await repo.getTodayRevenue();

            expect(chain.gte).toHaveBeenCalledWith("created_at", expect.any(String));
            expect(chain.lte).toHaveBeenCalledWith("created_at", expect.any(String));
        });

        it("handles decimal amounts correctly", async () => {
            const { client } = createMockClient({
                data: [
                    { amount: "10.50", description: "Laundry" },
                    { amount: "5.75", description: "Wash" },
                ],
                error: null,
            });

            const repo = new TransactionRepository(client);
            const result = await repo.getTodayRevenue();

            expect(result).toBeCloseTo(16.25);
        });

    });

    describe("getLast30DaysRevenue", () => {

        it("returns the correct total and daily data", async () => {
            const today = new Date();
            const yesterday = new Date(today);
            yesterday.setDate(today.getDate() - 1);

            const { client } = createMockClient({
                data: [
                    { amount: "15.0", created_at: today.toISOString() },
                    { amount: "25.0", created_at: today.toISOString() },
                    { amount: "10.0", created_at: yesterday.toISOString() },
                ],
                error: null,
            });

            const repo = new TransactionRepository(client);
            const result = await repo.getLast30DaysRevenue();

            expect(result).not.toBeNull();
            expect(result!.total).toBe(50);
            expect(result!.dailyData).toHaveLength(30);
        });

        it("initializes all 30 days with zero amounts", async () => {
            const { client } = createMockClient({ data: [], error: null });

            const repo = new TransactionRepository(client);
            const result = await repo.getLast30DaysRevenue();

            expect(result).not.toBeNull();
            expect(result!.dailyData).toHaveLength(30);
            expect(result!.total).toBe(0);

            // All days should have 0 amount
            result!.dailyData.forEach(day => {
                expect(day.amount).toBe(0);
            });
        });

        it("groups transactions by date correctly", async () => {
            const today = new Date();
            const todayKey = today.toISOString().split('T')[0];

            const { client } = createMockClient({
                data: [
                    { amount: "10.0", created_at: today.toISOString() },
                    { amount: "20.0", created_at: today.toISOString() },
                    { amount: "15.0", created_at: today.toISOString() },
                ],
                error: null,
            });

            const repo = new TransactionRepository(client);
            const result = await repo.getLast30DaysRevenue();

            expect(result).not.toBeNull();

            const todayData = result!.dailyData.find(day => day.date === todayKey);
            expect(todayData).toBeDefined();
            expect(todayData!.amount).toBe(45);
        });

        it("returns null when there is a supabase error", async () => {
            const { client } = createMockClient({
                data: null,
                error: { message: "Database error" },
            });

            const repo = new TransactionRepository(client);
            const result = await repo.getLast30DaysRevenue();

            expect(result).toBeNull();
        });

        it("skips rows with invalid amount values", async () => {
            const today = new Date();

            const { client } = createMockClient({
                data: [
                    { amount: "20.0", created_at: today.toISOString() },
                    { amount: "invalid", created_at: today.toISOString() },
                    { amount: null, created_at: today.toISOString() },
                    { amount: "10.0", created_at: today.toISOString() },
                ],
                error: null,
            });

            const repo = new TransactionRepository(client);
            const result = await repo.getLast30DaysRevenue();

            expect(result).not.toBeNull();
            expect(result!.total).toBe(30);
        });

        it("queries the transactions table", async () => {
            const { client } = createMockClient({ data: [], error: null });

            const repo = new TransactionRepository(client);
            await repo.getLast30DaysRevenue();

            expect(client.from).toHaveBeenCalledWith("transactions");
        });

        it("filters out loyalty payment descriptions", async () => {
            const { client, chain } = createMockClient({ data: [], error: null });

            const repo = new TransactionRepository(client);
            await repo.getLast30DaysRevenue();

            expect(chain.not).toHaveBeenCalledWith(
                "description",
                "in",
                '("Loyalty payment on Dryer","Loyalty payment on Washer")'
            );
        });

        it("applies date range filters for last 30 days", async () => {
            const { client, chain } = createMockClient({ data: [], error: null });

            const repo = new TransactionRepository(client);
            await repo.getLast30DaysRevenue();

            expect(chain.gte).toHaveBeenCalledWith("created_at", expect.any(String));
            expect(chain.lte).toHaveBeenCalledWith("created_at", expect.any(String));
        });

        it("sorts daily data by date in ascending order", async () => {
            const today = new Date();
            const fiveDaysAgo = new Date(today);
            fiveDaysAgo.setDate(today.getDate() - 5);
            const tenDaysAgo = new Date(today);
            tenDaysAgo.setDate(today.getDate() - 10);

            const { client } = createMockClient({
                data: [
                    { amount: "10.0", created_at: today.toISOString() },
                    { amount: "20.0", created_at: tenDaysAgo.toISOString() },
                    { amount: "15.0", created_at: fiveDaysAgo.toISOString() },
                ],
                error: null,
            });

            const repo = new TransactionRepository(client);
            const result = await repo.getLast30DaysRevenue();

            expect(result).not.toBeNull();

            // Verify dates are in ascending order
            for (let i = 1; i < result!.dailyData.length; i++) {
                expect(result!.dailyData[i]!.date >= result!.dailyData[i - 1]!.date).toBe(true);
            }
        });

        it("handles decimal amounts correctly", async () => {
            const today = new Date();

            const { client } = createMockClient({
                data: [
                    { amount: "10.50", created_at: today.toISOString() },
                    { amount: "5.75", created_at: today.toISOString() },
                ],
                error: null,
            });

            const repo = new TransactionRepository(client);
            const result = await repo.getLast30DaysRevenue();

            expect(result).not.toBeNull();
            expect(result!.total).toBeCloseTo(16.25);
        });

        it("returns null when an exception is thrown", async () => {
            const { client } = createMockClient({ data: [], error: null });

            // Force an error by making from throw
            vi.spyOn(client, 'from').mockImplementation(() => {
                throw new Error("Unexpected error");
            });

            const repo = new TransactionRepository(client);
            const result = await repo.getLast30DaysRevenue();

            expect(result).toBeNull();
        });

        it("handles data being null gracefully", async () => {
            const { client } = createMockClient({ data: null, error: null });

            const repo = new TransactionRepository(client);
            const result = await repo.getLast30DaysRevenue();

            expect(result).not.toBeNull();
            expect(result!.total).toBe(0);
            expect(result!.dailyData).toHaveLength(30);
        });

    });
});
