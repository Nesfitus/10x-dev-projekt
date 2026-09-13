// 1 = home win, 0 = draw, -1 = away win â€” comparable between predicted and actual.
export function outcomeSign(home: number, away: number) {
  return home > away ? 1 : home < away ? -1 : 0;
}

export function calculatePoints(predictedHome: number, predictedAway: number, actualHome: number, actualAway: number) {
  if (predictedHome === actualHome && predictedAway === actualAway) return 3;
  if (outcomeSign(predictedHome, predictedAway) === outcomeSign(actualHome, actualAway)) return 1;
  return 0;
}
