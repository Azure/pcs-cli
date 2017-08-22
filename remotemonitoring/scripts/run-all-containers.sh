#!/usr/bin/env bash
set -x
export HOST_NAME="${1:-localhost}"
export PRIVATE_IP="${2:-localhost}"
export APP_PORT="${3:-80}"
export APP_RUNTIME="${4:-dotnet}"
export APP_VERSION="${5:-latest}"

export PCS_AUTH_AAD_GLOBAL_TENANTID="$6"
export PCS_AUTH_AAD_GLOBAL_CLIENTID="$7"
export PCS_AUTH_AAD_GLOBAL_LOGINURI="$8"

# IoT Hub and DocumentDB Connection string needs to be in quotes
# so that value can be passed to docker container correctly
export PCS_IOTHUB_CONNSTRING="$9"
export PCS_STORAGEADAPTER_DOCUMENTDB_CONNSTRING="${10}"
export PCS_DEVICETELEMETRY_DOCUMENTDB_CONNSTRING="${10}"
export PCS_STREAMANALYTICS_DOCUMENTDB_CONNSTRING="${10}"

# Ports used by public facing web service
export PCS_AUTHENTICATION_WEBSERVICE_PORT=9001
export PCS_IOTHUBMANAGER_WEBSERVICE_PORT=9002
export PCS_DEVICESIMULATION_WEBSERVICE_PORT=9003
export PCS_DEVICETELEMETRY_WEBSERVICE_PORT=9004
export PCS_UICONFIG_WEBSERVICE_PORT=9005
export PCS_UXANALYTICS_WEBSERVICE_PORT=9006

# Ports used by internal web service
export PCS_AUTHADAPTER_WEBSERVICE_PORT=9021
export PCS_STORAGEADAPTER_WEBSERVICE_PORT=9022
export PCS_STREAMANALYTICS_WEBSERVICE_PORT=9023

# Public facing web service
export PCS_BASE_WEBSERVICE_URL="http://$HOST_NAME"
export PCS_AUTHENTICATION_WEBSERVICE_URL="$PCS_BASE_WEBSERVICE_URL:$PCS_AUTHENTICATION_WEBSERVICE_PORT/v1"
export PCS_IOTHUBMANAGER_WEBSERVICE_URL="$PCS_BASE_WEBSERVICE_URL:$PCS_IOTHUBMANAGER_WEBSERVICE_PORT/v1"
export PCS_DEVICESIMULATION_WEBSERVICE_URL="$PCS_BASE_WEBSERVICE_URL:$PCS_DEVICESIMULATION_WEBSERVICE_PORT/v1"
export PCS_DEVICETELEMETRY_WEBSERVICE_URL="$PCS_BASE_WEBSERVICE_URL:$PCS_DEVICETELEMETRY_WEBSERVICE_PORT/v1"
export PCS_UICONFIG_WEBSERVICE_URL="$PCS_BASE_WEBSERVICE_URL:$PCS_UICONFIG_WEBSERVICE_PORT/v1"
export PCS_UXANALYTICS_WEBSERVICE_URL="$PCS_BASE_WEBSERVICE_URL:$PCS_UXANALYTICS_WEBSERVICE_PORT/v1"

# Internal facing web service
export PCS_INTERNAL_BASE_WEBSERVICE_URL="http://$PRIVATE_IP"
export PCS_AUTHADAPTER_WEBSERVICE_URL="$PCS_INTERNAL_BASE_WEBSERVICE_URL:$PCS_AUTHADAPTER_WEBSERVICE_PORT/v1"
export PCS_STORAGEADAPTER_WEBSERVICE_URL="$PCS_INTERNAL_BASE_WEBSERVICE_URL:$PCS_STORAGEADAPTER_WEBSERVICE_PORT/v1"
export PCS_STREAMANALYTICS_WEBSERVICE_URL="$PCS_INTERNAL_BASE_WEBSERVICE_URL:$PCS_STREAMANALYTICS_WEBSERVICE_PORT/v1"

