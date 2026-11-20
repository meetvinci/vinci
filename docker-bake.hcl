# Every Vinci image from deploy/docker/Dockerfile in one Bake run, so the shared build stage is built once.
# CI (.github/workflows/images.yml) builds it per architecture; by hand, `docker buildx bake --print` shows the plan.
# The list matches `targets` in scripts/deploy.ts.

variable "TARGETS" {
  type    = list(string)
  default = ["daemon", "sandbox", "web", "hub", "provisioner", "firewall"]
}

# Where the images live, without a trailing slash (for example registry.example.com/vinci). Empty names them
# vinci-<target> as `bun run build:images` does.
variable "REGISTRY" {
  default = ""
}

variable "TAG" {
  default = "latest"
}

# A GitHub Actions cache scope prefix such as amd64. Empty uses no cache. Each image gets its own scope, so the six
# exports do not overwrite each other.
variable "CACHE_SCOPE" {
  default = ""
}

# true pushes each image by digest to REGISTRY, untagged; CI then joins the architectures under the release tags.
# false keeps the result in the build cache only.
variable "PUSH_BY_DIGEST" {
  type    = bool
  default = false
}

group "default" {
  targets = TARGETS
}

target "image" {
  name       = t
  matrix     = { t = TARGETS }
  context    = "."
  dockerfile = "deploy/docker/Dockerfile"
  target     = t
  tags       = PUSH_BY_DIGEST ? [] : ["${REGISTRY == "" ? "" : "${REGISTRY}/"}vinci-${t}:${TAG}"]
  output = PUSH_BY_DIGEST ? [
    "type=image,name=${REGISTRY}/vinci-${t},push-by-digest=true,name-canonical=true,push=true"
  ] : ["type=cacheonly"]
  cache-from = CACHE_SCOPE == "" ? [] : ["type=gha,scope=${CACHE_SCOPE}-${t}"]
  cache-to   = CACHE_SCOPE == "" ? [] : ["type=gha,scope=${CACHE_SCOPE}-${t},mode=max"]
}
