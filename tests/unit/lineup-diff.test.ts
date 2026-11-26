import { describe, expect, it } from "vitest";
import { computeLineupDiff, hasPendingDiffChanges } from "@/domain/lineup-diff";

describe("computeLineupDiff", () => {
  it("detects new entries, fills empty schedule fields, and flags missing entries without deleting", () => {
    const existing = [
      {
        id: "e1",
        billingName: "Mabe Fratti",
        subtitle: null,
        day: null,
        stage: null,
        setTime: null,
        artistNames: ["Mabe Fratti"],
      },
      {
        id: "e2",
        billingName: "William Basinski",
        subtitle: "Disintegration Loops",
        day: "Friday",
        stage: "Amare",
        setTime: "21:00",
        artistNames: ["William Basinski"],
      },
      {
        id: "e3",
        billingName: "Cancelled Act",
        subtitle: null,
        day: null,
        stage: null,
        setTime: null,
        artistNames: ["Cancelled Act"],
      },
    ];

    const incoming = [
      {
        billingName: "Mabe Fratti",
        artistNames: ["Mabe Fratti"],
        subtitle: "live",
        day: "Saturday",
        stage: "Paard",
        setTime: "22:30",
      },
      {
        billingName: "William Basinski",
        artistNames: ["William Basinski"],
        subtitle: "Different Subtitle",
        day: "Sunday",
        stage: "Other Stage",
        setTime: "23:00",
      },
      {
        billingName: "Autechre",
        artistNames: ["Autechre"],
        subtitle: "live AV",
        day: "Friday",
        stage: "Amare",
        setTime: "23:30",
      },
    ];

    const diff = computeLineupDiff(existing, incoming);

    expect(hasPendingDiffChanges(diff)).toBe(true);
    expect(diff.added).toHaveLength(1);
    expect(diff.added[0]?.billingName).toBe("Autechre");

    // Only fills previously empty fields (e1), never overwrites existing values (e2)
    expect(diff.updated).toEqual([
      {
        entryId: "e1",
        billingName: "Mabe Fratti",
        changes: {
          subtitle: "live",
          day: "Saturday",
          stage: "Paard",
          setTime: "22:30",
        },
      },
    ]);

    expect(diff.missing).toEqual([{ entryId: "e3", billingName: "Cancelled Act" }]);
  });

  it("matches collaborations by normalized artist set even when punctuation differs", () => {
    const existing = [
      {
        id: "e1",
        billingName: "Mabe Fratti & Bill Orcutt",
        subtitle: null,
        day: null,
        stage: null,
        setTime: null,
        artistNames: ["Mabe Fratti", "Bill Orcutt"],
      },
    ];

    const incoming = [
      {
        billingName: "Bill Orcutt + Mabe Fratti",
        artistNames: ["Bill Orcutt", "Mabe Fratti"],
        subtitle: null,
        day: "Friday",
        stage: null,
        setTime: null,
      },
    ];

    const diff = computeLineupDiff(existing, incoming);
    expect(diff.added).toHaveLength(0);
    expect(diff.missing).toHaveLength(0);
    expect(diff.updated).toEqual([
      {
        entryId: "e1",
        billingName: "Mabe Fratti & Bill Orcutt",
        changes: { day: "Friday" },
      },
    ]);
  });
});
