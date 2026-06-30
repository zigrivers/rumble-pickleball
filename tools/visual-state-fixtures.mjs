const names = [
  "Ava", "Ben", "Cy", "Dee", "Eli", "Fay", "Gus", "Hal",
  "Ivy", "Jay", "Kai", "Liv", "Mia", "Noah", "Owen", "Pia"
];

function player(slot) {
  return {
    slot,
    name: names[slot - 1] || "Player " + slot,
    phone: "",
    status: "active",
    eligibleFromRound: 1,
    joinedRound: 1,
    leftRound: null
  };
}

function game(court, team1, team2, score1 = null, score2 = null) {
  return {
    court,
    team1,
    team2,
    score1,
    score2,
    gameStartedAt: 1790000000000,
    gameEndedAt: Number.isInteger(score1) && Number.isInteger(score2) ? 1790000300000 : null,
    pauseSec: 0
  };
}

function baseState() {
  return {
    phase: "setup",
    format: "rr",
    rawNames: names.slice(0, 8),
    rawPhones: Array(8).fill(""),
    slots: names.slice(0, 8),
    phones: Array(8).fill(""),
    players: names.slice(0, 8).map((_, i) => player(i + 1)),
    currentRound: 1,
    rounds: [],
    finals: null,
    tiebreakRandom: [0,1,2,3,4,5,6,7],
    awardsShown: false,
    winScore: 11,
    winBy: 2,
    scoringSystem: "sideout",
    notifiedRounds: [],
    stackRounds: 8,
    kingRounds: 8,
    gauntletRounds: 8,
    rrRounds: 7,
    courtCount: 2,
    scheduleSeed: 12345,
    rrScheduleMode: "wh8",
    previousRanks: [],
    timeBudget: { enabled: false, minutes: 90, plannedConfig: null, startedAt: 0 }
  };
}

export function setupDesktopState() {
  return baseState();
}

export function playing13p3cState() {
  const s = baseState();
  s.phase = "playing";
  s.rawNames = names.slice(0, 13);
  s.slots = names.slice(0, 13);
  s.players = names.slice(0, 13).map((_, i) => player(i + 1));
  s.courtCount = 3;
  s.rrRounds = 6;
  s.rrScheduleMode = "generated";
  s.rounds = [
    { round: 1, games: [
      game(1, [1,4], [2,3], 11, 8),
      game(2, [5,8], [6,7], 9, 11),
      game(3, [9,12], [10,11])
    ], byes: [13] },
    { round: 2, games: [
      game(1, [1,5], [3,7]),
      game(2, [2,6], [4,8]),
      game(3, [9,13], [10,12])
    ], byes: [11] }
  ];
  s.currentRound = 2;
  return s;
}

export function finals13p3cState() {
  const s = playing13p3cState();
  s.phase = "finals";
  s.finals = {
    tiers: [
      game(1, [1,4], [2,3]),
      Object.assign(game(2, [5,8], [6,7]), { name: "Consolation" }),
      Object.assign(game(3, [9,12], [10,11]), { name: "Bronze" })
    ],
    unseated: [13]
  };
  s.finals.tiers[0].name = "Championship";
  return s;
}

export function doneTextResultsState() {
  const s = finals13p3cState();
  s.phase = "done";
  s.finals.tiers = s.finals.tiers.map((g, i) => Object.assign({}, g, {
    score1: i === 0 ? 11 : 9,
    score2: i === 0 ? 7 : 11,
    gameEndedAt: 1790000600000
  }));
  s.phones = s.slots.map((_, i) => i < 4 ? "555000000" + (i + 1) : "");
  s.players.forEach((p, i) => { p.phone = s.phones[i] || ""; });
  return s;
}

// Large-field playing state: 32 players across all 8 courts (one round scored)
// so the 7th/8th court colors and the dense standings render. Guards the
// 8-court / 32-player support.
export function playing32p8cState() {
  const s = baseState();
  s.phase = "playing";
  const N = 32;
  s.rawNames = Array.from({ length: N }, (_, i) => names[i] || "Player " + (i + 1));
  s.rawPhones = Array(N).fill("");
  s.slots = s.rawNames.slice();
  s.phones = Array(N).fill("");
  s.players = s.rawNames.map((_, i) => player(i + 1));
  s.tiebreakRandom = Array.from({ length: N }, (_, i) => i);
  s.courtCount = 8;
  s.rrRounds = 8;
  s.rrScheduleMode = "generated";
  const games = [];
  for (let c = 1; c <= 8; c++) {
    const base = (c - 1) * 4;
    games.push(game(c, [base + 1, base + 4], [base + 2, base + 3], 11, 5 + (c % 6)));
  }
  s.rounds = [{ round: 1, games, byes: [] }];
  s.currentRound = 1;
  return s;
}

