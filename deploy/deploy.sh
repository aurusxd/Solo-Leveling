#!/bin/sh
# Runs on the VPS from the deploy directory. Expects IMAGE and IMAGE_TAG in the environment
# and a .env file next to compose.yml.
set -eu

: "${IMAGE:?}"
: "${IMAGE_TAG:?}"
export IMAGE IMAGE_TAG

compose() { docker compose -f compose.yml "$@"; }

compose pull app
compose up -d --wait postgres

# The migrate service appears with the first migration (task 0.4); until then there is nothing to run.
if compose config --services | grep -qx migrate; then
	compose run --rm migrate
fi

compose up -d --remove-orphans

attempt=0
until compose exec -T app wget -qO- http://127.0.0.1:3000/api/health >/dev/null 2>&1; do
	attempt=$((attempt + 1))
	if [ "$attempt" -ge 30 ]; then
		compose logs --tail=100 app
		exit 1
	fi
	sleep 2
done

docker image prune -f >/dev/null
