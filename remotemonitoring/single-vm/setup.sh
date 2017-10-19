#!/bin/bash -ex

APP_PATH="/app"
WEBUICONFIG="${APP_PATH}/webui-config.js"
WEBUICONFIG_SAFE="${APP_PATH}/webui-config.js.safe"
WEBUICONFIG_UNSAFE="${APP_PATH}/webui-config.js.unsafe"
ENVVARS="${APP_PATH}/env-vars"
DOCKERCOMPOSE="${APP_PATH}/docker-compose.yml"
CERTS="${APP_PATH}/certs"
CERT="${CERTS}/tls.crt"
PKEY="${CERTS}/tls.key"

# TODO: move files to Remote Monitoring repositories
REPOSITORY="https://raw.githubusercontent.com/Azure/pcs-cli/master/remotemonitoring/single-vm"
SCRIPTS_URL="${REPOSITORY}/scripts/"

# ========================================================================

export HOST_NAME="${1:-localhost}"
export APP_RUNTIME="${3:-${APP_RUNTIME}}"
export APP_RELEASE_VERSION="${4:-${APP_RELEASE_VERSION}}"
export PCS_IOTHUB_CONNSTRING="$8"
export PCS_STORAGEADAPTER_DOCUMENTDB_CONNSTRING="$9"
export PCS_TELEMETRY_DOCUMENTDB_CONNSTRING="$9"
export PCS_TELEMETRYAGENT_DOCUMENTDB_CONNSTRING="$9"
export PCS_IOTHUBREACT_ACCESS_CONNSTRING="$8"
export PCS_IOTHUBREACT_HUB_NAME="${10}"
export PCS_IOTHUBREACT_HUB_ENDPOINT="${11}"
export PCS_IOTHUBREACT_HUB_PARTITIONS="${12}"
export PCS_IOTHUBREACT_AZUREBLOB_ACCOUNT="${13}"
export PCS_IOTHUBREACT_AZUREBLOB_KEY="${14}"
export PCS_IOTHUBREACT_AZUREBLOB_ENDPOINT_SUFFIX="${15}"
export PCS_CERTIFICATE="${16}"
export PCS_CERTIFICATE_KEY="${17}"
export PCS_BINGMAP_KEY="${18}"
export PCS_AUTH_ISSUER="https://sts.windows.net/${5}/"
export PCS_AUTH_AUDIENCE="$6"
export PCS_WEBUI_AUTH_TYPE="aad"
export PCS_WEBUI_AUTH_AAD_TENANT="$5"
export PCS_WEBUI_AUTH_AAD_APPID="$6"
export PCS_WEBUI_AUTH_AAD_INSTANCE="$7"
export PCS_APPLICATION_SECRET=$(cat /dev/urandom | LC_CTYPE=C tr -dc 'a-zA-Z0-9-,./;:[]\(\)_=^!~' | fold -w 64 | head -n 1)

# TODO: remove temporary fix when projects have moved to use PCS_APPLICATION_SECRET
export APPLICATION_SECRET=$PCS_APPLICATION_SECRET

# ========================================================================

# Configure Docker registry based on host name
# ToDo: we may need to add similar parameter to AzureGermanCloud and AzureUSGovernment
config_for_azure_china() {
    set +e
    local host_name=$1
    if (echo $host_name | grep -c  "\.cn$") ; then
        # If the host name has .cn suffix, dockerhub in China will be used to avoid slow network traffic failure.
        local config_file='/etc/docker/daemon.json'
        echo "{\"registry-mirrors\": [\"https://registry.docker-cn.com\"]}" > ${config_file}
        service docker restart

        # Rewrite the AAD issuer in Azure China environment
        export PCS_AUTH_ISSUER="https://sts.chinacloudapi.cn/$2/"
    fi
    set -e
}

config_for_azure_china $HOST_NAME $5

# ========================================================================

mkdir -p ${APP_PATH}
cd ${APP_PATH}

# ========================================================================

# Docker compose file

