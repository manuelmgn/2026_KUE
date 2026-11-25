import type { ReactNode } from "react";

interface EmptyStateProps {
  title: string;
  description: string;
  action?: ReactNode;
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-start gap-4 border-b border-line px-6 py-16">
      <h2 className="font-display text-3xl font-extrabold uppercase tracking-[-0.03em]">{title}</h2>
      <p className="max-w-xl font-serif text-xl italic text-ink-muted">{description}</p>
      {action ? <div className="pt-2">{action}</div> : null}
    </div>
  );
}
