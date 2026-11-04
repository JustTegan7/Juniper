import { defineConfig } from "vitest/config";

// Only plain TypeScript in lib/ is unit tested (no react-native imports), so the node environment is enough.
export default defineConfig({ test: { include: ["lib/**/*.test.ts"], environment: "node" } });
