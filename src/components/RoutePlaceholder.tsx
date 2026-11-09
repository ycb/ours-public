/** Temporary page bodies until Tasks 6–9 replace them. Content-free by design. */
export function RoutePlaceholder({ title, note }: { title: string; note: string }) {
  return (
    <section className="empty-state" aria-labelledby="page-title">
      <h1 id="page-title" className="page-title">
        {title}
      </h1>
      <p className="empty-state-copy">{note}</p>
    </section>
  );
}
