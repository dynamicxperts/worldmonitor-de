/**
 * Ultracrusty Panel — Competitive Intelligence
 *
 * Pure presentational. AGPL-3.0. No secrets, no business logic.
 *
 * Renders momentum-ranked top stories alongside the most recently
 * discovered competitors. The competitors list is intended to also
 * feed the globe layer (HQ markers) — the parent surface decides how
 * to consume it.
 */

"use client";

import { useEffect, useState } from "react";
import {
  dynamicExpertsClient,
  type UltracrustyStoriesResponse,
  type UltracrustyCompetitorsResponse,
} from "../../lib/dynamic-experts-client";

const REFRESH_MS = 120_000;

export default function UltracrustyPanel() {
  const [stories, setStories] = useState<UltracrustyStoriesResponse | null>(null);
  const [competitors, setCompetitors] =
    useState<UltracrustyCompetitorsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [s, c] = await Promise.all([
          dynamicExpertsClient.getUltracrustyTopStories(20),
          dynamicExpertsClient.getUltracrustyCompetitors(20),
        ]);
        if (!cancelled) {
          setStories(s);
          setCompetitors(c);
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
    <div className="de-panel de-panel-uc">
      <header>
        <strong>Competitive Intelligence</strong>
        {competitors ? (
          <span className="de-count">
            {competitors.count} tracked competitors
          </span>
        ) : null}
      </header>

      {error ? <p className="de-error">Feed unavailable: {error}</p> : null}

      {stories && stories.items.length > 0 ? (
        <ol className="de-stories">
          {stories.items.map((s) => (
            <li key={s.id ?? s.url ?? s.title ?? Math.random()}>
              {s.url ? (
                <a href={s.url} target="_blank" rel="noopener noreferrer">
                  {s.title ?? s.url}
                </a>
              ) : (
                <strong>{s.title ?? "Untitled"}</strong>
              )}
              {s.source ? <span className="de-source">{s.source}</span> : null}
              {typeof s.momentum === "number" ? (
                <span className="de-momentum">
                  momentum {s.momentum.toFixed(2)}
                </span>
              ) : null}
              {s.summary ? <p>{s.summary}</p> : null}
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}
