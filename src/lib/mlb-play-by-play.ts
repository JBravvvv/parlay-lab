/** Public MLB Stats API /game/{gamePk}/playByPlay. Missing values stay missing. */
export type MlbPitch = {
  id: string;
  number: number | null;
  result: string | null;
  type: string | null;
  speed: number | null;
  balls: number | null;
  strikes: number | null;
};
export type MlbPlay = {
  id: string;
  index: number | null;
  inning: number | null;
  half: "top" | "bottom" | null;
  complete: boolean;
  scoring: boolean;
  event: string | null;
  description: string | null;
  awayScore: number | null;
  homeScore: number | null;
  batter: string | null;
  pitcher: string | null;
  balls: number | null;
  strikes: number | null;
  outs: number | null;
  pitches: MlbPitch[];
};
export type MlbPlaysPayload = {
  pk: number;
  fetchedAt: string;
  plays: MlbPlay[];
  current: MlbPlay | null;
};

type ObjectValue = Record<string, unknown>;
function object(value: unknown): ObjectValue {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as ObjectValue : {};
}
function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
function number(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
function shapePlay(value: unknown, fallback: string, scoringIndices: Set<number>): MlbPlay | null {
  const p = object(value);
  if (!Object.keys(p).length) return null;
  const about = object(p.about), result = object(p.result), matchup = object(p.matchup), count = object(p.count);
  const index = number(about.atBatIndex);
  const pitchEvents = Array.isArray(p.playEvents) ? p.playEvents : [];
  const half = about.halfInning === "top" || about.halfInning === "bottom" ? about.halfInning : null;
  return {
    id: index === null ? fallback : `at-bat-${index}`,
    index,
    inning: number(about.inning),
    half,
    complete: about.isComplete === true,
    scoring: about.isScoringPlay === true || (index !== null && scoringIndices.has(index)),
    event: text(result.event),
    description: text(result.description),
    awayScore: number(result.awayScore),
    homeScore: number(result.homeScore),
    batter: text(object(matchup.batter).fullName),
    pitcher: text(object(matchup.pitcher).fullName),
    balls: number(count.balls),
    strikes: number(count.strikes),
    outs: number(count.outs),
    pitches: pitchEvents.flatMap((raw, i) => {
      const pitch = object(raw);
      if (pitch.isPitch !== true) return [];
      const details = object(pitch.details), pitchCount = object(pitch.count);
      return [{
        id: text(pitch.playId) ?? `pitch-${number(pitch.index) ?? i}`,
        number: number(pitch.pitchNumber),
        result: text(details.description) ?? text(object(details.call).description),
        type: text(object(details.type).description),
        speed: number(object(pitch.pitchData).startSpeed),
        balls: number(pitchCount.balls),
        strikes: number(pitchCount.strikes),
      }];
    }),
  };
}

export function shapeMlbPlays(pk: number, value: unknown, fetchedAt: string): MlbPlaysPayload {
  const data = object(value);
  if (!Array.isArray(data.allPlays)) throw new Error("MLB play-by-play feed is incomplete");
  const scoringIndices = new Set<number>(Array.isArray(data.scoringPlays) ? data.scoringPlays.filter((i): i is number => typeof i === "number") : []);
  const plays = data.allPlays.flatMap((p, i) => {
    const play = shapePlay(p, `play-${i}`, scoringIndices);
    return play ? [play] : [];
  });
  return { pk, fetchedAt, plays, current: shapePlay(data.currentPlay, "current", scoringIndices) };
}
