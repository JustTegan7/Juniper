import { defineConfig } from "vitest/config";
export default defineConfig({ test: { include: ["*.test.ts", "lib/**/*.test.ts"], exclude: ["e2e/**", "node_modules/**"] } });
