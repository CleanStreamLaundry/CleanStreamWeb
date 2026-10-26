import { Link } from "react-router-dom";
import {
  ArrowRight,
  Building2,
  CircleDollarSign,
  RefreshCw,
  TrendingUp,
  Wrench,
} from "lucide-react";
import { useAdmin } from "./context";
import { Empty, Loading, Notice, PageHeader } from "./ui";
import { dateTime, money, timezone } from "./format";
import { useQuery } from "./query";
import { portalRole } from "./permissions";

function Chart({
  values,
  labels,
  currency = false,
}: {
  values: number[];
  labels: string[];
  currency?: boolean;
}) {
  const max = Math.max(...values, 1);
  return (
    <>
      <div
        className="ap-chart"
        role="group"
        aria-label={
          currency ? "Daily recorded payments" : "Transactions by hour"
        }
      >
        {values.map((value, index) => (
          <button
            key={index}
            className="ap-chart-bar"
            style={{ height: `${Math.max(1, (value / max) * 100)}%` }}
            aria-label={`${labels[index]}: ${currency ? money(value) : value}`}
          >
            <span>
              {labels[index]} · {currency ? money(value) : value}
            </span>
          </button>
        ))}
      </div>
      <div className="ap-chart-axis">
        <span>{labels[0]}</span>
        <span>{labels[Math.floor(labels.length / 2)]}</span>
        <span>{labels.at(-1)}</span>
      </div>
      <details className="ap-chart-details">
        <summary>View data table</summary>
        <div className="ap-table-wrap">
          <table className="ap-table">
            <thead>
              <tr>
                <th>Period</th>
                <th>{currency ? "Amount" : "Transactions"}</th>
              </tr>
            </thead>
            <tbody>
              {values.map((value, index) => (
                <tr key={index}>
                  <td>{labels[index]}</td>
                  <td>{currency ? money(value) : value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </>
  );
}
export default function OverviewPage({ base }: { base: string }) {
  const { api, identity } = useAdmin();
  const owner = portalRole(identity) === "Owner";
  const query = useQuery(() => api.overview(), [api], { keepDataOnReload: true });
  const data = query.data;
  return (
    <>
      <PageHeader
        eyebrow="YOUR OPERATIONS AT A GLANCE"
        title="Overview"
        description={`Welcome back${identity?.name ? `, ${identity.name.split(" ")[0]}` : ""}. Here’s what needs your attention today.`}
        action={
          <button
            className="ap-button"
            disabled={query.loading}
            onClick={query.reload}
          >
            <RefreshCw size={16} />
            Refresh
          </button>
        }
      />
      {query.error && <Notice>{query.error}</Notice>}
      {query.loading && !data && <Loading />}
      {data && (
        <>
          <div className="ap-stats">
            {owner && <><div className="ap-stat">
              <div className="ap-stat-heading">
                Stripe net collections today
                <CircleDollarSign size={19} />
              </div>
              <div className="ap-stat-value">{data.reporting && data.today != null ? money(data.today) : "Unavailable"}</div>
              <div className="ap-stat-footer">Recorded USD · sandbox excluded</div>
            </div>
            <div className="ap-stat">
              <div className="ap-stat-heading">
                Last 30 days
                <TrendingUp size={19} />
              </div>
              <div className="ap-stat-value">{data.reporting && data.total != null ? money(data.total) : "Unavailable"}</div>
              <div className="ap-stat-footer">Recorded Stripe net collections · USD</div>
            </div></>}
            <div className="ap-stat">
              <div className="ap-stat-heading">
                Open maintenance
                <Wrench size={19} />
              </div>
              <div className="ap-stat-value">{data.openMaintenance}</div>
              <div className="ap-stat-footer">
                <Link to={`${base}/maintenance`}>
                  Review work queue
                  <ArrowRight size={13} />
                </Link>
              </div>
            </div>
            {owner && <div className="ap-stat">
              <div className="ap-stat-heading">
                Pending loyalty credits
                <CircleDollarSign size={19} />
              </div>
              <div className="ap-stat-value">{data.pendingCredits}</div>
              <div className="ap-stat-footer">
                <Link to={`${base}/refunds`}>
                  Review requests
                  <ArrowRight size={13} />
                </Link>
              </div>
            </div>}
            {!owner && <>
              <div className="ap-stat"><div className="ap-stat-heading">Locations<Building2 size={19} /></div><div className="ap-stat-value">{data.locations}</div></div>
              <div className="ap-stat"><div className="ap-stat-heading">Machines<Wrench size={19} /></div><div className="ap-stat-value">{data.machines}</div></div>
            </>}
          </div>
          {owner && <section className="ap-panel">
            <div className="ap-panel-heading"><h2>Collection coverage</h2></div>
            <div className="ap-panel-body">
              <p><strong>Direct Nayax device payments: Not connected</strong></p>
              <p>Transactions: Unknown · Collections: Unknown · Last sync: Never</p>
              <p>Stripe: Local records only · Last provider sync: Unknown</p>
              {!data.reporting ? <Notice>Typed reporting is unavailable. Legacy totals are not shown.</Notice> : <>
                <p>{data.reporting.scope}</p>
                <p>Historical environment may be unknown. New wallet loads use verified Stripe mode evidence. Not bank settlement.</p>
                <dl className="ap-detail-grid">
                  <div><dt>Wallet spend · USD</dt><dd>{money(data.reporting.walletSpendCents / 100)}</dd></div>
                  <div><dt>Promo used within wallet spend · USD</dt><dd>{money(data.reporting.promoSpendCents / 100)}</dd></div>
                  <div><dt>Load promo issued · USD</dt><dd>{money(data.reporting.promoIssuedCents / 100)}</dd></div>
                  <div><dt>Started vend value · USD</dt><dd>{money(data.reporting.operationalVendCents / 100)}</dd></div>
                  <div><dt>Unresolved records</dt><dd>{data.reporting.unresolvedRecords}</dd></div>
                </dl>
                <p>Wallet and promo use are not new collections. Vend value is operational, not additional cash.</p>
                <div className="ap-table-wrap"><table className="ap-table">
                  <thead><tr><th>Category</th><th>Provider / environment</th><th>Records</th><th>Record value</th><th>Known gross</th><th>Refunded</th><th>Net collections</th><th>Unresolved</th></tr></thead>
                  <tbody>{data.reporting.buckets.map((b) => {
                    const value = (cents: number | null) => cents == null ? "Unknown" : new Intl.NumberFormat("en-US", { style: "currency", currency: b.currency }).format(cents / 100);
                    return <tr key={`${b.category}:${b.provider}:${b.environment}:${b.currency}`}>
                      <td>{b.category.replaceAll("_", " ")}</td><td>{b.provider} / {b.environment}</td><td>{b.records}</td>
                      <td>{value(b.amountCents)} {b.currency}</td><td>{value(b.grossCollectionCents)}</td><td>{value(b.refundedCollectionCents)}</td><td>{value(b.netCollectionCents)}</td><td>{b.unresolvedRecords}</td>
                    </tr>;
                  })}</tbody>
                </table></div>
              </>}
            </div>
          </section>}
          {owner && data.reporting && <div className="ap-chart-grid">
            <section className="ap-panel">
              <div className="ap-panel-heading">
                <div>
                  <h2>Recorded Stripe net collection trend</h2>
                  <p>Daily totals over the last 30 days</p>
                </div>
                <span className="ap-badge">30 days</span>
              </div>
              <div className="ap-panel-body">
                {data.daily?.length ? (
                  <Chart
                    values={data.daily.map((d) => d.amount)}
                    labels={data.daily.map((d) => d.date)}
                    currency
                  />
                ) : (
                  <Empty title="No recorded payments" />
                )}
              </div>
            </section>
            <section className="ap-panel">
              <div className="ap-panel-heading">
                <div>
                  <h2>Transaction activity</h2>
                  <p>Transactions by hour · last 30 days</p>
                </div>
              </div>
              <div className="ap-panel-body">
                <Chart
                  values={data.hourly ?? []}
                  labels={(data.hourly ?? []).map(
                    (_, h) => `${h % 12 || 12} ${h < 12 ? "AM" : "PM"}`,
                  )}
                />
              </div>
            </section>
          </div>}
          <section className="ap-panel ap-summary-strip">
            <div>
              <Building2 size={26} />
              <div>
                <h3>
                  {data.locations} managed location
                  {data.locations === 1 ? "" : "s"} · {data.machines} machines
                </h3>
                <p>
                  {owner ? "Keep machine details, pricing, and payment setup up to date." : "Review machine availability and maintenance needs."}
                </p>
              </div>
            </div>
            <Link className="ap-button" to={`${base}/locations`}>
              Manage locations
              <ArrowRight size={16} />
            </Link>
          </section>
          <p className="ap-muted">
            <small>
              {owner && (data.reporting ? data.financialScope : "Reporting upgrade required.")} Timezone:{" "}
              {timezone}. Updated {dateTime(data.updatedAt)}.
            </small>
          </p>
        </>
      )}
    </>
  );
}
