import { useEffect, useRef, useState, type FormEvent } from "react";
import { Plus, RefreshCw } from "lucide-react";
import { ExportButton } from "./OperationsUi";
import { useAdmin } from "./context";
import { Badge, Empty, Field, Loading, Modal, Notice, PageHeader, Pagination } from "./ui";
import { useQuery } from "./query";
import type { Member, StaffRole } from "./types";
import type { OwnerAccount, OwnerAccounts, OwnerChange, OwnerChangeReceipt } from "./types";
import { ownerManagementApi } from "./api";
import { AdminAdmissionError } from "./admission";
import StaffRoleForm from "./StaffRoleForm";
import { portalRole as identityPortalRole } from "./permissions";

function memberPortalRole(member: Member) {
  if (member.role === "Owner") return "Owner";
  return member.portal_role ?? (member.role === "Admin" ? "Manager" : member.role);
}

const ownerErrors: Record<string, string> = {
  owner_last_required: "Another eligible Owner must remain. Owner access was not removed.",
  owner_state_changed: "This account's role changed. Refresh and review it again.",
  owner_target_ineligible: "This account is not eligible for this Owner change.",
  owner_request_conflict: "This request conflicts with a recorded change. Review its status before continuing.",
  admin_forbidden: "Current Owner access with verified MFA is required.",
  session_invalid: "Sign in again and verify MFA before managing Owners.",
  invalid_request: "The Owner change could not be accepted. Refresh and review the account again.",
};

type PendingOwnerChange = Pick<OwnerChange, "userId" | "owner" | "requestId">;
const ownerPendingKey = (callerId: string) => `admin.owner-change.pending.${callerId}`;
function readOwnerPending(callerId: string): { pending: PendingOwnerChange | null; error: string } {
  try {
    const raw = sessionStorage.getItem(ownerPendingKey(callerId));
    if (raw === null) return { pending: null, error: "" };
    const value = JSON.parse(raw) as Partial<PendingOwnerChange>;
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!value || typeof value.userId !== "string" || !uuid.test(value.userId) ||
      typeof value.requestId !== "string" || !uuid.test(value.requestId) || typeof value.owner !== "boolean") throw new Error("Invalid receipt");
    return { pending: value as PendingOwnerChange, error: "" };
  } catch {
    return { pending: null, error: "The local Owner request record is unavailable. Do not submit a change until it can be reconciled." };
  }
}