touch ${DOCKERCOMPOSE} && chmod 550 ${DOCKERCOMPOSE}
echo "version: '2'"                                                                         >> ${DOCKERCOMPOSE}
echo ""                                                                                     >> ${DOCKERCOMPOSE}
echo "services:"                                                                            >> ${DOCKERCOMPOSE}
echo "  reverseproxy:"                                                                      >> ${DOCKERCOMPOSE}
echo "    image: azureiotpcs/remote-monitoring-nginx:${APP_RELEASE_VERSION}"                >> ${DOCKERCOMPOSE}
echo "    ports:"                                                                           >> ${DOCKERCOMPOSE}
echo "      - \"80:80\""                                                                    >> ${DOCKERCOMPOSE}
echo "      - \"443:443\""                                                                  >> ${DOCKERCOMPOSE}
echo "    depends_on:"                                                                      >> ${DOCKERCOMPOSE}
echo "      - webui"                                                                        >> ${DOCKERCOMPOSE}
echo "      - auth"                                                                         >> ${DOCKERCOMPOSE}
echo "      - iothubmanager"                                                                >> ${DOCKERCOMPOSE}
echo "      - devicesimulation"                                                             >> ${DOCKERCOMPOSE}
echo "      - telemetry"                                                                    >> ${DOCKERCOMPOSE}
echo "      - config"                                                                       >> ${DOCKERCOMPOSE}
echo "    volumes:"                                                                         >> ${DOCKERCOMPOSE}
echo "      - /app/certs:/app/certs:ro"                                                     >> ${DOCKERCOMPOSE}
echo ""                                                                                     >> ${DOCKERCOMPOSE}
echo "  webui:"                                                                             >> ${DOCKERCOMPOSE}
echo "    image: azureiotpcs/pcs-remote-monitoring-webui:${APP_RELEASE_VERSION}"            >> ${DOCKERCOMPOSE}
echo "    depends_on:"                                                                      >> ${DOCKERCOMPOSE}
echo "      - auth"                                                                         >> ${DOCKERCOMPOSE}
echo "      - iothubmanager"                                                                >> ${DOCKERCOMPOSE}
echo "      - devicesimulation"                                                             >> ${DOCKERCOMPOSE}
echo "      - telemetry"                                                                    >> ${DOCKERCOMPOSE}
echo "      - config"                                                                       >> ${DOCKERCOMPOSE}
echo "    volumes:"                                                                         >> ${DOCKERCOMPOSE}
echo "      - /app/webui-config.js:/app/build/webui-config.js:ro"                           >> ${DOCKERCOMPOSE}
echo ""                                                                                     >> ${DOCKERCOMPOSE}
echo "  auth:"                                                                              >> ${DOCKERCOMPOSE}
echo "    image: azureiotpcs/pcs-auth-dotnet:${APP_RELEASE_VERSION}"                        >> ${DOCKERCOMPOSE}
echo "    environment:"                                                                     >> ${DOCKERCOMPOSE}
echo "      - PCS_AUTH_ISSUER"                                                              >> ${DOCKERCOMPOSE}
echo "      - PCS_AUTH_AUDIENCE"                                                            >> ${DOCKERCOMPOSE}
echo "      - PCS_AUTH_REQUIRED"                                                            >> ${DOCKERCOMPOSE}
echo "      - PCS_CORS_WHITELIST"                                                           >> ${DOCKERCOMPOSE}
echo "      - PCS_APPLICATION_SECRET"                                                       >> ${DOCKERCOMPOSE}
echo ""                                                                                     >> ${DOCKERCOMPOSE}
echo "  iothubmanager:"                                                                     >> ${DOCKERCOMPOSE}
echo "    image: azureiotpcs/iothub-manager-dotnet:${APP_RELEASE_VERSION}"                  >> ${DOCKERCOMPOSE}
echo "    environment:"                                                                     >> ${DOCKERCOMPOSE}
echo "      - PCS_IOTHUB_CONNSTRING"                                                        >> ${DOCKERCOMPOSE}
echo "      # TODO: the dependency on config is temporary"                                  >> ${DOCKERCOMPOSE}
echo "      - PCS_CONFIG_WEBSERVICE_URL=http://config:9005/v1"                              >> ${DOCKERCOMPOSE}
echo "      - PCS_AUTH_ISSUER"                                                              >> ${DOCKERCOMPOSE}
echo "      - PCS_AUTH_AUDIENCE"                                                            >> ${DOCKERCOMPOSE}
echo "      - PCS_AUTH_REQUIRED"                                                            >> ${DOCKERCOMPOSE}
echo "      - PCS_CORS_WHITELIST"                                                           >> ${DOCKERCOMPOSE}
echo "      - PCS_APPLICATION_SECRET"                                                       >> ${DOCKERCOMPOSE}
echo ""                                                                                     >> ${DOCKERCOMPOSE}
echo "  devicesimulation:"                                                                  >> ${DOCKERCOMPOSE}
echo "    image: azureiotpcs/device-simulation-dotnet:${APP_RELEASE_VERSION}"               >> ${DOCKERCOMPOSE}
echo "    depends_on:"                                                                      >> ${DOCKERCOMPOSE}
echo "      - storageadapter"                                                               >> ${DOCKERCOMPOSE}
echo "    environment:"                                                                     >> ${DOCKERCOMPOSE}
echo "      - PCS_IOTHUB_CONNSTRING"                                                        >> ${DOCKERCOMPOSE}
echo "      - PCS_STORAGEADAPTER_WEBSERVICE_URL=http://storageadapter:9022/v1"              >> ${DOCKERCOMPOSE}
echo "      - PCS_AUTH_ISSUER"                                                              >> ${DOCKERCOMPOSE}
echo "      - PCS_AUTH_AUDIENCE"                                                            >> ${DOCKERCOMPOSE}
echo "      - PCS_AUTH_REQUIRED"                                                            >> ${DOCKERCOMPOSE}
echo "      - PCS_CORS_WHITELIST"                                                           >> ${DOCKERCOMPOSE}
echo "      - PCS_APPLICATION_SECRET"                                                       >> ${DOCKERCOMPOSE}
echo "    # How one could mount custom device models"                                       >> ${DOCKERCOMPOSE}
echo "    #volumes:"                                                                        >> ${DOCKERCOMPOSE}
echo "    #  - ./my-device-models:/app/data:ro"                                             >> ${DOCKERCOMPOSE}
echo ""                                                                                     >> ${DOCKERCOMPOSE}
echo "  telemetry:"                                                                         >> ${DOCKERCOMPOSE}
echo "    image: azureiotpcs/telemetry-${APP_RUNTIME}:${APP_RELEASE_VERSION}"               >> ${DOCKERCOMPOSE}
echo "    depends_on:"                                                                      >> ${DOCKERCOMPOSE}
echo "      - storageadapter"                                                               >> ${DOCKERCOMPOSE}
echo "    environment:"                                                                     >> ${DOCKERCOMPOSE}
echo "      - PCS_TELEMETRY_DOCUMENTDB_CONNSTRING"                                          >> ${DOCKERCOMPOSE}
echo "      - PCS_STORAGEADAPTER_WEBSERVICE_URL=http://storageadapter:9022/v1"              >> ${DOCKERCOMPOSE}
echo "      - PCS_AUTH_ISSUER"                                                              >> ${DOCKERCOMPOSE}
echo "      - PCS_AUTH_AUDIENCE"                                                            >> ${DOCKERCOMPOSE}
echo "      - PCS_AUTH_REQUIRED"                                                            >> ${DOCKERCOMPOSE}
echo "      - PCS_CORS_WHITELIST"                                                           >> ${DOCKERCOMPOSE}
echo "      - PCS_APPLICATION_SECRET"                                                       >> ${DOCKERCOMPOSE}
echo ""                                                                                     >> ${DOCKERCOMPOSE}
echo "  config:"                                                                            >> ${DOCKERCOMPOSE}
echo "    image: azureiotpcs/pcs-config-${APP_RUNTIME}:${APP_RELEASE_VERSION}"              >> ${DOCKERCOMPOSE}
echo "    depends_on:"                                                                      >> ${DOCKERCOMPOSE}
echo "      - storageadapter"                                                               >> ${DOCKERCOMPOSE}
echo "      - devicesimulation"                                                             >> ${DOCKERCOMPOSE}
echo "      - telemetry"                                                                    >> ${DOCKERCOMPOSE}
echo "      - iothubmanager"                                                                >> ${DOCKERCOMPOSE}
echo "    environment:"                                                                     >> ${DOCKERCOMPOSE}
echo "      - PCS_STORAGEADAPTER_WEBSERVICE_URL=http://storageadapter:9022/v1"              >> ${DOCKERCOMPOSE}
echo "      - PCS_DEVICESIMULATION_WEBSERVICE_URL=http://devicesimulation:9003/v1"          >> ${DOCKERCOMPOSE}
echo "      - PCS_TELEMETRY_WEBSERVICE_URL=http://telemetry:9004/v1"                        >> ${DOCKERCOMPOSE}
echo "      - PCS_IOTHUBMANAGER_WEBSERVICE_URL=http://iothubmanager:9002/v1"                >> ${DOCKERCOMPOSE}
echo "      - PCS_BINGMAP_KEY"                                                              >> ${DOCKERCOMPOSE}
echo "      - PCS_AUTH_ISSUER"                                                              >> ${DOCKERCOMPOSE}
echo "      - PCS_AUTH_AUDIENCE"                                                            >> ${DOCKERCOMPOSE}
echo "      - PCS_AUTH_REQUIRED"                                                            >> ${DOCKERCOMPOSE}
echo "      - PCS_CORS_WHITELIST"                                                           >> ${DOCKERCOMPOSE}
echo "      - PCS_APPLICATION_SECRET"                                                       >> ${DOCKERCOMPOSE}
echo ""                                                                                     >> ${DOCKERCOMPOSE}
echo "  storageadapter:"                                                                    >> ${DOCKERCOMPOSE}
echo "    image: azureiotpcs/pcs-storage-adapter-${APP_RUNTIME}:${APP_RELEASE_VERSION}"     >> ${DOCKERCOMPOSE}
echo "    environment:"                                                                     >> ${DOCKERCOMPOSE}
echo "      - PCS_STORAGEADAPTER_DOCUMENTDB_CONNSTRING"                                     >> ${DOCKERCOMPOSE}
echo "      - PCS_AUTH_ISSUER"                                                              >> ${DOCKERCOMPOSE}
echo "      - PCS_AUTH_AUDIENCE"                                                            >> ${DOCKERCOMPOSE}
echo "      - PCS_AUTH_REQUIRED"                                                            >> ${DOCKERCOMPOSE}
echo "      - PCS_CORS_WHITELIST"                                                           >> ${DOCKERCOMPOSE}
echo "      - PCS_APPLICATION_SECRET"                                                       >> ${DOCKERCOMPOSE}
echo ""                                                                                     >> ${DOCKERCOMPOSE}
echo "  telemetryagent:"                                                                    >> ${DOCKERCOMPOSE}
echo "    image: azureiotpcs/telemetry-agent-${APP_RUNTIME}:${APP_RELEASE_VERSION}"         >> ${DOCKERCOMPOSE}
echo "    depends_on:"                                                                      >> ${DOCKERCOMPOSE}
echo "      - telemetry"                                                                    >> ${DOCKERCOMPOSE}
echo "      - iothubmanager"                                                                >> ${DOCKERCOMPOSE}
echo "      - config"                                                                       >> ${DOCKERCOMPOSE}
echo "    environment:"                                                                     >> ${DOCKERCOMPOSE}
echo "      - PCS_TELEMETRYAGENT_DOCUMENTDB_CONNSTRING"                                     >> ${DOCKERCOMPOSE}
echo "      - PCS_TELEMETRY_WEBSERVICE_URL=http://telemetry:9004/v1"                        >> ${DOCKERCOMPOSE}
echo "      - PCS_CONFIG_WEBSERVICE_URL=http://config:9005/v1"                              >> ${DOCKERCOMPOSE}
echo "      - PCS_IOTHUBMANAGER_WEBSERVICE_URL=http://iothubmanager:9002/v1"                >> ${DOCKERCOMPOSE}
echo "      - PCS_IOTHUBREACT_AZUREBLOB_ACCOUNT"                                            >> ${DOCKERCOMPOSE}
echo "      - PCS_IOTHUBREACT_AZUREBLOB_KEY"                                                >> ${DOCKERCOMPOSE}
echo "      - PCS_IOTHUBREACT_AZUREBLOB_ENDPOINT_SUFFIX"                                    >> ${DOCKERCOMPOSE}
echo "      - PCS_IOTHUBREACT_HUB_NAME"                                                     >> ${DOCKERCOMPOSE}
echo "      - PCS_IOTHUBREACT_HUB_ENDPOINT"                                                 >> ${DOCKERCOMPOSE}
echo "      - PCS_IOTHUBREACT_HUB_PARTITIONS"                                               >> ${DOCKERCOMPOSE}
echo "      - PCS_IOTHUBREACT_ACCESS_CONNSTRING"                                            >> ${DOCKERCOMPOSE}
echo "      - PCS_AUTH_ISSUER"                                                              >> ${DOCKERCOMPOSE} 
echo "      - PCS_AUTH_AUDIENCE"                                                            >> ${DOCKERCOMPOSE}
echo "      - PCS_AUTH_REQUIRED"                                                            >> ${DOCKERCOMPOSE}
echo "      - PCS_CORS_WHITELIST"                                                           >> ${DOCKERCOMPOSE}
echo "      - PCS_APPLICATION_SECRET"                                                       >> ${DOCKERCOMPOSE}

