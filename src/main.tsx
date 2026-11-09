import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { ErrorState } from "./components/ErrorState";
import { createSupabaseBrowserClient, readSupabaseConfig } from "./lib/supabase";
import "./styles/tokens.css";
import "./styles/global.css";

const root = createRoot(document.getElementById("root")!);

function createClientOrNull() {
  try {
    return createSupabaseBrowserClient(readSupabaseConfig(import.meta.env));
  } catch {
    return null;
  }
}

const client = createClientOrNull();

root.render(
  <StrictMode>
    {client ? (
      <App client={client} />
    ) : (
      <ErrorState
        title="Ours isn't configured"
        message="This build is missing its connection settings. Copy .env.example to .env.local and fill in the local values."
      />
    )}
  </StrictMode>,
);