function OwnerAccountsPanel({ callerId }: { callerId: string }) {
  const { refresh } = useAdmin();
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [accounts, setAccounts] = useState<OwnerAccounts | null>(null);
  const [target, setTarget] = useState<OwnerAccount | null>(null);
  const [note, setNote] = useState("");
  const [recovery] = useState(() => readOwnerPending(callerId));
  const [pending, setPending] = useState<PendingOwnerChange | null>(recovery.pending);
  const [storageError, setStorageError] = useState(recovery.error);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const operation = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; operation.current?.abort(); };
  }, []);

  async function load(nextQuery = query, page = 1) {
    if (operation.current || pending || storageError) return;
    const controller = new AbortController();
    operation.current = controller;
    setBusy(true); setError(""); setAccounts(null); setTarget(null);
    try {
      const result = await ownerManagementApi.accounts(callerId, nextQuery, page, controller.signal);
      if (mounted.current && !controller.signal.aborted) { setAccounts(result); setQuery(nextQuery); }
    } catch (cause) {
      if (mounted.current && !controller.signal.aborted) {
        setError("Owner accounts could not be verified. Refresh before taking action.");
        if (cause instanceof AdminAdmissionError) void refresh();
      }
    } finally {
      if (mounted.current && !controller.signal.aborted) { operation.current = null; setBusy(false); }
    }
  }

  function clearPending() {
    try { sessionStorage.removeItem(ownerPendingKey(callerId)); return true; }
    catch {
      setStorageError("The local Owner request record could not be cleared. Do not submit another change; check this request again.");
      return false;
    }
  }

  function completed(receipt: OwnerChangeReceipt) {
    setTarget(null); setAccounts(null);
    if (!clearPending()) return;
    setStorageError("");
    setPending(null); setTarget(null); setAccounts(null); setNote("");
    setNotice(`Owner change confirmed. Account ${receipt.userId} now has ${receipt.role === "Admin" ? "Manager" : receipt.role} access. Refresh the list before another change.`);
  }

  async function change() {
    if (operation.current || pending || storageError || !target || target.userId === callerId || !note.trim() || note.trim().length > 4000 ||
      (target.role !== "Owner" && !target.ownerEligible)) return;
    const input: OwnerChange = { userId: target.userId, owner: target.role !== "Owner", expectedRole: target.role,
      requestId: crypto.randomUUID(), note: note.trim() };
    // Persist before dispatch so navigation/reload cannot enable a blind replay.
    // No token, email, name or reason is retained in the tab-scoped receipt.
    const record: PendingOwnerChange = { userId: input.userId, owner: input.owner, requestId: input.requestId };
    try { sessionStorage.setItem(ownerPendingKey(callerId), JSON.stringify(record)); }
    catch {
      setStorageError("Cannot preserve the Owner request for reconciliation. No change was submitted.");
      return;
    }
    const controller = new AbortController();
    operation.current = controller;
    setPending(record); setBusy(true); setError(""); setNotice("");
    try {
      const receipt = await ownerManagementApi.setOwner(callerId, input, controller.signal);
      if (mounted.current && !controller.signal.aborted) completed(receipt);
    } catch (cause) {
      if (!mounted.current || controller.signal.aborted) return;
      const code = cause instanceof AdminAdmissionError ? cause.code : "";
      setTarget(null); setAccounts(null);
      if (ownerErrors[code] && code !== "owner_request_conflict") {
        if (clearPending()) setPending(null);
        setError(ownerErrors[code]);
      } else {
        setError(ownerErrors[code] ?? "Owner change outcome is unconfirmed. Check request status; do not submit another change.");
      }
      if (["admin_forbidden", "session_invalid", "enroll_totp", "challenge_totp"].includes(code)) void refresh();
    } finally {
      if (mounted.current && !controller.signal.aborted) { operation.current = null; setBusy(false); }
    }
  }

  async function checkStatus() {
    if (operation.current || !pending) return;
    const controller = new AbortController();
    operation.current = controller;
    setBusy(true); setError("");
    try {
      const result = await ownerManagementApi.status(callerId, pending.requestId, controller.signal);
      if (!mounted.current || controller.signal.aborted) return;
      if (result.state === "completed" && result.result.userId === pending.userId &&
        (pending.owner ? result.result.role === "Owner" : result.result.role !== "Owner")) {
        completed(result.result);
      } else {
        setError("No matching completed change is confirmed. This does not mean it is safe to retry. Keep this request ID for reconciliation.");
      }
    } catch (cause) {
      if (mounted.current && !controller.signal.aborted) {
        setError("Owner change status is unavailable. Do not submit another change.");
        if (cause instanceof AdminAdmissionError) void refresh();
      }
    } finally {
      if (mounted.current && !controller.signal.aborted) { operation.current = null; setBusy(false); }
    }
  }

  return <section className="ap-panel-body" aria-label="Owner accounts">
    <h2>Owners</h2>
    {notice && <Notice kind="info">{notice}</Notice>}
    {storageError && !target && <Notice>{storageError}</Notice>}
    {error && <Notice>{error}</Notice>}
    {pending && <div>
      <p className="ap-detail-text">Unconfirmed request: {pending.requestId}</p>
      <button className="ap-button" disabled={busy} onClick={() => void checkStatus()}>Check request status</button>
    </div>}
    <form className="ap-filters" onSubmit={event => { event.preventDefault(); void load(search.trim()); }}>
      <Field label="Existing account email or UUID">
        <input value={search} maxLength={254} autoComplete="off" disabled={busy || Boolean(pending) || Boolean(storageError)}
          onChange={event => { setSearch(event.target.value); setAccounts(null); setTarget(null); }} />
      </Field>
      <button className="ap-button" disabled={busy || Boolean(pending) || Boolean(storageError)} type="submit">
        {search.trim() ? "Find account" : "Refresh Owners"}
      </button>
    </form>
    {busy && <Loading />}
    {accounts && <>
      <p className="ap-muted">Eligible Owners: {accounts.activeOwnerCount}</p>
      {!accounts.items.length ? <Empty title="No matching accounts" /> : <div className="ap-table-wrap">
        <table className="ap-table"><thead><tr><th>Account</th><th>Role</th><th>Owner access</th></tr></thead>
          <tbody>{accounts.items.map(account => <tr key={account.userId}>
            <td><strong>{account.name || account.email || "Existing account"}</strong><small>{account.email}</small><small>{account.userId}</small></td>
            <td>{account.role === "Admin" ? "Manager" : account.role}</td><td>
              <button className={`ap-button${account.role === "Owner" ? " ap-danger" : ""}`}
                disabled={busy || Boolean(pending) || Boolean(storageError) || account.userId === callerId || (account.role !== "Owner" && !account.ownerEligible)}
                onClick={() => { setTarget(account); setNote(""); setError(""); setNotice(""); }}>
                {account.role === "Owner" ? "Revoke Owner" : "Grant Owner"}
              </button>
              {account.userId === callerId ? <small>Another Owner must manage your Owner access.</small> :
                account.role !== "Owner" && !account.ownerEligible ? <small>Account not eligible.</small> : null}
            </td>
          </tr>)}</tbody>
        </table>
      </div>}
      {accounts.total > 25 && <div className="ap-inline">
        <button className="ap-button" disabled={busy || Boolean(pending) || Boolean(storageError) || accounts.page <= 1}
          onClick={() => void load(query, accounts.page - 1)}>Previous</button>
        <span>Page {accounts.page}</span>
        <button className="ap-button" disabled={busy || Boolean(pending) || Boolean(storageError) || accounts.page * 25 >= accounts.total}
          onClick={() => void load(query, accounts.page + 1)}>Next</button>
      </div>}
    </>}
    {target && <Modal title={target.role === "Owner" ? "Revoke Owner access?" : "Grant Owner access?"}
      busy={busy} onClose={() => setTarget(null)}>
      {storageError && <Notice>{storageError}</Notice>}
      <p><strong>{target.name || target.email || "Existing account"}</strong></p>
      <p className="ap-detail-text">{target.email}<br />{target.userId}</p>
      <Notice kind="info">{target.role === "Owner"
        ? "Global Owner authority will be removed. Existing location assignments and the customer account will be preserved."
        : "This account will receive global Owner authority, including global wallet administration and management of other Owners."}</Notice>
      <Field label="Reason"><textarea value={note} maxLength={4000} disabled={busy}
        onChange={event => setNote(event.target.value)} /></Field>
      <div className="ap-dialog-actions">
        <button className="ap-button" disabled={busy} onClick={() => setTarget(null)}>Cancel</button>
        <button className="ap-button ap-primary" disabled={busy || !note.trim() || Boolean(pending) || Boolean(storageError)} onClick={() => void change()}>
          {busy ? "Saving..." : "Confirm Owner change"}
        </button>
      </div>
    </Modal>}
  </section>;
}

