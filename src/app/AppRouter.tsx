import { Navigate, Outlet, useLocation } from "react-router-dom";
import { ErrorState } from "../components/ErrorState";
import { LoadingState } from "../components/LoadingState";
import { AlphaSignIn } from "../features/auth/AlphaSignIn";
import { useAuth } from "../features/auth/authContext";
import { CurrentMemberContext } from "../features/auth/currentMemberContext";
import { SignOutButton } from "../features/auth/SignOutButton";
import { useCurrentMember } from "../features/auth/useCurrentMember";
import { MemberMappingError } from "../lib/errors";

function MemberBoundary() {
  const member = useCurrentMember();

  if (member.isPending) {
    return <LoadingState />;
  }

  if (member.isError) {
    if (member.error instanceof MemberMappingError) {
      return (
        <ErrorState
          title="This account isn't set up yet"
          message="Ours couldn't match this sign-in to a partner profile. Ask the person who set up Ours to finish account setup."
          actions={<SignOutButton className="button-primary" />}
        />
      );
    }
    return (
      <ErrorState
        title="Ours couldn't load"
        message="Something went wrong while opening your space. Check your connection and try again."
        actions={
          <>
            <button type="button" className="button-primary" onClick={() => void member.refetch()}>
              Try again
            </button>
            <SignOutButton />
          </>
        }
      />
    );
  }

  return (
    <CurrentMemberContext.Provider value={member.data}>
      <Outlet />
    </CurrentMemberContext.Provider>
  );
}

/**
 * Root route. Private routes render only with a valid session AND a validated member row.
 * Keying the private tree by user id guarantees nothing from one identity survives into the next.
 */
export function AuthGate() {
  const { status, userId } = useAuth();
  const location = useLocation();

  if (status === "loading" || status === "signing_out") {
    return <LoadingState />;
  }

  if (status === "signed_out") {
    // Drop any private path and router state rather than carrying it to the next identity.
    if (location.pathname !== "/" || location.search || location.hash || location.state) {
      return <Navigate to="/" replace state={null} />;
    }
    return <AlphaSignIn />;
  }

  return <MemberBoundary key={userId} />;
}
