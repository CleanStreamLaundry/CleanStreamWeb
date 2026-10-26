import { useEffect, useState } from "react";
import "../styles/RefundsPage.css";
import type {Refund, RefundStatus} from '../interfaces/RefundService'
import { useRefunds as getRefundService, useFunctions as getFunctionService } from '../di/container';

const STATUS_LABEL: Record<RefundStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  denied: "Denied",
};

interface ModalState {
  refund: Refund;
  action: "approve" | "deny" | null;
}

interface RefundResolutionResponse {
  success: boolean;
  status: RefundStatus;
  notificationWarning?: string;
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

type Props = {
  refundService?: ReturnType<typeof getRefundService>;
  functionService?: ReturnType<typeof getFunctionService>;
};


export default function RefundsPage({
  refundService,
  functionService
}: Props) {
  const [refunds, setRefunds] = useState<Refund[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState | null>(null);
  const [actionSelected, setActionSelected] = useState<"approve" | "deny" | null>(null);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [filter, setFilter] = useState<RefundStatus | "all">("all");
  const { getRefunds } = refundService ?? getRefundService();
  const { callFunction } = functionService ?? getFunctionService();

  const openModal = (refund: Refund) => {
    setModal({ refund, action: null });
    setActionSelected(null);
    setReason("");
  };

  const closeModal = () => {
    setModal(null);
    setActionSelected(null);
    setReason("");
  };

  const showToast = (message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  useEffect(() => {
    let active = true;
    const fetchRefunds = async() => {
      try {
        const data = await getRefunds();
        if (!active) return;
        setRefunds(data);
        setError(null);
      } catch (err) {
        if (!active) return;
        console.log(err);
        setError("Failed to load refunds");
      } finally {
        if (active) setLoading(false);
      }
    };
    void fetchRefunds();
    return () => { active = false; };
  }, [getRefunds]);

  const handleSubmit = async () => {
    if (!modal || !actionSelected) return;
    setSubmitting(true);

    try {
      const expectedStatus = actionSelected === "approve" ? "approved" : "denied";
      const result = await callFunction<RefundResolutionResponse>(
        actionSelected === "approve" ? "approveRefund" : "denyRefund",
        { refundId: modal.refund.refundId, note: reason }
      );

      if (!result.success || result.status !== expectedStatus) {
        throw new Error("The loyalty credit request was not resolved");
      }

      setRefunds((prev) =>
        prev.map((r) =>
          r.id === modal.refund.id
            ? { ...r, status: expectedStatus }
            : r
        )
      );

      showToast(
        result.notificationWarning
          ? `Request ${modal.refund.id} was resolved, but the customer email could not be sent.`
          : actionSelected === "approve"
            ? `Loyalty credit ${modal.refund.id} approved.`
            : `Loyalty credit ${modal.refund.id} denied.`,
        result.notificationWarning ? "error" : "success"
      );
      closeModal();
    } catch {
      showToast("The loyalty credit was not completed. Please try again.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const filtered = filter === "all" ? refunds : refunds.filter((r) => r.status === filter);
  const counts = {
    all: refunds.length,
    pending: refunds.filter((r) => r.status === "pending").length,
    approved: refunds.filter((r) => r.status === "approved").length,
    denied: refunds.filter((r) => r.status === "denied").length,
  };


  return (
    <div className="refunds-page">
      {/* Header */}
      <div className="refunds-header">
        <div>
          <h1 className="refunds-title">Loyalty Credit Requests</h1>
          <p className="refunds-subtitle">Review requests to return value to a customer's loyalty balance</p>
        </div>
      </div>

      {/* Stat pills */}
      <div className="refunds-filters">
        {(["all", "pending", "approved", "denied"] as const).map((f) => (
          <button
            key={f}
            className={`filter-pill filter-pill--${f} ${filter === f ? "active" : ""}`}
            onClick={() => setFilter(f)}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
            <span className="pill-count">{counts[f]}</span>
          </button>
        ))}
      </div>

      {/* Table */}
      {loading && <div className="loading">Loading refunds...</div>}
      {error && <div className="error">{error}</div>}
      { !loading && !error &&(
      <div className="refunds-table-wrapper">
        <table className="refunds-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Customer</th>
              <th>Credit Requests</th>
              <th>Amount</th>
              <th>Reason</th>
              <th>Date</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="empty-row">
                  No loyalty credit requests in this category.
                </td>
              </tr>
            )}
            {filtered.map((refund) => (
              <tr key={refund.id} className={`table-row status-row--${refund.status}`}>
                <td className="refund-id">{refund.id}</td>
                <td>
                  <div className="customer-name">{refund.customerName}</div>
                </td>
                <td>
                  <div className="attempts">{refund.attempts}</div>
                </td>
                <td className="amount">${refund.amount.toFixed(2)}</td>
                <td className="reason-cell">
                  <span className="reason-text">{refund.reason}</span>
                </td>
                <td className="date-cell">{formatDate(refund.date)}</td>
                <td>
                  <span className={`status-badge status-badge--${refund.status}`}>
                    {STATUS_LABEL[refund.status]}
                  </span>
                </td>
                <td>
                  {refund.status === "pending" ? (
                    <button className="respond-btn" onClick={() => openModal(refund)}>
                      Respond
                    </button>
                  ) : (
                    <span className="resolved-label">Resolved</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}

      {/* Modal */}
      {modal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2 className="modal-title">Respond to Loyalty Credit Request</h2>
                <p className="modal-refund-id">{modal.refund.id}</p>
              </div>
              <button className="modal-close" onClick={closeModal}>✕</button>
            </div>

            <div className="modal-info">
              <div className="modal-info-row">
                <span className="info-label">Customer</span>
                <span className="info-value">{modal.refund.customerName}</span>
              </div>
              <div className="modal-info-row">
                <span className="info-label">Amount</span>
                <span className="info-value">${modal.refund.amount.toFixed(2)}</span>
              </div>
              <div className="modal-info-row">
                <span className="info-label">Reason</span>
                <span className="info-value reason-full">{modal.refund.reason}</span>
              </div>
            </div>

            <div className="modal-section-label">Decision</div>
            <div className="modal-actions">
              <button
                className={`decision-btn approve-btn ${actionSelected === "approve" ? "selected" : ""}`}
                onClick={() => setActionSelected("approve")}
              >
                ✓ Approve
              </button>
              <button
                className={`decision-btn deny-btn ${actionSelected === "deny" ? "selected" : ""}`}
                onClick={() => setActionSelected("deny")}
              >
                ✕ Deny
              </button>
            </div>

            <div className="modal-section-label">
              Note <span className="optional-label">(optional)</span>
            </div>
            <textarea
              className="reason-input"
              placeholder="Add a note to the customer..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
            />

            <div className="modal-footer">
              <button className="cancel-btn" onClick={closeModal}>
                Cancel
              </button>
              <button
                className={`submit-btn ${!actionSelected ? "disabled" : ""} ${actionSelected ? `submit-btn--${actionSelected}` : ""}`}
                onClick={handleSubmit}
                disabled={!actionSelected || submitting}
              >
                {submitting ? "Submitting…" : "Submit"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`toast toast--${toast.type}`}>
          {toast.message}
        </div>
      )}
    </div>
  );
}
