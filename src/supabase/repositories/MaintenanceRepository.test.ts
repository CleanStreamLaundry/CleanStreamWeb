import { describe, it, expect, vi, beforeEach } from "vitest";
import { SupabaseClient } from "@supabase/supabase-js";
import type { Maintenance } from "../../interfaces/MaintenanceService";
import { MaintenanceRepository } from "./MaintenanceRepository";

describe("MaintenanceRepository", () => {
    let mockClient: SupabaseClient;
    let repo: MaintenanceRepository;
    const mockFetch = vi.fn<typeof fetch>();

    beforeEach(() => {
        mockFetch.mockReset().mockRejectedValue(new Error('Unexpected fetch'));
        mockClient = new SupabaseClient('https://example.invalid', 'test-key', {
            accessToken: async () => 'test-token',
            global: { fetch: mockFetch },
        });

        repo = new MaintenanceRepository(mockClient);
    });

    it("should fetch maintenance records and map them correctly", async () => {
        const mockSupabaseData: Maintenance[] = [
            {
                maint_id: "1",
                user_id: "USER-123",
                category: "Plumbing",
                description: "Leaky faucet",
                created_at: "2026-04-01T10:00:00Z",
                location: "Room 101",
                image_data: "base64_string",
            },
        ];

        mockFetch.mockResolvedValue(Response.json(mockSupabaseData));

        const result = await repo.getMaintenances();

        expect(result[0]).toEqual({
            maint_id: "1",
            user_id: "USER-123",
            category: "Plumbing",
            description: "Leaky faucet",
            created_at: "2026-04-01T10:00:00Z",
            location: "Room 101",
            image_data: "base64_string",
        });
    });

    it("should throw an error if Supabase returns an error", async () => {
        // Supabase error objects have a 'message' property
        const mockSupabaseError = { message: "Connection failed" };
        mockFetch.mockResolvedValue(Response.json(mockSupabaseError, { status: 400 }));

        await expect(repo.getMaintenances()).rejects.toThrow("Connection failed");
    });

    it("should throw an error if data is null without an explicit error", async () => {
        mockFetch.mockResolvedValue(Response.json(null));

        await expect(repo.getMaintenances()).rejects.toThrow("No data returned from server");
    });
});