# ========================================================================

# HTTPS certificates
mkdir -p ${CERTS}
touch ${CERT} && chmod 550 ${CERT}
touch ${PKEY} && chmod 550 ${PKEY}
# Always have quotes around the certificate and key value to preserve the formatting
echo "${PCS_CERTIFICATE}"      > ${CERT}
echo "${PCS_CERTIFICATE_KEY}"  > ${PKEY}

# ========================================================================

# Download scripts
wget $SCRIPTS_URL/logs.sh     -O /app/logs.sh     && chmod 750 /app/logs.sh
wget $SCRIPTS_URL/simulate.sh -O /app/simulate.sh && chmod 750 /app/simulate.sh
wget $SCRIPTS_URL/start.sh    -O /app/start.sh    && chmod 750 /app/start.sh
wget $SCRIPTS_URL/stats.sh    -O /app/stats.sh    && chmod 750 /app/stats.sh
wget $SCRIPTS_URL/status.sh   -O /app/status.sh   && chmod 750 /app/status.sh
wget $SCRIPTS_URL/stop.sh     -O /app/stop.sh     && chmod 750 /app/stop.sh

# Temporarily disabled - The update scenario requires some work
# wget $SCRIPTS_REPO/update.sh   -O /app/update.sh   && chmod 750 /app/update.sh

