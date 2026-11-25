import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseRawLineup } from "@/domain/lineup-parser";

describe("domain/lineup-parser", () => {
  it("parses mid-dot separated blocks and strips A – D: headings", () => {
    const entries = parseRawLineup("A – D: Atlas Sound · Barker · Blackhaine");
    expect(entries).toHaveLength(3);
    expect(entries.map((e) => e.billingName)).toEqual(["Atlas Sound", "Barker", "Blackhaine"]);
    expect(entries.map((e) => e.artistNames)).toEqual([
      ["Atlas Sound"],
      ["Barker"],
      ["Blackhaine"],
    ]);
  });

  it("preserves in-name pipe in BIG|BRAVE even in tabular lines", () => {
    const entries = parseRawLineup("BIG|BRAVE | Sábado | PAARD | 23:00");
    expect(entries).toEqual([
      {
        billingName: "BIG|BRAVE",
        artistNames: ["BIG|BRAVE"],
        subtitle: null,
        day: "Sábado",
        stage: "PAARD",
        setTime: "23:00",
      },
    ]);
  });

  it("preserves names with symbols and internal apostrophes (B0YG1RL, I'A'V, L'Rain)", () => {
    const entries = parseRawLineup("B0YG1RL · I'A'V · L'Rain");
    expect(entries.map((e) => e.artistNames)).toEqual([["B0YG1RL"], ["I'A'V"], ["L'Rain"]]);
    expect(entries.every((e) => e.subtitle === null)).toBe(true);
  });

  it("extracts quoted subtitles cleanly without polluting artist names", () => {
    const entries = parseRawLineup("William Basinski 'Passing the Cup of Sorrows'");
    expect(entries[0]).toEqual({
      billingName: "William Basinski 'Passing the Cup of Sorrows'",
      artistNames: ["William Basinski"],
      subtitle: "Passing the Cup of Sorrows",
      day: null,
      stage: null,
      setTime: null,
    });
  });

  it("extracts trailing parenthetical metadata like (live AV) and (estrea mundial)", () => {
    const entries = parseRawLineup(
      "Fatima Al Qadiri (live AV)\nNeffa-T 'Complex Grooves' (estrea mundial)",
    );
    expect(entries[0]?.artistNames).toEqual(["Fatima Al Qadiri"]);
    expect(entries[0]?.subtitle).toBe("live AV");
    expect(entries[1]?.artistNames).toEqual(["Neffa-T"]);
    expect(entries[1]?.subtitle).toBe("Complex Grooves · estrea mundial");
  });

  it("splits collaborations using &, feat., ft., featuring, w/, and +", () => {
    const entries = parseRawLineup(
      [
        "Mabe Fratti & Bill Orcutt",
        "Hayden Pedigo feat. Ragazze Quartet",
        "Artist A ft. Artist B",
        "Artist C + Artist D",
        "Artist E w/ Artist F",
      ].join("\n"),
    );

    expect(entries.map((e) => e.artistNames)).toEqual([
      ["Mabe Fratti", "Bill Orcutt"],
      ["Hayden Pedigo", "Ragazze Quartet"],
      ["Artist A", "Artist B"],
      ["Artist C", "Artist D"],
      ["Artist E", "Artist F"],
    ]);
  });

  it("splits trio collaborations formatted as A, B & C", () => {
    const entries = parseRawLineup("Anna Butterss, John Raymond & Ben Lumsdaine");
    expect(entries[0]?.artistNames).toEqual(["Anna Butterss", "John Raymond", "Ben Lumsdaine"]);
  });

  it("handles Galician/Spanish/English days and stages with pipes, tabs, and em-dashes", () => {
    const entries = parseRawLineup(
      [
        "Tim Hecker & Vincent de Belleval | Venres | Grote Kerk",
        "Sarah Davachi 'The Will of Tongues'\tDomingo 11\tLutherse Kerk\t18:00",
        "Robert Henke 'FIRST LIGHT' (live AV) — Fri — Amare",
      ].join("\n"),
    );

    expect(entries[0]).toMatchObject({
      artistNames: ["Tim Hecker", "Vincent de Belleval"],
      day: "Venres",
      stage: "Grote Kerk",
    });
    expect(entries[1]).toMatchObject({
      artistNames: ["Sarah Davachi"],
      subtitle: "The Will of Tongues",
      day: "Domingo 11",
      stage: "Lutherse Kerk",
      setTime: "18:00",
    });
    expect(entries[2]).toMatchObject({
      artistNames: ["Robert Henke"],
      subtitle: "FIRST LIGHT · live AV",
      day: "Fri",
      stage: "Amare",
    });
  });

  it("strips bullets, ignores empty lines and standalone headings, and deduplicates exact rows", () => {
    const entries = parseRawLineup(
      ["", "A – D:", "• Barker", "- Barker", "* Klara Lewis", "   ", "1. Gilla Band"].join("\n"),
    );

    expect(entries.map((e) => e.billingName)).toEqual(["Barker", "Klara Lewis", "Gilla Band"]);
  });

  it("does not create a separate generic 'Ensemble' artist for '& Ensemble' billings", () => {
    const entries = parseRawLineup(
      "Carmen Villain & Ensemble 'Memoria' · Space Afrika & Ensemble 'Quiet Storm' · ML Buch Ensemble (estrea mundial)",
    );

    expect(entries[0]?.artistNames).toEqual(["Carmen Villain"]);
    expect(entries[0]?.subtitle).toBe("Memoria");
    expect(entries[1]?.artistNames).toEqual(["Space Afrika"]);
    expect(entries[1]?.subtitle).toBe("Quiet Storm");
    expect(entries[2]?.artistNames).toEqual(["ML Buch Ensemble"]);
    expect(entries[2]?.subtitle).toBe("estrea mundial");
  });

  it("parses the complete real rewire-2027-raw.txt (61 entries) and validates 15+ difficult cases", () => {
    const rawPath = path.resolve(
      import.meta.dirname,
      "../../kue-antigravity-kit/rewire-2027-raw.txt",
    );
    const rawText = readFileSync(rawPath, "utf8");
    const entries = parseRawLineup(rawText);

    expect(entries).toHaveLength(61);

    const byBilling = (needle: string) => {
      const found = entries.find((entry) => entry.billingName === needle);
      expect(found, `Expected to find billing "${needle}"`).toBeDefined();
      return found;
    };

    // 1. Trio A, B & C
    expect(byBilling("Anna Butterss, John Raymond & Ben Lumsdaine")?.artistNames).toEqual([
      "Anna Butterss",
      "John Raymond",
      "Ben Lumsdaine",
    ]);

    // 2. Alphanumeric stylized name
    expect(byBilling("B0YG1RL")?.artistNames).toEqual(["B0YG1RL"]);

    // 3. Pipe inside name
    expect(byBilling("BIG|BRAVE")?.artistNames).toEqual(["BIG|BRAVE"]);

    // 4. Accented Celtic name + collaboration
    expect(byBilling("Brìghde Chaimbeul & Colin Stetson")?.artistNames).toEqual([
      "Brìghde Chaimbeul",
      "Colin Stetson",
    ]);

    // 5. Artist & Ensemble + quoted subtitle
    expect(byBilling("Carmen Villain & Ensemble 'Memoria'")).toMatchObject({
      artistNames: ["Carmen Villain"],
      subtitle: "Memoria",
    });

    // 6. Second trio A, B & C
    expect(byBilling("Colin Stetson, Greg Fox & Trevor Dunn")?.artistNames).toEqual([
      "Colin Stetson",
      "Greg Fox",
      "Trevor Dunn",
    ]);

    // 7. Named ensemble collaboration + quoted subtitle
    expect(byBilling("Dewa Alit & Gamelan Salukat 'Baur Bentur'")).toMatchObject({
      artistNames: ["Dewa Alit", "Gamelan Salukat"],
      subtitle: "Baur Bentur",
    });

    // 8. Accented Spanish/Greek name
    expect(byBilling("Diamanda Galás")?.artistNames).toEqual(["Diamanda Galás"]);

    // 9. Parenthetical live AV
    expect(byBilling("Fatima Al Qadiri (live AV)")).toMatchObject({
      artistNames: ["Fatima Al Qadiri"],
      subtitle: "live AV",
    });

    // 10. Solo vs feat. same artist (two distinct entries linking Hayden Pedigo)
    expect(byBilling("Hayden Pedigo (solo)")).toMatchObject({
      artistNames: ["Hayden Pedigo"],
      subtitle: "solo",
    });
    expect(byBilling("Hayden Pedigo feat. Ragazze Quartet")).toMatchObject({
      artistNames: ["Hayden Pedigo", "Ragazze Quartet"],
      subtitle: null,
    });

    // 11. Multiple internal apostrophes
    expect(byBilling("I'A'V")).toMatchObject({
      artistNames: ["I'A'V"],
      subtitle: null,
    });

    // 12. Leading apostrophe name
    expect(byBilling("L'Rain")).toMatchObject({
      artistNames: ["L'Rain"],
      subtitle: null,
    });

    // 13. Quoted subtitle + parenthetical world premiere
    expect(byBilling("Neffa-T 'Complex Grooves' (estrea mundial)")).toMatchObject({
      artistNames: ["Neffa-T"],
      subtitle: "Complex Grooves · estrea mundial",
    });

    // 14. Same artist appearing twice (regular + special project with colon in quotes)
    expect(byBilling("Precious Renee Tucker")?.artistNames).toEqual(["Precious Renee Tucker"]);
    expect(byBilling("Precious Renee Tucker 'Weather Report: Proxima Centauri b'")).toMatchObject({
      artistNames: ["Precious Renee Tucker"],
      subtitle: "Weather Report: Proxima Centauri b",
    });

    // 15. Complex 5-artist collaboration + quoted subtitle + parenthetical premiere
    expect(
      byBilling(
        "Saint Abdullah, Eomac & Rebecca Salvadori 'I love you all the way up to god' feat. Charlie Hope & Abbas Zahedi (estrea mundial)",
      ),
    ).toMatchObject({
      artistNames: ["Saint Abdullah", "Eomac", "Rebecca Salvadori", "Charlie Hope", "Abbas Zahedi"],
      subtitle: "I love you all the way up to god · estrea mundial",
    });

    // 16. Third trio + lowercase artist with long quoted title
    expect(byBilling("Whitney Johnson, Lia Kohl & Macie Stewart")?.artistNames).toEqual([
      "Whitney Johnson",
      "Lia Kohl",
      "Macie Stewart",
    ]);
    expect(byBilling("yuniya edi kwon 'silver through the grass like nothing'")).toMatchObject({
      artistNames: ["yuniya edi kwon"],
      subtitle: "silver through the grass like nothing",
    });
  });
});
