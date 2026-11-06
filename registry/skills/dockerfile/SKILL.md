---
name: kit-dockerfile
description: Write or improve Dockerfiles and compose files with multi-stage builds, pinned base images, cache-friendly layer order, a non-root user, a minimal runtime image, and a .dockerignore, verified by building the image. Use when the user asks to containerize an app, write or fix a Dockerfile or docker-compose file, or make an image smaller, faster to build, or safer. Do not use for Kubernetes manifests (use kit-kubernetes), for CI pipelines (use kit-ci-pipeline), or for running containers in production.
---

# Dockerfile

## 1. Learn the app

Find the runtime and version, package manager and lockfile, build command, start command, port, required environment variables, and files the app needs at runtime. Read any existing Dockerfile, compose file, and `.dockerignore`.

## 2. Write

- **Base images:** official or trusted images pinned to an exact version tag (or digest), matching the project's runtime version; slim or distroless variants for the runtime stage.
- **Multi-stage:** install dependencies and build in a builder stage; copy only the build output and production dependencies into the runtime stage.
- **Caching:** copy the manifest and lockfile first, install with the lockfile (`npm ci`, `pnpm install --frozen-lockfile`, `uv sync --frozen`, `go mod download`), then copy the source. Use BuildKit cache mounts if the project already does.
- **Security:** run as a non-root `USER`; never copy `.env`, credentials, or `.git` into the image or pass secrets as `ARG` or `ENV` (use BuildKit `--secret`); no package manager caches left in the final image.
- **Runtime:** exec-form `CMD` or `ENTRYPOINT` so signals reach the process, `EXPOSE` the port, a `HEALTHCHECK` if the platform uses it (distroless images have no shell or curl, so use the app binary or skip it), and production settings such as `NODE_ENV=production`.
- **.dockerignore:** exclude `node_modules`, `.venv`, build output, `.git`, `.env*`, and test artifacts.
- **Compose:** pinned images, named volumes for data, health-checked `depends_on`, and no secrets inline.

## 3. Verify

When a Dockerfile already exists, build it first to record its size and build time. Build the new image (`docker build .`) and, when possible, run it briefly to confirm it starts and answers on its port, then stop it. Report the image size, before and after when there was an earlier image. Never tag and push images to a registry unless the user asks. If Docker is unavailable, say so instead of claiming the build works.

## 4. Report

Summarize the stages, base images and why, security choices, build and run results, and the image size.

## Examples

- Use: "Containerize this FastAPI app." "Make our Node image smaller." "Fix the Dockerfile so it doesn't run as root."
- Skip: "Write the Kubernetes Deployment." (kit-kubernetes) "Add a GitHub Actions job that pushes the image." (kit-ci-pipeline)
