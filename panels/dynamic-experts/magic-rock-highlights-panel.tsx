/**
 * Magic Rock Highlights Panel — Featured carousel
 *
 * Pure presentational. AGPL-3.0. No secrets, no business logic.
 *
 * Auto-advancing carousel of featured highlights from the public
 * outbound API. Items are already filtered server-side (the upstream
 * Lambda passes ?for=worldmonitor so the source can strip anything
 * not safe for the public globe).
 */

"use client";

import { useEffect, useState } from "react";
import {
  dynamicExpertsClient,
  type MagicRockHighlightsResponse,
  type MagicRockHighlight,
} from "../../lib/dynamic-experts-client";

const REFRESH_MS = 30_000;
const ROTATE_MS = 5_000;

export default function MagicRockHighlightsPanel() {
  const [data, setData] = useState<MagicRockHighlightsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const d = await dynamicExpertsClient.getMagicRockHighlights();
        if (!cancelled) {
          setData(d);
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

  useEffect(() => {
    if (!data || data.items.length <= 1) return;
    const id = setInterval(
      () => setIdx((i) => (i + 1) % data.items.length),
      ROTATE_MS,
    );
    return () => clearInterval(id);
  }, [data]);

  if (error) {
    return (
      <div className="de-panel de-panel-mr de-panel-error">
        <header>Featured Highlights</header>
        <p>Unavailable: {error}</p>
      </div>
    );
  }

  if (!data || data.items.length === 0) {
    return (
      <div className="de-panel de-panel-mr">
        <header>Featured Highlights</header>
        <p>No highlights right now.</p>
      </div>
    );
  }

  const current: MagicRockHighlight = data.items[idx % data.items.length];

  return (
    <div className="de-panel de-panel-mr">
      <header>
        <strong>Featured Highlights</strong>
        <span className="de-rotor">
          {idx + 1} / {data.items.length}
        </span>
      </header>
      <article>
        {current.imageUrl ? (
          <img src={current.imageUrl} alt={current.title} />
        ) : null}
        <h3>
          {current.link ? (
            <a href={current.link} target="_blank" rel="noopener noreferrer">
              {current.title}
            </a>
          ) : (
            current.title
          )}
        </h3>
        {current.description ? <p>{current.description}</p> : null}
        {current.publishedAt ? (
          <time dateTime={current.publishedAt}>{current.publishedAt}</time>
        ) : null}
      </article>
    </div>
  );
}
