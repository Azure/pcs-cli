#!/bin/bash -e

cd /app

if [[ "$1" == "" ]]; then
  docker-compose logs
else
  docker logs -f --tail 100 $1
fi