# ========================================================================

# Web App configuration
touch ${WEBUICONFIG} && chmod 444 ${WEBUICONFIG}
touch ${WEBUICONFIG_SAFE} && chmod 444 ${WEBUICONFIG_SAFE}
touch ${WEBUICONFIG_UNSAFE} && chmod 444 ${WEBUICONFIG_UNSAFE}

echo "var DeploymentConfig = {"                       >> ${WEBUICONFIG_SAFE}
echo "  authEnabled: true,"                           >> ${WEBUICONFIG_SAFE}
echo "  authType: '${PCS_WEBUI_AUTH_TYPE}',"          >> ${WEBUICONFIG_SAFE}
echo "  aad : {"                                      >> ${WEBUICONFIG_SAFE}
echo "    tenant: '${PCS_WEBUI_AUTH_AAD_TENANT}',"    >> ${WEBUICONFIG_SAFE}
echo "    appId: '${PCS_WEBUI_AUTH_AAD_APPID}',"      >> ${WEBUICONFIG_SAFE}
echo "    instance: '${PCS_WEBUI_AUTH_AAD_INSTANCE}'" >> ${WEBUICONFIG_SAFE}
echo "  }"                                            >> ${WEBUICONFIG_SAFE}
echo "}"                                              >> ${WEBUICONFIG_SAFE}