// Setup view with the "Save to lifetime stats" toggle switched on.
export function setupLifetimeToggleState() {
  const s = baseState();
  s.saveToLifetime = true;
  return s;
}

// Setup view with mixed mode ON: per-player M/W group toggles are visible and
// the roster is imbalanced (5 Men / 3 Women) so the "some same-gender teams
// needed" warning renders with the group labels.
export function setupMixedState() {
  const s = baseState();
  s.mixedMode = true;
  s.mixedGroupLabels = { a: "Men", b: "Women" };
  s.rawGroups = ["a", "a", "a", "a", "a", "b", "b", "b"];
  return s;
}

// A fully-populated pb_lifetime_v1 store: 3 players (Ava/Ben/Cy) across 2 tournaments,
// with realistic wins/losses/finalRank/podium so the leaderboard renders with content.
// FIXED timestamps only — never Date.now().
export function lifetimeLedgerPopulated() {
  const T = 1790000000000;
  return {
    schemaVersion: 1,
    activeOwner: "local",
    ledgers: {
      local: {
        players: {
          "5550000001": { phoneKey: "5550000001", displayName: "Ava", aliases: [], firstSeenAt: T, lastSeenAt: T },
          "5550000002": { phoneKey: "5550000002", displayName: "Ben", aliases: [], firstSeenAt: T, lastSeenAt: T },
          "5550000003": { phoneKey: "5550000003", displayName: "Cy",  aliases: [], firstSeenAt: T, lastSeenAt: T },
        },
        tournaments: {
          "t1": {
            id: "t1", ownerId: "local", schemaVersion: 1,
            completedAt: T, revisedAt: T,
            format: "rr", courtCount: 2, trackedPlayerCount: 3, fieldSize: 8,
            results: [
              { phoneKey: "5550000001", name: "Ava", slot: 1, status: "active", gamesPlayed: 7, wins: 5, losses: 2, pointsFor: 71, pointDiff: 14, finalRank: 1, podium: 1, partial: false },
              { phoneKey: "5550000002", name: "Ben", slot: 2, status: "active", gamesPlayed: 7, wins: 4, losses: 3, pointsFor: 66, pointDiff: 3,  finalRank: 2, podium: 2, partial: false },
              { phoneKey: "5550000003", name: "Cy",  slot: 3, status: "active", gamesPlayed: 7, wins: 3, losses: 4, pointsFor: 60, pointDiff: -6, finalRank: 3, podium: 3, partial: false },
            ],
          },
          "t2": {
            id: "t2", ownerId: "local", schemaVersion: 1,
            completedAt: T, revisedAt: T,
            format: "rr", courtCount: 2, trackedPlayerCount: 3, fieldSize: 8,
            results: [
              { phoneKey: "5550000002", name: "Ben", slot: 1, status: "active", gamesPlayed: 6, wins: 5, losses: 1, pointsFor: 64, pointDiff: 18, finalRank: 1, podium: 1,    partial: false },
              { phoneKey: "5550000001", name: "Ava", slot: 2, status: "active", gamesPlayed: 6, wins: 4, losses: 2, pointsFor: 58, pointDiff: 9,  finalRank: 2, podium: 2,    partial: false },
              { phoneKey: "5550000003", name: "Cy",  slot: 4, status: "active", gamesPlayed: 6, wins: 2, losses: 4, pointsFor: 49, pointDiff: -8, finalRank: 5, podium: null, partial: false },
            ],
          },
        },
        sync: { lastSyncedAt: T, pendingTournamentIds: [], pendingDeletes: [] },
      },
    },
  };
}

export function stateForVisual(name) {
  if (name === "setup-desktop" || name === "setup-mobile") return setupDesktopState();
  if (name === "playing-13p-3c" || name === "settings-modal") return playing13p3cState();
  if (name === "playing-32p-8c") return playing32p8cState();
  if (name === "finals-13p-3c") return finals13p3cState();
  if (name === "text-results") return doneTextResultsState();
  if (name === "setup-lifetime-toggle") return setupLifetimeToggleState();
  if (name === "setup-mixed") return setupMixedState();
  throw new Error("Unknown visual state: " + name);
}

export function listVisualStates() {
  return ["setup-desktop", "setup-mobile", "playing-13p-3c", "settings-modal", "finals-13p-3c", "text-results", "setup-lifetime-toggle", "setup-mixed", "career-empty", "career-populated"];
}

if (process.argv[1] && process.argv[1].endsWith("visual-state-fixtures.mjs")) {
  console.log(listVisualStates().join("\n"));
}
