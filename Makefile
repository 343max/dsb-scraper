# Variables
REGISTRY = ghcr.io
REPO_OWNER = $(shell git config --get remote.origin.url | sed 's/.*github.com[:/]\([^/]*\).*/\1/')
REPO_NAME = $(shell basename `git rev-parse --show-toplevel`)
IMAGE_NAME = $(REGISTRY)/$(REPO_OWNER)/$(REPO_NAME)
TAG = latest

.PHONY: build push login clean help

# Default target
all: build

# Build the Docker image
build:
	docker build -t $(IMAGE_NAME):$(TAG) .

# Build and deploy to GHCR
deploy: build
	echo "$$GITHUB_TOKEN" | docker login $(REGISTRY) -u $(REPO_OWNER) --password-stdin
	docker push $(IMAGE_NAME):$(TAG)

# Deploy using GitHub CLI (alternative to deploy)
gh-deploy: build
	gh auth token | docker login $(REGISTRY) -u $(shell gh api user --jq .login) --password-stdin
	docker push $(IMAGE_NAME):$(TAG)

# Check GitHub token scopes
check-token:
	@echo "Checking GitHub token scopes..."
	@curl -H "Authorization: token $$GITHUB_TOKEN" https://api.github.com/user -I 2>/dev/null | grep -i x-oauth-scopes || echo "Could not retrieve token scopes"

# Check GitHub CLI token scopes
check-gh-token:
	@echo "Checking GitHub CLI token scopes..."
	@gh api user -I 2>/dev/null | grep -i x-oauth-scopes || echo "Could not retrieve token scopes"

# Clean up local images
clean:
	docker rmi $(IMAGE_NAME):$(TAG) || true

# Show help
help:
	@echo "Available targets:"
	@echo "  build         - Build the Docker image"
	@echo "  deploy        - Build and push to GHCR"
	@echo "  gh-deploy     - Build and push using GitHub CLI"
	@echo "  check-token   - Check GitHub token scopes"
	@echo "  check-gh-token - Check GitHub CLI token scopes"
	@echo "  clean         - Remove local Docker image"
	@echo "  help    - Show this help message"
	@echo ""
	@echo "Image will be tagged as: $(IMAGE_NAME):$(TAG)"