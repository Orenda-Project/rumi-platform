import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
// @ts-expect-error - CommonJS module shared with the Jest test suite
import { assertAppBuildConfig } from "./src/lib/app-build-guard.cjs";

// https://vitejs.dev/config/
export default defineConfig(async ({ mode }) => {
  // `--mode app` (npm run build:app) is the bundle the Android app ships; it
  // must carry an absolute https API url or it white-screens on launch.
  assertAppBuildConfig({ mode, env: loadEnv(mode, process.cwd(), "") });

  return {
    server: {
      host: "::",
      port: 8080,
    },
    // The component tagger is a dev-server aid and a devDependency. Imported
    // only for a development build, so a production install
    // (npm ci --omit=dev) can still run `npm run build`.
    plugins: [
      react(),
      mode === "development" && (await import("lovable-tagger")).componentTagger(),
    ].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
