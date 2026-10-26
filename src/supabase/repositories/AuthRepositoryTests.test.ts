import { describe, it, expect, vi } from "vitest";
import { AuthRepository } from "./AuthRepository";
import { AuthenticationResponse } from "../enum/authentication_responses";
import { AuthError, SupabaseClient, type Session } from "@supabase/supabase-js";

// ─── Mock Data ───────────────────────────────────────────────────────────────

const mockSession: Session = {
    user: {
        id: "test-user-id",
        app_metadata: {},
        user_metadata: {},
        aud: "authenticated",
        created_at: "2026-01-01T00:00:00Z",
    },
    access_token: "test-token",
    refresh_token: "test-refresh-token",
    expires_in: 3600,
    token_type: "bearer",
};

const mockAdminProfile = { roles: "Admin" };
const mockOwnerProfile = { roles: "Owner" };
const mockUserProfile = { roles: "User" };

// ─── Mock Client Factory ─────────────────────────────────────────────────────

const createMockClient = () => {
    const single = vi.fn();
    const from = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single,
    });

    return {
        client: {
            auth: {
                signInWithPassword: vi.fn(),
                getSession: vi.fn(),
                signOut: vi.fn(),
            },
            from,
        } as unknown as SupabaseClient,
        single,
    };
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("AuthRepository", () => {

    describe("login", () => {
        it("returns failure when credentials are wrong", async () => {
            const { client } = createMockClient();
            (client.auth.signInWithPassword as ReturnType<typeof vi.fn>).mockResolvedValue({
                data: { user: null, session: null },
                error: { message: "Invalid credentials" },
            });

            const repo = new AuthRepository(client);
            const result = await repo.login("wrong@email.com", "wrongpassword");

            expect(result).toBe(AuthenticationResponse.failure);
        });

        it("returns success when admin logs in", async () => {
            const { client, single } = createMockClient();
            (client.auth.signInWithPassword as ReturnType<typeof vi.fn>).mockResolvedValue({
                data: { user: { id: "test-user-id" }, session: mockSession },
                error: null,
            });
            single.mockResolvedValue({ data: mockAdminProfile, error: null });

            const repo = new AuthRepository(client);
            const result = await repo.login("admin@email.com", "password");

            expect(result).toBe(AuthenticationResponse.success);
        });

        it("returns success when owner logs in", async () => {
            const { client, single } = createMockClient();
            (client.auth.signInWithPassword as ReturnType<typeof vi.fn>).mockResolvedValue({
                data: { user: { id: "test-user-id" }, session: mockSession },
                error: null,
            });
            single.mockResolvedValue({ data: mockOwnerProfile, error: null });

            const repo = new AuthRepository(client);
            const result = await repo.login("owner@email.com", "password");

            expect(result).toBe(AuthenticationResponse.success);
        });

        it("returns invalidPermissions when a regular user logs in", async () => {
            const { client, single } = createMockClient();
            (client.auth.signInWithPassword as ReturnType<typeof vi.fn>).mockResolvedValue({
                data: { user: { id: "test-user-id" }, session: mockSession },
                error: null,
            });
            single.mockResolvedValue({ data: mockUserProfile, error: null });

            const repo = new AuthRepository(client);
            const result = await repo.login("user@email.com", "password");

            expect(result).toBe(AuthenticationResponse.invalidPermissions);
        });

        it("saves session and userID on successful login", async () => {
            const { client, single } = createMockClient();
            (client.auth.signInWithPassword as ReturnType<typeof vi.fn>).mockResolvedValue({
                data: { user: { id: "test-user-id" }, session: mockSession },
                error: null,
            });
            single.mockResolvedValue({ data: mockAdminProfile, error: null });

            const repo = new AuthRepository(client);
            await repo.login("admin@email.com", "password");

            expect(await repo.isSession()).toBe(true);
            expect(await repo.getUserID()).toBe("test-user-id");
        });
    });

    describe("getRole", () => {
        it("returns success for Admin role", async () => {
            const { client, single } = createMockClient();
            single.mockResolvedValue({ data: mockAdminProfile, error: null });

            const repo = new AuthRepository(client);
            const result = await repo.getRole("test-user-id");

            expect(result).toBe(AuthenticationResponse.success);
        });

        it("returns success for Owner role", async () => {
            const { client, single } = createMockClient();
            single.mockResolvedValue({ data: mockOwnerProfile, error: null });

            const repo = new AuthRepository(client);
            const result = await repo.getRole("test-user-id");

            expect(result).toBe(AuthenticationResponse.success);
        });

        it("returns invalidPermissions for non-admin role", async () => {
            const { client, single } = createMockClient();
            single.mockResolvedValue({ data: mockUserProfile, error: null });

            const repo = new AuthRepository(client);
            const result = await repo.getRole("test-user-id");

            expect(result).toBe(AuthenticationResponse.invalidPermissions);
        });

        it("returns failure when profile is not found", async () => {
            const { client, single } = createMockClient();
            single.mockResolvedValue({ data: null, error: { message: "Not found" } });

            const repo = new AuthRepository(client);
            const result = await repo.getRole("test-user-id");

            expect(result).toBe(AuthenticationResponse.failure);
        });
    });

    describe("isSession", () => {
        it("returns false when no session exists", async () => {
            const { client } = createMockClient();
            const repo = new AuthRepository(client);

            expect(await repo.isSession()).toBe(false);
        });

        it("returns true after successful login", async () => {
            const { client, single } = createMockClient();
            (client.auth.signInWithPassword as ReturnType<typeof vi.fn>).mockResolvedValue({
                data: { user: { id: "test-user-id" }, session: mockSession },
                error: null,
            });
            single.mockResolvedValue({ data: mockAdminProfile, error: null });

            const repo = new AuthRepository(client);
            await repo.login("admin@email.com", "password");

            expect(await repo.isSession()).toBe(true);
        });
    });

    describe("restoreSession", () => {
        it("returns failure when no session exists", async () => {
            const { client } = createMockClient();
            (client.auth.getSession as ReturnType<typeof vi.fn>).mockResolvedValue({
                data: { session: null },
                error: null,
            });

            const repo = new AuthRepository(client);
            const result = await repo.restoreSession();

            expect(result).toBe(AuthenticationResponse.failure);
        });

        it("returns failure when getSession throws", async () => {
            const { client } = createMockClient();
            (client.auth.getSession as ReturnType<typeof vi.fn>).mockRejectedValue(
                new Error("Network error")
            );

            const repo = new AuthRepository(client);
            const result = await repo.restoreSession();

            expect(result).toBe(AuthenticationResponse.failure);
        });

        it("returns success when valid admin session is restored", async () => {
            const { client, single } = createMockClient();
            (client.auth.getSession as ReturnType<typeof vi.fn>).mockResolvedValue({
                data: { session: mockSession },
                error: null,
            });
            single.mockResolvedValue({ data: mockAdminProfile, error: null });

            const repo = new AuthRepository(client);
            const result = await repo.restoreSession();

            expect(result).toBe(AuthenticationResponse.success);
        });

        it("returns invalidPermissions when restored user is not admin or owner", async () => {
            const { client, single } = createMockClient();
            (client.auth.getSession as ReturnType<typeof vi.fn>).mockResolvedValue({
                data: { session: mockSession },
                error: null,
            });
            single.mockResolvedValue({ data: mockUserProfile, error: null });

            const repo = new AuthRepository(client);
            const result = await repo.restoreSession();

            expect(result).toBe(AuthenticationResponse.invalidPermissions);
        });

        it("restores session and userID on success", async () => {
            const { client, single } = createMockClient();
            (client.auth.getSession as ReturnType<typeof vi.fn>).mockResolvedValue({
                data: { session: mockSession },
                error: null,
            });
            single.mockResolvedValue({ data: mockAdminProfile, error: null });

            const repo = new AuthRepository(client);
            await repo.restoreSession();

            expect(await repo.isSession()).toBe(true);
            expect(await repo.getUserID()).toBe("test-user-id");
        });
    });

    describe("signOut", () => {
        it("calls supabase signOut", async () => {
            const { client } = createMockClient();
            (client.auth.signOut as ReturnType<typeof vi.fn>).mockResolvedValue({});

            const repo = new AuthRepository(client);
            await repo.signOut();

            expect(client.auth.signOut).toHaveBeenCalledTimes(1);
        });
    });

    describe.each(["login", "restoreSession"] as const)("%s authorization failures", (method) => {
        const failures = [
            { label: "missing profile", data: null, error: null, expected: AuthenticationResponse.failure },
            { label: "query error", data: null, error: new Error("Role lookup failed"), expected: AuthenticationResponse.failure },
            { label: "error alongside privileged data", data: mockOwnerProfile, error: new Error("Role lookup failed"), expected: AuthenticationResponse.failure },
            { label: "non-staff role", data: mockUserProfile, error: null, expected: AuthenticationResponse.invalidPermissions },
        ];

        it.each(failures)("denies $label and clears previously cached identity", async ({ data, error, expected }) => {
            const { client, single } = createMockClient();
            vi.mocked(client.auth.signInWithPassword).mockResolvedValue({
                data: { user: mockSession.user, session: mockSession }, error: null,
            });
            vi.mocked(client.auth.getSession).mockResolvedValue({ data: { session: mockSession }, error: null });
            single.mockResolvedValueOnce({ data: mockOwnerProfile, error: null });
            const repo = new AuthRepository(client);
            const attempt = () => method === "login" ? repo.login("owner@example.com", "password") : repo.restoreSession();

            expect(await attempt()).toBe(AuthenticationResponse.success);
            expect(await repo.isSession()).toBe(true);
            expect(await repo.getUserID()).toBe(mockSession.user.id);

            single.mockResolvedValueOnce({ data, error });
            expect(await attempt()).toBe(expected);
            expect(await repo.isSession()).toBe(false);
            expect(await repo.getUserID()).toBeNull();
        });

        it("clears cached identity when the role lookup throws", async () => {
            const { client, single } = createMockClient();
            vi.mocked(client.auth.signInWithPassword).mockResolvedValue({
                data: { user: mockSession.user, session: mockSession }, error: null,
            });
            vi.mocked(client.auth.getSession).mockResolvedValue({ data: { session: mockSession }, error: null });
            single.mockResolvedValueOnce({ data: mockOwnerProfile, error: null });
            const repo = new AuthRepository(client);
            const attempt = () => method === "login" ? repo.login("owner@example.com", "password") : repo.restoreSession();
            expect(await attempt()).toBe(AuthenticationResponse.success);

            const error = new Error("Role lookup rejected");
            single.mockRejectedValueOnce(error);
            if (method === "login") {
                await expect(attempt()).rejects.toBe(error);
            } else {
                expect(await attempt()).toBe(AuthenticationResponse.failure);
            }
            expect(await repo.isSession()).toBe(false);
            expect(await repo.getUserID()).toBeNull();
        });

        it("clears cached identity when authentication no longer supplies a user or session", async () => {
            const { client, single } = createMockClient();
            vi.mocked(client.auth.signInWithPassword).mockResolvedValue({
                data: { user: mockSession.user, session: mockSession }, error: null,
            });
            vi.mocked(client.auth.getSession).mockResolvedValue({ data: { session: mockSession }, error: null });
            single.mockResolvedValueOnce({ data: mockOwnerProfile, error: null });
            const repo = new AuthRepository(client);
            const attempt = () => method === "login" ? repo.login("owner@example.com", "password") : repo.restoreSession();
            expect(await attempt()).toBe(AuthenticationResponse.success);

            vi.mocked(client.auth.signInWithPassword).mockResolvedValue({
                data: { user: null, session: null }, error: new AuthError("Invalid credentials"),
            });
            vi.mocked(client.auth.getSession).mockResolvedValue({ data: { session: null }, error: null });
            expect(await attempt()).toBe(AuthenticationResponse.failure);
            expect(await repo.isSession()).toBe(false);
            expect(await repo.getUserID()).toBeNull();
        });
    });
});
