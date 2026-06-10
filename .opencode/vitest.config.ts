import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["../core/sanitizer/tests/**/*.test.ts"],
  },
});
