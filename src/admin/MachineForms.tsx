import { useEffect, useState, type FormEvent } from "react";
import QRCode from "qrcode";
import { useAdmin } from "./context";
import { Field, Loading, Modal, Notice } from "./ui";
import { money } from "./format";
import { useQuery } from "./query";
import type {
  CortinaMachineConfig,
  Location,
  Machine,
  WasherSizeRate,
} from "./types";
type FormProps = { onClose: () => void; onSaved: () => void };
function Actions({
  busy,
  onClose,
  label = "Save changes",
}: {
  busy: boolean;
  onClose: () => void;
  label?: string;
}) {
  return (
    <div className="ap-dialog-actions">
      <button
        type="button"
        className="ap-button"
        disabled={busy}
        onClick={onClose}
      >
        Cancel
      </button>
      <button className="ap-button ap-primary" disabled={busy}>
        {busy ? "Saving…" : label}
      </button>
    </div>
  );
}
export function LocationForm({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: (id: number) => void;
}) {
  const { api } = useAdmin();
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("IN");
  const [zip, setZip] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const lat = Number(latitude);
      const lon = Number(longitude);
      if (!latitude.trim() || !Number.isFinite(lat) || lat < -90 || lat > 90)
        throw new Error("Enter a valid latitude between -90 and 90.");
      if (!longitude.trim() || !Number.isFinite(lon) || lon < -180 || lon > 180)
        throw new Error("Enter a valid longitude between -180 and 180.");
      const result = await api.createLocation({
        Name: name.trim(),
        Address: `${address.trim()}, ${city.trim()}, ${state.trim()} ${zip.trim()}`,
        Latitude: lat,
        Longitude: lon,
      });
      onSaved(result.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title="Add location"
      description="This location will be assigned to your owner account."
      onClose={onClose}
      busy={busy}
    >
      <form onSubmit={submit}>
        {error && <Notice>{error}</Notice>}
        <Field label="Location name">
          <input
            required
            maxLength={120}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field label="Street address">
          <input
            required
            autoComplete="street-address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
        </Field>
        <Field label="City">
          <input
            required
            autoComplete="address-level2"
            value={city}
            onChange={(e) => setCity(e.target.value)}
          />
        </Field>
        <div className="ap-form-grid">
          <Field label="State">
            <input
              required
              maxLength={2}
              pattern="[A-Za-z]{2}"
              value={state}
              onChange={(e) => setState(e.target.value.toUpperCase())}
            />
          </Field>
          <Field label="ZIP code">
            <input
              required
              pattern="[0-9]{5}(-[0-9]{4})?"
              autoComplete="postal-code"
              value={zip}
              onChange={(e) => setZip(e.target.value)}
            />
          </Field>
        </div>
        <div className="ap-form-grid">
          <Field label="Latitude">
            <input
              required
              type="number"
              min={-90}
              max={90}
              step="any"
              value={latitude}
              onChange={(e) => setLatitude(e.target.value)}
            />
          </Field>
          <Field label="Longitude">
            <input
              required
              type="number"
              min={-180}
              max={180}
              step="any"
              value={longitude}
              onChange={(e) => setLongitude(e.target.value)}
            />
          </Field>
        </div>
        <Actions busy={busy} onClose={onClose} label="Add location" />
      </form>
    </Modal>
  );
}
export function MachineForm({
  locationId,
  locations,
  onClose,
  onSaved,
}: FormProps & { locationId: number; locations: Location[] }) {
  const { api } = useAdmin();
  const [location, setLocation] = useState(locationId);
  const [type, setType] = useState("Washer");
  const [name, setName] = useState("");
  const [rateId, setRateId] = useState(0);
  const [weight, setWeight] = useState("");
  const [runtime, setRuntime] = useState("30");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const rates = useQuery(
    () => (location ? api.rates(location) : Promise.resolve([])),
    [api, location],
  );
  const activeRates =
    rates.data?.filter((r) => r.is_active && !r.review_required) ?? [];
  const rate = activeRates.find((r) => r.id === rateId);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      if (type === "Washer" && !rate)
        throw new Error("Select a reviewed washer rate.");
      await api.createMachine({
        Name: name.trim(),
        Machine_type: type,
        Location_ID: location,
        Weight_kg: type === "Washer" ? rate!.capacity_kg : Number(weight),
        Runtime: type === "Dryer" ? 5 : Number(runtime),
        Price: type === "Washer" ? rate!.price_cents / 100 : 0.25,
        Status: "idle",
        washer_size_rate_id: type === "Washer" ? rate!.id : null,
      });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title="Add machine"
      description="Start with its location and type. Configure payments after adding it."
      onClose={onClose}
      busy={busy}
    >
      <form onSubmit={submit}>
        {error && <Notice>{error}</Notice>}
        <div className="ap-form-grid">
          <Field label="Location">
            <select
              required
              value={location || ""}
              onChange={(e) => {
                setLocation(Number(e.target.value));
                setRateId(0);
              }}
            >
              <option value="" disabled>
                Select location
              </option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.Name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Machine type">
            <select
              value={type}
              onChange={(e) => {
                setType(e.target.value);
                setRateId(0);
              }}
            >
              <option>Washer</option>
              <option>Dryer</option>
            </select>
          </Field>
        </div>
        <Field label="Machine name">
          <input
            required
            maxLength={120}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={`e.g. ${type} 04`}
          />
        </Field>
        {type === "Washer" ? (
          <>
            {rates.loading ? (
              <Loading />
            ) : rates.error ? (
              <Notice>{rates.error}</Notice>
            ) : (
              <Field label="Washer size and price">
                <select
                  required
                  value={rateId || ""}
                  onChange={(e) => setRateId(Number(e.target.value))}
                >
                  <option value="" disabled>
                    Select a reviewed rate
                  </option>
                  {activeRates.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.size_label} · {r.capacity_kg} kg ·{" "}
                      {money(r.price_cents / 100)}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            {!rates.loading && !activeRates.length && (
              <Notice kind="info">
                Add an active, reviewed washer rate in Washer pricing first.
              </Notice>
            )}
            <Field label="Cycle runtime (minutes)">
              <input
                required
                type="number"
                min={1}
                max={240}
                value={runtime}
                onChange={(e) => setRuntime(e.target.value)}
              />
            </Field>
          </>
        ) : (
          <>
            <Field label="Capacity (kg)">
              <input
                required
                type="number"
                min={1}
                max={200}
                step="0.1"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
              />
            </Field>
            <Notice kind="info">
              Dryer pricing uses $0.25 per 5 minutes. Payment options run from
              10 to 90 minutes.
            </Notice>
          </>
        )}
        <Actions busy={busy} onClose={onClose} label="Add machine" />
      </form>
    </Modal>
  );
}
export function RateForm({
  locationId,
  rate,
  onClose,
  onSaved,
}: FormProps & { locationId: number; rate: WasherSizeRate | null }) {
  const { api } = useAdmin();
  const [label, setLabel] = useState(rate?.size_label ?? "");
  const [capacity, setCapacity] = useState(String(rate?.capacity_kg ?? ""));
  const [price, setPrice] = useState(
    rate ? String(rate.price_cents / 100) : "",
  );
  const [active, setActive] = useState(rate?.is_active ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await api.saveRate({
        id: rate?.id ?? 0,
        location_id: locationId,
        size_label: label.trim(),
        capacity_kg: Number(capacity),
        price_cents: Math.round(Number(price) * 100),
        is_active: active,
        review_required: false,
      });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title={rate ? "Edit washer rate" : "Add washer rate"}
      description="Saving confirms you have reviewed this location’s price."
      onClose={onClose}
      busy={busy}
    >
      <form onSubmit={submit}>
        {error && <Notice>{error}</Notice>}
        <Field label="Size label">
          <input
            required
            maxLength={80}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Large"
          />
        </Field>
        <div className="ap-form-grid">
          <Field label="Capacity (kg)">
            <input
              required
              type="number"
              min={1}
              max={200}
              step="1"
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
            />
          </Field>
          <Field label="Price per cycle ($)">
            <input
              required
              type="number"
              min="0.25"
              max="1000"
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </Field>
        </div>
        <label className="ap-checkbox">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
          />
          Active rate
        </label>
        {rate && (
          <Notice kind="info">
            New payment quotes use the updated rate. Payments pause when a
            product-code mapping is missing for the new price or the rate is
            deactivated. Review Payment setup to enable them again.
          </Notice>
        )}
        <Actions busy={busy} onClose={onClose} />
      </form>
    </Modal>
  );
}
export function PaymentForm({
  machine,
  onClose,
  onSaved,
}: FormProps & { machine: Machine }) {
  const { api } = useAdmin();
  const [config, setConfig] = useState<CortinaMachineConfig>(
    machine.cortina_machine_config ?? {
      machine_id: machine.id,
      nayax_terminal_id: null,
      nayax_uniqr: null,
      pulse_line_number: null,
      product_codes: null,
      environment: "sandbox",
      is_enabled: false,
      review_required: true,
    },
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [qr, setQr] = useState("");
  const array = config.product_codes != null;
  const prices =
    machine.Machine_type === "Dryer"
      ? [50, 100, 150, 200, 300, 450]
      : machine.Price == null ? [] : [Math.round(machine.Price * 100)];
  const url = config.public_machine_token
    ? `https://cleanstreamlaundry.com/pay?machine=${encodeURIComponent(config.public_machine_token)}`
    : "";
  useEffect(() => {
    let active = true;
    if (url)
      void QRCode.toDataURL(url, {
        width: 520,
        margin: 2,
        errorCorrectionLevel: "H",
      })
        .then((data) => {
          if (active) setQr(data);
        })
        .catch(() => {
          if (active) setError("QR preview could not be generated.");
        });
    return () => {
      active = false;
    };
  }, [url]);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await api.saveConfig(config);
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title="Payment setup"
      description={`${machine.Name} · ${machine.Machine_type}`}
      onClose={onClose}
      busy={busy}
      wide
    >
      <form onSubmit={submit}>
        {error && <Notice>{error}</Notice>}
        {!machine.cortina_machine_config && (
          <Notice kind="info">
            This machine has no payment configuration. Save a setup to create it
            and generate its QR link.
          </Notice>
        )}
        <div className="ap-form-grid">
          <Field label="Nayax terminal ID">
            <input
              value={config.nayax_terminal_id ?? ""}
              onChange={(e) =>
                setConfig({
                  ...config,
                  nayax_terminal_id: e.target.value.trim() || null,
                })
              }
            />
          </Field>
          <Field label="UniQR (optional)">
            <input
              value={config.nayax_uniqr ?? ""}
              onChange={(e) =>
                setConfig({
                  ...config,
                  nayax_uniqr: e.target.value.trim() || null,
                })
              }
            />
          </Field>
        </div>
        <Field label="Product selection">
          <select
            value={array ? "array" : "pulse"}
            onChange={(e) =>
              setConfig({
                ...config,
                product_codes: e.target.value === "array" ? {} : null,
                pulse_line_number: null,
              })
            }
          >
            <option value="pulse">Pulse lines (1–6)</option>
            <option value="array">Price array (product codes)</option>
          </select>
        </Field>
        {array ? (
          <div className="ap-form-grid">
            {prices.map((price) => (
              <Field key={price} label={`${money(price / 100)} product code`}>
                <input
                  required={config.is_enabled}
                  type="number"
                  min={0}
                  max={32767}
                  step={1}
                  value={config.product_codes?.[price] ?? ""}
                  onChange={(e) => {
                    const codes = { ...config.product_codes };
                    if (!e.target.value) delete codes[price];
                    else codes[price] = Number(e.target.value);
                    setConfig({ ...config, product_codes: codes });
                  }}
                />
              </Field>
            ))}
          </div>
        ) : machine.Machine_type === "Dryer" ? (
          <Notice kind="info">
            Dryer options use pulse lines 1–6 for 10, 20, 30, 40, 60, and 90
            minutes respectively.
          </Notice>
        ) : (
          <Field label="Pulse line">
            <input
              type="number"
              min={1}
              max={6}
              step={1}
              required={config.is_enabled}
              value={config.pulse_line_number ?? ""}
              onChange={(e) =>
                setConfig({
                  ...config,
                  pulse_line_number: Number(e.target.value) || null,
                })
              }
            />
          </Field>
        )}
        <Field label="Environment">
          <select
            value={config.environment}
            onChange={(e) =>
              setConfig({
                ...config,
                environment: e.target.value as "sandbox" | "production",
              })
            }
          >
            <option value="sandbox">Sandbox — testing</option>
            <option value="production">Production — real payments</option>
          </select>
        </Field>
        <label className="ap-checkbox">
          <input
            type="checkbox"
            checked={config.is_enabled}
            onChange={(e) =>
              setConfig({ ...config, is_enabled: e.target.checked })
            }
          />
          Enable payments
        </label>
        {config.environment === "production" && config.is_enabled && (
          <Notice kind="info">
            Saving enables real customer payments using the terminal and
            selectors above.
          </Notice>
        )}
        {qr && (
          <div className="ap-qr">
            <img src={qr} alt={`Payment QR for ${machine.Name}`} />
            <div>
              <a
                className="ap-button"
                href={qr}
                download={`${machine.Name.replace(/[^a-z0-9-]/gi, "-")}-CleanStream-QR.png`}
              >
                Download QR
              </a>
              <p>
                <small>
                  QR always points to this machine’s saved configuration.
                </small>
              </p>
              <a href={url} target="_blank" rel="noreferrer">
                Open payment link
              </a>
            </div>
          </div>
        )}
        <Actions busy={busy} onClose={onClose} />
      </form>
    </Modal>
  );
}
