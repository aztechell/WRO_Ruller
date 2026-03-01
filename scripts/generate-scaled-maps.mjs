import { promises as fs } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const scales = [25, 50, 75, 100];
const rootDir = process.cwd();
const sourceMapsDir = path.join(rootDir, "maps");
const publicMapsDir = path.join(rootDir, "public", "maps");
const scaledRootDir = path.join(publicMapsDir, "scaled");

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function copyConfigIfPresent() {
  const srcConfig = path.join(sourceMapsDir, "config.txt");
  const destConfig = path.join(publicMapsDir, "config.txt");
  try {
    await fs.access(srcConfig);
  } catch {
    return;
  }
  await ensureDir(publicMapsDir);
  await fs.copyFile(srcConfig, destConfig);
  console.log(`Copied config: ${path.relative(rootDir, destConfig)}`);
}

async function listPngFiles() {
  const entries = await fs.readdir(sourceMapsDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".png"))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
}

async function generateScaledFile(filename, scalePercent) {
  const srcPath = path.join(sourceMapsDir, filename);
  const outPath = path.join(scaledRootDir, String(scalePercent), filename);
  await ensureDir(path.dirname(outPath));

  if (scalePercent === 100) {
    await fs.copyFile(srcPath, outPath);
    return outPath;
  }

  const image = sharp(srcPath);
  const metadata = await image.metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error(`Cannot read dimensions for ${filename}`);
  }

  const targetWidth = Math.max(1, Math.round((metadata.width * scalePercent) / 100));
  const targetHeight = Math.max(1, Math.round((metadata.height * scalePercent) / 100));

  await image
    .resize({
      width: targetWidth,
      height: targetHeight,
      fit: "fill",
      kernel: sharp.kernel.lanczos3,
    })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(outPath);

  return outPath;
}

async function main() {
  await ensureDir(scaledRootDir);
  await copyConfigIfPresent();

  const files = await listPngFiles();
  if (files.length === 0) {
    console.log("No PNG files found in maps/");
    return;
  }

  for (const filename of files) {
    console.log(`Processing ${filename}`);
    for (const scale of scales) {
      const outputPath = await generateScaledFile(filename, scale);
      console.log(`  ${scale}% -> ${path.relative(rootDir, outputPath)}`);
    }
  }

  console.log("Scaled map generation complete.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
