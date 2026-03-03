# Used as a postUpgradeTask by Renovate. See ./renovate.json5.
.PHONY: help install build build-full build-ci docs lint lint-fix format format-check test test-fast test-update-snapshots test-examples verify renovate

help:
	@grep -E '^[a-zA-Z_-]+:.*## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*## "}; {printf "  %-24s %s\n", $$1, $$2}'

install: ## Install project dependencies
	yarn install --frozen-lockfile

build: ## Compile TypeScript (no side effects)
	yarn run build

build-full: ## Build docs, format, and autofix lint
	yarn run build:full

build-ci: ## Build using CI-safe check flow
	yarn run build:ci

docs: ## Regenerate API docs
	yarn run docs

lint: ## Run lint checks
	yarn run lint:check

lint-fix: ## Run lint with autofix
	yarn run lint:fix

format: ## Format source files
	yarn run format

format-check: ## Check formatting only
	yarn run format:check

test: ## Run unit tests
	yarn run test

test-fast: ## Run fast targeted unit tests
	yarn run test:fast

test-update-snapshots: ## Run unit tests and update snapshots
	yarn run test:update-snapshots

test-examples: ## Run example/integration acceptance tests
	yarn run test-examples

verify: ## Fast local verification
	yarn run verify

renovate: ## Refresh aws-native metadata using pinned dependency version
	VERSION=$(shell cat package.json | jq -r '.devDependencies["@pulumi/aws-native"]'); \
	curl -L https://raw.githubusercontent.com/pulumi/pulumi-aws-native/refs/tags/v$${VERSION}/provider/cmd/pulumi-resource-aws-native/metadata.json -o schemas/aws-native-metadata.json