export DOCKER_HUB_ACCOUNT=azureiotpcs

# UIConfig environment
export PCS_UICONFIG_CORS_WHITELIST=*

# Required by IoT Hub React
export PCS_IOTHUBREACT_ACCESS_CONNSTRING="$9"

# TODO: use the arguments that passed from command line. it is just an example here.
export PCS_IOTHUBREACT_HUB_NAME="${11}"
export PCS_IOTHUBREACT_HUB_ENDPOINT="${12}"
export PCS_IOTHUBREACT_HUB_PARTITIONS="${13}"
export PCS_IOTHUBREACT_AZUREBLOB_ACCOUNT="${14}"
export PCS_IOTHUBREACT_AZUREBLOB_KEY="${15}"

docker run -d -p $PCS_IOTHUBMANAGER_WEBSERVICE_PORT:$PCS_IOTHUBMANAGER_WEBSERVICE_PORT \
    -e "PCS_IOTHUBMANAGER_WEBSERVICE_PORT=$PCS_IOTHUBMANAGER_WEBSERVICE_PORT" \
    -e "PCS_IOTHUB_CONNSTRING=$PCS_IOTHUB_CONNSTRING" \
    "$DOCKER_HUB_ACCOUNT/iothub-manager-$APP_RUNTIME:$APP_VERSION"

docker run -d -p $PCS_STORAGEADAPTER_WEBSERVICE_PORT:$PCS_STORAGEADAPTER_WEBSERVICE_PORT \
    -e "PCS_STORAGEADAPTER_WEBSERVICE_PORT=$PCS_STORAGEADAPTER_WEBSERVICE_PORT" \
    -e "PCS_STORAGEADAPTER_DOCUMENTDB_CONNSTRING=$PCS_STORAGEADAPTER_DOCUMENTDB_CONNSTRING" \
    "$DOCKER_HUB_ACCOUNT/pcs-storage-adapter-$APP_RUNTIME:$APP_VERSION"

docker run -d -p $PCS_UICONFIG_WEBSERVICE_PORT:$PCS_UICONFIG_WEBSERVICE_PORT \
    -e "PCS_UICONFIG_WEBSERVICE_PORT=$PCS_UICONFIG_WEBSERVICE_PORT" \
    -e "PCS_UICONFIG_CORS_WHITELIST=$PCS_UICONFIG_CORS_WHITELIST" \
    -e "PCS_STORAGEADAPTER_WEBSERVICE_URL=$PCS_STORAGEADAPTER_WEBSERVICE_URL" \
    "$DOCKER_HUB_ACCOUNT/pcs-ui-config-$APP_RUNTIME:$APP_VERSION"

docker run -d -p $PCS_DEVICESIMULATION_WEBSERVICE_PORT:$PCS_DEVICESIMULATION_WEBSERVICE_PORT \
    -e "PCS_DEVICESIMULATION_WEBSERVICE_PORT=$PCS_DEVICESIMULATION_WEBSERVICE_PORT" \
    -e "PCS_IOTHUB_CONNSTRING=$PCS_IOTHUB_CONNSTRING" \
    -e "PCS_STORAGEADAPTER_WEBSERVICE_URL=$PCS_STORAGEADAPTER_WEBSERVICE_URL" \
    "$DOCKER_HUB_ACCOUNT/device-simulation-$APP_RUNTIME:$APP_VERSION"

# Change the runtime value to env variable once we have dotnet version
docker run -d -p $PCS_DEVICETELEMETRY_WEBSERVICE_PORT:$PCS_DEVICETELEMETRY_WEBSERVICE_PORT \
    -e "PCS_DEVICETELEMETRY_WEBSERVICE_PORT=$PCS_DEVICETELEMETRY_WEBSERVICE_PORT" \
    -e "PCS_DEVICETELEMETRY_DOCUMENTDB_CONNSTRING=$PCS_DEVICETELEMETRY_DOCUMENTDB_CONNSTRING" \
    -e "PCS_STORAGEADAPTER_WEBSERVICE_URL=$PCS_STORAGEADAPTER_WEBSERVICE_URL" \
    "$DOCKER_HUB_ACCOUNT/device-telemetry-java:$APP_VERSION"

