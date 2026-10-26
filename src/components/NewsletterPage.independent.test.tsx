import { StrictMode } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { BrowserRouter, Link, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import NewsletterPage from "./NewsletterPage";

const a = "a".repeat(64), b = "b".repeat(64);
const path = (token = a, action = "confirm", pathname = "/newsletter") => `${pathname}#action=${action}&token=${token}`;
const fetchMock = vi.fn<typeof fetch>();
const storage = { getItem: vi.fn<(key: string) => string | null>(), setItem: vi.fn(), removeItem: vi.fn(), clear: vi.fn(), key: vi.fn(), length: 0 };
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function mount(url = path()) {
  window.history.replaceState({ key: "qa-email", retained: true }, "", url);
  return render(<StrictMode><BrowserRouter>
    <Link to={path(a)}>Email A</Link><Link to={path(b, "unsubscribe")}>Email B</Link>
    <Routes>
      {/* Identical newsletter path/default matching to App.tsx; no payment/Auth imports. */}
      <Route path="/newsletter" element={<NewsletterPage />} />
      <Route path="/support" element={<h1>Support fixture</h1>} />
    </Routes>
  </BrowserRouter></StrictMode>);
}
const submit = (name = "Confirm subscription") => fireEvent.click(screen.getByRole("button", { name }));
beforeEach(() => {
  fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock);
  for (const method of [storage.getItem, storage.setItem, storage.removeItem, storage.clear, storage.key]) method.mockReset();
  storage.getItem.mockReturnValue(null);
  vi.stubGlobal("localStorage", storage); vi.stubGlobal("sessionStorage", storage);
  vi.stubEnv("VITE_SUPABASE_URL", "https://newsletter-fixture.invalid");
  vi.stubEnv("VITE_ANON_KEY", "public-test-key");
});
afterEach(() => {
  cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs();
  window.history.replaceState({}, "", "/");
});

// These are intentionally ordinary regression assertions, not expected-failure
// tests: accepted route spellings must not leave capability tokens in history.
it.each(["/newsletter/", "/NewsLetter"])("scrubs the capability on accepted route %s", (pathname) => {
  mount(path(a, "confirm", pathname));
  expect(screen.getByRole("button", { name: "Confirm subscription" })).toBeEnabled();
  expect(fetchMock).not.toHaveBeenCalled();
  expect(document.body.textContent).not.toContain(a);
  expect(window.history.state.retained).toBe(true);
  expect(window.location.hash).toBe("");
});

it("does not read/write browser Auth storage or react to cross-tab session events", async () => {
  storage.getItem.mockReturnValue(JSON.stringify({ access_token: "stored-user-bearer", refresh_token: "stored-refresh" }));
  fetchMock.mockResolvedValue(new Response('{"state":"subscribed"}'));
  mount();
  act(() => window.dispatchEvent(new StorageEvent("storage", { key: "sb-newsletter-fixture-auth-token", newValue: "another-user" })));
  expect(fetchMock).not.toHaveBeenCalled();
  submit();
  expect(await screen.findByText("Your newsletter subscription is confirmed.")).toBeInTheDocument();
  expect(storage.getItem).not.toHaveBeenCalled(); expect(storage.setItem).not.toHaveBeenCalled(); expect(storage.removeItem).not.toHaveBeenCalled();
  const [url, init] = fetchMock.mock.calls[0]!;
  expect(String(url)).toBe("https://newsletter-fixture.invalid/functions/v1/newsletter");
  expect(init?.credentials).toBe("omit"); expect(init?.referrerPolicy).toBe("no-referrer");
  expect(new Headers(init?.headers).has("Authorization")).toBe(false);
  expect(JSON.parse(String(init?.body))).toEqual({ action: "confirm", token: a });
});

it("timeout aborts once, displays uncertainty, and cannot auto-retry", async () => {
  vi.useFakeTimers();
  fetchMock.mockImplementation((_url, init) => new Promise((_resolve, reject) => {
    init!.signal!.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
  }));
  mount(); submit();
  await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
  expect(fetchMock.mock.calls[0]![1]!.signal!.aborted).toBe(true);
  expect(screen.getByRole("alert")).toHaveTextContent("We could not confirm the result");
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
  await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
  expect(fetchMock).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(0);
});

