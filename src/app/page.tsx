export default function HomePage() {
  return (
    <main className="min-h-screen bg-bg text-ink">
      <header className="flex h-14 items-center border-b border-line px-6">
        <span className="font-display text-2xl font-extrabold uppercase leading-none tracking-[-0.04em]">
          KUE
        </span>
      </header>
      <section className="px-6 py-10">
        <h1 className="font-display text-[clamp(2.5rem,6vw,5.5rem)] font-extrabold uppercase leading-[0.92] tracking-[-0.03em]">
          KUE
        </h1>
        <p className="mt-3 font-serif text-xl italic text-ink-muted">Base técnica inicializada.</p>
      </section>
    </main>
  );
}
