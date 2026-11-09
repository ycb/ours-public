export function LoadingState({ label = "Opening Ours…" }: { label?: string }) {
  return (
    <div className="auth-frame">
      <p role="status" className="loading-state">
        {label}
      </p>
    </div>
  );
}
