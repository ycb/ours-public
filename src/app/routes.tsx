import { Navigate, type RouteObject } from "react-router-dom";
import { LegacyRedirect } from "../components/LegacyRedirect";
import { IdeasPage } from "../features/palette/IdeasPage";
import { IdeaSheet } from "../features/palette/IdeaSheet";
import { EditRedirect } from "../features/palette/ItemDetailPage";
import { NewItemPage } from "../features/palette/ItemFormPages";
import { AgreedPage, PlanPage } from "../features/palette/PlanPage";
import { AppShell } from "./AppShell";
import { AuthGate } from "./AppRouter";

export const appRoutes: RouteObject[] = [
  {
    element: <AuthGate />,
    children: [
      {
        element: <AppShell />,
        children: [
          // The Ideas tab is home (v2 Final IA).
          { index: true, element: <Navigate to="/ideas" replace /> },
          // An idea opens as a sheet over the list, which stays mounted underneath.
          { path: "ideas", element: <IdeasPage />, children: [{ path: ":itemId", element: <IdeaSheet /> }] },
          { path: "ideas/new", element: <NewItemPage /> },
          { path: "ideas/:itemId/edit", element: <EditRedirect /> },
          { path: "plan", element: <PlanPage /> },
          { path: "plan/agreed", element: <AgreedPage /> },
          { path: "palette/*", element: <LegacyRedirect /> },
          { path: "palette", element: <LegacyRedirect /> },
          { path: "experiences/*", element: <LegacyRedirect /> },
          { path: "experiences", element: <LegacyRedirect /> },
          { path: "roulette", element: <Navigate to="/plan" replace /> },
          { path: "*", element: <Navigate to="/ideas" replace /> },
        ],
      },
    ],
  },
];
