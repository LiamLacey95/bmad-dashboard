interface RoutePageProps {
  title: string;
  description: string;
}

export function RoutePage({ title, description }: RoutePageProps): JSX.Element {
  return (
    <section className="space-y-2">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="text-sm text-[var(--muted-fg)]">{description}</p>
    </section>
  );
}
