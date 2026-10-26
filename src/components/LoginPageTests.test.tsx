import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AuthenticationResponse } from "../supabase/enum/authentication_responses";
import Login from "./LoginPage";

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockNavigate = vi.fn();
const mockLogin = vi.fn();
const mockRestoreSession = vi.fn();
const mockAuthService = { login: mockLogin, restoreSession: mockRestoreSession };

vi.mock("react-router-dom", async () => {
    const actual = await vi.importActual("react-router-dom");
    return {
        ...actual,
        useNavigate: () => mockNavigate,
    };
});

vi.mock("../di/container", () => ({
    useAuth: () => mockAuthService,
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

const renderLogin = () =>
    render(
        <MemoryRouter>
            <Login />
        </MemoryRouter>
    );

function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((done) => { resolve = done; });
    return { promise, resolve };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("Login", () => {

    beforeEach(() => {
        vi.clearAllMocks();
        mockAuthService.restoreSession = mockRestoreSession;
        // Default: no existing session
        mockRestoreSession.mockResolvedValue(AuthenticationResponse.failure);
    });

    describe("session restore", () => {

        it("does not restart restoration for unchanged dependencies", async () => {
            const { rerender } = renderLogin();
            await screen.findByPlaceholderText("Email");

            rerender(<MemoryRouter><Login /></MemoryRouter>);

            expect(mockRestoreSession).toHaveBeenCalledTimes(1);
        });

        it("ignores superseded restoration without navigating or ending the current check", async () => {
            const previous = deferred<AuthenticationResponse>();
            const current = deferred<AuthenticationResponse>();
            mockRestoreSession.mockReturnValueOnce(previous.promise);
            const { rerender } = renderLogin();
            const replacement = vi.fn<() => Promise<AuthenticationResponse>>().mockReturnValue(current.promise);
            mockAuthService.restoreSession = replacement;

            rerender(<MemoryRouter><Login /></MemoryRouter>);
            expect(replacement).toHaveBeenCalledTimes(1);

            await act(async () => previous.resolve(AuthenticationResponse.success));
            expect(mockNavigate).not.toHaveBeenCalled();
            expect(screen.queryByPlaceholderText("Email")).toBeNull();

            await act(async () => current.resolve(AuthenticationResponse.failure));
            expect(screen.getByPlaceholderText("Email")).toBeDefined();
            expect(mockNavigate).not.toHaveBeenCalled();
        });

        it("does not navigate when restoration completes after unmount", async () => {
            const pending = deferred<AuthenticationResponse>();
            mockRestoreSession.mockReturnValueOnce(pending.promise);
            const { unmount } = renderLogin();

            unmount();
            await act(async () => pending.resolve(AuthenticationResponse.success));

            expect(mockNavigate).not.toHaveBeenCalled();
        });

        it("navigates to /home if session is restored successfully", async () => {
            mockRestoreSession.mockResolvedValue(AuthenticationResponse.success);

            renderLogin();

            await waitFor(() => {
                expect(mockNavigate).toHaveBeenCalledWith("/home");
            });
        });

        it("renders the login form when no session exists", async () => {
            renderLogin();

            await waitFor(() => {
                expect(screen.getByPlaceholderText("Email")).toBeDefined();
                expect(screen.getByPlaceholderText("Password")).toBeDefined();
            });
        });

        it("does not navigate when restoreSession fails", async () => {
            renderLogin();

            await waitFor(() => expect(mockRestoreSession).toHaveBeenCalled());

            expect(mockNavigate).not.toHaveBeenCalled();
        });

        it("renders form even if restoreSession throws", async () => {
            mockRestoreSession.mockRejectedValue(new Error("Network error"));

            renderLogin();

            await waitFor(() => {
                expect(screen.getByPlaceholderText("Email")).toBeDefined();
            });
        });

    });

    describe("handleLogin", () => {

        it("shows error when both fields are empty", async () => {
            renderLogin();

            await waitFor(() => screen.getByPlaceholderText("Email"));

            fireEvent.click(screen.getByText("Log In"));

            expect(screen.getByText("Please fill in both fields")).toBeDefined();
        });

        it("shows error when email is empty", async () => {
            renderLogin();

            await waitFor(() => screen.getByPlaceholderText("Email"));

            fireEvent.change(screen.getByPlaceholderText("Password"), {
                target: { value: "password123" },
            });
            fireEvent.click(screen.getByText("Log In"));

            expect(screen.getByText("Please fill in both fields")).toBeDefined();
        });

        it("shows error when password is empty", async () => {
            renderLogin();

            await waitFor(() => screen.getByPlaceholderText("Email"));

            fireEvent.change(screen.getByPlaceholderText("Email"), {
                target: { value: "test@email.com" },
            });
            fireEvent.click(screen.getByText("Log In"));

            expect(screen.getByText("Please fill in both fields")).toBeDefined();
        });

        it("shows error when credentials are incorrect", async () => {
            mockLogin.mockResolvedValue(AuthenticationResponse.failure);

            renderLogin();

            await waitFor(() => screen.getByPlaceholderText("Email"));

            fireEvent.change(screen.getByPlaceholderText("Email"), {
                target: { value: "wrong@email.com" },
            });
            fireEvent.change(screen.getByPlaceholderText("Password"), {
                target: { value: "wrongpassword" },
            });
            fireEvent.click(screen.getByText("Log In"));

            await waitFor(() => {
                expect(screen.getByText("Email or Password is incorrect")).toBeDefined();
            });
        });

        it("shows error when user has invalid permissions", async () => {
            mockLogin.mockResolvedValue(AuthenticationResponse.invalidPermissions);

            renderLogin();

            await waitFor(() => screen.getByPlaceholderText("Email"));

            fireEvent.change(screen.getByPlaceholderText("Email"), {
                target: { value: "user@email.com" },
            });
            fireEvent.change(screen.getByPlaceholderText("Password"), {
                target: { value: "password123" },
            });
            fireEvent.click(screen.getByText("Log In"));

            await waitFor(() => {
                expect(screen.getByText("Invalid Permissions. Must be an Owner or Admin!")).toBeDefined();
            });
        });

        it("navigates to /home on successful login", async () => {
            mockLogin.mockResolvedValue(AuthenticationResponse.success);

            renderLogin();

            await waitFor(() => screen.getByPlaceholderText("Email"));

            fireEvent.change(screen.getByPlaceholderText("Email"), {
                target: { value: "admin@email.com" },
            });
            fireEvent.change(screen.getByPlaceholderText("Password"), {
                target: { value: "password123" },
            });
            fireEvent.click(screen.getByText("Log In"));

            await waitFor(() => {
                expect(mockNavigate).toHaveBeenCalledWith("/home");
            });
        });

        it("calls login with correct email and password", async () => {
            mockLogin.mockResolvedValue(AuthenticationResponse.success);

            renderLogin();

            await waitFor(() => screen.getByPlaceholderText("Email"));

            fireEvent.change(screen.getByPlaceholderText("Email"), {
                target: { value: "admin@email.com" },
            });
            fireEvent.change(screen.getByPlaceholderText("Password"), {
                target: { value: "password123" },
            });
            fireEvent.click(screen.getByText("Log In"));

            await waitFor(() => {
                expect(mockLogin).toHaveBeenCalledWith("admin@email.com", "password123");
            });
        });

    });

    describe("password visibility", () => {

        it("password is obscured by default", async () => {
            renderLogin();

            await waitFor(() => screen.getByPlaceholderText("Password"));

            const input = screen.getByPlaceholderText("Password") as HTMLInputElement;
            expect(input.type).toBe("password");
        });

        it("shows password when Show is clicked", async () => {
            renderLogin();

            await waitFor(() => screen.getByText("Show"));

            fireEvent.click(screen.getByText("Show"));

            const input = screen.getByPlaceholderText("Password") as HTMLInputElement;
            expect(input.type).toBe("text");
        });

        it("hides password when Hide is clicked", async () => {
            renderLogin();

            await waitFor(() => screen.getByText("Show"));

            fireEvent.click(screen.getByText("Show"));
            fireEvent.click(screen.getByText("Hide"));

            const input = screen.getByPlaceholderText("Password") as HTMLInputElement;
            expect(input.type).toBe("password");
        });

    });

    describe("error clearing", () => {

        it("clears error when email input changes", async () => {
            renderLogin();

            await waitFor(() => screen.getByPlaceholderText("Email"));

            fireEvent.click(screen.getByText("Log In"));
            expect(screen.getByText("Please fill in both fields")).toBeDefined();

            fireEvent.change(screen.getByPlaceholderText("Email"), {
                target: { value: "a" },
            });

            expect(screen.queryByText("Please fill in both fields")).toBeNull();
        });

        it("clears error when password input changes", async () => {
            renderLogin();

            await waitFor(() => screen.getByPlaceholderText("Email"));

            fireEvent.click(screen.getByText("Log In"));
            expect(screen.getByText("Please fill in both fields")).toBeDefined();

            fireEvent.change(screen.getByPlaceholderText("Password"), {
                target: { value: "a" },
            });

            expect(screen.queryByText("Please fill in both fields")).toBeNull();
        });

    });

    describe("keyboard", () => {

        it("triggers login when Enter is pressed", async () => {
            mockLogin.mockResolvedValue(AuthenticationResponse.success);

            renderLogin();

            await waitFor(() => screen.getByPlaceholderText("Email"));

            fireEvent.change(screen.getByPlaceholderText("Email"), {
                target: { value: "admin@email.com" },
            });
            fireEvent.change(screen.getByPlaceholderText("Password"), {
                target: { value: "password123" },
            });

            fireEvent.keyDown(screen.getByPlaceholderText("Email"), { key: "Enter" });

            await waitFor(() => {
                expect(mockLogin).toHaveBeenCalledWith("admin@email.com", "password123");
            });
        });

    });

});
