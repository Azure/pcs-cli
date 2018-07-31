#!/bin/bash -e

cd /app

echo

docker-compose ps

COL_NO="\033[0m" # no color
COL_MARK="\033[1;33m" # yellow

echo -e "\n${COL_MARK}Run ./logs.sh <service name> to see the logs of a service.${COL_NO}"
