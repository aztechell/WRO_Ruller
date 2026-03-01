import { promises as fs } from "node:fs";
import path from "node:path";

const rootDir = process.cwd();
const sourceDir = path.join(rootDir, "maps_scaled");
const sourceConfig = path.join(sourceDir, "config.txt");
const targetDir = path.join(rootDir, "public", "maps_scaled");
const targetScaledConfig = path.join(targetDir, "config.txt");

async function ensureSourceExists() {
  try {
    const stat = await fs.stat(sourceDir);
    if (!stat.isDirectory()) {
      throw new Error();
    }
  } catch {
    throw new Error(`Missing source directory: ${path.relative(rootDir, sourceDir)}`);
  }
}

async function listSourceFiles() {
  const entries = await fs.readdir(sourceDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".png"))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
}

async function syncConfig() {
  try {
    await fs.access(sourceConfig);
  } catch {
    throw new Error(`Missing config: ${path.relative(rootDir, sourceConfig)}`);
  }
  await fs.mkdir(targetDir, { recursive: true });
  await fs.copyFile(sourceConfig, targetScaledConfig);
}

async function main() {
  await ensureSourceExists();
  const files = await listSourceFiles();
  if (files.length === 0) {
    throw new Error("No PNG files found in maps_scaled/");
  }

  await fs.rm(targetDir, { recursive: true, force: true });
  await fs.mkdir(targetDir, { recursive: true });

  for (const filename of files) {
    const src = path.join(sourceDir, filename);
    const dest = path.join(targetDir, filename);
    await fs.copyFile(src, dest);
  }

  await syncConfig();

  console.log(`Synced ${files.length} map(s) to ${path.relative(rootDir, targetDir)}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
