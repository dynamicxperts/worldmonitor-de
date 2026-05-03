/**
 * Variant: dynamicexperts.com
 *
 * This file is part of the AGPL-3.0-licensed worldmonitor-de public fork.
 * No secrets. No proprietary logic. All dynamic data comes from the
 * public outbound API at https://wm-out.api.sudoself.com — see
 * lib/dynamic-experts-client.ts for the fetch wrapper.
 *
 * Hostname bindings:
 *   dynamicexperts.com
 *   sudoself.com
 *   *.sudoself.com
 *   globe.dynamicexperts.com
 *   globe.sudoself.com
 *
 * The panel registry shape mirrors the upstream WorldMonitor variant API.
 * If the upstream API changes shape on a future merge, only this file
 * needs to be reconciled — panels themselves are pure presentational
 * components that are variant-agnostic.
 */

import JetAttributionPanel from "../panels/dynamic-experts/jet-attribution-panel";
import MissionControlPanel from "../panels/dynamic-experts/mission-control-panel";
import UltracrustyPanel from "../panels/dynamic-experts/ultracrusty-panel";
import WarRoomPanel from "../panels/dynamic-experts/war-room-panel";
import MagicRockHighlightsPanel from "../panels/dynamic-experts/magic-rock-highlights-panel";

export type VariantPanelSlot =
  | "primary"
  | "secondary"
  | "tertiary"
  | "overlay"
  | "carousel";

export interface VariantPanelDefinition {
  id: string;
  title: string;
  slot: VariantPanelSlot;
  component: React.ComponentType<Record<string, never>>;
  refreshIntervalSeconds?: number;
}

export interface VariantConfig {
  variantId: string;
  hostnames: string[];
  brandName: string;
  brandUrl: string;
  panels: VariantPanelDefinition[];
}

const config: VariantConfig = {
  variantId: "dynamicexperts.com",
  hostnames: [
    "dynamicexperts.com",
    "sudoself.com",
    "*.sudoself.com",
    "globe.dynamicexperts.com",
    "globe.sudoself.com",
  ],
  brandName: "Dynamic Experts",
  brandUrl: "https://dynamicexperts.com",
  panels: [
    {
      id: "jet-attribution",
      title: "Aircraft Beneficial Owner",
      slot: "overlay",
      component: JetAttributionPanel,
      refreshIntervalSeconds: 60,
    },
    {
      id: "mission-control",
      title: "Platform Status",
      slot: "primary",
      component: MissionControlPanel,
      refreshIntervalSeconds: 30,
    },
    {
      id: "ultracrusty",
      title: "Competitive Intelligence",
      slot: "secondary",
      component: UltracrustyPanel,
      refreshIntervalSeconds: 120,
    },
    {
      id: "war-room",
      title: "Target Board",
      slot: "tertiary",
      component: WarRoomPanel,
      refreshIntervalSeconds: 60,
    },
    {
      id: "magic-rock-highlights",
      title: "Featured Highlights",
      slot: "carousel",
      component: MagicRockHighlightsPanel,
      refreshIntervalSeconds: 30,
    },
  ],
};

export default config;
