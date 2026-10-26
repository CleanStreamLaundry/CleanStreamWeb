import { useState, type FormEvent } from "react";
import { useAdmin } from "./context";
import { Field, Modal, Notice } from "./ui";
import type { Machine } from "./types";

export default function AvailabilityForm({
  machine,
  onClose,
  onSaved,
}: {
  machine: Machine;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { api } = useAdmin();
  const restoring = !!machine.is_out_of_service;
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!machine.service_updated_at) {
      setError(
        "Availability controls require the updated backend. Refresh after setup is complete.",
      );
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api.setAvailability(
        machine.id,
        !restoring,
        reason.trim(),
        machine.service_updated_at,
      );
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={
        restoring
          ? `Restore ${machine.Name}?`
          : `Take ${machine.Name} out of service?`
      }
      busy={busy}
      onClose={onClose}
    >
      <form onSubmit={submit}>
        {error && <Notice>{error}</Notice>}
        <Notice kind="info">
          {restoring
            ? "Restoring service clears the maintenance block. Payments still require an available device and an enabled, valid payment configuration."
            : "This blocks new checkouts. A payment already underway may complete and then be refunded or reversed before a machine start. It does not stop a cycle or start request already underway."}
        </Notice>
        {machine.service_reason && (
          <p className="ap-detail-text">
            <strong>Current service note: </strong>
            {machine.service_reason}
          </p>
        )}
        <Field
          label={restoring ? "Restoration note (optional)" : "Reason"}
          hint="Saved in the audit log for your team’s records."
        >
          <textarea
            required={!restoring}
            maxLength={1000}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={
              restoring
                ? "Repair completed and machine checked…"
                : "Describe why this machine needs to stay unavailable…"
            }
          />
        </Field>
        <div className="ap-dialog-actions">
          <button
            type="button"
            className="ap-button"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            className={`ap-button ${restoring ? "ap-primary" : "ap-danger"}`}
            disabled={busy || (!restoring && !reason.trim())}
          >
            {busy
              ? "Saving…"
              : restoring
                ? "Restore service"
                : "Take out of service"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
