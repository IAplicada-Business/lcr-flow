// Config própria de vitest, separada de vite.config.ts — aquele arquivo é
// gerenciado pelo wrapper @lovable.dev/vite-tanstack-config (comentário no
// topo dele já avisa pra não adicionar plugins/config manualmente ali).
// Mantendo os dois totalmente separados evitamos qualquer risco de
// interferir no build/dev gerenciado pela Lovable.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
