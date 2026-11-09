import { Navigate, useLocation, useParams } from "react-router-dom";

/**
 * Old names for Ideas: "Palette" (until 2026-10-25) and "Experiences" (until 2026-10-26).
 * Old links keep working. The old ?view= values are dropped (the views were replaced).
 */
export function LegacyRedirect() {
  const { "*": rest = "" } = useParams();
  const location = useLocation();
  const search = new URLSearchParams(location.search);
  search.delete("view");
  const query = search.toString();
  return (
    <Navigate
      to={{ pathname: rest ? `/ideas/${rest}` : "/ideas", search: query ? `?${query}` : "" }}
      state={location.state}
      replace
    />
  );
}
