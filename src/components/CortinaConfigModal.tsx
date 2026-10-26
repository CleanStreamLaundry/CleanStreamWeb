import { useEffect, useRef, useState } from "react";
import { Download, QrCode, X } from "lucide-react";
import QRCode from "qrcode";
import { useLocations } from "../di/container";
import type { CortinaMachineConfig, Machine } from "../interfaces/LocationService";

interface Props { machine: Machine | null; onClose: () => void; onSuccess: () => void; }

export default function CortinaConfigModal({ machine, onClose, onSuccess }: Props) {
  if (!machine?.cortina_machine_config) return null;
  return <CortinaConfigForm key={machine.id} machine={machine} initialConfig={machine.cortina_machine_config} onClose={onClose} onSuccess={onSuccess} />;
}

function CortinaConfigForm({ machine, initialConfig, onClose, onSuccess }: Omit<Props, "machine"> & { machine: Machine; initialConfig: CortinaMachineConfig }) {
  const service = useLocations();
  const [config, setConfig] = useState(() => ({ ...initialConfig }));
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const active = useRef(false);
  const savePending = useRef(false);
  const previewRequest = useRef(0);

  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);

  const payUrl = `https://cleanstreamlaundry.com/pay?machine=${config.public_machine_token}`;
  const prices = machine.Machine_type.toLowerCase() === "dryer"
    ? [50, 100, 150, 200, 300, 450]
    : [Math.round(machine.Price * 100)];
  const priceArray = config.product_codes != null;
  const preview = async () => {
    const request = ++previewRequest.current;
    setError("");
    try {
      const dataUrl = await QRCode.toDataURL(payUrl, { width: 520, margin: 2, errorCorrectionLevel: "H" });
      if (active.current && request === previewRequest.current) setQrDataUrl(dataUrl);
    } catch {
      if (active.current && request === previewRequest.current) setError("Unable to preview QR. Please try again.");
    }
  };
  const save = async () => {
    if (savePending.current) return;
    setError("");
    const validSelector = priceArray
      ? prices.every((price) => {
        const code = config.product_codes?.[String(price)];
        return Number.isInteger(code) && code! >= 0 && code! <= 32767;
      })
      : Number.isInteger(config.pulse_line_number) && config.pulse_line_number! >= 1 && config.pulse_line_number! <= 6;
    const canEnable = Boolean((config.nayax_terminal_id || config.nayax_uniqr) && validSelector);
    if (config.is_enabled && !canEnable) { setError("A terminal ID or UniQR and a valid selector for every price are required before enabling."); return; }
    savePending.current = true;
    setSaving(true);
    try {
      const result = await service.saveCortinaConfig({ ...config, review_required: !canEnable });
      if (!active.current) return;
      if (result) { setError(result); return; }
      onSuccess();
      if (active.current) onClose();
    } catch {
      if (active.current) setError("Unable to save machine configuration. Please try again.");
    } finally {
      savePending.current = false;
      if (active.current) setSaving(false);
    }
  };
  const text = (value: string) => value.trim() || null;

  return <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}><div className="modal-card cortina-config-modal">
    <div className="top-section"><div><p>Cortina setup</p><span>{machine.Name}</span></div><button onClick={onClose} aria-label="Close Cortina setup"><X /></button></div>
    {error && <p className="inline-error">{error}</p>}
    <div className="modal-form">
      <div className="form-group"><label className="form-label" htmlFor="terminalId">Terminal ID</label><input className="form-input" disabled={saving} id="terminalId" value={config.nayax_terminal_id ?? ""} onChange={(e) => setConfig({ ...config, nayax_terminal_id: text(e.target.value) })} /></div>
      <div className="form-group"><label className="form-label" htmlFor="productSelection">Product selection</label><select className="form-select" disabled={saving} id="productSelection" value={priceArray ? "price_array" : "pulse_line"} onChange={(e) => setConfig({ ...config, product_codes: e.target.value === "price_array" ? {} : null, pulse_line_number: null })}><option value="pulse_line">Pulse lines (1-6)</option><option value="price_array">Price array (product codes)</option></select></div>
      {priceArray ? prices.map((price) => <div className="form-group" key={price}><label className="form-label" htmlFor={`productCode-${price}`}>${(price / 100).toFixed(2)} product code</label><input className="form-input" disabled={saving} id={`productCode-${price}`} type="number" min="0" max="32767" step="1" value={config.product_codes?.[String(price)] ?? ""} onChange={(e) => {
        const codes = { ...config.product_codes };
        if (e.target.value === "") delete codes[String(price)];
        else codes[String(price)] = Number(e.target.value);
        setConfig({ ...config, product_codes: codes });
      }} /></div>) : <div className="form-group"><label className="form-label" htmlFor="pulseLine">Pulse line</label><input className="form-input" disabled={saving} id="pulseLine" type="number" min="1" max="6" value={config.pulse_line_number ?? ""} onChange={(e) => setConfig({ ...config, pulse_line_number: Number(e.target.value) || null })} /></div>}
      <div className="form-group"><label className="form-label" htmlFor="uniQr">Nayax UniQR (optional)</label><input className="form-input" disabled={saving} id="uniQr" value={config.nayax_uniqr ?? ""} onChange={(e) => setConfig({ ...config, nayax_uniqr: text(e.target.value) })} /></div>
      <div className="form-row"><div className="form-group"><label className="form-label" htmlFor="environment">Environment</label><select className="form-select" disabled={saving} id="environment" value={config.environment} onChange={(e) => setConfig({ ...config, environment: e.target.value as "sandbox" | "production" })}><option value="sandbox">Sandbox</option><option value="production">Production</option></select></div><label className="config-toggle"><input type="checkbox" disabled={saving} checked={config.is_enabled} onChange={(e) => setConfig({ ...config, is_enabled: e.target.checked })} />Enable payments</label></div>
    </div>
    <div className="qr-tools"><button className="btn-cancel" onClick={preview}><QrCode />Preview QR</button>{qrDataUrl && <><img src={qrDataUrl} alt={`Payment QR for ${machine.Name}`} /><a className="btn-submit" href={qrDataUrl} download={`${machine.Name.replaceAll(" ", "-")}-CleanStream-QR.png`}><Download />Download</a></>}</div>
    <div className="modal-actions"><button className="btn-cancel" onClick={onClose}>Cancel</button><button className="btn-submit" onClick={save} disabled={saving}>{saving ? "Saving..." : "Save setup"}</button></div>
  </div></div>;
}
