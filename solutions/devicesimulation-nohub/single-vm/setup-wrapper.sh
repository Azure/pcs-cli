#!/usr/bin/env bash
# Copyright (c) Microsoft. All rights reserved.

# Important:
# 1. The script is designed NOT to throw errors, to avoid secrets ending in some logs, e.g azureiotsolutions.com
# 2. In case of errors, the script instead terminates with exit code "1" which must be caught by the deployment service to inform the user.
# 3. The script invokes setup-internal.sh script and checks errors returned by the script, logging to a file that the user can find inside the VM.

APP_PATH="/app"
SETUP_LOG="${APP_PATH}/setup.log"

PARAMS_COPY="$@"

while [ "$#" -gt 0 ]; do
    case "$1" in
        --release-version) PCS_RELEASE_VERSION="$2" ;;
    esac
    shift
done

if [ -z "$PCS_RELEASE_VERSION" ]; then
    echo "No release version specified."
    # Exit code 1 is used by the deployment script to inform the user that something went wrong.
    exit 1
fi

# Note: this points to the solution without an IoT Hub service
SETUP_SCRIPTS_URL="https://raw.githubusercontent.com/Azure/pcs-cli/${PCS_RELEASE_VERSION}/solutions/devicesimulation-nohub/single-vm/"

mkdir -p ${APP_PATH}
cd ${APP_PATH}

# Download actual setup script, and exit if the download fails
wget $SETUP_SCRIPTS_URL/setup.sh && chmod 750 setup.sh
if [ $? -ne 0 ]; then
    echo "Unable to download ${SETUP_SCRIPTS_URL}/setup.sh."
    # Exit code 1 is used by the deployment script to inform the user that something went wrong.
    exit 1
fi

# Invoke setup script
./setup.sh "${PARAMS_COPY}" > ${SETUP_LOG} 2>&1
if [ $? -ne 0 ]; then
    chmod 440 ${SETUP_LOG}
    echo "Setup script failed with an error. Please see ${SETUP_LOG} for more information."
    # Exit code 1 is used by the deployment script to inform the user that something went wrong.
    exit 1
fi

chmod 440 ${SETUP_LOG}
