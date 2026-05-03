/**
 * Mission Control Panel — Platform Status
 *
 * Pure presentational. AGPL-3.0. No secrets, no business logic.
 *
 * Renders compact subsystem health + the latest high-severity intel
 * items. Refreshes on the cadence defined by the variant config.
 */

"use client";

import { useEffect, useState } from "react";
import {
  dynamicExpertsClient,
  type MissionControlHealthResponse,
  type IntelListResponse,
} from "../../lib/dynamic-experts-client";

const REFRESH_MS = 30_000;

export default function MissionControlPanel() {
  const [health, setHealth] = useState<MissionControlHealthResponse | null>(null);
  const [intel, setIntel] = useState<IntelListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [h, i] = await Promise.all([
          dynamicExpertsClient.getMissionControlHealth(),
          dynamicExpertsClient.getMissionControlIntel("high", 10),
        ]);
        if (!cancelled) {
          setHealth(h);
          setIntel(i);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    }

    load();
    const id = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return (
    <div className="de-panel de-panel-mc">
      <header>
        <strong>Platform Status</strong>
        {health ? (
          <span className={`de-overall de-overall-${health.overall}`}>
            {health.overall.toUpperCase()}
          </span>
        ) : null}
      </header>

      {error ? <p className="de-error">Status unavailable: {error}</p> : null}

      {health ? (
        <ul className="de-subsystems">
          {health.subsystems.map((s) => (
            <li key={s.subsystem} className={`de-status-${s.status}`}>
              <span className="de-subsystem-name">{s.subsystem}</span>
              <span className="de-subsystem-status">{s.status}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {intel && intel.items.length > 0 ? (
        <section className="de-intel">
          <h4>Recent intel</h4>
          <ol>
            {intel.items.slice(0, 5).map((r) => (
              <li key={r.id}>
                <span className={`de-sev de-sev-${r.severity}`}>
                  {r.severity}
                </span>
                <strong>{r.title ?? r.report_type ?? "Untitled"}</strong>
                {r.summary ? <p>{r.summary}</p> : null}
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </div>
  );
}
