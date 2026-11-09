import { configDefaults, defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    // Playwright owns e2e/; vitest would otherwise collect its *.spec.ts files.
    exclude: [...configDefaults.exclude, "e2e/**"],
  },
});
