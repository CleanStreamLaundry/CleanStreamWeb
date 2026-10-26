import { StrictMode } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { BrowserRouter, Link, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import NewsletterPage from "./NewsletterPage";

const token = "a".repeat(64);
const nextToken = "b".repeat(64);
const fetchMock = vi.fn<typeof fetch>();
const path = (action = "confirm", value = token) => `/newsletter#action=${action}&token=${value}`;

function mount(url = path()) {
  window.history.replaceState({ key: "email-link", custom: "preserved" }, "", url);
  return render(<StrictMode><BrowserRouter>
    <Link to={path("unsubscribe", nextToken)}>Next email</Link>
    <Routes>
      <Route path="/newsletter" element={<NewsletterPage />} />
      <Route path="/support" element={<h1>Support</h1>} />
    </Routes>
  </BrowserRouter></StrictMode>);
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("VITE_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("VITE_ANON_KEY", "public-fixture-key");
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  window.history.replaceState({}, "", "/");
});

it("removes the capability from history without auto-confirming, even in StrictMode", () => {
  mount();
  expect(window.location.hash).toBe("");
  expect(window.history.state.custom).toBe("preserved");
  expect(screen.getByRole("button", { name: "Confirm subscription" })).toBeEnabled();
  expect(document.body.textContent).not.toContain(token);
  expect(fetchMock).not.toHaveBeenCalled();
});

it.each([
  "/newsletter",
  "/newsletter?token=secret",
  "/newsletter#action=confirm&token=bad",
  `/newsletter#action=delete&token=${token}`,
  `/newsletter#action=confirm&token=${token}&token=${nextToken}`,
  `/newsletter#action=confirm&action=unsubscribe&token=${token}`,
  `/newsletter#action=confirm&token=${token}&email=person@example.test`,
])("rejects malformed capability %s without a request", (url) => {
  mount(url);
  expect(screen.getByText(/incomplete or invalid/)).toBeInTheDocument();
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
  expect(window.location.hash).toBe("");
  expect(window.location.search).toBe("");
  expect(fetchMock).not.toHaveBeenCalled();
});

it.each([
  ["confirm", "Confirm subscription", "subscribed", "Your newsletter subscription is confirmed."],
  ["unsubscribe", "Unsubscribe", "unsubscribed", /You are unsubscribed/],
] as const)("requires an explicit %s and does not attach a user session", async (action, label, state, message) => {
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ state }), { status: 200 }));
  mount(path(action));
  fireEvent.click(screen.getByRole("button", { name: label }));
  expect(await screen.findByText(message)).toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [url, init] = fetchMock.mock.calls[0]!;
  expect(String(url)).toBe("https://example.supabase.co/functions/v1/newsletter");
  expect(init?.method).toBe("POST");
  expect(init?.credentials).toBe("omit");
  expect(init?.referrerPolicy).toBe("no-referrer");
  expect(init?.headers).toEqual({ apikey: "public-fixture-key", "Content-Type": "application/json" });
  expect(JSON.parse(init!.body as string)).toEqual({ action, token });
});

it("deduplicates clicks and does not claim success for an uncertain outcome", async () => {
  let reject!: (error: Error) => void;
  fetchMock.mockImplementation(() => new Promise((_, fail) => { reject = fail; }));
  mount();
  const button = screen.getByRole("button", { name: "Confirm subscription" });
  fireEvent.click(button);
  fireEvent.click(button);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(button).toBeDisabled();
  await act(async () => reject(new Error("connection lost")));
  expect(screen.getByRole("alert")).toHaveTextContent("We could not confirm the result");
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});

it.each([
  new Response('{"state":"pending"}', { status: 200 }),
  new Response('{"state":"unsubscribed"}', { status: 200 }),
  new Response('{"state":"subscribed"}', { status: 503 }),
  new Response("not json", { status: 200 }),
])("validates server state and HTTP outcome", async (response) => {
  fetchMock.mockResolvedValue(response);
  mount();
  fireEvent.click(screen.getByRole("button", { name: "Confirm subscription" }));
  expect(await screen.findByRole("alert")).toBeInTheDocument();
});

it("does not send without configured public client settings", async () => {
  vi.stubEnv("VITE_SUPABASE_URL", "");
  mount();
  fireEvent.click(screen.getByRole("button", { name: "Confirm subscription" }));
  expect(await screen.findByRole("alert")).toBeInTheDocument();
  expect(fetchMock).not.toHaveBeenCalled();
});

it("abandons old results and retains a newly opened email action", async () => {
  let resolve!: (response: Response) => void;
  fetchMock.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
  mount();
  fireEvent.click(screen.getByRole("button", { name: "Confirm subscription" }));
  const oldSignal = fetchMock.mock.calls[0]![1]!.signal;
  fireEvent.click(screen.getByRole("link", { name: "Next email" }));
  expect(screen.getByRole("button", { name: "Unsubscribe" })).toBeEnabled();
  expect(oldSignal?.aborted).toBe(true);
  await act(async () => resolve(new Response('{"state":"subscribed"}')));
  expect(screen.queryByText("Your newsletter subscription is confirmed.")).not.toBeInTheDocument();
  fetchMock.mockResolvedValue(new Response('{"state":"unsubscribed"}'));
  fireEvent.click(screen.getByRole("button", { name: "Unsubscribe" }));
  await waitFor(() => expect(screen.getByText(/You are unsubscribed/)).toBeInTheDocument());
  expect(JSON.parse(fetchMock.mock.calls[1]![1]!.body as string)).toEqual({ action: "unsubscribe", token: nextToken });
});
