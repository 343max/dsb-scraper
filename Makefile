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
	docker build --progress=plain -t $(IMAGE_NAME):$(TAG) .

# Build and deploy to GHCR
deploy: build
	docker push $(IMAGE_NAME):$(TAG)

# Clean up local images
clean:
	docker rmi $(IMAGE_NAME):$(TAG) || true