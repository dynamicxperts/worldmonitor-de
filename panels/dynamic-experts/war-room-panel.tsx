/**
 * War Room Panel — Target Board
 *
 * Pure presentational. AGPL-3.0. No secrets, no business logic.
 *
 * Lists active targets with HQ coordinates so the parent globe
 * surface can pin markers; clicking an item follows the deep link
 * back to the auth-gated internal target detail.
 */

"use client";

import { useEffect, useMemo, useState } from "react";
import {
  dynamicExpertsClient,
  type WarRoomTargetsResponse,
} from "../../lib/dynamic-experts-client";

const REFRESH_MS = 60_000;

export default function WarRoomPanel() {
  const [targets, setTargets] = useState<WarRoomTargetsResponse | null>(null);
  const [suspects, setSuspects] = useState<WarRoomTargetsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [t, s] = await Promise.all([
          dynamicExpertsClient.getWarRoomTargets(),
          dynamicExpertsClient.getWarRoomSuspects(true),
        ]);
        if (!cancelled) {
          setTargets(t);
          setSuspects(s);
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

  const totalCount = useMemo(
    () =>
      (targets?.items.length ?? 0) + (suspects?.items.length ?? 0),
    [targets, suspects],
  );

  return (
    <div className="de-panel de-panel-wr">
      <header>
        <strong>Target Board</strong>
        <span className="de-count">{totalCount} entities</span>
      </header>

      {error ? <p className="de-error">Board unavailable: {error}</p> : null}

      {targets && targets.items.length > 0 ? (
        <section>
          <h4>Active targets</h4>
          <ul className="de-targets">
            {targets.items.map((t) => (
              <li key={t.id ?? t.name ?? Math.random()}>
                {t.deep_link ? (
                  <a href={t.deep_link} target="_blank" rel="noopener noreferrer">
                    {t.name ?? "Unnamed target"}
                  </a>
                ) : (
                  <strong>{t.name ?? "Unnamed target"}</strong>
                )}
                {t.hq_country ? (
                  <span className="de-country">{t.hq_country}</span>
                ) : null}
                <span className={`de-status de-status-${t.status}`}>
                  {t.status}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {suspects && suspects.items.length > 0 ? (
        <section>
          <h4>Screened suspects</h4>
          <ul className="de-targets">
            {suspects.items.map((t) => (
              <li key={t.id ?? t.name ?? Math.random()}>
                <strong>{t.name ?? "Unnamed"}</strong>
                {t.hq_country ? (
                  <span className="de-country">{t.hq_country}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
