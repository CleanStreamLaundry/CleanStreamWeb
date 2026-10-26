import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { StrictMode, useLayoutEffect, useState } from "react";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminWorkspace } from "./AdminApp";
import { Modal } from "./ui";
import type { AdminApi, AuditEvent, Identity, MaintenanceRecord } from "./types";
const identity: Identity = {
  id: "owner",
  role: "Owner",
  name: "Owner",
  email: "owner@example.com",
};
const record: MaintenanceRecord = {
  maint_id: "old-report",
  category: "Other",
  description: "An old report still awaiting repair",
  created_at: "2026-01-01T12:00:00Z",
  location: "North",
  location_id: 1,
  image_data: null,
  status: "open",
  updated_at: "2026-01-01T12:00:00Z",
};
function api() {
  return {
    topupRefunds: vi.fn().mockResolvedValue([]),
    reviewTopupRefund: vi.fn(),
    identity: vi.fn().mockResolvedValue(identity),
    locations: vi
      .fn()
      .mockResolvedValue([{ id: 1, Name: "North", Address: "North address" }]),
    maintenance: vi
      .fn()
      .mockResolvedValue({ items: [record], total: 1, page: 1, pageSize: 20 }),
    history: vi.fn().mockResolvedValue([]),
    assignees: vi
      .fn()
      .mockResolvedValue([
        { id: "staff", name: "Staff", email: "staff@example.com" },
      ]),
    audit: vi
      .fn()
      .mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 }),
    transactions: vi
      .fn()
      .mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 }),
    exportRecords: vi.fn().mockResolvedValue({
      rows: [],
      total: 0,
      exportedAt: "2026-09-28T12:00:00Z",
    }),
    machines: vi.fn().mockResolvedValue([
      {
        id: 1,
        Name: "Washer 01",
        Machine_type: "Washer",
        Price: 3.5,
        Weight_kg: 10,
        Status: "idle",
        Location_ID: 1,
        is_out_of_service: false,
        service_updated_at: record.updated_at,
      },
    ]),
    rates: vi.fn().mockResolvedValue([]),
    setAvailability: vi.fn().mockResolvedValue(undefined),
    updateMaintenance: vi.fn().mockResolvedValue(undefined),
    team: vi.fn().mockResolvedValue({
      items: [
        {
          user_id: "staff",
          name: "Staff",
          email: "staff@example.com",
          role: "Admin",
          location_id: 1,
          location_name: "North",
          invitation_status: "active",
          assignment_count: 2,
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    }),
    removeMember: vi.fn().mockResolvedValue(undefined),
    invite: vi.fn().mockResolvedValue({}),
    credits: vi
      .fn()
      .mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 }),
    overview: vi.fn().mockResolvedValue({
      today: 0,
      total: 0,
      daily: [],
      hourly: Array(24).fill(0),
      pendingCredits: 0,
      openMaintenance: 0,
      locations: 1,
      machines: 0,
      updatedAt: "2026-09-28T12:00:00Z",
      financialScope: "Assigned locations",
    }),
  } as unknown as AdminApi;
}
function show(path: string, service: AdminApi, role = identity) {
  return render(
    <MemoryRouter initialEntries={[`/admin/preview/${path}`]}>
      <Routes>
        <Route
          path="/admin/preview/*"
          element={
            <AdminWorkspace fixture={{ api: service, identity: role }} />
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}
beforeEach(() => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  );
  sessionStorage.clear();
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
});
describe("new admin workflows", () => {
  it.each(["refunds", "transactions", "topup-refunds", "audit"])("blocks Manager access to %s before requesting financial data", async (path) => {
    const service = api();
    show(path, service, { ...identity, role: "Admin", portalRole: "Manager" });
    await screen.findByRole("heading", { name: "Overview", level: 1 });
    await waitFor(() => expect(service.overview).toHaveBeenCalled());
    for (const label of ["Loyalty Credits", "Transactions", "Top-Up Refunds", "Audit Log"]) {
      expect(screen.queryByRole("link", { name: label })).not.toBeInTheDocument();
    }
    expect(screen.queryByText("Stripe net collections today")).not.toBeInTheDocument();
    expect(screen.queryByText("Pending loyalty credits")).not.toBeInTheDocument();
    expect(screen.queryByText("Collection coverage")).not.toBeInTheDocument();
    expect(service.credits).not.toHaveBeenCalled();
    expect(service.transactions).not.toHaveBeenCalled();
    expect(service.topupRefunds).not.toHaveBeenCalled();
    expect(service.audit).not.toHaveBeenCalled();
  });

  it.each(["", "locations", "employees", "transactions", "refunds"])("routes Maintenance away from %s into only its work queue", async (path) => {
    const service = api();
    show(path, service, { ...identity, role: "Admin", portalRole: "Maintenance" });
    expect(await screen.findByText(record.description)).toBeInTheDocument();
    const navigation = screen.getByRole("navigation", { name: "Main navigation" });
    expect(within(navigation).getAllByRole("link")).toHaveLength(1);
    expect(within(navigation).getByRole("link", { name: "Maintenance" })).toBeInTheDocument();
    expect(service.overview).not.toHaveBeenCalled();
    expect(service.team).not.toHaveBeenCalled();
    expect(service.machines).not.toHaveBeenCalled();
    expect(service.transactions).not.toHaveBeenCalled();
    expect(service.credits).not.toHaveBeenCalled();
  });

  it("shows Manager inventory without prices or payment configuration", async () => {
    const service = api();
    show("locations", service, { ...identity, role: "Admin", portalRole: "Manager" });
    expect(await screen.findByText("Washer 01")).toBeInTheDocument();
    expect(screen.queryByText("$3.50")).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Washer pricing" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Payment setup" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add machine" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Take out of service" })).toBeInTheDocument();
    expect(service.rates).not.toHaveBeenCalled();
  });

  it.each([
    { locations: [], selected: "0" },
    { locations: [{ id: 1, Name: "North", Address: "North address", Longitude: 0, Latitude: 0 }], selected: "1" },
    { locations: [
      { id: 1, Name: "North", Address: "North address", Longitude: 0, Latitude: 0 },
      { id: 2, Name: "South", Address: "South address", Longitude: 0, Latitude: 0 },
    ], selected: "0" },
  ])("replaces an unavailable saved location with $selected", async ({ locations, selected }) => {
    sessionStorage.setItem("admin.location", "99");
    const service = api();
    vi.mocked(service.locations).mockResolvedValue(locations);
    show("locations", service);
    const select = await screen.findByRole("combobox", { name: "Location" });
    await waitFor(() => expect(select).toBeEnabled());
    expect(select).toHaveValue(selected);
    if (selected === "0") expect(screen.queryByText("Washer 01")).not.toBeInTheDocument();
  });

  it("routes Owners to the distinct top-up queue", async () => {
    const service = api(); show("topup-refunds", service);
    expect(await screen.findByText("No top-up refund requests")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Top-Up Refunds" })).toBeInTheDocument();
    expect(service.topupRefunds).toHaveBeenCalledWith("owner", null);
    expect(service.credits).not.toHaveBeenCalled();
  });
  it("hides and denies the top-up refund route for Admins", async () => {
    const service = api(); show("topup-refunds", service, { ...identity, role: "Admin" });
    await screen.findByRole("heading", { name: "Overview", level: 1 });
    expect(screen.queryByRole("link", { name: "Top-Up Refunds" })).not.toBeInTheDocument();
    expect(service.topupRefunds).not.toHaveBeenCalled();
  });
  it("shows old unresolved reports and defaults to an age-independent queue", async () => {
    const service = api();
    show("maintenance", service);
    expect(await screen.findByText(record.description)).toBeInTheDocument();
    expect(service.maintenance).toHaveBeenCalledWith({
      status: "unresolved",
      page: 1,
    });
  });
  it("keeps a failed maintenance update open without losing the note", async () => {
    const service = api();
    vi.mocked(service.updateMaintenance).mockRejectedValue(
      new Error("Connection interrupted"),
    );
    show("maintenance", service);
    fireEvent.click(await screen.findByRole("button", { name: "View report" }));
    fireEvent.change(screen.getByLabelText(/Internal note/), {
      target: { value: "Replace door latch" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save update" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Connection interrupted",
    );
    expect(screen.getByLabelText(/Internal note/)).toHaveValue(
      "Replace door latch",
    );
    expect(service.updateMaintenance).toHaveBeenCalledWith(
      "old-report",
      "open",
      "Replace door latch",
      record.updated_at,
      { priority: "normal", assignedTo: null, dueDate: null },
    );
  });
  it("removes only the selected location with explicit confirmation", async () => {
    const service = api();
    show("employees", service);
    fireEvent.click(
      await screen.findByRole("button", { name: "Remove location" }),
    );
    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByText(/retain staff access to 1 other location/),
    ).toBeInTheDocument();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Remove location access" }),
    );
    await waitFor(() =>
      expect(service.removeMember).toHaveBeenCalledWith("staff", 1),
    );
  });
  it("gives Managers read-only Team access", async () => {
    const service = api();
    show("employees", service, { ...identity, role: "Admin" });
    await screen.findByRole("heading", { name: "Team", level: 1 });
    expect(screen.getByRole("link", { name: "Team" })).toBeInTheDocument();
    expect(await screen.findByText("Staff")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Invite team member" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove access" })).not.toBeInTheDocument();
  });
  it("invites only after email and locations have been provided", async () => {
    const service = api();
    show("employees", service);
    fireEvent.click(screen.getByRole("button", { name: "Invite team member" }));
    const send = screen.getByRole("button", { name: "Send invitation" });
    expect(send).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "new@example.com" },
    });
    fireEvent.click(await screen.findByRole("checkbox"));
    fireEvent.click(send);
    await waitFor(() =>
      expect(service.invite).toHaveBeenCalledWith("new@example.com", [1], "Manager"),
    );
  });
  it("credits default to pending and failures do not appear as empty lists", async () => {
    const service = api();
    vi.mocked(service.credits).mockRejectedValue(new Error("Request failed"));
    show("refunds", service);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Request failed",
    );
    expect(
      screen.queryByText("No matching loyalty credit requests"),
    ).not.toBeInTheDocument();
    expect(service.credits).toHaveBeenCalledWith({
      status: "pending",
      page: 1,
    });
  });
});

