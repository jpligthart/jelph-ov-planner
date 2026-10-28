#!/usr/bin/env node
// Builds the api and web images for the server's CPU architecture(s) and pushes
// them to the registry. Works on macOS, Linux and Windows: npm run docker:push
// Settings come from the environment or the repo's .env:
//   IMAGE_REGISTRY   registry + namespace, e.g. registry.example.com/team (required)
//   IMAGE_TAG        default: latest
//   IMAGE_PLATFORMS  default: linux/amd64,linux/arm64
// Log in first: docker login <registry host>
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

const root = fileURLToPath(new URL("..", import.meta.url));
const envPath = fileURLToPath(new URL("../.env", import.meta.url));
// Parsed, not loaded: only the IMAGE_* keys are used.
const fileEnv = existsSync(envPath) ? parseEnv(readFileSync(envPath, "utf8")) : {};
const setting = (key) => process.env[key] || fileEnv[key] || "";

const registry = setting("IMAGE_REGISTRY").replace(/\/+$/, "");
const tag = setting("IMAGE_TAG") || "latest";
const platforms = setting("IMAGE_PLATFORMS") || "linux/amd64,linux/arm64";

if (!registry) {
  console.error("IMAGE_REGISTRY is not set (in .env or the environment).");
  process.exit(1);
}

const git = (...args) =>
  spawnSync("git", args, { cwd: root, encoding: "utf8" }).stdout?.trim() ?? "";
if (git("status", "--porcelain")) {
  console.warn("Warning: uncommitted changes are included in the images.");
}

const { version, license } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const source = "https://github.com/jpligthart/jelph-ov-planner";
const apps = {
  api: {
    title: "Jelph OV Planner API",
    description: "Route planning API for the Jelph OV Planner (NS + Transitous), with login and rate limiting.",
  },
  web: {
    title: "Jelph OV Planner Web",
    description: "Web app for the Jelph OV Planner: door-to-door public transport planning in the Netherlands.",
  },
};

// OCI metadata: as labels (image config, docker inspect) and as annotations
// on the multi-arch index and manifests (shown by registries such as zot).
function metadata(app) {
  return {
    "org.opencontainers.image.title": apps[app].title,
    "org.opencontainers.image.description": apps[app].description,
    "org.opencontainers.image.vendor": "Jelph",
    "org.opencontainers.image.authors": "Jelph (https://jelph.nl)",
    "org.opencontainers.image.url": "https://jelph.nl",
    "org.opencontainers.image.source": source,
    "org.opencontainers.image.documentation": `${source}#readme`,
    "org.opencontainers.image.licenses": license,
    "org.opencontainers.image.version": version,
    "org.opencontainers.image.revision": git("rev-parse", "HEAD"),
    "org.opencontainers.image.created": new Date().toISOString(),
  };
}

for (const app of Object.keys(apps)) {
  const image = `${registry}/ov-planner-${app}:${tag}`;
  console.log(`==> ${image} (${platforms})`);
  const meta = Object.entries(metadata(app)).flatMap(([key, value]) => [
    "--label", `${key}=${value}`,
    "--annotation", `index,manifest:${key}=${value}`,
  ]);
  const result = spawnSync(
    "docker",
    [
      "buildx", "build",
      "--platform", platforms,
      "--file", `Dockerfile.${app}`,
      "--tag", image,
      ...meta,
      "--push",
      ".",
    ],
    { cwd: root, stdio: "inherit" },
  );
  if (result.error) {
    console.error(`Could not run docker: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}
