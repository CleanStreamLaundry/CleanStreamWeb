import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ProtectedRoute } from "./ProtectedRoute";

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockIsSession = vi.fn();
const mockNavigate = vi.fn();
const mockAuthService = { isSession: mockIsSession };

vi.mock("../di/container", () => ({
    useAuth: () => mockAuthService,
}));

vi.mock("react-router-dom", async () => {
    const actual = await vi.importActual("react-router-dom");
    return {
        ...actual,
        Navigate: ({ to }: { to: string }) => {
            mockNavigate(to);
            return <div>Redirected to {to}</div>;
        },
    };
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

const renderProtectedRoute = (children = <div>Protected Content</div>) =>
    render(
        <MemoryRouter>
            <ProtectedRoute>{children}</ProtectedRoute>
        </MemoryRouter>
    );

function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((done) => { resolve = done; });
    return { promise, resolve };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("ProtectedRoute", () => {

    beforeEach(() => {
        vi.clearAllMocks();
        mockAuthService.isSession = mockIsSession;
    });

    it("does not recheck a session for unchanged dependencies", async () => {
        mockIsSession.mockResolvedValue(true);
        const { rerender } = renderProtectedRoute();
        await screen.findByText("Protected Content");

        rerender(<MemoryRouter><ProtectedRoute><div>Protected Content</div></ProtectedRoute></MemoryRouter>);

        expect(mockIsSession).toHaveBeenCalledTimes(1);
    });

    it.each([true, false])("keeps the latest session result %s after an older check completes", async (currentSession) => {
        const previous = deferred<boolean>();
        mockIsSession.mockReturnValueOnce(previous.promise);
        const { rerender } = renderProtectedRoute();
        const replacement = vi.fn<() => Promise<boolean>>().mockResolvedValue(currentSession);
        mockAuthService.isSession = replacement;

        rerender(<MemoryRouter><ProtectedRoute><div>Protected Content</div></ProtectedRoute></MemoryRouter>);
        await screen.findByText(currentSession ? "Protected Content" : "Redirected to /");
        expect(replacement).toHaveBeenCalledTimes(1);

        await act(async () => previous.resolve(!currentSession));

        expect(screen.getByText(currentSession ? "Protected Content" : "Redirected to /")).toBeDefined();
        expect(screen.queryByText(currentSession ? "Redirected to /" : "Protected Content")).toBeNull();
    });

    describe("loading state", () => {

        it("shows loading while checking session", () => {
            mockIsSession.mockResolvedValue(new Promise(() => {})); // never resolves
            renderProtectedRoute();

            expect(screen.getByText("Loading...")).toBeDefined();
        });

        it("does not render children while checking session", () => {
            mockIsSession.mockResolvedValue(new Promise(() => {}));
            renderProtectedRoute();

            expect(screen.queryByText("Protected Content")).toBeNull();
        });

    });

    describe("authenticated", () => {

        it("renders children when session is valid", async () => {
            mockIsSession.mockResolvedValue(true);
            renderProtectedRoute();

            await waitFor(() => {
                expect(screen.getByText("Protected Content")).toBeDefined();
            });
        });

        it("does not redirect when session is valid", async () => {
            mockIsSession.mockResolvedValue(true);
            renderProtectedRoute();

            await waitFor(() => {
                expect(mockNavigate).not.toHaveBeenCalled();
            });
        });

        it("calls isSession once on mount", async () => {
            mockIsSession.mockResolvedValue(true);
            renderProtectedRoute();

            await waitFor(() => {
                expect(mockIsSession).toHaveBeenCalledTimes(1);
            });
        });

        it("renders custom children correctly", async () => {
            mockIsSession.mockResolvedValue(true);
            renderProtectedRoute(<div>Custom Child Component</div>);

            await waitFor(() => {
                expect(screen.getByText("Custom Child Component")).toBeDefined();
            });
        });

    });

    describe("unauthenticated", () => {

        it("redirects to / when session is false", async () => {
            mockIsSession.mockResolvedValue(false);
            renderProtectedRoute();

            await waitFor(() => {
                expect(mockNavigate).toHaveBeenCalledWith("/");
            });
        });

        it("redirects to / when session is undefined", async () => {
            mockIsSession.mockResolvedValue(undefined);
            renderProtectedRoute();

            await waitFor(() => {
                expect(mockNavigate).toHaveBeenCalledWith("/");
            });
        });

        it("does not render children when unauthenticated", async () => {
            mockIsSession.mockResolvedValue(false);
            renderProtectedRoute();

            await waitFor(() => {
                expect(screen.queryByText("Protected Content")).toBeNull();
            });
        });

        it("shows redirect message when unauthenticated", async () => {
            mockIsSession.mockResolvedValue(false);
            renderProtectedRoute();

            await waitFor(() => {
                expect(screen.getByText("Redirected to /")).toBeDefined();
            });
        });

    });

});
