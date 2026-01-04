import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts"],
  format: "esm",
  target: "node24",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  unbundle: false,
  noExternal: [/.*/],
});