# Change the runtime value to env variable once we have dotnet version
docker run -d -p $PCS_STREAMANALYTICS_WEBSERVICE_PORT:$PCS_STREAMANALYTICS_WEBSERVICE_PORT \
    -e "PCS_STREAMANALYTICS_DOCUMENTDB_CONNSTRING=$PCS_STREAMANALYTICS_DOCUMENTDB_CONNSTRING" \
    -e "PCS_DEVICETELEMETRY_WEBSERVICE_URL=$PCS_DEVICETELEMETRY_WEBSERVICE_URL" \
    -e "PCS_UICONFIG_WEBSERVICE_URL=$PCS_UICONFIG_WEBSERVICE_URL" \
    -e "PCS_IOTHUBMANAGER_WEBSERVICE_URL=$PCS_IOTHUBMANAGER_WEBSERVICE_URL" \
    -e "PCS_IOTHUBREACT_AZUREBLOB_ACCOUNT=$PCS_IOTHUBREACT_AZUREBLOB_ACCOUNT" \
    -e "PCS_IOTHUBREACT_AZUREBLOB_KEY=$PCS_IOTHUBREACT_AZUREBLOB_KEY" \
    -e "PCS_IOTHUBREACT_ACCESS_CONNSTRING=$PCS_IOTHUBREACT_ACCESS_CONNSTRING" \
    -e "PCS_IOTHUBREACT_HUB_NAME=$PCS_IOTHUBREACT_HUB_NAME" \
    -e "PCS_IOTHUBREACT_HUB_ENDPOINT=$PCS_IOTHUBREACT_HUB_ENDPOINT" \
    -e "PCS_IOTHUBREACT_HUB_PARTITIONS=$PCS_IOTHUBREACT_HUB_PARTITIONS" \
    "$DOCKER_HUB_ACCOUNT/iot-stream-analytics-java:$APP_VERSION"

docker run -d -p $PCS_AUTHENTICATION_WEBSERVICE_PORT:$PCS_AUTHENTICATION_WEBSERVICE_PORT \
    -e "PCS_AUTH_AAD_GLOBAL_TENANTID=$PCS_AUTH_AAD_GLOBAL_TENANTID" \
    -e "PCS_AUTH_AAD_GLOBAL_CLIENTID=$PCS_AUTH_AAD_GLOBAL_CLIENTID" \
    -e "PCS_AUTH_AAD_GLOBAL_LOGINURI=$PCS_AUTH_AAD_GLOBAL_LOGINURI" \
    "$DOCKER_HUB_ACCOUNT/pcs-auth-$APP_RUNTIME:$APP_VERSION"

docker run -d -p $APP_PORT:$APP_PORT \
    -e "REACT_APP_BASE_SERVICE_URL=$PCS_BASE_WEBSERVICE_URL" \
    -e "REACT_APP_IOTHUBMANAGER_WEBSERVICE_PORT=$PCS_IOTHUBMANAGER_WEBSERVICE_PORT" \
    -e "REACT_APP_DEVICESIMULATION_WEBSERVICE_PORT=$PCS_DEVICESIMULATION_WEBSERVICE_PORT" \
    -e "REACT_APP_DEVICETELEMETRY_WEBSERVICE_PORT=$PCS_DEVICETELEMETRY_WEBSERVICE_PORT" \
    -e "REACT_APP_UICONFIG_WEBSERVICE_PORT=$PCS_UICONFIG_WEBSERVICE_PORT" \
    -e "REACT_APP_AUTH_WEBSERVICE_PORT=$PCS_AUTHENTICATION_WEBSERVICE_PORT" \
    "$DOCKER_HUB_ACCOUNT/pcs-remote-monitoring-webui:$APP_VERSION"

set +x