export default function TeamPage() {
  const { identity, preview, loading, error } = useAdmin();
  const role = identityPortalRole(identity);
  if (role === "Maintenance") return <Notice>Team access requires Manager or Owner access.</Notice>;
  return <TeamContent key={`${identity?.id}:${role}:${preview}:${loading}:${Boolean(error)}`} />;
}

function TeamContent() {
  const { api, identity, preview, loading, error: admissionError } = useAdmin();
  const isOwner = !loading && !admissionError && identityPortalRole(identity) === "Owner";
  const canManageRoles = isOwner && !preview;
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [inviting, setInviting] = useState(false);
  const [removing, setRemoving] = useState<Member | null>(null);
  const [email, setEmail] = useState("");
  const [portalRole, setPortalRole] = useState<StaffRole>("Manager");
  const [roleTarget, setRoleTarget] = useState<Member | null>(null);
  const [roleLocked, setRoleLocked] = useState(false);
  const [locationIds, setLocationIds] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const query = useQuery(() => api.team({ search, page }), [api, search, page]);
  const locations = useQuery(() => isOwner ? api.locations() : Promise.resolve([]), [api, isOwner]);
  const invite = async (event: FormEvent) => {
    event.preventDefault();
    if (!isOwner || busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await api.invite(email.trim(), locationIds, portalRole);
      setNotice(
        result.warning ||
          "Invitation sent. The team member can set their own password from the email.",
      );
      setInviting(false);
      setEmail("");
      setLocationIds([]);
      setPortalRole("Manager");
      query.reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!isOwner || !removing || busy || memberPortalRole(removing) === "Owner") return;
    setBusy(true);
    setError("");
    try {
      await api.removeMember(removing.user_id, removing.location_id);
      setRemoving(null);
      setNotice(
        "Location access removed. Other location assignments have been preserved.",
      );
      query.reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const resend = async (member: Member) => {
    if (!isOwner || busy || memberPortalRole(member) === "Owner") return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api.resend(member.user_id, member.location_id);
      setNotice("A new secure account access email has been sent.");
      query.reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <PageHeader
        eyebrow="PEOPLE & ACCESS"
        title="Team"
        description={isOwner ? "Invite your team and manage access to each location." : "Team members at your assigned locations."}
        action={
          isOwner && <div className="ap-inline">
            <ExportButton dataset="team" filters={{ search }} />
            <button
              className="ap-button ap-primary"
              onClick={() => {
                setError("");
                setPortalRole("Manager");
                setInviting(true);
              }}
            >
              <Plus size={17} />
              Invite team member
            </button>
          </div>
        }
      />
      {notice && <Notice kind="info">{notice}</Notice>}
      {error && !inviting && !removing && <Notice>{error}</Notice>}
      {canManageRoles && identity?.role === "Owner" &&
        <OwnerAccountsPanel key={`owners:${identity.id}`} callerId={identity.id} />}
      {canManageRoles && identity && <StaffRoleForm key={`staff-role:${identity.id}`} callerId={identity.id} member={roleTarget}
        onClose={() => setRoleTarget(null)} onChanged={query.reload} onLocked={setRoleLocked} />}
      <section className="ap-panel">
        <div className="ap-filters">
          <label className="ap-search">
            <input
              type="search"
              aria-label="Search team"
              placeholder="Search by name, email, or location…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </label>
          <button
            className="ap-button"
            onClick={query.reload}
            disabled={query.loading}
          >
            <RefreshCw size={16} />
            Refresh
          </button>
        </div>
        {query.loading ? (
          <Loading />
        ) : query.error ? (
          <div className="ap-panel-body">
            <Notice>{query.error}</Notice>
          </div>
        ) : !query.data?.items.length ? (
          <Empty title={isOwner ? "Your team starts here" : "No team members found"}>
            {isOwner ? "Invite a team member and choose the locations they can manage." : "No team members match your accessible locations and search."}
          </Empty>
        ) : (
          <div className="ap-table-wrap">
            <table className="ap-table">
              <thead>
                <tr>
                  <th>Team member</th>
                  <th>Location</th>
                  <th>Role</th>
                  {isOwner && <th>Account</th>}
                  {isOwner && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {query.data.items.map((member) => (
                  <tr key={`${member.user_id}-${member.location_id}`}>
                    <td>
                      <strong>{member.name || "Invited team member"}</strong>
                      <small>{member.email}</small>
                    </td>
                    <td>{member.location_name}</td>
                    <td>{memberPortalRole(member)}</td>
                    {isOwner && <td>
                      <Badge value={member.invitation_status} />
                    </td>}
                    {isOwner && <td>
                      {memberPortalRole(member) !== "Owner" && (
                        <div className="ap-inline">
                          {canManageRoles && member.user_id !== identity?.id && ["Manager", "Maintenance"].includes(memberPortalRole(member)) &&
                            <button className="ap-button" disabled={busy || roleLocked} onClick={() => setRoleTarget(member)}>
                              Change access
                            </button>}
                          <button
                            className="ap-button"
                            disabled={busy}
                            onClick={() => void resend(member)}
                          >
                            Resend access email
                          </button>
                          <button
                            className="ap-button ap-danger"
                            disabled={busy}
                            onClick={() => {
                              setError("");
                              setRemoving(member);
                            }}
                          >
                            Remove location
                          </button>
                        </div>
                      )}
                    </td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {query.data && (
          <Pagination
            page={query.data.page}
            total={query.data.total}
            onChange={setPage}
          />
        )}
      </section>
      {isOwner && inviting && (
        <Modal
          title="Invite team member"
          description="The recipient receives a secure email to set up their own access."
          onClose={() => setInviting(false)}
          busy={busy}
        >
          <form onSubmit={invite}>
            {error && <Notice>{error}</Notice>}
            <Field label="Email address">
              <input
                required
                type="email"
                autoComplete="off"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
            <Field label="Access role">
              <select value={portalRole} disabled={busy} onChange={event => setPortalRole(event.target.value as StaffRole)}>
                <option value="Manager">Manager</option>
                <option value="Maintenance">Maintenance</option>
              </select>
            </Field>
            <h3>Location access</h3>
            <p className="ap-muted">
              {portalRole === "Manager" ? "Nonfinancial operations at selected locations. Financial and team administration remain Owner-only." : "Maintenance only at selected locations."}
            </p>
            {locations.loading ? (
              <Loading />
            ) : locations.error ? (
              <Notice>{locations.error}</Notice>
            ) : locations.data?.length ? (
              locations.data.map((location) => (
                <label className="ap-checkbox" key={location.id}>
                  <input
                    type="checkbox"
                    checked={locationIds.includes(location.id)}
                    onChange={(e) =>
                      setLocationIds((ids) =>
                        e.target.checked
                          ? [...ids, location.id]
                          : ids.filter((id) => id !== location.id),
                      )
                    }
                  />
                  <span>
                    {location.Name}
                    <small>{location.Address}</small>
                  </span>
                </label>
              ))
            ) : (
              <Empty title="Create a location first">
                You need a managed location before inviting staff.
              </Empty>
            )}
            <div className="ap-dialog-actions">
              <button
                type="button"
                className="ap-button"
                disabled={busy}
                onClick={() => setInviting(false)}
              >
                Cancel
              </button>
              <button
                className="ap-button ap-primary"
                disabled={busy || !locationIds.length}
              >
                {busy ? "Sending…" : "Send invitation"}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {isOwner && removing && (
        <Modal
          title="Remove location access?"
          onClose={() => setRemoving(null)}
          busy={busy}
        >
          {error && <Notice>{error}</Notice>}
          <p>
            Remove <strong>{removing.email}</strong> from{" "}
            <strong>{removing.location_name}</strong>?
          </p>
          <p className="ap-detail-text">
            {removing.assignment_count > 1
              ? `They will retain staff access to ${removing.assignment_count - 1} other location${removing.assignment_count > 2 ? "s" : ""}.`
              : "This is their final location assignment. Their staff access will end."}{" "}
            Their customer account is retained.
          </p>
          <div className="ap-dialog-actions">
            <button
              className="ap-button"
              disabled={busy}
              onClick={() => setRemoving(null)}
            >
              Cancel
            </button>
            <button
              className="ap-button ap-danger"
              disabled={busy}
              onClick={() => void remove()}
            >
              {busy ? "Removing…" : "Remove location access"}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
