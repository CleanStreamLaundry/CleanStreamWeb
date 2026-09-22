import { useEffect, useState } from "react";
import { Download, QrCode, X } from "lucide-react";
import QRCode from "qrcode";
import { useLocations } from "../di/container";
import type { CortinaMachineConfig, Machine } from "../interfaces/LocationService";

interface Props { machine: Machine | null; onClose: () => void; onSuccess: () => void; }

export default function CortinaConfigModal({ machine, onClose, onSuccess }: Props) {
  const service = useLocations();
  const [config, setConfig] = useState<CortinaMachineConfig | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const next = machine?.cortina_machine_config ?? null;
    setConfig(next ? { ...next } : null);
    setQrDataUrl(""); setError(""); setSaving(false);
  }, [machine]);
  if (!machine || !config) return null;

  const payUrl = `https://cleanstreamlaundry.com/pay?machine=${config.public_machine_token}`;
  const prices = machine.Machine_type.toLowerCase() === "dryer"
    ? [50, 100, 150, 200, 300, 450]
    : [Math.round(machine.Price * 100)];
  const priceArray = config.product_codes != null;
  const preview = async () => setQrDataUrl(await QRCode.toDataURL(payUrl, { width: 520, margin: 2, errorCorrectionLevel: "H" }));
  const save = async () => {
    if (saving) return;
    setError("");
    const validSelector = priceArray
      ? prices.every((price) => {
        const code = config.product_codes?.[String(price)];
        return Number.isInteger(code) && code! >= 0 && code! <= 32767;
      })
      : Number.isInteger(config.pulse_line_number) && config.pulse_line_number! >= 1 && config.pulse_line_number! <= 6;
    const canEnable = Boolean((config.nayax_terminal_id || config.nayax_uniqr) && validSelector);
    if (config.is_enabled && !canEnable) { setError("A terminal ID or UniQR and a valid selector for every price are required before enabling."); return; }
    setSaving(true);
    try {
      const result = await service.saveCortinaConfig({ ...config, review_required: !canEnable });
      if (result) { setError(result); return; }
      onSuccess(); onClose();
    } catch {
      setError("Unable to save machine configuration. Please try again.");
    } finally { setSaving(false); }
  };
  const text = (value: string) => value.trim() || null;

  return <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}><div className="modal-card cortina-config-modal">
    <div className="top-section"><div><p>Cortina setup</p><span>{machine.Name}</span></div><button onClick={onClose} aria-label="Close Cortina setup"><X /></button></div>
    {error && <p className="inline-error">{error}</p>}
    <div className="modal-form">
      <div className="form-group"><label className="form-label" htmlFor="terminalId">Terminal ID</label><input className="form-input" id="terminalId" value={config.nayax_terminal_id ?? ""} onChange={(e) => setConfig({ ...config, nayax_terminal_id: text(e.target.value) })} /></div>
      <div className="form-group"><label className="form-label" htmlFor="productSelection">Product selection</label><select className="form-select" id="productSelection" value={priceArray ? "price_array" : "pulse_line"} onChange={(e) => setConfig({ ...config, product_codes: e.target.value === "price_array" ? {} : null, pulse_line_number: null })}><option value="pulse_line">Pulse lines (1-6)</option><option value="price_array">Price array (product codes)</option></select></div>
      {priceArray ? prices.map((price) => <div className="form-group" key={price}><label className="form-label" htmlFor={`productCode-${price}`}>${(price / 100).toFixed(2)} product code</label><input className="form-input" id={`productCode-${price}`} type="number" min="0" max="32767" step="1" value={config.product_codes?.[String(price)] ?? ""} onChange={(e) => {
        const codes = { ...config.product_codes };
        if (e.target.value === "") delete codes[String(price)];
        else codes[String(price)] = Number(e.target.value);
        setConfig({ ...config, product_codes: codes });
      }} /></div>) : <div className="form-group"><label className="form-label" htmlFor="pulseLine">Pulse line</label><input className="form-input" id="pulseLine" type="number" min="1" max="6" value={config.pulse_line_number ?? ""} onChange={(e) => setConfig({ ...config, pulse_line_number: Number(e.target.value) || null })} /></div>}
      <div className="form-group"><label className="form-label" htmlFor="uniQr">Nayax UniQR (optional)</label><input className="form-input" id="uniQr" value={config.nayax_uniqr ?? ""} onChange={(e) => setConfig({ ...config, nayax_uniqr: text(e.target.value) })} /></div>
      <div className="form-row"><div className="form-group"><label className="form-label" htmlFor="environment">Environment</label><select className="form-select" id="environment" value={config.environment} onChange={(e) => setConfig({ ...config, environment: e.target.value as "sandbox" | "production" })}><option value="sandbox">Sandbox</option><option value="production">Production</option></select></div><label className="config-toggle"><input type="checkbox" checked={config.is_enabled} onChange={(e) => setConfig({ ...config, is_enabled: e.target.checked })} />Enable payments</label></div>
    </div>
    <div className="qr-tools"><button className="btn-cancel" onClick={preview}><QrCode />Preview QR</button>{qrDataUrl && <><img src={qrDataUrl} alt={`Payment QR for ${machine.Name}`} /><a className="btn-submit" href={qrDataUrl} download={`${machine.Name.replaceAll(" ", "-")}-CleanStream-QR.png`}><Download />Download</a></>}</div>
    <div className="modal-actions"><button className="btn-cancel" onClick={onClose}>Cancel</button><button className="btn-submit" onClick={save} disabled={saving}>{saving ? "Saving..." : "Save setup"}</button></div>
  </div></div>;
}
