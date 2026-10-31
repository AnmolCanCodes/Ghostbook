import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { describeError, getHaunting } from "../api.js";
import { plural } from "../lib/format.js";
import { providerLabel } from "./AiBadge.jsx";
import { ChevronIcon } from "./Icons.jsx";

const BANDS = [
  { max: 19, name: "Quiet" },
  { max: 49, name: "Restless" },
  { max: 79, name: "Haunted" },
  { max: 100, name: "Poltergeist" },
];
const TICKS = [0, 20, 50, 80, 100];
const SEVERITIES = [
  { key: "high", title: "High" },
  { key: "medium", title: "Medium" },
  { key: "low", title: "Low" },
];

function bandFor(score) {
  return BANDS.find((band) => score <= band.max) ?? BANDS[BANDS.length - 1];
}

/** A candle on a ruled line. The ink runs from 0 to the score. */
function Gauge({ score, band }) {
  const x = 10 + (Math.min(100, Math.max(0, score)) / 100) * 300;
  return (
    <svg className="gauge" data-band={band.toLowerCase()} viewBox="0 0 320 68" aria-hidden="true" focusable="false">
      <line className="gauge__rule" x1="10" y1="44" x2="310" y2="44" />
      <rect className="gauge__fill" x="10" y="41" width={x - 10} height="6" />
      {TICKS.map((tick) => (
        <g key={tick}>
          <line className="gauge__tick" x1={10 + tick * 3} y1="42" x2={10 + tick * 3} y2="53" />
          <text className="gauge__tick-label" x={10 + tick * 3} y="65" textAnchor="middle">
            {tick}
          </text>
        </g>
      ))}
      <g transform={`translate(${x} 0)`}>
        <line className="gauge__wick" x1="0" y1="37" x2="0" y2="44" />
        <path className="gauge__flame" d="M0 37c-4.2-3-4.8-8.6 0-15 1.2 4.2 5.8 7 0 15z" />
      </g>
    </svg>
  );
}

function FindingItem({ finding, accountsById, onOpenAccount }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const affected = finding.account_ids.map((id) => accountsById.get(id)).filter(Boolean);

  return (
    <li className="finding" data-severity={finding.severity}>
      <button
        type="button"
        className="finding__toggle"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="finding__title">{finding.title}</span>
        <span className="finding__count mono">{plural(finding.account_ids.length, "entry", "entries")}</span>
        <ChevronIcon size={16} className="finding__chevron" />
      </button>
      <div id={panelId} className="finding__panel" hidden={!open}>
        <p className="finding__detail">{finding.detail}</p>
        {affected.length > 0 ? (
          <ul className="finding__accounts">
            {affected.map((account) => (
              <li key={account.id}>
                <button type="button" className="finding__link" onClick={() => onOpenAccount(account.id)}>
                  <span className="finding__site">{account.site}</span>
                  {account.email ? <span className="finding__email mono">{account.email}</span> : null}
                  <span className="visually-hidden"> Open in the ledger</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </li>
  );
}

/** Rule-based findings plus a short summary. Runs on first open and on "Run again". */
export default function HauntingReport({ active, accounts, onOpenAccount }) {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const started = useRef(false);

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setReport(await getHaunting());
    } catch (err) {
      setError(describeError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (active && !started.current) {
      started.current = true;
      run();
    }
  }, [active, run]);

  const accountsById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  const grouped = useMemo(
    () =>
      report
        ? SEVERITIES.map((severity) => ({
            ...severity,
            items: report.findings.filter((finding) => finding.severity === severity.key),
          })).filter((group) => group.items.length > 0)
        : [],
    [report]
  );
  const band = report ? bandFor(report.score) : null;
  const stats = report?.stats;

  return (
    <section className="view haunting" aria-labelledby="haunting-title" aria-busy={loading}>
      <header className="view-head">
        <div>
          <h1 id="haunting-title" className="view-title">
            The haunting
          </h1>
          <p className="view-sub">Stale accounts, lonely logins and one email holding too much.</p>
        </div>
        <button type="button" className="btn" onClick={run} disabled={loading}>
          {loading ? "Running" : "Run again"}
        </button>
      </header>

      {loading ? (
        <p className="inkline" role="status">
          Walking the stacks by candlelight
        </p>
      ) : null}

      {error ? (
        <p className="form__error" role="alert">
          {error}
        </p>
      ) : null}

      {report ? (
        <div className="report" data-stale={loading ? "" : undefined}>
          <div className="score-block">
            <p className="score">
              <span className="score__num">{report.score}</span>
              <span className="score__of">of 100</span>
            </p>
            <p className="score__band">{band.name}</p>
            <Gauge score={report.score} band={band.name} />
          </div>

          <section className="summary" aria-live="polite">
            <h2 className="summary__title">Findings of the night</h2>
            <p className="summary__text">{report.summary}</p>
            <p className="summary__source label">
              {report.summary_source === "ai"
                ? `Written by ${providerLabel(report.provider_used)}`
                : "Written by a template (AI unavailable)"}
            </p>
          </section>

          <dl className="stats">
            <div className="stat">
              <dt className="label">Entries</dt>
              <dd>{stats.total_accounts}</dd>
            </div>
            <div className="stat">
              <dt className="label">Ghosts</dt>
              <dd>{stats.stale_count}</dd>
            </div>
            <div className="stat">
              <dt className="label">Unknown usage</dt>
              <dd>{stats.unknown_usage_count}</dd>
            </div>
            <div className="stat">
              <dt className="label">Busiest email</dt>
              <dd>{stats.top_email_count}</dd>
            </div>
            <div className="stat">
              <dt className="label">No reset route</dt>
              <dd>{stats.missing_reset_route_count}</dd>
            </div>
            <div className="stat">
              <dt className="label">Duplicate sites</dt>
              <dd>{stats.duplicate_site_count}</dd>
            </div>
          </dl>

          {grouped.length === 0 ? (
            <p className="empty__line">Nothing is haunting you. Enjoy it while it lasts.</p>
          ) : (
            grouped.map((group) => (
              <section key={group.key} className="finding-group" data-severity={group.key}>
                <h2 className="finding-group__title">
                  <span className="label">{group.title}</span>
                  <span className="mono">{group.items.length}</span>
                </h2>
                <ul className="findings">
                  {group.items.map((finding, index) => (
                    <FindingItem
                      key={`${finding.kind}-${index}`}
                      finding={finding}
                      accountsById={accountsById}
                      onOpenAccount={onOpenAccount}
                    />
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>
      ) : null}
    </section>
  );
}