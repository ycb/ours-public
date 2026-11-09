import { useState } from "react";
import { RouterProvider, createBrowserRouter } from "react-router-dom";
import { AppProviders } from "./app/AppProviders";
import { appRoutes } from "./app/routes";
import type { OursSupabaseClient } from "./lib/supabase";

function App({ client }: { client: OursSupabaseClient }) {
  const [router] = useState(() => createBrowserRouter(appRoutes));
  return (
    <AppProviders client={client}>
      <RouterProvider router={router} />
    </AppProviders>
  );
}

export default App;
