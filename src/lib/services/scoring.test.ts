import { describe, expect, it } from "vitest";
import { calculatePoints, outcomeSign } from "./scoring";

// Oracle: opis reguĹ‚y biznesowej (3 pkt dokĹ‚adny wynik / 1 pkt trafiony
// kierunek / 0 pkt chybiony), nie kod calculatePoints pod testem.
describe("calculatePoints", () => {
  it.each([
    // [predictedHome, predictedAway, actualHome, actualAway, expectedPoints, description]
    [2, 1, 2, 1, 3, "dokĹ‚adny wynik â€” wygrana gospodarzy"],
    [1, 1, 1, 1, 3, "dokĹ‚adny wynik â€” remis"],
    [0, 2, 0, 2, 3, "dokĹ‚adny wynik â€” wygrana goĹ›ci"],
    [3, 1, 2, 0, 1, "trafiony kierunek, inny wynik â€” wygrana gospodarzy"],
    [2, 2, 1, 1, 1, "trafiony kierunek, inny wynik â€” remis:remis rĂłĹĽnymi wynikami"],
    [0, 3, 1, 2, 1, "trafiony kierunek, inny wynik â€” wygrana goĹ›ci"],
    [2, 0, 1, 1, 0, "chybiony kierunek â€” przewidziano gospodarzy, byĹ‚o remis"],
    [1, 1, 0, 1, 0, "chybiony kierunek â€” przewidziano remis, wygrali goĹ›cie"],
    [0, 1, 1, 0, 0, "chybiony kierunek â€” przewidziano goĹ›ci, wygrali gospodarze"],
  ] as const)("%i:%i vs %i:%i -> %i pkt (%s)", (predictedHome, predictedAway, actualHome, actualAway, expected) => {
    expect(calculatePoints(predictedHome, predictedAway, actualHome, actualAway)).toBe(expected);
  });
});

describe("outcomeSign", () => {
  it("zwraca 1 dla wygranej gospodarzy", () => {
    expect(outcomeSign(2, 0)).toBe(1);
  });

  it("zwraca 0 dla remisu", () => {
    expect(outcomeSign(1, 1)).toBe(0);
  });

  it("zwraca -1 dla wygranej goĹ›ci", () => {
    expect(outcomeSign(0, 2)).toBe(-1);
  });
});
