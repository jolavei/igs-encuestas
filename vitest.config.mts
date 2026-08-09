import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Config de pruebas (Vitest). Resolvemos el alias "@/..." igual que en la app para
// poder importar desde src sin rutas relativas largas.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    // Unitarias (puras) en src/ e integración (con base de datos) en tests/.
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
  },
});
