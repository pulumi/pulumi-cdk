build_sdk:: VERSION := $(shell pulumictl get version --language javascript)
build_sdk::
	yarn install && \
	yarn run build && \
	sed -i.bak -e "s/\$${VERSION}/$(VERSION)/g" ./lib/package.json && \
	rm ./lib/package.json.bak
