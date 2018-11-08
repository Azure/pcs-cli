#!/usr/bin/env bash
# Copyright (c) Microsoft. All rights reserved.
# Note: Windows Bash doesn't support shebang extra params

# This script is used to invoke setupInternal.sh script and check errors returned by the script.
# In case of failures, log them to a file and return custom error string.
# This will prevent secrets from leaking out to logs on azureiotsolutions.com

APP_PATH="/app"

while [ "$#" -gt 0 ]; do
    case "$1" in
        --solution-setup-url)      PCS_SOLUTION_SETUP_URL="$2" ;; # e.g. https://raw.githubusercontent.com/Azure/pcs-cli/DS-1.0.0/solutions/devicesimulation
        --subscription-domain)     PCS_SUBSCRIPTION_DOMAIN="$2" ;;
        --subscription-id)         PCS_SUBSCRIPTION_ID="$2" ;;
        --hostname)                HOST_NAME="$2" ;;
        --log-level)               PCS_LOG_LEVEL="$2" ;;
        --solution-type)           PCS_SOLUTION_TYPE="$2" ;;
        --solution-name)           PCS_SOLUTION_NAME="$2" ;;
        --resource-group)          PCS_RESOURCE_GROUP="$2" ;;
        --iothub-name)             PCS_IOHUB_NAME="$2" ;;
        --iothub-sku)              PCS_IOTHUB_SKU="$2" ;;
        --iothub-tier)             PCS_IOTHUB_TIER="$2" ;;
        --iothub-units)            PCS_IOTHUB_UNITS="$2" ;;
        --iothub-connstring)       PCS_IOTHUB_CONNSTRING="$2" ;;
        --docdb-name)              PCS_DOCDB_NAME="$2" ;;
        --docdb-connstring)        PCS_STORAGEADAPTER_DOCUMENTDB_CONNSTRING="$2" ;;
        --storage-connstring)      PCS_AZURE_STORAGE_ACCOUNT="$2" ;;
        --ssl-certificate)         PCS_CERTIFICATE="$2" ;;
        --ssl-certificate-key)     PCS_CERTIFICATE_KEY="$2" ;;
        --auth-audience)           PCS_AUTH_AUDIENCE="$2" ;;
        --auth-issuer)             PCS_AUTH_ISSUER="$2" ;;
        --auth-type)               PCS_WEBUI_AUTH_TYPE="$2" ;;
        --aad-appid)               PCS_WEBUI_AUTH_AAD_APPID="$2" ;;
        --aad-sp-client-id)        PCS_AAD_CLIENT_SP_ID="$2" ;;
        --aad-app-secret)          PCS_AAD_SECRET="$2" ;;
        --aad-tenant)              PCS_WEBUI_AUTH_AAD_TENANT="$2" ;;
        --aad-instance)            PCS_WEBUI_AUTH_AAD_INSTANCE="$2" ;;
        --cloud-type)              PCS_CLOUD_TYPE="$2" ;;
        --deployment-id)           PCS_DEPLOYMENT_ID="$2" ;;
        --diagnostics-url)         PCS_DIAGNOSTICS_ENDPOINT_URL="$2" ;;
        --docker-tag)              PCS_DOCKER_TAG="$2" ;;
        --release-version)         PCS_RELEASE_VERSION="$2" ;;
        --resource-group-location) PCS_RESOURCE_GROUP_LOCATION="$2" ;;
        --vmss-name)               PCS_VMSS_NAME="$2" ;;
    esac
    shift
done

SETUP_SCRIPTS_URL="https://raw.githubusercontent.com/Azure/pcs-cli/${PCS_RELEASE_VERSION}/solutions/devicesimulation/single-vm/"

mkdir -p ${APP_PATH}
cd ${APP_PATH}

# Download setup internal script
wget $SETUP_SCRIPTS_URL/setupInternal.sh     -O /app/setupInternal.sh     && chmod 750 /app/setupInternal.sh

# Invoke setupInternal script
./setupInternal.sh --log-level Info --hostname $HOST_NAME --resource-group-location $PCS_RESOURCE_GROUP_LOCATION --vmss-name $PCS_VMSS_NAME --docdb-connstring $PCS_STORAGEADAPTER_DOCUMENTDB_CONNSTRING --ssl-certificate "$PCS_CERTIFICATE" --ssl-certificate-key "$PCS_CERTIFICATE_KEY" --auth-type $PCS_WEBUI_AUTH_TYPE --auth-audience $PCS_AUTH_AUDIENCE --aad-appid $PCS_WEBUI_AUTH_AAD_APPID --aad-tenant $PCS_WEBUI_AUTH_AAD_TENANT --auth-issuer $PCS_AUTH_ISSUER --aad-instance $PCS_WEBUI_AUTH_AAD_INSTANCE --resource-group $PCS_RESOURCE_GROUP --release-version $PCS_RELEASE_VERSION --solution-type $PCS_SOLUTION_TYPE --deployment-id $PCS_DEPLOYMENT_ID --diagnostics-url $PCS_DIAGNOSTICS_ENDPOINT_URL --storage-connstring $PCS_AZURE_STORAGE_ACCOUNT --docdb-name $PCS_DOCDB_NAME --solution-name $PCS_SOLUTION_NAME --solution-setup-url $PCS_SOLUTION_SETUP_URL --docker-tag $PCS_DOCKER_TAG --subscription-domain $PCS_SUBSCRIPTION_DOMAIN --subscription-id $PCS_SUBSCRIPTION_ID --aad-sp-client-id $PCS_AAD_CLIENT_SP_ID --aad-app-secret $PCS_AAD_SECRET --iothub-name $PCS_IOHUB_NAME --iothub-sku $PCS_IOTHUB_SKU --iothub-tier $PCS_IOTHUB_TIER --iothub-units $PCS_IOTHUB_UNITS --iothub-connstring $PCS_IOTHUB_CONNSTRING --cloud-type $PCS_CLOUD_TYPE > /dev/null 2>setup-errors.log

if [ $? -eq 0 ]; then
    exit 0
else
    echo "SetupInternal.sh script failed with an error. Please check file setup-errors.log for more information."
    exit 1
fi