echo "var DeploymentConfig = {"                       >> ${WEBUICONFIG_UNSAFE}
echo "  authEnabled: false,"                          >> ${WEBUICONFIG_UNSAFE}
echo "  authType: '${PCS_WEBUI_AUTH_TYPE}',"          >> ${WEBUICONFIG_UNSAFE}
echo "  aad : {"                                      >> ${WEBUICONFIG_UNSAFE}
echo "    tenant: '${PCS_WEBUI_AUTH_AAD_TENANT}',"    >> ${WEBUICONFIG_UNSAFE}
echo "    appId: '${PCS_WEBUI_AUTH_AAD_APPID}',"      >> ${WEBUICONFIG_UNSAFE}
echo "    instance: '${PCS_WEBUI_AUTH_AAD_INSTANCE}'" >> ${WEBUICONFIG_UNSAFE}
echo "  }"                                            >> ${WEBUICONFIG_UNSAFE}
echo "}"                                              >> ${WEBUICONFIG_UNSAFE}

cp -p ${WEBUICONFIG_SAFE} ${WEBUICONFIG}

# ========================================================================

# Environment variables
touch ${ENVVARS} && chmod 440 ${ENVVARS}

echo "export HOST_NAME=\"${HOST_NAME}\""                                                                 >> ${ENVVARS}
echo "export APP_RUNTIME=\"${APP_RUNTIME}\""                                                             >> ${ENVVARS}
echo "export PCS_AUTH_ISSUER=\"${PCS_AUTH_ISSUER}\""                                                     >> ${ENVVARS}
echo "export PCS_AUTH_AUDIENCE=\"${PCS_AUTH_AUDIENCE}\""                                                 >> ${ENVVARS}
echo "export PCS_AUTH_AAD_GLOBAL_TENANTID=\"${PCS_AUTH_AAD_GLOBAL_TENANTID}\""                           >> ${ENVVARS}
echo "export PCS_AUTH_AAD_GLOBAL_CLIENTID=\"${PCS_AUTH_AAD_GLOBAL_CLIENTID}\""                           >> ${ENVVARS}
echo "export PCS_AUTH_AAD_GLOBAL_LOGINURI=\"${PCS_AUTH_AAD_GLOBAL_LOGINURI}\""                           >> ${ENVVARS}
echo "export PCS_IOTHUB_CONNSTRING=\"${PCS_IOTHUB_CONNSTRING}\""                                         >> ${ENVVARS}
echo "export PCS_STORAGEADAPTER_DOCUMENTDB_CONNSTRING=\"${PCS_STORAGEADAPTER_DOCUMENTDB_CONNSTRING}\""   >> ${ENVVARS}
echo "export PCS_TELEMETRY_DOCUMENTDB_CONNSTRING=\"${PCS_TELEMETRY_DOCUMENTDB_CONNSTRING}\""             >> ${ENVVARS}
echo "export PCS_TELEMETRYAGENT_DOCUMENTDB_CONNSTRING=\"${PCS_TELEMETRYAGENT_DOCUMENTDB_CONNSTRING}\""   >> ${ENVVARS}
echo "export PCS_IOTHUBREACT_ACCESS_CONNSTRING=\"${PCS_IOTHUBREACT_ACCESS_CONNSTRING}\""                 >> ${ENVVARS}
echo "export PCS_IOTHUBREACT_HUB_NAME=\"${PCS_IOTHUBREACT_HUB_NAME}\""                                   >> ${ENVVARS}
echo "export PCS_IOTHUBREACT_HUB_ENDPOINT=\"${PCS_IOTHUBREACT_HUB_ENDPOINT}\""                           >> ${ENVVARS}
echo "export PCS_IOTHUBREACT_HUB_PARTITIONS=\"${PCS_IOTHUBREACT_HUB_PARTITIONS}\""                       >> ${ENVVARS}
echo "export PCS_IOTHUBREACT_AZUREBLOB_ACCOUNT=\"${PCS_IOTHUBREACT_AZUREBLOB_ACCOUNT}\""                 >> ${ENVVARS}
echo "export PCS_IOTHUBREACT_AZUREBLOB_KEY=\"${PCS_IOTHUBREACT_AZUREBLOB_KEY}\""                         >> ${ENVVARS}
echo "export PCS_IOTHUBREACT_AZUREBLOB_ENDPOINT_SUFFIX=\"${PCS_IOTHUBREACT_AZUREBLOB_ENDPOINT_SUFFIX}\"" >> ${ENVVARS}
echo "export PCS_BINGMAP_KEY=\"${PCS_BINGMAP_KEY}\""                                                     >> ${ENVVARS}
echo "export PCS_APPLICATION_SECRET=\"${PCS_APPLICATION_SECRET}\""                                       >> ${ENVVARS}
echo ""                                                                                                  >> ${ENVVARS}
echo "##########################################################################################"        >> ${ENVVARS}
echo "# Development settings, don't change these in Production"                                          >> ${ENVVARS}
echo "# You can run 'start.sh --unsafe' to temporarily disable Auth and Cross-Origin protections"        >> ${ENVVARS}
echo ""                                                                                                  >> ${ENVVARS}
echo "# Format: true | false"                                                                            >> ${ENVVARS}
echo "# empty => Auth required"                                                                          >> ${ENVVARS}
echo "export PCS_AUTH_REQUIRED=\"\""                                                                     >> ${ENVVARS}
echo ""                                                                                                  >> ${ENVVARS}
echo "# Format: { 'origins': ['*'], 'methods': ['*'], 'headers': ['*'] }"                                >> ${ENVVARS}
echo "# empty => CORS support disabled"                                                                  >> ${ENVVARS}
echo "export PCS_CORS_WHITELIST=\"\""                                                                    >> ${ENVVARS}

# ========================================================================

nohup /app/start.sh &
