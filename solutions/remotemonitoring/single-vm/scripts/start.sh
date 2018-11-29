#!/bin/bash -e

cd /app

source "env-vars"

COL_NO="\033[0m" # no color
COL_ERR="\033[1;31m" # light red

APP_PATH="/app"
WEBUICONFIG="${APP_PATH}/webui-config.js"
WEBUICONFIG_SAFE="${APP_PATH}/webui-config.js.safe"
WEBUICONFIG_UNSAFE="${APP_PATH}/webui-config.js.unsafe"

rm -f ${WEBUICONFIG}
cp -p ${WEBUICONFIG_SAFE} ${WEBUICONFIG}

if [[ "$1" == "--unsafe" ]]; then
  echo -e "${COL_ERR}WARNING! Starting services in UNSAFE mode!${COL_NO}"
  # Disable Auth
  export PCS_AUTH_REQUIRED="false"
  # Allow cross-origin requests from anywhere
  export PCS_CORS_WHITELIST="{ 'origins': ['*'], 'methods': ['*'], 'headers': ['*'] }"

  rm -f ${WEBUICONFIG}
  cp -p ${WEBUICONFIG_UNSAFE} ${WEBUICONFIG}
fi

list=$(docker ps -aq)
if [ -n "$list" ]; then
  docker rm -f $list
fi

# Retry multiple times to pull all docker images before running all containers
# in case docker hub has transient problem of image availability.
retry_docker_compose_pull() {
  set +e
  max_retries=${1:-100}
  n=0
  docker-compose pull
  while [[ $? -ne 0 && $n -lt $max_retries ]]; do
    n=$(($n+1))
    echo "Retrying($n) to pull all images..."
    sleep 3
    docker-compose pull
  done
  set -e
}

retry_docker_compose_pull

nohup docker-compose up > /dev/null 2>&1&

ISUP=$(curl -ks https://localhost/ | grep -i "html" | wc -l)
while [[ "$ISUP" == "0" ]]; do
  echo "Waiting for web site to start..."
  sleep 3
  ISUP=$(curl -ks https://localhost/ | grep -i "html" | wc -l)
done
