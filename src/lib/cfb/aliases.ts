/**
 * THE ALIAS TABLE, on its own (2026-09-08, the NFL build): src/lib/cfb/rules.ts now builds
 * CFB_LEAGUE and needs this table, and names.ts imports CFB_MODEL from rules.ts — so the table
 * lives here, imported by both, and rules.ts never imports names.ts (no cycle). names.ts still
 * re-exports it under the same name, so every existing import keeps resolving.
 */

/**
 * ESPN displayName → the odds feed's spelling. Every entry was read out of the raw
 * 2026-09-05 `americanfootball_ncaaf` capture (158 events); none is guessed. The two
 * apostrophe-only cases are listed for the record — `normTeam` alone already joins them.
 */
export const ALIASES: Record<string, string> = {
  "Sam Houston Bearkats": "Sam Houston State Bearkats",
  "Southern Miss Golden Eagles": "Southern Mississippi Golden Eagles",
  "Houston Christian Huskies": "Houston Baptist Huskies",
  "App State Mountaineers": "Appalachian State Mountaineers",
  "SE Louisiana Lions": "Southeastern Louisiana Lions",
  "The Citadel Bulldogs": "Citadel Bulldogs",
  "Youngstown State Penguins": "Youngstown St Penguins",
  "Nicholls Colonels": "Nicholls State Colonels",
  "Louisiana Ragin' Cajuns": "Louisiana Ragin Cajuns",
  "Hawai'i Rainbow Warriors": "Hawaii Rainbow Warriors",
};
