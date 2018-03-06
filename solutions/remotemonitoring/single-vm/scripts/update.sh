#!/bin/bash -ex

# Where to download scripts from
REPOSITORY="https://raw.githubusercontent.com/Azure/pcs-cli/master/solutions/remotemonitoring/single-vm"
SCRIPTS_URL="${REPOSITORY}/scripts/"

cd /app

# Download scripts
wget $SCRIPTS_URL/logs.sh     -O /app/logs.sh     && chmod 750 /app/logs.sh
wget $SCRIPTS_URL/simulate.sh -O /app/simulate.sh && chmod 750 /app/simulate.sh
wget $SCRIPTS_URL/start.sh    -O /app/start.sh    && chmod 750 /app/start.sh
wget $SCRIPTS_URL/stats.sh    -O /app/stats.sh    && chmod 750 /app/stats.sh
wget $SCRIPTS_URL/status.sh   -O /app/status.sh   && chmod 750 /app/status.sh
wget $SCRIPTS_URL/stop.sh     -O /app/stop.sh     && chmod 750 /app/stop.sh
wget $SCRIPTS_URL/update.sh   -O /app/update.sh   && chmod 750 /app/update.sh

# Stop the services, so Docker images are not in use
./stop.sh

# Update Docker images
docker-compose pull --ignore-pull-failure

# Start the services
./start.sh
