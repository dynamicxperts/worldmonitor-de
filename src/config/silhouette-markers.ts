// Top-down vehicle silhouette markers for the map (planes + ships).
//
// Owned assets (AI-generated, white-on-transparent alpha masks packed into a
// single atlas) — NOT derived from GPL'd tar1090/dump1090 art. The atlas lives
// at public/markers/silhouette-atlas.png; each 128px cell is a mask-tintable
// frame (deck.gl IconLayer mask:true → tinted by getColor, rotated by getAngle).
//
// Fidelity is class-distinct with a few military exacts (see scope decision):
// aircraft resolve by ICAO type designator (threaded from airplanes.live `t`
// into MilitaryFlight.aircraftModel) → class, falling back to the coarse
// MilitaryAircraftType enum; ships resolve by AIS ship-type range.

export const SILHOUETTE_ATLAS = '/markers/silhouette-atlas.png';

const CELL = 128;
const grid = (col: number, row: number) => ({
  x: col * CELL,
  y: row * CELL,
  width: CELL,
  height: CELL,
  mask: true,
});

export type SilhouetteFrame =
  | 'jet_bizjet' | 'jet_airliner' | 'jet_heavy' | 'turboprop'
  | 'fighter' | 'helicopter' | 'c130' | 'e3_awacs'
  | 'ship_tanker' | 'ship_cargo' | 'ship_passenger' | 'ship_military' | 'ship_tug';

export const SILHOUETTE_ICON_MAPPING: Record<SilhouetteFrame, ReturnType<typeof grid>> = {
  jet_bizjet: grid(0, 0), jet_airliner: grid(1, 0), jet_heavy: grid(2, 0), turboprop: grid(3, 0),
  fighter: grid(0, 1), helicopter: grid(1, 1), c130: grid(2, 1), e3_awacs: grid(3, 1),
  ship_tanker: grid(0, 2), ship_cargo: grid(1, 2), ship_passenger: grid(2, 2), ship_military: grid(3, 2),
  ship_tug: grid(0, 3),
};

// ICAO type designator (airplanes.live `t`) → silhouette class. Covers the
// common contacts; anything unmapped falls through to the enum/default.
const TYPE_DESIGNATOR_FRAME: Record<string, SilhouetteFrame> = {
  // AWACS / dorsal rotodome
  E3TF: 'e3_awacs', E3CF: 'e3_awacs', E3: 'e3_awacs', A50: 'e3_awacs',
  // C-130 family (4 high-wing turboprop)
  C130: 'c130', C30J: 'c130', L100: 'c130', LM100: 'c130',
  // Other turboprops
  AT72: 'turboprop', AT76: 'turboprop', DH8D: 'turboprop', C295: 'turboprop',
  C27J: 'turboprop', B350: 'turboprop', BE20: 'turboprop', PC12: 'turboprop',
  C212: 'turboprop', SB20: 'turboprop', AT45: 'turboprop',
  // Fighters
  F16: 'fighter', F15: 'fighter', F18: 'fighter', F22: 'fighter', F35: 'fighter',
  EUFI: 'fighter', RFAL: 'fighter', GR4: 'fighter', F2: 'fighter', SU27: 'fighter',
  SU30: 'fighter', SU34: 'fighter', MG29: 'fighter', J10: 'fighter', T38: 'fighter',
  // Helicopters
  H60: 'helicopter', UH60: 'helicopter', H47: 'helicopter', CH47: 'helicopter',
  EC35: 'helicopter', EC45: 'helicopter', AS65: 'helicopter', A139: 'helicopter',
  H225: 'helicopter', MI8: 'helicopter', MI17: 'helicopter', H64: 'helicopter',
  // Heavies (4-engine / wide-body / large tankers & transports)
  C17: 'jet_heavy', C5M: 'jet_heavy', K35R: 'jet_heavy', KC46: 'jet_heavy',
  KC10: 'jet_heavy', B52: 'jet_heavy', IL76: 'jet_heavy', A124: 'jet_heavy',
  B742: 'jet_heavy', B744: 'jet_heavy', B748: 'jet_heavy', A388: 'jet_heavy',
  A332: 'jet_heavy', A333: 'jet_heavy', A359: 'jet_heavy', B772: 'jet_heavy',
  B77W: 'jet_heavy', B763: 'jet_heavy', B762: 'jet_heavy', P8: 'jet_heavy',
  RC135: 'jet_heavy', E6: 'jet_heavy', VC25: 'jet_heavy',
  // Business jets
  GLF4: 'jet_bizjet', GLF5: 'jet_bizjet', GLF6: 'jet_bizjet', GLF7: 'jet_bizjet',
  GL5T: 'jet_bizjet', GL7T: 'jet_bizjet', GLEX: 'jet_bizjet', G280: 'jet_bizjet',
  CL30: 'jet_bizjet', CL35: 'jet_bizjet', CL60: 'jet_bizjet', CRJ2: 'jet_bizjet',
  F2TH: 'jet_bizjet', FA7X: 'jet_bizjet', FA8X: 'jet_bizjet', F900: 'jet_bizjet',
  C56X: 'jet_bizjet', C68A: 'jet_bizjet', C25C: 'jet_bizjet', E55P: 'jet_bizjet',
  LJ60: 'jet_bizjet', LJ75: 'jet_bizjet', H25B: 'jet_bizjet', PRM1: 'jet_bizjet',
  // Narrow-body airliners
  A319: 'jet_airliner', A320: 'jet_airliner', A321: 'jet_airliner', A20N: 'jet_airliner',
  A21N: 'jet_airliner', B737: 'jet_airliner', B738: 'jet_airliner', B739: 'jet_airliner',
  B38M: 'jet_airliner', E190: 'jet_airliner', E195: 'jet_airliner', BCS3: 'jet_airliner',
};

