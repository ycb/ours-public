import { useAuth } from "./authContext";

export function SignOutButton({ className = "button-quiet" }: { className?: string }) {
  const { signOut } = useAuth();
  return (
    <button type="button" className={className} onClick={() => void signOut()}>
      Sign out
    </button>
  );
}