it("denies the Audit Log route to Admin accounts without fetching audit data", async () => {
  const service = api();
  show("audit", service, { ...identity, role: "Admin" });
  await screen.findByRole("heading", { name: "Overview", level: 1 });
  expect(service.audit).not.toHaveBeenCalled();
  expect(
    screen.queryByRole("link", { name: "Audit Log" }),
  ).not.toBeInTheDocument();
});
it("exports current filters across pages and shows permission failures", async () => {
  const service = api();
  vi.mocked(service.exportRecords).mockRejectedValue(
    new Error("Export access denied"),
  );
  show("transactions", service);
  fireEvent.change(screen.getByRole("combobox", { name: "Payment status" }), {
    target: { value: "refunded" },
  });
  fireEvent.change(screen.getByRole("searchbox", { name: "Search records" }), {
    target: { value: "pi_customer" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Export access denied",
  );
  expect(service.exportRecords).toHaveBeenCalledWith("transactions", {
    status: "all",
    page: 1,
    paymentStatus: "refunded",
    search: "pi_customer",
  });
});
it("saves maintenance planning with the original version and does not require a status change", async () => {
  const service = api();
  show("maintenance", service);
  fireEvent.click(await screen.findByRole("button", { name: "View report" }));
  const dialog = within(screen.getByRole("dialog"));
  await dialog.findByRole("option", { name: "Staff" });
  fireEvent.change(dialog.getByLabelText("Priority"), {
    target: { value: "urgent" },
  });
  fireEvent.change(dialog.getByRole("combobox", { name: /Assigned to/ }), {
    target: { value: "staff" },
  });
  fireEvent.change(dialog.getByLabelText(/Due date/), {
    target: { value: "2026-10-01" },
  });
  fireEvent.click(dialog.getByRole("button", { name: "Save update" }));
  await waitFor(() =>
    expect(service.updateMaintenance).toHaveBeenCalledWith(
      "old-report",
      "open",
      "",
      record.updated_at,
      { priority: "urgent", assignedTo: "staff", dueDate: "2026-10-01" },
    ),
  );
});
it("requires an outage reason, prevents duplicate submissions, and preserves failed edits", async () => {
  const service = api();
  let rejectSave!: (error: Error) => void;
  vi.mocked(service.setAvailability).mockImplementation(
    () =>
      new Promise((_, reject) => {
        rejectSave = reject;
      }),
  );
  show("locations", service);
  fireEvent.click(
    await screen.findByRole("button", { name: "Take out of service" }),
  );
  const dialog = within(screen.getByRole("dialog"));
  const submit = dialog.getByRole("button", { name: "Take out of service" });
  expect(submit).toBeDisabled();
  fireEvent.change(dialog.getByLabelText(/Reason/), {
    target: { value: "Door latch needs repair" },
  });
  fireEvent.click(submit);
  fireEvent.click(submit);
  expect(service.setAvailability).toHaveBeenCalledTimes(1);
  expect(service.setAvailability).toHaveBeenCalledWith(
    1,
    true,
    "Door latch needs repair",
    record.updated_at,
  );
  rejectSave(new Error("Machine availability changed. Refresh and try again."));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Machine availability changed",
  );
  expect(dialog.getByLabelText(/Reason/)).toHaveValue(
    "Door latch needs repair",
  );
});
it("late transaction searches cannot replace the currently selected filter results", async () => {
  const service = api();
  let finish!: (data: Awaited<ReturnType<AdminApi["transactions"]>>) => void;
  vi.mocked(service.transactions).mockImplementation((filters) =>
    filters.search === "old"
      ? new Promise((resolve) => {
          finish = resolve;
        })
      : Promise.resolve({ items: [], total: 0, page: 1, pageSize: 20 }),
  );
  show("transactions", service);
  const search = screen.getByRole("searchbox", { name: "Search records" });
  fireEvent.change(search, { target: { value: "old" } });
  await waitFor(() => expect(finish).toBeTypeOf("function"));
  fireEvent.change(search, { target: { value: "new" } });
  await screen.findByText("No matching transactions");
  finish({ items: [], total: 99, page: 1, pageSize: 20 });
  await waitFor(() =>
    expect(screen.getByText(/0 results · Page 1/)).toBeInTheDocument(),
  );
  expect(screen.queryByText(/99 results/)).not.toBeInTheDocument();
});
it("clearing the location filter omits it and returns to the first page", async () => {
  const service = api();
  show("transactions", service);
  const location = screen.getByRole("combobox", { name: "Location" });
  await waitFor(() => expect(location).toBeEnabled());
  fireEvent.change(location, { target: { value: "1" } });
  await waitFor(() =>
    expect(service.transactions).toHaveBeenLastCalledWith({
      status: "all",
      page: 1,
      locationId: 1,
    }),
  );
  fireEvent.change(location, { target: { value: "" } });
  await waitFor(() =>
    expect(service.transactions).toHaveBeenLastCalledWith({
      status: "all",
      page: 1,
    }),
  );
  expect(vi.mocked(service.transactions).mock.lastCall?.[0]).not.toHaveProperty(
    "locationId",
  );
});

describe("audit entity labels", () => {
  const event: AuditEvent = {
    id: "synthetic-audit-event",
    created_at: "2026-09-29T12:00:00Z",
    actor_id: "owner",
    actor_name: "Owner",
    entity: "machine",
    entity_id: "synthetic-audit-record",
    operation: "update",
    location_ids: [1],
    before_values: { Name: "Before fixture" },
    after_values: { Name: "After fixture" },
  };

  it("allows Owner access and preserves record labels, filter values and page reset", async () => {
    const service = api();
    vi.mocked(service.audit).mockImplementation(async (filters) => ({
      items: [event], total: 40, page: filters.page ?? 1, pageSize: 20,
    }));
    show("audit", service);
    expect(await screen.findByRole("heading", { name: "Audit Log", level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Audit Log" })).toBeInTheDocument();
    await screen.findByText("ID synthetic-audit-record");
    expect(service.audit).toHaveBeenCalledWith({ page: 1 });
    const filter = screen.getByRole("combobox", { name: "Record type" });
    expect(within(filter).getAllByRole("option").map(option => [
      option.getAttribute("value"), option.textContent,
    ])).toEqual([
      ["", "All record types"],
      ["machine", "Machine"],
      ["location", "Location"],
      ["washer_rate", "Washer pricing"],
      ["payment_config", "Payment setup"],
      ["membership", "Location access"],
      ["invitation", "Invitation"],
      ["maintenance", "Maintenance"],
      ["loyalty_credit", "Loyalty Credit"],
      ["role", "Account role"],
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    await waitFor(() => expect(service.audit).toHaveBeenLastCalledWith({ page: 2 }));
    fireEvent.change(filter, { target: { value: "washer_rate" } });
    await waitFor(() => expect(service.audit).toHaveBeenLastCalledWith({ page: 1, entity: "washer_rate" }));
    expect(filter).toHaveValue("washer_rate");
    fireEvent.change(filter, { target: { value: "" } });
    await waitFor(() => expect(service.audit).toHaveBeenLastCalledWith({ page: 1, entity: "" }));
    expect(service.exportRecords).not.toHaveBeenCalled();
  });

  it.each([
    ["machine", "Machine"],
    ["synthetic_entity", "synthetic_entity"],
  ])("preserves the row and dialog label for %s", async (entity, label) => {
    const service = api();
    vi.mocked(service.audit).mockResolvedValue({
      items: [{ ...event, entity }], total: 1, page: 1, pageSize: 20,
    });
    show("audit", service);
    const table = await screen.findByRole("table");
    expect(within(table).getByText(label, { exact: true })).toBeInTheDocument();
    fireEvent.click(within(table).getByRole("button", { name: "View changes" }));
    const dialog = await screen.findByRole("dialog", { name: `${label} changes` });
    expect(within(dialog).getByText("Record synthetic-audit-record · update")).toBeInTheDocument();
    expect(within(dialog).getByText("Before fixture")).toBeInTheDocument();
    expect(within(dialog).getByText("After fixture")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: /^Close$/ }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(service.audit).toHaveBeenCalledTimes(1);
    expect(service.exportRecords).not.toHaveBeenCalled();
  });
});

function NavigationDriver({ onCommit }: {
  onCommit: ((pathname: string) => void) | undefined;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  useLayoutEffect(() => { onCommit?.(location.pathname); }, [location.pathname, onCommit]);
  return <>
    <button onClick={() => navigate("/admin/preview/employees")}>Go to team</button>
    <button onClick={() => navigate(-1)}>History back</button>
    <button onClick={() => navigate(1)}>History forward</button>
    <button onClick={() => navigate({ search: "?view=queue", hash: location.hash })}>Query only</button>
    <button onClick={() => navigate({ search: location.search, hash: "#reports" })}>Hash only</button>
    <button onClick={() => navigate("/admin/preview/unmatched-one")}>Unmatched one</button>
    <button onClick={() => navigate("/admin/preview/unmatched-two")}>Unmatched two</button>
  </>;
}

function showNavigation(onCommit?: (pathname: string) => void, strict = false) {
  const fixture = { api: api(), identity };
  const view = <MemoryRouter initialEntries={["/admin/preview/maintenance"]}>
    <Routes>
      <Route path="/admin/preview/*" element={<AdminWorkspace fixture={fixture} />} />
    </Routes>
    <NavigationDriver onCommit={onCommit} />
  </MemoryRouter>;
  return render(strict ? <StrictMode>{view}</StrictMode> : view);
}

function mobileViewport() {
  const listeners = new Set<() => void>();
  const media = {
    matches: true,
    addEventListener: vi.fn((_event: string, listener: () => void) => listeners.add(listener)),
    removeEventListener: vi.fn((_event: string, listener: () => void) => listeners.delete(listener)),
  };
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue(media));
  return {
    listeners,
    change(matches: boolean) {
      media.matches = matches;
      listeners.forEach(listener => listener());
    },
  };
}

describe("workspace navigation lifecycle", () => {
  let originalOverflow: string;
  let originalTitle: string;
  beforeEach(() => {
    originalOverflow = document.body.style.overflow;
    originalTitle = document.title;
    mobileViewport();
    document.body.style.overflow = "scroll";
  });
  afterEach(() => {
    cleanup();
    document.body.style.overflow = originalOverflow;
    document.title = originalTitle;
    vi.restoreAllMocks();
  });

  it("opens mobile navigation, locks scrolling and traps focus", async () => {
    const view = showNavigation();
    await screen.findByText(record.description);
    const trigger = screen.getByRole("button", { name: "Open navigation" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(view.container.querySelector("aside")).toHaveAttribute("inert");
    fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Workspace navigation" });
    const first = within(dialog).getByRole("link", { name: /CleanStream/ });
    // jsdom groups this selector differently from browser document order.
    const targets = dialog.querySelectorAll<HTMLElement>("a,button:not(:disabled)");
    const last = targets[targets.length - 1]!;
    expect(targets).toContain(within(dialog).getByRole("link", { name: /View public website/ }));
    expect(targets).not.toContain(within(dialog).getByRole("button", { name: "Sign out" }));
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).not.toHaveAttribute("inert");
    expect(view.container.querySelector(".ap-workspace")).toHaveAttribute("inert");
    expect(document.body.style.overflow).toBe("hidden");
    expect(first).toHaveFocus();
    fireEvent.keyDown(first, { key: "Tab", shiftKey: true });
    expect(last).toHaveFocus();
    fireEvent.keyDown(last, { key: "Tab" });
    expect(first).toHaveFocus();
  });

  it.each(["Escape", "scrim", "close button"])("restores focus and scrolling after %s", async (action) => {
    const view = showNavigation();
    await screen.findByText(record.description);
    const trigger = screen.getByRole("button", { name: "Open navigation" });
    fireEvent.click(trigger);
    if (action === "Escape") fireEvent.keyDown(window, { key: "Escape" });
    else if (action === "scrim") fireEvent.click(view.container.querySelector<HTMLButtonElement>(".ap-scrim")!);
    else fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Close navigation" }));
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveFocus();
    expect(document.body.style.overflow).toBe("scroll");
    expect(view.container.querySelector("aside")).toHaveAttribute("aria-hidden", "true");
    expect(view.container.querySelector(".ap-workspace")).not.toHaveAttribute("inert");
  });

  it("closes navigation before the destination commits and preserves the trigger", async () => {
    const commits: { pathname: string; expanded: string | null }[] = [];
    showNavigation(pathname => commits.push({ pathname, expanded: screen.getByRole("button", { name: "Open navigation" }).getAttribute("aria-expanded") }));
    await screen.findByText(record.description);
    const trigger = screen.getByRole("button", { name: "Open navigation" });
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("link", { name: "Team" }));
    await screen.findByRole("heading", { name: "Team", level: 1 });
    expect(commits.filter(commit => commit.pathname.endsWith("/employees"))).toEqual([
      { pathname: "/admin/preview/employees", expanded: "false" },
    ]);
    expect(screen.getByRole("button", { name: "Open navigation" })).toBe(trigger);
    expect(trigger).toHaveFocus();
    expect(document.body.style.overflow).toBe("scroll");
    expect(document.title).toBe("Team · CleanStream Admin");
  });

  it("closes on programmatic and history navigation without reopening an earlier path", async () => {
    showNavigation();
    await screen.findByText(record.description);
    const trigger = screen.getByRole("button", { name: "Open navigation" });
    for (const [action, heading] of [["Go to team", "Team"], ["History back", "Maintenance"], ["History forward", "Team"]] as const) {
      fireEvent.click(trigger);
      expect(trigger).toHaveAttribute("aria-expanded", "true");
      fireEvent.click(screen.getByRole("button", { name: action }));
      await screen.findByRole("heading", { name: heading, level: 1 });
      expect(trigger).toHaveAttribute("aria-expanded", "false");
      expect(trigger).toHaveFocus();
      expect(document.body.style.overflow).toBe("scroll");
    }
    fireEvent.click(screen.getByRole("button", { name: "History back" }));
    await screen.findByText(record.description);
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("keeps navigation open for query-only and hash-only changes", async () => {
    showNavigation();
    await screen.findByText(record.description);
    const trigger = screen.getByRole("button", { name: "Open navigation" });
    fireEvent.click(trigger);
    for (const action of ["Query only", "Hash only", "History back", "History back"]) {
      fireEvent.click(screen.getByRole("button", { name: action }));
      expect(trigger).toHaveAttribute("aria-expanded", "true");
      expect(document.body.style.overflow).toBe("hidden");
    }
    expect(document.title).toBe("Maintenance · CleanStream Admin");
  });

  it("closes on changed paths even when the fallback navigation label is unchanged", async () => {
    const commits: { pathname: string; expanded: string | null }[] = [];
    showNavigation(pathname => commits.push({ pathname, expanded: screen.getByRole("button", { name: "Open navigation" }).getAttribute("aria-expanded") }));
    await screen.findByText(record.description);
    fireEvent.click(screen.getByRole("button", { name: "Unmatched one" }));
    await screen.findByRole("heading", { name: "Overview", level: 1 });
    const trigger = screen.getByRole("button", { name: "Open navigation" });
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("button", { name: "Unmatched two" }));
    await screen.findByRole("heading", { name: "Overview", level: 1 });
    expect(commits.find(commit => commit.pathname.endsWith("/unmatched-two"))?.expanded).toBe("false");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(document.title).toBe("Overview · CleanStream Admin");
  });

  it("closes at a breakpoint change and stays closed when returning to mobile", async () => {
    const media = mobileViewport();
    const view = showNavigation();
    await screen.findByText(record.description);
    const trigger = screen.getByRole("button", { name: "Open navigation" });
    fireEvent.click(trigger);
    act(() => media.change(false));
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(document.body.style.overflow).toBe("scroll");
    expect(view.container.querySelector("aside")).not.toHaveAttribute("inert");
    expect(view.container.querySelector("aside")).not.toHaveAttribute("aria-hidden");
    act(() => media.change(true));
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(view.container.querySelector("aside")).toHaveAttribute("inert");
  });

  it("uses the original trigger during unmount cleanup after its ref detaches", async () => {
    const view = showNavigation();
    await screen.findByText(record.description);
    const trigger = screen.getByRole("button", { name: "Open navigation" });
    fireEvent.click(trigger);
    const focus = vi.spyOn(trigger, "focus");
    view.unmount();
    expect(focus).toHaveBeenCalledTimes(1);
    expect(document.body.style.overflow).toBe("scroll");
    expect(trigger.isConnected).toBe(false);
  });

  it("balances navigation listeners and scroll cleanup in StrictMode", async () => {
    const media = mobileViewport();
    const view = showNavigation(undefined, true);
    await screen.findByText(record.description);
    expect(media.listeners.size).toBe(1);
    const trigger = screen.getByRole("button", { name: "Open navigation" });
    fireEvent.click(trigger);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(trigger).toHaveFocus();
    expect(document.body.style.overflow).toBe("scroll");
    fireEvent.click(trigger);
    view.unmount();
    expect(media.listeners.size).toBe(0);
    expect(document.body.style.overflow).toBe("scroll");
  });
});

function ModalFixture({ save, onClose }: {
  save: () => Promise<void>;
  onClose: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const close = () => { onClose(); setOpen(false); };
  return <>
    <button onClick={() => setOpen(true)}>Open fixture</button>
    {open && <Modal title="Synthetic dialog" busy={busy} onClose={close}>
      <input aria-label="Synthetic draft" defaultValue="synthetic draft" />
      <button disabled={busy} onClick={async () => {
        setBusy(true);
        await save();
        setOpen(false);
        setBusy(false);
      }}>Save fixture</button>
    </Modal>}
  </>;
}

describe.each([false, true])("modal lifetime (StrictMode %s)", strict => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  function showModalFixture(save = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)) {
    const onClose = vi.fn();
    const showModal = vi.spyOn(HTMLDialogElement.prototype, "showModal");
    const close = vi.spyOn(HTMLDialogElement.prototype, "close");
    const fixture = <ModalFixture save={save} onClose={onClose} />;
    const view = render(strict ? <StrictMode>{fixture}</StrictMode> : fixture);
    const opener = screen.getByRole("button", { name: "Open fixture" });
    opener.focus();
    fireEvent.click(opener);
    const dialog = screen.getByRole("dialog", { name: "Synthetic dialog" });
    return { ...view, onClose, showModal, close, opener, dialog };
  }

  it.each(["close button", "cancel"])("closes the setup-owned dialog and restores focus after %s", action => {
    const view = showModalFixture();
    expect(view.showModal).toHaveBeenCalledTimes(strict ? 2 : 1);
    expect(view.close).toHaveBeenCalledTimes(strict ? 1 : 0);
    expect(view.dialog).toHaveAttribute("open");
    screen.getByLabelText("Synthetic draft").focus();
    if (action === "close button") {
      fireEvent.click(screen.getByRole("button", { name: "Close dialog" }));
    } else {
      const cancel = new Event("cancel", { cancelable: true });
      fireEvent(view.dialog, cancel);
      expect(cancel.defaultPrevented).toBe(true);
    }
    expect(view.onClose).toHaveBeenCalledTimes(1);
    expect(view.close).toHaveBeenCalledTimes(strict ? 2 : 1);
    expect(view.showModal.mock.contexts).toEqual(Array(strict ? 2 : 1).fill(view.dialog));
    expect(view.close.mock.contexts).toEqual(Array(strict ? 2 : 1).fill(view.dialog));
    expect(view.dialog.isConnected).toBe(false);
    expect(view.dialog).not.toHaveAttribute("open");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(view.opener).toHaveFocus();
  });

  it("keeps a deferred save busy without replaying setup and restores focus on completion", async () => {
    const completion = Promise.withResolvers<void>();
    const save = vi.fn<() => Promise<void>>().mockReturnValue(completion.promise);
    const view = showModalFixture(save);
    fireEvent.change(screen.getByLabelText("Synthetic draft"), { target: { value: "retained draft" } });
    fireEvent.click(screen.getByRole("button", { name: "Save fixture" }));
    expect(save).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Save fixture" })).toBeDisabled();
    const closeButton = screen.getByRole("button", { name: "Close dialog" });
    expect(closeButton).toBeDisabled();
    fireEvent.click(closeButton);
    const cancel = new Event("cancel", { cancelable: true });
    fireEvent(view.dialog, cancel);
    expect(cancel.defaultPrevented).toBe(true);
    expect(view.onClose).not.toHaveBeenCalled();
    expect(view.dialog).toHaveAttribute("open");
    expect(screen.getByLabelText("Synthetic draft")).toHaveValue("retained draft");
    expect(view.showModal).toHaveBeenCalledTimes(strict ? 2 : 1);
    expect(view.close).toHaveBeenCalledTimes(strict ? 1 : 0);
    await act(async () => { completion.resolve(); await completion.promise; });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(view.dialog).not.toHaveAttribute("open");
    expect(view.close).toHaveBeenCalledTimes(strict ? 2 : 1);
    expect(view.showModal).toHaveBeenCalledTimes(strict ? 2 : 1);
    expect(view.onClose).not.toHaveBeenCalled();
    expect(view.opener).toHaveFocus();
  });

  it("closes the detached node on parent unmount and ignores late save completion", async () => {
    const completion = Promise.withResolvers<void>();
    const save = vi.fn<() => Promise<void>>().mockReturnValue(completion.promise);
    const view = showModalFixture(save);
    fireEvent.click(screen.getByRole("button", { name: "Save fixture" }));
    expect(save).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Close dialog" })).toBeDisabled();
    view.unmount();
    expect(view.dialog.isConnected).toBe(false);
    expect(view.opener.isConnected).toBe(false);
    expect(view.dialog).not.toHaveAttribute("open");
    expect(view.close).toHaveBeenCalledTimes(strict ? 2 : 1);
    expect(view.close.mock.contexts).toEqual(Array(strict ? 2 : 1).fill(view.dialog));
    const focus = vi.spyOn(view.opener, "focus");
    await act(async () => { completion.resolve(); await completion.promise; });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(view.showModal).toHaveBeenCalledTimes(strict ? 2 : 1);
    expect(view.close).toHaveBeenCalledTimes(strict ? 2 : 1);
    expect(focus).not.toHaveBeenCalled();
    expect(view.onClose).not.toHaveBeenCalled();
  });
});
