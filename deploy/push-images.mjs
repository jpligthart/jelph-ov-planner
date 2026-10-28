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

for (const app of ["api", "web"]) {
  const image = `${registry}/ov-planner-${app}:${tag}`;
  console.log(`==> ${image} (${platforms})`);
  const result = spawnSync(
    "docker",
    [
      "buildx", "build",
      "--platform", platforms,
      "--file", `Dockerfile.${app}`,
      "--tag", image,
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
