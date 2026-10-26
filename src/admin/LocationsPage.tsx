import { useEffect, useState, type FormEvent } from "react";
import { Plus, QrCode, Search } from "lucide-react";
import AvailabilityForm from "./AvailabilityForm";
import { ExportButton } from "./OperationsUi";
import { useAdmin } from "./context";
import { Badge, Empty, Field, Loading, Modal, Notice, PageHeader } from "./ui";
import { money } from "./format";
import { useQuery } from "./query";
import type { Machine, WasherSizeRate } from "./types";
import {
  LocationForm,
  MachineForm,
  PaymentForm,
  RateForm,
} from "./MachineForms";
export default function LocationsPage() {
  const { api, identity } = useAdmin();
  const owner = identity?.role === "Owner";
  const locations = useQuery(() => api.locations(), [api]);
  const [locationId, setLocationId] = useState<number>(
    Number(sessionStorage.getItem("admin.location")) || 0,
  );
  const [selectedTab, setTab] = useState("machines");
  const tab = owner ? selectedTab : "machines";
  const [search, setSearch] = useState("");
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const [availability, setAvailability] = useState("");
  const [serviceMachine, setServiceMachine] = useState<Machine | null>(null);
  const [modal, setModal] = useState<"location" | "machine" | "rate" | null>(
    null,
  );
  const [machine, setMachine] = useState<Machine | null>(null);
  const [deleting, setDeleting] = useState<Machine | null>(null);
  const [rate, setRate] = useState<WasherSizeRate | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  if (locations.data && !locations.data.some((l) => l.id === locationId)) {
    const fallback = locations.data.length === 1 ? locations.data[0]!.id : 0;
    if (locationId !== fallback) setLocationId(fallback);
  }
  useEffect(() => {
    if (locationId)
      sessionStorage.setItem("admin.location", String(locationId));
  }, [locationId]);
  const machines = useQuery(
    () => (locationId ? api.machines(locationId) : Promise.resolve([])),
    [api, locationId],
  );
  const rates = useQuery(
    () => (locationId && owner ? api.rates(locationId) : Promise.resolve([])),
    [api, locationId, owner],
  );
  const selected = locations.data?.find((l) => l.id === locationId);
  const filtered =
    machines.data?.filter(
      (m) =>
        (!type || m.Machine_type === type) &&
        (!status || m.Status === status) &&
        (!availability ||
          !!m.is_out_of_service === (availability === "out_of_service")) &&
        m.Name.toLowerCase().includes(search.toLowerCase()),
    ) ?? [];
  const saved = () => {
    setModal(null);
    setMachine(null);
    setServiceMachine(null);
    setRate(null);
    setNotice("Changes saved.");
    machines.reload();
    rates.reload();
    locations.reload();
  };
  const remove = async (event: FormEvent) => {
    event.preventDefault();
    if (!owner || !deleting || busy) return;
    setBusy(true);
    setError("");
    try {
      await api.deleteMachine(deleting.id);
      setDeleting(null);
      machines.reload();
      setNotice("Machine removed.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <PageHeader
        eyebrow="YOUR LAUNDRY NETWORK"
        title="Locations & Machines"
        description={owner ? "Manage your locations, machine inventory, and payment readiness." : "Review locations and machine availability."}
        action={
          owner && (
            <button className="ap-button" onClick={() => setModal("location")}>
              <Plus size={17} />
              Add location
            </button>
          )
        }
      />
      {notice && <Notice kind="success">{notice}</Notice>}
      <section className="ap-panel">
        <div className="ap-panel-body">
          <Field label="Location">
            <select
              value={locationId}
              disabled={locations.loading}
              onChange={(e) => {
                setLocationId(Number(e.target.value));
                setSearch("");
                setStatus("");
              }}
            >
              <option value={0}>Select a location</option>
              {locations.data?.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.Name}
                </option>
              ))}
            </select>
          </Field>
          {selected && <p className="ap-muted">{selected.Address}</p>}
          {locations.error && <Notice>{locations.error}</Notice>}
        </div>
      </section>
      {!locationId ? (
        <section className="ap-panel">
          <Empty
            title={
              locations.data?.length
                ? "Choose a location to get started"
                : "No locations assigned"
            }
          >
            {owner
              ? "Select a location above or add your first location."
              : "Ask your owner to assign a location to your account."}
          </Empty>
        </section>
      ) : (
        <>
          {owner && (
            <div
              className="ap-tabs"
              role="tablist"
              aria-label="Location sections"
            >
              {[
                ["machines", "Machine inventory"],
                ["pricing", "Washer pricing"],
                ["payments", "Payment setup"],
              ].map(([value, label]) => (
                <button
                  key={value}
                  role="tab"
                  aria-selected={tab === value}
                  onClick={() => setTab(value!)}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          <section className="ap-panel">
            <div className="ap-panel-heading">
              <div>
                <h2>
                  {tab === "pricing"
                    ? "Washer size rates"
                    : tab === "payments"
                      ? "Payment readiness"
                      : "Machine inventory"}
                </h2>
                <p>
                  {tab === "pricing"
                    ? "Location pricing used for new quotes."
                    : `${selected?.Name ?? "Selected location"} · ${machines.data?.length ?? 0} machines`}
                </p>
              </div>
              {owner && (
                <button
                  className="ap-button ap-primary"
                  onClick={() => {
                    setRate(null);
                    setModal(tab === "pricing" ? "rate" : "machine");
                  }}
                >
                  <Plus size={16} />
                  {tab === "pricing" ? "Add rate" : "Add machine"}
                </button>
              )}
            </div>
            {tab === "pricing" ? (
              rates.loading ? (
                <Loading />
              ) : rates.error ? (
                <div className="ap-panel-body">
                  <Notice>{rates.error}</Notice>
                  <button className="ap-button" onClick={rates.reload}>
                    Retry
                  </button>
                </div>
              ) : !rates.data?.length ? (
                <Empty title="No washer rates yet">
                  Add a rate before configuring a washer.
                </Empty>
              ) : (
                <div className="ap-table-wrap">
                  <table className="ap-table">
                    <thead>
                      <tr>
                        <th>Size</th>
                        <th>Capacity</th>
                        <th>Price</th>
                        <th>Status</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rates.data.map((r) => (
                        <tr key={r.id}>
                          <td>
                            <strong>{r.size_label}</strong>
                          </td>
                          <td>{r.capacity_kg} kg</td>
                          <td>{money(r.price_cents / 100)}</td>
                          <td>
                            <Badge
                              value={
                                r.review_required
                                  ? "needs_review"
                                  : r.is_active
                                    ? "active"
                                    : "disabled"
                              }
                            />
                          </td>
                          <td>
                            <button
                              className="ap-button"
                              onClick={() => {
                                setRate(r);
                                setModal("rate");
                              }}
                            >
                              Edit rate
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            ) : (
              <>
                <div className="ap-filters">
                  <label className="ap-search">
                    <Search size={17} />
                    <input
                      type="search"
                      aria-label="Search machines"
                      placeholder="Search machines…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </label>
                  <Field label="Machine type">
                    <select
                      value={type}
                      onChange={(e) => setType(e.target.value)}
                    >
                      <option value="">All types</option>
                      <option>Washer</option>
                      <option>Dryer</option>
                    </select>
                  </Field>
                  <Field label="Availability">
                    <select
                      value={availability}
                      onChange={(e) => setAvailability(e.target.value)}
                    >
                      <option value="">All machines</option>
                      <option value="in_service">In service</option>
                      <option value="out_of_service">Out of service</option>
                    </select>
                  </Field>
                  <Field label="Device status">
                    <select
                      value={status}
                      onChange={(e) => setStatus(e.target.value)}
                    >
                      <option value="">All statuses</option>
                      {[...new Set(machines.data?.map((m) => m.Status))].map(
                        (s) => (
                          <option key={s}>{s}</option>
                        ),
                      )}
                    </select>
                  </Field>
                  <ExportButton
                    dataset="machines"
                    filters={{
                      locationId,
                      search,
                      machineType: type,
                      status: status || "all",
                      availability,
                    }}
                  />
                </div>
                {machines.loading ? (
                  <Loading />
                ) : machines.error ? (
                  <div className="ap-panel-body">
                    <Notice>{machines.error}</Notice>
                    <button className="ap-button" onClick={machines.reload}>
                      Retry
                    </button>
                  </div>
                ) : !filtered.length ? (
                  <Empty
                    title={
                      machines.data?.length
                        ? "No matching machines"
                        : "No machines at this location"
                    }
                  >
                    Adjust your filters or add a machine to this location.
                  </Empty>
                ) : (
                  <div className="ap-table-wrap">
                    <table className="ap-table">
                      <thead>
                        <tr>
                          <th>Machine</th>
                          <th>Availability / device</th>
                          <th>
                            {tab === "payments"
                              ? "Environment"
                              : owner ? "Capacity / price" : "Capacity"}
                          </th>
                          {owner && <th>Payments</th>}
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map((m) => (
                          <tr key={m.id}>
                            <td>
                              <strong>{m.Name}</strong>
                              <small>{m.Machine_type}</small>
                            </td>
                            <td>
                              <Badge
                                value={
                                  m.is_out_of_service
                                    ? "out_of_service"
                                    : "in_service"
                                }
                              />
                              <small>Device: {m.Status}</small>
                              {m.service_reason && (
                                <small
                                  className="ap-description"
                                  title={m.service_reason}
                                >
                                  {m.service_reason}
                                </small>
                              )}
                            </td>
                            <td>
                              {tab === "payments" ? (
                                <Badge
                                  value={
                                    m.cortina_machine_config?.environment ??
                                    "not configured"
                                  }
                                />
                              ) : (
                                <>
                                  {m.Weight_kg} kg
                                  {owner && <small>
                                    {m.Price == null ? "Unavailable" : money(m.Price)}
                                    {m.Machine_type === "Dryer"
                                      ? " / 5 min"
                                      : " / cycle"}
                                  </small>}
                                </>
                              )}
                            </td>
                            {owner && <td>
                              <Badge
                                value={
                                  m.is_out_of_service
                                    ? "blocked"
                                    : !m.cortina_machine_config ||
                                        m.cortina_machine_config.review_required
                                      ? "needs_review"
                                      : m.cortina_machine_config.is_enabled
                                        ? "enabled"
                                        : "disabled"
                                }
                              />
                            </td>}
                            {(
                              <td>
                                <div className="ap-inline">
                                  {owner && <button
                                    className="ap-button"
                                    onClick={() => setMachine(m)}
                                  >
                                    <QrCode size={15} />
                                    Payment setup
                                  </button>}
                                  <button
                                    className="ap-button"
                                    onClick={() => setServiceMachine(m)}
                                  >
                                    {m.is_out_of_service
                                      ? "Restore service"
                                      : "Take out of service"}
                                  </button>
                                  {owner && tab === "machines" && (
                                    <button
                                      className="ap-button ap-danger"
                                      onClick={() => {
                                        setError("");
                                        setDeleting(m);
                                      }}
                                    >
                                      Remove
                                    </button>
                                  )}
                                </div>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </section>
        </>
      )}
      {owner && modal === "location" && (
        <LocationForm
          onClose={() => setModal(null)}
          onSaved={(id) => {
            setLocationId(id);
            saved();
          }}
        />
      )}{" "}
      {owner && modal === "machine" && (
        <MachineForm
          locationId={locationId}
          locations={locations.data ?? []}
          onClose={() => setModal(null)}
          onSaved={saved}
        />
      )}{" "}
      {owner && modal === "rate" && (
        <RateForm
          locationId={locationId}
          rate={rate}
          onClose={() => setModal(null)}
          onSaved={saved}
        />
      )}{" "}
      {owner && machine && (
        <PaymentForm
          machine={machine}
          onClose={() => setMachine(null)}
          onSaved={saved}
        />
      )}
      {serviceMachine && (
        <AvailabilityForm
          machine={serviceMachine}
          onClose={() => setServiceMachine(null)}
          onSaved={saved}
        />
      )}
      {owner && deleting && (
        <Modal
          title={`Remove ${deleting.Name}?`}
          onClose={() => setDeleting(null)}
          busy={busy}
        >
          <form onSubmit={remove}>
            {error && <Notice>{error}</Notice>}
            <p>
              This permanently removes the machine configuration. Machines
              linked to payment history cannot be removed. Take them out of
              service to block new payments.
            </p>
            <div className="ap-dialog-actions">
              <button
                type="button"
                className="ap-button"
                disabled={busy}
                onClick={() => setDeleting(null)}
              >
                Cancel
              </button>
              <button className="ap-button ap-danger" disabled={busy}>
                {busy ? "Removing…" : "Remove machine"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
