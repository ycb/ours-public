import type { ReactNode } from "react";

type EmptyStateProps = {
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
  headingLevel?: 1 | 2;
};

export function EmptyState({ title, children, actions, headingLevel = 2 }: EmptyStateProps) {
  const Heading = headingLevel === 1 ? "h1" : "h2";
  return (
    <section className="empty-state empty-state-inline">
      <Heading className="empty-state-title">{title}</Heading>
      {children ? <div className="empty-state-copy">{children}</div> : null}
      {actions ? <div className="state-actions state-actions-center">{actions}</div> : null}
    </section>
  );
}
