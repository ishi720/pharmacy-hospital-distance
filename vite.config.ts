import { defineConfig } from "vite";

export default defineConfig({
  // GitHub Pages のサブパス（/<リポジトリ名>/）でも動くよう相対パスで出力する
  base: "./",
});
