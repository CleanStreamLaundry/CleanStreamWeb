// Imported only behind import.meta.env.DEV. No production login bypass exists.
import { AdminWorkspace } from "./AdminApp";
import type {
  AdminApi,
  AuditEvent,
  Transaction,
  ExportDataset,
  Credit,
  Filters,
  HistoryEntry,
  Location,
  Machine,
  MaintenanceRecord,
  Member,
  Page,
  WasherSizeRate,
  Identity,
  PortalRole,
} from "./types";
const now = () => new Date().toISOString();
const ago = (days: number) =>
  new Date(Date.now() - days * 86400000).toISOString();
const locations: Location[] = [
  {
    id: 1,
    Name: "Meridian Street Laundry",
    Address: "1840 N Meridian St, Indianapolis, IN 46202",
    Latitude: 39.79,
    Longitude: -86.15,
  },
  {
    id: 2,
    Name: "Broad Ripple Laundry",
    Address: "6220 College Ave, Indianapolis, IN 46220",
    Latitude: 39.87,
    Longitude: -86.14,
  },
];
const rates: WasherSizeRate[] = [
  {
    id: 1,
    location_id: 1,
    size_label: "Standard",
    capacity_kg: 10,
    price_cents: 350,
    is_active: true,
    review_required: false,
  },
  {
    id: 2,
    location_id: 1,
    size_label: "Large",
    capacity_kg: 18,
    price_cents: 550,
    is_active: true,
    review_required: false,
  },
  {
    id: 3,
    location_id: 2,
    size_label: "Standard",
    capacity_kg: 10,
    price_cents: 350,
    is_active: true,
    review_required: false,
  },
];
let machines: Machine[] = Array.from({ length: 8 }, (_, i) => ({
  id: i + 1,
  Name: `${i < 4 ? "Washer" : "Dryer"} ${String((i % 4) + 1).padStart(2, "0")}`,
  Machine_type: i < 4 ? "Washer" : "Dryer",
  Price: i < 4 ? 3.5 : 0.25,
  Runtime: i < 4 ? 30 : 5,
  Weight_kg: i < 4 ? 10 : 18,
  Status: i === 2 ? "maintenance" : i === 1 ? "running" : "idle",
  Location_ID: 1,
  is_out_of_service: i === 2,
  service_reason: i === 2 ? "Drum inspection needed before next cycle." : null,
  service_updated_at: ago(1),
  washer_size_rate_id: i < 4 ? 1 : null,
  cortina_machine_config:
    i === 3
      ? null
      : {
          machine_id: i + 1,
          public_machine_token: `demo-machine-${i}`,
          nayax_terminal_id: `DEMO-${i + 100}`,
          nayax_uniqr: null,
          pulse_line_number: 1,
          product_codes: null,
          environment: i === 7 ? "sandbox" : "production",
          is_enabled: i !== 7,
          review_required: i === 7,
        },
}));
let maintenance: MaintenanceRecord[] = [
  {
    maint_id: "1042",
    category: "Washer/Dryer Maintenance",
    description:
      "Washer 03 is making a loud noise during the spin cycle. Please inspect the drum before putting it back in service.",
    created_at: ago(1),
    location: locations[0]!.Name,
    location_id: 1,
    image_data: null,
    status: "open",
    updated_at: ago(1),
    priority: "urgent",
    assigned_to: "demo-admin",
    assigned_name: "Sam Rivera",
    due_date: ago(1).slice(0, 10),
    overdue: true,
  },
  {
    maint_id: "1038",
    category: "Location Maintenance",
    description:
      "The folding table near the rear entrance needs a new support bracket.",
    created_at: ago(4),
    location: locations[1]!.Name,
    location_id: 2,
    image_data: null,
    status: "in_progress",
    updated_at: ago(2),
    priority: "normal",
    assigned_to: "demo-admin",
    assigned_name: "Sam Rivera",
    due_date: ago(-2).slice(0, 10),
    overdue: false,
  },
  {
    maint_id: "1014",
    category: "Washer/Dryer Maintenance",
    description:
      "Dryer 02 door latch needs adjustment. Older reports remain in the queue until resolved.",
    created_at: ago(28),
    location: locations[0]!.Name,
    location_id: 1,
    image_data: null,
    status: "open",
    updated_at: ago(28),
    priority: "high",
    assigned_to: null,
    assigned_name: null,
    due_date: null,
    overdue: false,
  },
];
let credits: Credit[] = [
  {
    refund_id: 2041,
    location_id: 1,
    customer_name: "Morgan Reed",
    amount: 3.5,
    description: "Washer stopped before the cycle finished.",
    date: ago(1),
    status: "pending",
    transaction_id: "9914",
    admin_note: null,
    resolved_at: null,
    notification_sent_at: null,
  },
  {
    refund_id: 2040,
    location_id: 1,
    customer_name: "Alex Chen",
    amount: 2,
    description: "Dryer did not heat during the selected time.",
    date: ago(2),
    status: "pending",
    transaction_id: "9907",
    admin_note: null,
    resolved_at: null,
    notification_sent_at: null,
  },
  {
    refund_id: 2019,
    location_id: 2,
    customer_name: "Taylor Parker",
    amount: 5.5,
    description: "The machine was unavailable after payment.",
    date: ago(23),
    status: "approved",
    transaction_id: "9701",
    admin_note:
      "Confirmed the interruption. Credit returned to loyalty balance.",
    resolved_at: ago(20),
    notification_sent_at: ago(20),
  },
];
let members: Omit<Member, "assignment_count">[] = [
  {
    user_id: "demo-owner",
    name: "Jamie Morgan",
    email: "jamie@example.com",
    role: "Owner",
    location_id: 1,
    location_name: locations[0]!.Name,
    invitation_status: "active",
    invited_at: null,
  },
  {
    user_id: "demo-admin",
    name: "Sam Rivera",
    email: "sam@example.com",
    role: "Admin",
    location_id: 1,
    location_name: locations[0]!.Name,
    invitation_status: "active",
    invited_at: ago(40),
  },
  {
    user_id: "demo-admin",
    name: "Sam Rivera",
    email: "sam@example.com",
    role: "Admin",
    location_id: 2,
    location_name: locations[1]!.Name,
    invitation_status: "active",
    invited_at: ago(40),
  },
  {
    user_id: "demo-invite",
    name: "",
    email: "casey@example.com",
    role: "Admin",
    location_id: 1,
    location_name: locations[0]!.Name,
    invitation_status: "invited",
    invited_at: ago(1),
  },
];
const history: Record<string, HistoryEntry[]> = {};
const mode = new URLSearchParams(window.location.search).get("state");
function sample<T>(value: T): Promise<T> {
  if (mode === "error")
    return Promise.reject(
      new Error("Sample connection failure. Your changes have not been saved."),
    );
  return new Promise((resolve) =>
    setTimeout(
      () => resolve(structuredClone(value)),
      mode === "loading" ? 60000 : 120,
    ),
  );
}
function matching<T>(records: T[], f: Filters): T[] {
  if (mode === "empty") return [];
  return records.filter((record) => {
    const r = record as Record<string, unknown>;
    const d = r.date ?? r.created_at ?? r.invited_at;
    const day = d
      ? new Intl.DateTimeFormat("en-CA", {
          timeZone: "America/Indiana/Indianapolis",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date(String(d)))
      : "";
    return (
      (!f.search ||
        (r.machine_type ? String(r.name) : JSON.stringify(r))
          .toLowerCase()
          .includes(f.search.toLowerCase())) &&
      (!f.from || (!!day && day >= f.from)) &&
      (!f.to || (!!day && day <= f.to)) &&
      (!f.locationId ||
        r.location_id === f.locationId ||
        (r.location_ids as number[] | undefined)?.includes(f.locationId)) &&
      (!f.status ||
        f.status === "all" ||
        (f.status === "unresolved"
          ? r.status !== "resolved"
          : r.status === f.status)) &&
      (!f.category || r.category === f.category) &&
      (!f.priority || r.priority === f.priority) &&
      (!f.entity || r.entity === f.entity) &&
      (!f.paymentStatus || r.payment_status === f.paymentStatus) &&
      (!f.overdue || !!r.overdue) &&
      (!f.machineType || r.machine_type === f.machineType) &&
      (!f.availability ||
        !!r.is_out_of_service === (f.availability === "out_of_service")) &&
      (!f.assignedTo ||
        (f.assignedTo === "unassigned"
          ? !r.assigned_to
          : r.assigned_to ===
            (f.assignedTo === "me" ? identity.id : f.assignedTo)))
    );
  });
}
function page<T>(records: T[], filters: Filters): Promise<Page<T>> {
  const all = matching(records, filters);
  const p = filters.page ?? 1;
  return sample({
    items: all.slice((p - 1) * 20, p * 20),
    total: all.length,
    page: p,
    pageSize: 20,
  });
}
const identity = {
  id: "demo-owner",
  name: "Jamie Morgan",
  email: "jamie@example.com",
  role: "Owner" as const,
};
const transactions: Transaction[] = Array.from({ length: 26 }, (_, i) => {
  const legacy = i === 5;
  const status = [
    "started",
    "payment_pending",
    "refunded",
    "failed",
    "approved",
    "recorded",
  ][i % 6]!;
  return {
    id: `${legacy ? "legacy" : "vend"}:sample-${i}`,
    date: ago(i / 3),
    source: legacy ? "legacy" : "machine_payment",
    customer_name: ["Morgan Reed", "Guest", "Alex Chen", "Taylor Parker"][
      i % 4
    ]!,
    customer_email: i % 4 === 1 ? null : "customer@example.com",
    location_id: legacy ? null : 1,
    location_name: legacy ? null : locations[0]!.Name,
    machine_id: legacy ? null : (i % 8) + 1,
    machine_name: legacy ? null : machines[i % 8]!.Name,
    amount: legacy ? 10 : i % 8 < 4 ? 3.5 : 1.5,
    currency: "USD",
    payment_method: legacy ? "unattributed" : i % 3 === 0 ? "wallet" : "card",
    channel: legacy ? null : i % 3 === 0 ? "app" : "web",
    status: legacy ? "recorded" : status === "recorded" ? "started" : status,
    payment_status: legacy
      ? "recorded"
      : status === "payment_pending"
        ? "pending"
        : status === "refunded"
          ? "refunded"
          : status === "failed"
            ? "unconfirmed"
            : "received",
    reference: `CS-SAMPLE-${String(9914 - i)}`,
    payment_reference: legacy || i % 3 === 0 ? null : `pi_sample_${i}`,
    checkout_reference: legacy || i % 3 === 0 ? null : `cs_sample_${i}`,
    refund_reference: status === "refunded" ? `re_sample_${i}` : null,
    ledger_id: ["started", "approved", "recorded"].includes(status)
      ? String(9914 - i)
      : null,
    failure_message:
      status === "failed"
        ? "Start could not be confirmed. Review payment reference before taking action."
        : status === "refunded"
          ? "Machine was unavailable. Original payment refunded."
          : null,
    completed_at: ["started", "refunded"].includes(status) ? ago(i / 3) : null,
    description: legacy ? "Historical loyalty funding" : "Machine payment",
  };
});
const auditEvents: AuditEvent[] = [
  {
    id: "event-1",
    created_at: ago(1),
    actor_id: "demo-owner",
    actor_name: "Jamie Morgan",
    entity: "machine",
    entity_id: "3",
    operation: "update",
    location_ids: [1],
    before_values: { is_out_of_service: false, service_reason: null },
    after_values: {
      is_out_of_service: true,
      service_reason: "Drum inspection needed before next cycle.",
    },
  },
  {
    id: "event-2",
    created_at: ago(2),
    actor_id: "demo-admin",
    actor_name: "Sam Rivera",
    entity: "maintenance",
    entity_id: "1038",
    operation: "update",
    location_ids: [2],
    before_values: { status: "open", priority: "normal", assigned_to: null },
    after_values: {
      status: "in_progress",
      priority: "normal",
      assigned_to: "demo-admin",
    },
  },
  {
    id: "event-3",
    created_at: ago(3),
    actor_id: "demo-owner",
    actor_name: "Jamie Morgan",
    entity: "washer_rate",
    entity_id: "2",
    operation: "update",
    location_ids: [1],
    before_values: { size_label: "Large", price_cents: 500 },
    after_values: { size_label: "Large", price_cents: 550 },
  },
];
function audit(
  entity: string,
  entityId: string | number,
  locationIds: number[],
  before: unknown,
  after: unknown,
) {
  const snapshot = (value: unknown) =>
    value == null
      ? null
      : structuredClone(
          Object.fromEntries(
            Object.entries(value as Record<string, unknown>).filter(
              ([key]) =>
                !["public_machine_token", "cortina_machine_config"].includes(
                  key,
                ),
            ),
          ),
        );
  auditEvents.unshift({
    id: crypto.randomUUID(),
    created_at: now(),
    actor_id: identity.id,
    actor_name: identity.name,
    entity,
    entity_id: String(entityId),
    operation: before == null ? "insert" : after == null ? "delete" : "update",
    location_ids: locationIds,
    before_values: snapshot(before),
    after_values: snapshot(after),
  });
}
function teamRows() {
  return members.map((m) => ({
    ...m,
    assignment_count: members.filter((a) => a.user_id === m.user_id).length,
  }));
}
function exportRows(dataset: ExportDataset): Record<string, unknown>[] {
  const data = {
    transactions,
    audit: auditEvents,
    maintenance,
    credits,
    team: teamRows(),
    machines: machines.map((m) => ({
      id: m.id,
      name: m.Name,
      location_id: m.Location_ID,
      location_name: locations.find((l) => l.id === m.Location_ID)?.Name,
      machine_type: m.Machine_type,
      status: m.Status,
      capacity_kg: m.Weight_kg,
      price: m.Price,
      is_out_of_service: !!m.is_out_of_service,
      service_reason: m.service_reason,
      service_updated_at: m.service_updated_at,
      payment_enabled: m.cortina_machine_config?.is_enabled ?? false,
      payment_review_required:
        m.cortina_machine_config?.review_required ?? true,
      environment: m.cortina_machine_config?.environment,
    })),
  };
  return data[dataset] as unknown as Record<string, unknown>[];
}
const api: AdminApi = {
  machineIssueReview: async (_callerId, id) => {
    const credit = credits.find(row => row.refund_id === id);
    if (!credit) throw new Error("Synthetic claim not found.");
    return sample({ refundId: id, transactionId: Number(credit.transaction_id), status: credit.status,
      policyVersion: "legacy_14_day" as const, amountCents: Math.round(credit.amount * 100),
      paidAmountCents: null, promoAmountCents: null, locationId: null, locationTimezone: null,
      transactionAt: null, receivedAt: credit.date, sameDayEligible: false,
      manualReviewReason: "Synthetic legacy claim; historical eligibility is unverified.", financialResolution: null,
      capabilities: { walletRefund: false, replacementVend: false }, replacementMachines: [],
      replacementUnavailableReason: "Machine starts are unavailable in the synthetic preview.", receipt: null });
  },
  resolveMachineIssue: async () => { throw new Error("Machine issue resolutions are unavailable in the synthetic preview."); },
  topupRefunds: () => sample([]),
  reviewTopupRefund: async () => { throw new Error("Top-up refund decisions are unavailable in the synthetic preview."); },
  transactions: (f) => page(transactions, f),
  audit: (f) => page(auditEvents, f),
  exportRecords: (dataset, f) => {
    const rows = matching(exportRows(dataset), f);
    return sample({ rows, total: rows.length, exportedAt: now() });
  },
  assignees: (id) => {
    const location = maintenance.find((m) => m.maint_id === id)?.location_id;
    return sample(
      members
        .filter(
          (m, i, all) =>
            m.location_id === location &&
            all.findIndex(
              (a) => a.user_id === m.user_id && a.location_id === location,
            ) === i,
        )
        .map((m) => ({ id: m.user_id, name: m.name, email: m.email })),
    );
  },
  setAvailability: async (id, outOfService, reason, expected) => {
    await sample(null);
    const m = machines.find((m) => m.id === id)!;
    if (m.service_updated_at !== expected)
      throw new Error("Machine availability changed. Refresh and try again.");
    if (outOfService && !reason.trim())
      throw new Error("Enter the reason this machine is out of service.");
    const before = {
      is_out_of_service: !!m.is_out_of_service,
      service_reason: m.service_reason ?? null,
    };
    Object.assign(m, {
      is_out_of_service: outOfService,
      service_reason: reason || null,
      service_updated_at: now(),
    });
    audit("machine", id, [m.Location_ID], before, {
      is_out_of_service: outOfService,
      service_reason: m.service_reason,
    });
  },
  identity: () => sample(identity),
  locations: () => sample(mode === "empty" ? [] : locations),
  machines: (id) =>
    sample(
      mode === "empty" ? [] : machines.filter((m) => m.Location_ID === id),
    ),
  rates: (id) => sample(rates.filter((r) => r.location_id === id)),
  createLocation: async (input) => {
    const row = { ...input, id: locations.length + 1 };
    await sample(null);
    locations.push(row);
    audit("location", row.id, [row.id], null, row);
    return sample(row);
  },
  createMachine: async (input) => {
    await sample(null);
    const row = {
      ...input,
      id: Math.max(0, ...machines.map((m) => m.id)) + 1,
      is_out_of_service: false,
      service_updated_at: now(),
    };
    machines.push(row);
    audit("machine", row.id, [row.Location_ID], null, row);
  },
  deleteMachine: async (id) => {
    await sample(null);
    const m = machines.find((m) => m.id === id)!;
    if (transactions.some((t) => t.machine_id === id))
      throw new Error(
        "This machine has payment history. Take it out of service instead.",
      );
    audit("machine", id, [m.Location_ID], m, null);
    machines = machines.filter((m) => m.id !== id);
  },
  saveRate: async (rate) => {
    await sample(null);
    const index = rates.findIndex((r) => r.id === rate.id);
    audit(
      "washer_rate",
      rate.id || rates.length + 1,
      [rate.location_id],
      index >= 0 ? rates[index] : null,
      rate,
    );
    if (index >= 0) rates[index] = rate;
    else rates.push({ ...rate, id: rates.length + 1 });
  },
  saveConfig: async (config) => {
    await sample(null);
    const before = machines.find((m) => m.id === config.machine_id)!;
    audit(
      "payment_config",
      config.machine_id,
      [before.Location_ID],
      before.cortina_machine_config,
      config,
    );
    machines = machines.map((m) =>
      m.id === config.machine_id
        ? {
            ...m,
            cortina_machine_config: {
              ...config,
              public_machine_token:
                config.public_machine_token ?? "new-demo-machine",
              review_required: false,
            },
          }
        : m,
    );
  },
  maintenance: (f) =>
    page(
      maintenance.filter(
        (m) =>
          (!f.status ||
            f.status === "all" ||
            (f.status === "unresolved"
              ? m.status !== "resolved"
              : m.status === f.status)) &&
          (!f.category || m.category === f.category),
      ),
      f,
    ),
  history: (id) => sample(history[id] ?? []),
  updateMaintenance: async (id, status, note, expected, planning) => {
    await sample(null);
    const record = maintenance.find((m) => m.maint_id === id)!;
    if (record.updated_at !== expected)
      throw new Error("Report changed. Refresh and try again.");
    const next = {
      ...record,
      status,
      updated_at: now(),
      ...(planning && {
        priority: planning.priority,
        assigned_to: planning.assignedTo,
        due_date: planning.dueDate,
      }),
    };
    const assignee = members.find((m) => m.user_id === next.assigned_to);
    next.assigned_name = assignee ? assignee.name || assignee.email : null;
    next.overdue =
      status !== "resolved" &&
      !!next.due_date &&
      next.due_date < now().slice(0, 10);
    const details = (m: MaintenanceRecord) => ({
      priority: m.priority ?? "normal",
      assignee: m.assigned_name ?? "Unassigned",
      due_date: m.due_date ?? null,
    });
    audit(
      "maintenance",
      id,
      record.location_id ? [record.location_id] : [],
      { status: record.status, ...details(record) },
      { status: next.status, ...details(next) },
    );
    (history[id] ??= []).unshift({
      changes: { before: details(record), after: details(next) },
      id: crypto.randomUUID(),
      note,
      from_status: record.status,
      to_status: status,
      actor_name: identity.name,
      created_at: now(),
    });
    maintenance = maintenance.map((m) => (m.maint_id === id ? next : m));
  },
  credits: (f) =>
    page(
      credits.filter(
        (c) => !f.status || f.status === "all" || c.status === f.status,
      ),
      f,
    ),
  resolveCredit: async (id, status, note) => {
    await sample(null);
    const before = credits.find((c) => c.refund_id === id)!;
    if (before.status !== "pending")
      throw new Error("This request is already resolved.");
    audit(
      "loyalty_credit",
      id,
      before.location_id ? [before.location_id] : [],
      { status: before.status, admin_note: before.admin_note },
      { status, admin_note: note },
    );
    credits = credits.map((c) =>
      c.refund_id === id
        ? {
            ...c,
            status,
            admin_note: note,
            resolved_at: now(),
            notification_sent_at: now(),
          }
        : c,
    );
    return {};
  },
  team: (f) => page(teamRows(), f),
  invite: async (email, ids) => {
    await sample(null);
    const userId =
      members.find((m) => m.email.toLowerCase() === email.toLowerCase())
        ?.user_id ?? crypto.randomUUID();
    for (const id of ids) {
      if (members.some((m) => m.user_id === userId && m.location_id === id))
        continue;
      const member = {
        user_id: userId,
        name: "",
        email,
        role: "Admin",
        location_id: id,
        location_name: locations.find((l) => l.id === id)!.Name,
        invitation_status: "invited",
        invited_at: now(),
      };
      members.push(member);
      audit("membership", `${userId}:${id}`, [id], null, {
        user_id: userId,
        location_id: id,
      });
    }
    return {};
  },
  resend: async (userId, locationId) => {
    await sample(null);
    const member = members.find(
      (m) => m.user_id === userId && m.location_id === locationId,
    )!;
    audit(
      "invitation",
      `${userId}:${locationId}`,
      [locationId],
      { last_sent_at: member.invited_at },
      { last_sent_at: now() },
    );
  },
  removeMember: async (userId, locationId) => {
    await sample(null);
    if (members.some((m) => m.user_id === userId && m.role === "Owner"))
      throw new Error("Owner accounts cannot be removed here.");
    audit(
      "membership",
      `${userId}:${locationId}`,
      [locationId],
      { user_id: userId, location_id: locationId },
      null,
    );
    members = members.filter(
      (m) => m.user_id !== userId || m.location_id !== locationId,
    );
  },
  overview: () =>
    sample({
      today: 284.5,
      total: 8942.75,
      daily: Array.from({ length: 30 }, (_, i) => ({
        date: ago(29 - i).slice(0, 10),
        amount: [
          175, 240, 215, 325, 370, 420, 290, 265, 230, 330, 290, 440, 465, 310,
          285, 325, 310, 360, 440, 510, 410, 370, 390, 440, 415, 535, 470, 325,
          345, 284.5,
        ][i]!,
      })),
      hourly: [
        0, 0, 0, 0, 0, 2, 8, 20, 35, 41, 38, 34, 39, 43, 38, 42, 55, 62, 48, 30,
        21, 11, 5, 1,
      ],
      pendingCredits: credits.filter((c) => c.status === "pending").length,
      openMaintenance: maintenance.filter((m) => m.status !== "resolved")
        .length,
      locations: locations.length,
      machines: machines.length,
      updatedAt: now(),
      financialScope: "Illustrative sample data.",
    }),
};
// Role selection applies only to this synthetic, development-only workspace.
const requestedRole = new URLSearchParams(window.location.search).get("role");
const previewRole: PortalRole = requestedRole === "Manager" || requestedRole === "Maintenance" ? requestedRole : "Owner";
const previewIdentity: Identity = { ...identity, role: previewRole === "Owner" ? "Owner" : "Admin", portalRole: previewRole };
const fixture = { api, identity: previewIdentity };
export default function Preview() {
  return <AdminWorkspace fixture={fixture} />;
}
