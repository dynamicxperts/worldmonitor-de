/**
 * Jet Attribution Panel
 *
 * Pure presentational. AGPL-3.0. No secrets, no business logic.
 *
 * Renders an enrichment overlay for an ADS-B contact: looks up the
 * 24-bit ICAO hex address against the public outbound API and shows
 * the beneficial owner if known.
 *
 * Expected to be mounted by the upstream globe surface whenever a
 * single ADS-B contact is selected; the parent passes the hex via
 * the `icao24` prop or via a `globe:contact-selected` postMessage.
 */

"use client";

import { useEffect, useState } from "react";
import {
  dynamicExpertsClient,
  type JetOwnerResponse,
} from "../../lib/dynamic-experts-client";

interface Props {
  icao24: string;
}

export default function JetAttributionPanel({ icao24 }: Props) {
  const [data, setData] = useState<JetOwnerResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    dynamicExpertsClient
      .getJetOwner(icao24)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [icao24]);

  if (loading) {
    return (
      <div className="de-panel de-panel-jet">
        <header>Aircraft Lookup</header>
        <p>Resolving {icao24}…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="de-panel de-panel-jet de-panel-error">
        <header>Aircraft Lookup</header>
        <p>Error: {error}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="de-panel de-panel-jet">
        <header>Aircraft Lookup</header>
        <p>No registered owner found for {icao24}.</p>
      </div>
    );
  }

  return (
    <div className="de-panel de-panel-jet">
      <header>
        <strong>{data.tail ?? data.icao24}</strong>
        <span className="de-confidence">{data.confidence}</span>
      </header>
      <dl>
        <dt>Owner</dt>
        <dd>{data.owner_name ?? "Unknown"}</dd>
        <dt>Owner type</dt>
        <dd>{data.owner_type ?? "—"}</dd>
        <dt>Aircraft</dt>
        <dd>
          {data.model ?? "—"}
          {data.year ? ` (${data.year})` : ""}
        </dd>
        <dt>As of</dt>
        <dd>{data.updated_at ?? "—"}</dd>
      </dl>
    </div>
  );
}
