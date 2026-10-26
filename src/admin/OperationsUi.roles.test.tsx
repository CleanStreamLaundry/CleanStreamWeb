import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ExportButton } from "./OperationsUi";
import type { Identity } from "./types";
const mock = vi.hoisted(() => ({ identity: null as Identity | null, exportRecords: vi.fn() }));
vi.mock("./context", () => ({ useAdmin: () => ({ identity: mock.identity, api: { exportRecords: mock.exportRecords } }) }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
it.each(["role", "unmount"])("does not download stale financial export after %s change", async change => {
  mock.identity = { id: "owner", name: "Owner", email: "owner@example.invalid", role: "Owner" };
  let complete!: (value: unknown) => void;
  mock.exportRecords.mockReturnValue(new Promise(resolve => { complete = resolve; }));
  const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  const { rerender, unmount } = render(<ExportButton dataset="transactions" filters={{}} />);
  fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));
  if (change === "unmount") unmount();
  else {
    mock.identity = { ...mock.identity, role: "Admin", portalRole: "Manager" };
    rerender(<ExportButton dataset="transactions" filters={{}} />);
  }
  await act(async () => complete({ rows: [{ amount: 100 }], total: 1, exportedAt: "2026-10-04" }));
  expect(click).not.toHaveBeenCalled();
});