const ENUM_FRAME: Record<string, SilhouetteFrame> = {
  fighter: 'fighter',
  bomber: 'jet_heavy',
  transport: 'c130',
  tanker: 'jet_heavy',
  awacs: 'e3_awacs',
  reconnaissance: 'jet_heavy',
  helicopter: 'helicopter',
  drone: 'turboprop',
  special_ops: 'c130',
  vip: 'jet_bizjet',
};

/**
 * Resolve an aircraft silhouette frame.
 * @param typeCode ICAO type designator (e.g. "C30J", "GLF5") from `t` if available
 * @param enumType the coarse MilitaryAircraftType enum value (lowercase)
 */
export function resolvePlaneIcon(typeCode?: string | null, enumType?: string | null): SilhouetteFrame {
  if (typeCode) {
    const t = typeCode.toUpperCase().trim();
    if (TYPE_DESIGNATOR_FRAME[t]) return TYPE_DESIGNATOR_FRAME[t];
    // Heuristic prefixes for unmapped codes.
    if (/^(A3|A2|B73|B75|E19|BCS)/.test(t)) return 'jet_airliner';
    if (/^(B74|B77|A38|A34|A35|C17|C5|IL7|K35)/.test(t)) return 'jet_heavy';
    if (/^(GLF|GL[0-9]|GLEX|CL[0-9]|F2|FA|F9|C5[0-9]|C6|LJ|H25)/.test(t)) return 'jet_bizjet';
    if (/^(AT|DH|BE|PC|C2|SB|C30|C13|L1)/.test(t)) return 'turboprop';
    if (/^(F1|F2[0-9]|F3|SU|MG|EUFI|RFAL|J1|T38)/.test(t)) return 'fighter';
    if (/^(H[0-9]|EC|AS|MI|A13|UH|CH)/.test(t)) return 'helicopter';
  }
  if (enumType && ENUM_FRAME[enumType]) return ENUM_FRAME[enumType];
  return 'jet_bizjet';
}

/**
 * Resolve a vessel silhouette frame from an AIS ship type code.
 * AIS type ranges: 30 fishing, 31-32 tug/tow, 35 military, 36-37 sailing/pleasure,
 * 60-69 passenger, 70-79 cargo, 80-89 tanker.
 */
export function resolveShipIcon(shipType?: number | null): SilhouetteFrame {
  const t = Number(shipType);
  if (!Number.isFinite(t)) return 'ship_cargo';
  if (t === 35) return 'ship_military';
  if (t === 31 || t === 32 || t === 52) return 'ship_tug';
  if (t >= 60 && t <= 69) return 'ship_passenger';
  if (t >= 80 && t <= 89) return 'ship_tanker';
  if (t >= 70 && t <= 79) return 'ship_cargo';
  return 'ship_cargo';
}
