"use client";

import Link from "next/link";
import { useState } from "react";
import { createFestivalAction } from "@/actions/festival-actions";
import { importLineupAction } from "@/actions/import-actions";
import type { FestivalSummary } from "@/components/features/types";
import { HairlineButton } from "@/components/ui/HairlineButton";
import { parseRawLineup } from "@/domain/lineup-parser";

interface RawImporterProps {
  festivals: FestivalSummary[];
  initialFestivalId: string | null;
}

interface EditableRow {
  key: string;
  included: boolean;
  billingName: string;
  artistsCsv: string;
  subtitle: string;
  day: string;
  stage: string;
  setTime: string;
}

export function RawImporter({ festivals: initialFestivals, initialFestivalId }: RawImporterProps) {
  const [festivals, setFestivals] = useState<FestivalSummary[]>(initialFestivals);
  const [selectedFestivalId, setSelectedFestivalId] = useState<string>(
    initialFestivalId ?? initialFestivals[0]?.id ?? "",
  );
  const [showNewFestival, setShowNewFestival] = useState(initialFestivals.length === 0);
  const [newFestName, setNewFestName] = useState("Rewire");
  const [newFestYear, setNewFestYear] = useState("2027");
  const [newFestLocation, setNewFestLocation] = useState("La Haya · 8–11 abril 2027");
  const [creatingFestival, setCreatingFestival] = useState(false);

  const [rawText, setRawText] = useState("");
  const [rows, setRows] = useState<EditableRow[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultSummary, setResultSummary] = useState<{
    createdEntriesCount: number;
    newArtistsCount: number;
    festivalSlug: string;
  } | null>(null);

  const handleCreateFestival = async () => {
    setCreatingFestival(true);
    setError(null);
    try {
      const created = await createFestivalAction({
        name: newFestName,
        year: Number(newFestYear),
        location: newFestLocation || undefined,
      });
      setFestivals((prev) => [created, ...prev]);
      setSelectedFestivalId(created.id);
      setShowNewFestival(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "No se pudo crear el festival");
    } finally {
      setCreatingFestival(false);
    }
  };

  const handleParse = () => {
    setError(null);
    setResultSummary(null);
    const parsed = parseRawLineup(rawText);
    setRows(
      parsed.map((item, idx) => ({
        key: `${idx}-${item.billingName}`,
        included: true,
        billingName: item.billingName,
        artistsCsv: item.artistNames.join(", "),
        subtitle: item.subtitle ?? "",
        day: item.day ?? "",
        stage: item.stage ?? "",
        setTime: item.setTime ?? "",
      })),
    );
  };

  const updateRow = (index: number, patch: Partial<EditableRow>) => {
    setRows((prev) => prev.map((row, idx) => (idx === index ? { ...row, ...patch } : row)));
  };

  const handleConfirmImport = async () => {
    if (!selectedFestivalId) {
      setError("Selecciona o crea un festival antes de importar.");
      return;
    }

    const includedRows = rows
      .filter((row) => row.included && row.billingName.trim().length > 0)
      .map((row) => ({
        billingName: row.billingName.trim(),
        artistNames: row.artistsCsv
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        subtitle: row.subtitle.trim() || null,
        day: row.day.trim() || null,
        stage: row.stage.trim() || null,
        setTime: row.setTime.trim() || null,
        included: true,
      }))
      .filter((row) => row.artistNames.length > 0);

    if (includedRows.length === 0) {
      setError("No hay filas válidas seleccionadas para importar.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const res = await importLineupAction({
        festivalId: selectedFestivalId,
        rows: includedRows,
      });
      const targetFest = festivals.find((f) => f.id === selectedFestivalId);
      setResultSummary({
        createdEntriesCount: res.createdEntriesCount,
        newArtistsCount: res.newArtistsCount,
        festivalSlug: targetFest?.slug ?? "",
      });
      setRows([]);
      setRawText("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error guardando el cartel");
    } finally {
      setSubmitting(false);
    }
  };

  const includedCount = rows.filter((r) => r.included).length;

  return (
    <main className="mx-auto flex max-w-[1160px] flex-col gap-6 px-6 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-6">
        <div>
          <h1 className="font-display text-[clamp(2rem,5vw,3.4rem)] font-extrabold uppercase leading-[0.95] tracking-[-0.03em]">
            Importador en bruto
          </h1>
          <p className="mt-2 font-serif text-[1.25rem] italic text-ink-muted">
            Pega un anuncio o tabla de cartel. Separa colaboraciones, subtítulos, días y escenarios
            sin APIs de pago.
          </p>
        </div>

        <div className="flex items-stretch border border-line">
          {festivals.length > 0 ? (
            <select
              aria-label="Festival de destino"
              value={selectedFestivalId}
              onChange={(event) => setSelectedFestivalId(event.target.value)}
              className="cursor-pointer bg-bg px-4 py-2.5 font-mono text-xs uppercase tracking-[0.06em] text-ink outline-none"
            >
              {festivals.map((fest) => (
                <option key={fest.id} value={fest.id} className="bg-bg text-ink">
                  {fest.name} {fest.year}
                </option>
              ))}
            </select>
          ) : null}
          <HairlineButton
            variant={showNewFestival ? "inverted" : "default"}
            size="md"
            onClick={() => setShowNewFestival((prev) => !prev)}
            className="border-0 border-l border-line"
          >
            + Nuevo festival
          </HairlineButton>
        </div>
      </div>

      {showNewFestival ? (
        <section className="grid grid-cols-1 gap-3 border border-line bg-surface p-4 sm:grid-cols-[2fr_100px_2fr_auto]">
          <input
            type="text"
            value={newFestName}
            onChange={(event) => setNewFestName(event.target.value)}
            placeholder="Nombre (ej. Rewire)"
            aria-label="Nombre del festival"
            className="border border-line bg-bg px-3 py-2 font-sans text-sm text-ink outline-none focus:border-acid"
          />
          <input
            type="number"
            value={newFestYear}
            onChange={(event) => setNewFestYear(event.target.value)}
            placeholder="Año"
            aria-label="Año del festival"
            className="border border-line bg-bg px-3 py-2 font-mono text-sm text-ink outline-none focus:border-acid"
          />
          <input
            type="text"
            value={newFestLocation}
            onChange={(event) => setNewFestLocation(event.target.value)}
            placeholder="Ubicación / fechas"
            aria-label="Ubicación del festival"
            className="border border-line bg-bg px-3 py-2 font-sans text-sm text-ink outline-none focus:border-acid"
          />
          <HairlineButton
            variant="acid"
            size="md"
            disabled={creatingFestival}
            onClick={() => void handleCreateFestival()}
          >
            {creatingFestival ? "Creando..." : "Crear"}
          </HairlineButton>
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <textarea
          value={rawText}
          onChange={(event) => setRawText(event.target.value)}
          placeholder={
            "Tim Hecker & Vincent de Belleval | Viernes 09 | Grote Kerk\nWilliam Basinski 'Passing the Cup of Sorrows' | Sábado 10 | Amare\nBIG|BRAVE | Sábado 10 | PAARD"
          }
          aria-label="Texto del cartel en bruto"
          className="min-h-[190px] w-full resize-y border border-line bg-surface p-4 font-mono text-[0.82rem] leading-relaxed text-ink placeholder:text-ink-muted focus:border-acid focus:outline-none"
        />

        <div className="flex flex-wrap items-center gap-3">
          <HairlineButton variant="acid" size="md" onClick={handleParse}>
            Analizar texto →
          </HairlineButton>
          {rows.length > 0 ? (
            <span className="font-mono text-xs uppercase text-ink-muted">
              {includedCount} de {rows.length} filas listas
            </span>
          ) : null}
        </div>
      </section>

      {error ? (
        <div role="alert" className="border border-line bg-surface p-3 font-mono text-xs text-ink">
          {error}
        </div>
      ) : null}

      {resultSummary ? (
        <div className="flex flex-wrap items-center justify-between gap-4 border border-acid bg-surface p-4">
          <div className="font-mono text-xs uppercase">
            Importadas {resultSummary.createdEntriesCount} entradas ({resultSummary.newArtistsCount}{" "}
            artistas nuevos en cola de enriquecimiento).
          </div>
          <Link
            href={
              resultSummary.festivalSlug
                ? `/?festival=${encodeURIComponent(resultSummary.festivalSlug)}`
                : "/"
            }
            className="border border-acid bg-acid px-4 py-2 font-mono text-xs font-semibold uppercase text-acid-ink"
          >
            Ver cartel →
          </Link>
        </div>
      ) : null}

      {rows.length > 0 ? (
        <section className="flex flex-col gap-4">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="font-mono text-[0.72rem] uppercase text-ink-muted">
                  <th className="w-10 border border-line p-2.5 text-center">Inc.</th>
                  <th className="border border-line p-2.5 text-left">Nombre en cartel</th>
                  <th className="border border-line p-2.5 text-left">Artistas a vincular</th>
                  <th className="border border-line p-2.5 text-left">Subtítulo</th>
                  <th className="border border-line p-2.5 text-left">Día</th>
                  <th className="border border-line p-2.5 text-left">Escenario</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <tr key={row.key} className={row.included ? "" : "opacity-40"}>
                    <td className="border border-line p-2 text-center">
                      <input
                        type="checkbox"
                        checked={row.included}
                        aria-label={`Incluir ${row.billingName}`}
                        onChange={(event) => updateRow(idx, { included: event.target.checked })}
                        className="h-4 w-4 cursor-pointer accent-acid"
                      />
                    </td>
                    <td className="border border-line p-1.5">
                      <input
                        type="text"
                        value={row.billingName}
                        onChange={(event) => updateRow(idx, { billingName: event.target.value })}
                        className="w-full bg-transparent px-1.5 py-1 font-sans font-semibold text-ink outline-none focus:bg-surface"
                      />
                    </td>
                    <td className="border border-line p-1.5">
                      <input
                        type="text"
                        value={row.artistsCsv}
                        onChange={(event) => updateRow(idx, { artistsCsv: event.target.value })}
                        className="w-full bg-transparent px-1.5 py-1 font-mono text-xs text-ink outline-none focus:bg-surface"
                      />
                    </td>
                    <td className="border border-line p-1.5">
                      <input
                        type="text"
                        value={row.subtitle}
                        onChange={(event) => updateRow(idx, { subtitle: event.target.value })}
                        placeholder="—"
                        className="w-full bg-transparent px-1.5 py-1 font-serif text-base italic text-ink outline-none focus:bg-surface"
                      />
                    </td>
                    <td className="border border-line p-1.5">
                      <input
                        type="text"
                        value={row.day}
                        onChange={(event) => updateRow(idx, { day: event.target.value })}
                        placeholder="—"
                        className="w-28 bg-transparent px-1.5 py-1 font-mono text-xs text-ink outline-none focus:bg-surface"
                      />
                    </td>
                    <td className="border border-line p-1.5">
                      <input
                        type="text"
                        value={row.stage}
                        onChange={(event) => updateRow(idx, { stage: event.target.value })}
                        placeholder="—"
                        className="w-28 bg-transparent px-1.5 py-1 font-mono text-xs text-ink outline-none focus:bg-surface"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end">
            <HairlineButton
              variant="acid"
              size="md"
              disabled={submitting || includedCount === 0}
              onClick={() => void handleConfirmImport()}
            >
              {submitting ? "Importando..." : `Importar ${includedCount} entradas`}
            </HairlineButton>
          </div>
        </section>
      ) : null}
    </main>
  );
}
