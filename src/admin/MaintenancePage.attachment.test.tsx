import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import MaintenancePage from "./MaintenancePage";

const mocks = vi.hoisted(() => ({
  attempt: vi.fn(), createUrl: vi.fn(), revokeUrl: vi.fn(),
  identity: { id: "A", role: "Owner" },
  api: { maintenance: vi.fn(), history: vi.fn(), assignees: vi.fn(), updateMaintenance: vi.fn() },
}));
vi.mock("./context", () => ({ useAdmin: () => ({ api: mocks.api, identity: mocks.identity }) }));
vi.mock("./maintenanceAttachment", () => ({ maintenanceAttachmentAttempt: mocks.attempt }));
vi.mock("./OperationsUi", () => ({ ChangeDetails: () => null, ExportButton: () => null, LocationFilter: () => null }));
const report = {
  maint_id: "9223372036854775807", category: "Other", description: "Report evidence", location: "Test",
  created_at: "2026-09-30T12:00:00Z", updated_at: "2026-09-30T12:00:00Z", status: "open",
  image_data: "https://untrusted.invalid/tracking.png",
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
function attempt() {
  let active = true;
  return {
    current: () => active,
    close: vi.fn(() => { active = false; }),
    download: vi.fn<() => Promise<Blob>>().mockResolvedValue(new Blob(["synthetic"], { type: "image/png" })),
    invalidate() { active = false; },
  };
}
const NativeURL = URL;
beforeEach(() => {
  vi.resetAllMocks();
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  mocks.identity = { id: "A", role: "Owner" };
  mocks.api.maintenance.mockResolvedValue({ items: [report], total: 1, page: 1, pageSize: 25 });
  mocks.api.history.mockResolvedValue([]);
  mocks.api.assignees.mockResolvedValue([]);
  mocks.attempt.mockImplementation(attempt);
  mocks.createUrl.mockReturnValue("blob:private-attachment");
  vi.stubGlobal("URL", class extends NativeURL {
    static createObjectURL = mocks.createUrl;
    static revokeObjectURL = mocks.revokeUrl;
  });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function view() { return <MemoryRouter><MaintenancePage /></MemoryRouter>; }
async function open() {
  const result = render(view());
  fireEvent.click(await screen.findByRole("button", { name: "View report" }));
  return result;
}

it("never embeds a legacy URL and loads authorized evidence only after the user requests it", async () => {
  await open();
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
  expect(document.querySelector(`[src="${report.image_data}"], [href="${report.image_data}"]`)).toBeNull();
  expect(mocks.attempt).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "View attachment" }));
  expect(await screen.findByRole("img", { name: "Attached maintenance report evidence" })).toHaveAttribute("src", "blob:private-attachment");
  expect(mocks.attempt).toHaveBeenCalledExactlyOnceWith(report.maint_id, "A", expect.any(Function));
  const download = screen.getByRole("link", { name: "Download attachment" });
  expect(download).toHaveAttribute("href", "blob:private-attachment");
  expect(download).toHaveAttribute("download", `maintenance-${report.maint_id}`);
});
it("shows pending/failure states and retries without a legacy fallback", async () => {
  const run = attempt();
  const pending = deferred<Blob>();
  run.download.mockReturnValue(pending.promise);
  mocks.attempt.mockReturnValueOnce(run);
  await open();
  fireEvent.click(screen.getByRole("button", { name: "View attachment" }));
  expect(screen.getByRole("button", { name: "Loading attachment..." })).toBeDisabled();
  await act(async () => { pending.reject(new Error("This attachment is unavailable or you no longer have access.")); });
  expect(await screen.findByRole("alert")).toHaveTextContent("unavailable");
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Retry attachment" }));
  expect(await screen.findByRole("img")).toHaveAttribute("src", "blob:private-attachment");
  expect(run.close).toHaveBeenCalledOnce();
});
it("revokes preview on close and never starts a second download automatically", async () => {
  const run = attempt();
  mocks.attempt.mockReturnValueOnce(run);
  await open();
  fireEvent.click(screen.getByRole("button", { name: "View attachment" }));
  await screen.findByRole("img");
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(run.close).toHaveBeenCalledOnce();
  expect(mocks.revokeUrl).toHaveBeenCalledExactlyOnceWith("blob:private-attachment");
  fireEvent.click(screen.getByRole("button", { name: "View report" }));
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
  expect(mocks.attempt).toHaveBeenCalledOnce();
});
it("discards a deferred blob after the detail is closed", async () => {
  const run = attempt();
  const pending = deferred<Blob>();
  run.download.mockReturnValue(pending.promise);
  mocks.attempt.mockReturnValueOnce(run);
  await open();
  fireEvent.click(screen.getByRole("button", { name: "View attachment" }));
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  await act(async () => { pending.resolve(new Blob(["late"], { type: "image/png" })); });
  expect(mocks.createUrl).not.toHaveBeenCalled();
  expect(run.close).toHaveBeenCalledOnce();
});
it("clears and revokes visible evidence immediately on same-ID session replacement", async () => {
  const run = attempt();
  mocks.attempt.mockReturnValueOnce(run);
  await open();
  fireEvent.click(screen.getByRole("button", { name: "View attachment" }));
  await screen.findByRole("img");
  act(() => {
    run.invalidate();
    mocks.attempt.mock.calls[0]?.[2]();
  });
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Download attachment" })).not.toBeInTheDocument();
  expect(mocks.revokeUrl).toHaveBeenCalledExactlyOnceWith("blob:private-attachment");
  expect(screen.getByRole("alert")).toHaveTextContent("session changed");
});
it("unmounts caller A's attachment state when the provider identity changes", async () => {
  const run = attempt();
  mocks.attempt.mockReturnValueOnce(run);
  const result = await open();
  fireEvent.click(screen.getByRole("button", { name: "View attachment" }));
  await screen.findByRole("img");
  mocks.identity = { id: "B", role: "Owner" };
  result.rerender(view());
  await waitFor(() => expect(run.close).toHaveBeenCalledOnce());
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
  expect(mocks.revokeUrl).toHaveBeenCalledExactlyOnceWith("blob:private-attachment");
});
