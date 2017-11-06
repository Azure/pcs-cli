#!/bin/bash -e

cd /app

echo "Starting simulation..."
ISUP=$(docker exec -it app_devicesimulation_1 curl -sk http://localhost:9003/v1/status | grep "Alive" | wc -l)
while [[ "$ISUP" == "0" ]]; do
  echo "Waiting for simulation service to be available..."
  sleep 4
  ISUP=$(docker exec -it app_devicesimulation_1 curl -sk http://localhost:9003/v1/status |grep "Alive" | wc -l)
done
docker exec -it app_devicesimulation_1 curl -sk -X POST "http://localhost:9003/v1/simulations?template=default" -H "content-type: application/json" -d "{}"
echo