it.each(["resolve", "reject"] as const)("departure aborts and ignores a late body %s after returning to the same token", async (outcome) => {
  const body = deferred<unknown>();
  fetchMock.mockResolvedValue({ ok: true, json: () => body.promise } as Response);
  mount(); submit();
  await act(async () => { await Promise.resolve(); });
  const signal = fetchMock.mock.calls[0]![1]!.signal!;
  fireEvent.click(screen.getByRole("link", { name: "Contact support" }));
  expect(screen.getByRole("heading", { name: "Support fixture" })).toBeInTheDocument();
  expect(signal.aborted).toBe(true);
  fireEvent.click(screen.getByRole("link", { name: "Email A" }));
  expect(screen.getByRole("button", { name: "Confirm subscription" })).toBeEnabled();
  await act(async () => { if (outcome === "resolve") body.resolve({ state: "subscribed" }); else body.reject(new Error("late failure")); });
  expect(screen.queryByText("Your newsletter subscription is confirmed.")).not.toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it("A-B-A isolates each explicit token/action attempt, including stale opposite results", async () => {
  const first = deferred<Response>(), second = deferred<Response>(), third = deferred<Response>();
  fetchMock.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise).mockReturnValueOnce(third.promise);
  mount(); submit();
  fireEvent.click(screen.getByRole("link", { name: "Email B" }));
  expect(fetchMock).toHaveBeenCalledTimes(1); submit("Unsubscribe");
  fireEvent.click(screen.getByRole("link", { name: "Email A" }));
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(fetchMock.mock.calls.slice(0, 2).every((call) => call[1]!.signal!.aborted)).toBe(true);
  await act(async () => { first.resolve(new Response('{"state":"subscribed"}')); second.resolve(new Response('{"state":"unsubscribed"}')); });
  expect(screen.getByRole("button", { name: "Confirm subscription" })).toBeEnabled();
  expect(screen.queryByText(/You are unsubscribed|Your newsletter subscription is confirmed/)).not.toBeInTheDocument();
  expect(window.location.hash).toBe(""); submit();
  expect(fetchMock.mock.calls.map((call) => JSON.parse(String(call[1]!.body)))).toEqual([
    { action: "confirm", token: a }, { action: "unsubscribe", token: b }, { action: "confirm", token: a },
  ]);
  await act(async () => third.resolve(new Response('{"state":"subscribed"}')));
  expect(screen.getByText("Your newsletter subscription is confirmed.")).toBeInTheDocument();
});

it("unmount aborts the transport and clears its deadline", async () => {
  vi.useFakeTimers();
  fetchMock.mockReturnValue(new Promise(() => {}));
  const view = mount(); submit();
  expect(vi.getTimerCount()).toBe(1); view.unmount();
  expect(fetchMock.mock.calls[0]![1]!.signal!.aborted).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});

it.each([
  [200, '{"state":"subscribed"}'], [202, '{"state":"pending"}'], [429, '{"state":"unsubscribed"}'],
  [503, '{"state":"unsubscribed"}'], [200, 'null'], [200, '[]'], [200, '{"error":"disabled"}'],
])("unsubscribe does not assert success for status %s and body %s", async (status, body) => {
  fetchMock.mockResolvedValue(new Response(body, { status }));
  mount(path(a, "unsubscribe")); submit("Unsubscribe");
  expect(await screen.findByRole("alert")).toHaveTextContent("We could not confirm the result");
  expect(screen.queryByText(/You are unsubscribed/)).not.toBeInTheDocument();
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it.each(["VITE_SUPABASE_URL", "VITE_ANON_KEY"])("missing %s fails locally with no transport", async (key) => {
  vi.stubEnv(key, ""); mount(); submit();
  expect(await screen.findByRole("alert")).toBeInTheDocument(); expect(fetchMock).not.toHaveBeenCalled();
});

it("a fresh mount of the scrubbed URL cannot replay its capability", () => {
  const first = mount(); const scrubbed = window.location.pathname + window.location.search + window.location.hash;
  first.unmount(); mount(scrubbed);
  expect(screen.getByText(/incomplete or invalid/)).toBeInTheDocument();
  expect(screen.queryByRole("button")).not.toBeInTheDocument(); expect(fetchMock).not.toHaveBeenCalled();
});
