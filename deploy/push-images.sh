#!/usr/bin/env sh
# Builds the api and web images for the server's CPU architecture(s) and pushes
# them to the registry. Settings come from the environment or the repo's .env:
#   IMAGE_REGISTRY   registry + namespace, e.g. registry.example.com/team (required)
#   IMAGE_TAG        default: latest
#   IMAGE_PLATFORMS  default: linux/amd64,linux/arm64
# Log in first: docker login <registry host>
set -eu
cd "$(dirname "$0")/.."

# Read a single key from .env without executing the file (it holds secrets).
from_env_file() {
  [ -f .env ] || return 0
  grep -E "^$1=" .env | tail -n 1 | cut -d= -f2- | sed -e 's/^["'\'']//' -e 's/["'\'']$//'
}

REGISTRY="${IMAGE_REGISTRY:-$(from_env_file IMAGE_REGISTRY)}"
TAG="${IMAGE_TAG:-$(from_env_file IMAGE_TAG)}"
PLATFORMS="${IMAGE_PLATFORMS:-$(from_env_file IMAGE_PLATFORMS)}"
TAG="${TAG:-latest}"
PLATFORMS="${PLATFORMS:-linux/amd64,linux/arm64}"

if [ -z "$REGISTRY" ]; then
  echo "IMAGE_REGISTRY is not set (in .env or the environment)." >&2
  exit 1
fi

for app in api web; do
  image="$REGISTRY/ov-planner-$app:$TAG"
  echo "==> $image ($PLATFORMS)"
  docker buildx build \
    --platform "$PLATFORMS" \
    --file "Dockerfile.$app" \
    --tag "$image" \
    --push \
    .
done
