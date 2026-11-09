import type { ReactNode } from "react";

type ErrorStateProps = {
  title: string;
  message: string;
  actions?: ReactNode;
};

/** Content-free failure screen: never renders record bodies, credentials, or raw errors. */
export function ErrorState({ title, message, actions }: ErrorStateProps) {
  return (
    <div className="auth-frame">
      <main id="main-content" className="auth-panel">
        <p className="wordmark auth-wordmark">Ours</p>
        <h1 className="auth-title">{title}</h1>
        <p className="auth-copy">{message}</p>
        {actions ? <div className="state-actions">{actions}</div> : null}
      </main>
    </div>
  );
}
