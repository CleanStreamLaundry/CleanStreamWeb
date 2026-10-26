import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { StrictMode, useLayoutEffect, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Identity } from "./types";
import { useQuery } from "./query";

const admin = vi.hoisted(() => ({ identity: null as Identity | null }));
vi.mock("./context", () => ({ useAdmin: () => admin }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

beforeEach(() => {
  admin.identity = { id: "owner-1", role: "Owner", name: "Owner", email: "owner@example.com" };
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("useQuery scope and refresh", () => {
  it("keeps the default reload behavior without opting in", async () => {
    const next = deferred<string>();
    const fetcher = vi.fn<() => Promise<string>>().mockResolvedValueOnce("initial").mockReturnValueOnce(next.promise);
    const { result } = renderHook(() => useQuery(fetcher, []));
    await waitFor(() => expect(result.current.data).toBe("initial"));
    act(() => result.current.reload());
    expect(result.current).toMatchObject({ data: null, error: "", loading: true });
    await act(async () => next.resolve("new"));
    expect(result.current).toMatchObject({ data: "new", error: "", loading: false });
  });

  it("retains only the same-scope last success through refresh failures and retry", async () => {
    const refresh = deferred<string>();
    const retry = deferred<string>();
    const fetcher = vi.fn<() => Promise<string>>().mockResolvedValueOnce("cached")
      .mockReturnValueOnce(refresh.promise).mockReturnValueOnce(retry.promise);
    const { result } = renderHook(() => useQuery(fetcher, [], { keepDataOnReload: true }));
    await waitFor(() => expect(result.current.data).toBe("cached"));
    act(() => result.current.reload());
    expect(result.current).toMatchObject({ data: "cached", error: "", loading: true });
    await act(async () => refresh.reject(new Error("Offline")));
    expect(result.current).toMatchObject({ data: "cached", error: "Offline", loading: false });
    act(() => result.current.reload());
    expect(result.current).toMatchObject({ data: "cached", error: "", loading: true });
    await act(async () => retry.resolve("fresh"));
    expect(result.current).toMatchObject({ data: "fresh", error: "", loading: false });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it.each(["account", "role", "portal-role", "location", "api", "sign-out"])("masks cached data and errors before effects on %s change", async (change) => {
    const pending = deferred<string>();
    const fetcher = vi.fn<() => Promise<string>>().mockResolvedValueOnce("private data")
      .mockRejectedValueOnce(new Error("Old error")).mockReturnValue(pending.promise);
    const api = { overview: () => undefined };
    const commits: { data: string | null; error: string }[] = [];
    const { result, rerender } = renderHook(({ dependency, location }) => {
      const query = useQuery(fetcher, [dependency, location], { keepDataOnReload: true });
      useLayoutEffect(() => { commits.push({ data: query.data, error: query.error }); });
      return query;
    }, { initialProps: { dependency: api, location: 1 } });
    await waitFor(() => expect(result.current.data).toBe("private data"));
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.error).toBe("Old error"));
    commits.length = 0;
    if (change === "account") admin.identity = { ...admin.identity!, id: "owner-2" };
    if (change === "role") admin.identity = { ...admin.identity!, role: "Admin" };
    if (change === "portal-role") admin.identity = { ...admin.identity!, portalRole: "Maintenance" };
    if (change === "sign-out") admin.identity = null;
    rerender({ dependency: change === "api" ? { ...api } : api, location: change === "location" ? 2 : 1 });
    expect(commits.length).toBeGreaterThan(0);
    expect(commits.every(value => value.data === null && value.error === "")).toBe(true);
    expect(result.current.data).toBeNull();
    if (change === "sign-out") {
      expect(fetcher).toHaveBeenCalledTimes(2);
      expect(result.current.loading).toBe(false);
    }
  });

  it("does not resurrect cached data when a location changes away and back", async () => {
    const next = deferred<string>();
    const fetcher = vi.fn<() => Promise<string>>().mockResolvedValueOnce("location A").mockReturnValue(next.promise);
    const { result, rerender } = renderHook(({ location }) =>
      useQuery(fetcher, [location], { keepDataOnReload: true }), { initialProps: { location: 1 } });
    await waitFor(() => expect(result.current.data).toBe("location A"));
    rerender({ location: 2 });
    expect(result.current.data).toBeNull();
    rerender({ location: 1 });
    expect(result.current.data).toBeNull();
  });

  it.each(["resolve", "reject"] as const)("ignores a superseded request's late %s, including loading state", async (outcome) => {
    const old = deferred<string>();
    const current = deferred<string>();
    const fetcher = vi.fn<() => Promise<string>>().mockResolvedValueOnce("cached")
      .mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
    const { result } = renderHook(() => useQuery(fetcher, [], { keepDataOnReload: true }));
    await waitFor(() => expect(result.current.data).toBe("cached"));
    act(() => result.current.reload());
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    act(() => result.current.reload());
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(3));
    await act(async () => {
      if (outcome === "resolve") old.resolve("stale");
      else old.reject(new Error("stale error"));
    });
    expect(result.current).toMatchObject({ data: "cached", error: "", loading: true });
    await act(async () => current.resolve("current"));
    expect(result.current).toMatchObject({ data: "current", error: "", loading: false });
  });

  it("rejects old-account completion after the new account has loaded", async () => {
    const old = deferred<string>();
    const fetcher = vi.fn<() => Promise<string>>().mockReturnValueOnce(old.promise).mockResolvedValue("new account");
    const { result, rerender } = renderHook(() => useQuery(fetcher, [], { keepDataOnReload: true }));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    admin.identity = { ...admin.identity!, id: "new-account" };
    rerender();
    await waitFor(() => expect(result.current.data).toBe("new account"));
    await act(async () => old.resolve("old account"));
    expect(result.current).toMatchObject({ data: "new account", error: "", loading: false });
  });

  it("uses identity and Object.is dependency equality, not API serialization or fetcher identity", async () => {
    const toJSON = vi.fn(() => { throw new Error("Do not serialize APIs"); });
    const dependency = { toJSON };
    const fetcher = vi.fn<() => Promise<string>>().mockResolvedValue("initial");
    const { result, rerender } = renderHook(() => useQuery(() => fetcher(), [dependency, NaN], { keepDataOnReload: true }));
    await waitFor(() => expect(result.current.data).toBe("initial"));
    admin.identity = { ...admin.identity!, name: "Updated display name" };
    rerender();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(toJSON).not.toHaveBeenCalled();
    fetcher.mockResolvedValue("reloaded");
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.data).toBe("reloaded"));
  });

  it("uses the newest fetcher for an explicit reload", async () => {
    const first = vi.fn<() => Promise<string>>().mockResolvedValue("first");
    const second = vi.fn<() => Promise<string>>().mockResolvedValue("second");
    const { result, rerender } = renderHook(({ fetcher }) => useQuery(fetcher, []), { initialProps: { fetcher: first } });
    await waitFor(() => expect(result.current.data).toBe("first"));
    rerender({ fetcher: second });
    expect(second).not.toHaveBeenCalled();
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.data).toBe("second"));
  });

  it("handles synchronous exceptions without losing the last successful data", async () => {
    const fetcher = vi.fn<() => Promise<string>>().mockResolvedValueOnce("cached").mockImplementation(() => { throw new Error("Sync failure"); });
    const { result } = renderHook(() => useQuery(fetcher, [], { keepDataOnReload: true }));
    await waitFor(() => expect(result.current.data).toBe("cached"));
    act(() => result.current.reload());
    await waitFor(() => expect(result.current).toMatchObject({ data: "cached", error: "Sync failure", loading: false }));
  });

  it("does not fetch without a verified identity", async () => {
    admin.identity = null;
    const fetcher = vi.fn<() => Promise<string>>().mockResolvedValue("private");
    const { result } = renderHook(() => useQuery(fetcher, []));
    await act(async () => {});
    expect(fetcher).not.toHaveBeenCalled();
    expect(result.current).toMatchObject({ data: null, error: "", loading: false });
  });

  it("ignores results after unmount and creates no refresh timers", async () => {
    vi.useFakeTimers();
    const pending = deferred<string>();
    const fetcher = vi.fn<() => Promise<string>>().mockReturnValue(pending.promise);
    const commits: unknown[] = [];
    const { unmount } = renderHook(() => {
      const query = useQuery(fetcher, [], { keepDataOnReload: true });
      useLayoutEffect(() => { commits.push(query.data); });
      return query;
    });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    unmount();
    const committed = commits.length;
    await act(async () => {
      pending.resolve("late");
      await vi.advanceTimersByTimeAsync(600000);
    });
    expect(commits).toHaveLength(committed);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps StrictMode effect cleanup from starting a discarded fetch", async () => {
    const fetcher = vi.fn<() => Promise<string>>().mockResolvedValue("ready");
    const { result } = renderHook(() => useQuery(fetcher, []), {
      wrapper: ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>,
    });
    await waitFor(() => expect(result.current.data).toBe("ready"));
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
