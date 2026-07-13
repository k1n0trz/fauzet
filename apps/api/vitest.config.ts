import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Persistent integration files share one PostgreSQL database and exercise
    // global economic configuration transitions. Running those files in
    // parallel would make one suite observe another suite's temporary config.
    fileParallelism: process.env.RUN_INTEGRATION !== "true",
  },
});
