import { defineConfig } from "vite";

const base = process.env.VITE_BASE ?? "/WRO_Ruller/";

export default defineConfig({
  base,
});
