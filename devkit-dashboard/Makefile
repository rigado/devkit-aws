BUCKET="s3://rigado-devkit-dashboard"

deps:
	scripts/check_deps.sh

compile: deps
	npm install
	grunt

deploy: compile
	aws s3 cp index.html $(BUCKET) --acl public-read
	aws s3 cp rigado.json $(BUCKET) --acl public-read
	aws s3 cp --recursive js $(BUCKET)/js --acl public-read
	aws s3 cp --recursive css $(BUCKET)/css --acl public-read
	aws s3 cp --recursive img $(BUCKET)/img --acl public-read
	aws s3 cp --recursive plugins $(BUCKET)/plugins --acl public-read
index:
	aws s3 cp index.html $(BUCKET) --acl public-read
	aws s3 cp rigado.json $(BUCKET) --acl public-read
