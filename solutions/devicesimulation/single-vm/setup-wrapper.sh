#!/usr/bin/env bash
# Copyright (c) Microsoft. All rights reserved.

# Important:
# 1. The script is designed NOT to throw errors, to avoid secrets ending in azureiotsolutions.com logs
# 2. In case of errors, the script terminates with exit code "1" which must be caught by the deployment service to inform the user.
# 3. The script invokes setup.sh script and checks for errors returned by the script, logging to a file in the VM.

APP_PATH="/app"
SETUP_LOG="${APP_PATH}/setup.log"

# Copy all params before shifting the original ones
PARAMS_COPY="$@"

while [ "$#" -gt 0 ]; do
    case "$1" in
        --release-version) PCS_RELEASE_VERSION="$2" ;;
    esac
    shift
done

if [ -z "$PCS_RELEASE_VERSION" ]; then
    echo "No release version specified"
    exit 1
fi

# Note: this points to the solution WITH an IoT Hub service
SETUP_SCRIPTS_URL="https://raw.githubusercontent.com/Azure/pcs-cli/${PCS_RELEASE_VERSION}/solutions/devicesimulation/single-vm"

mkdir -p ${APP_PATH}
cd ${APP_PATH}

# Create log file, make it writable and empty (for local tests)
touch ${SETUP_LOG} && chmod 660 ${SETUP_LOG} && echo > ${SETUP_LOG}
if [ $? -ne 0 ]; then
    echo "Unable to create log file '${SETUP_LOG}'"
    exit 1
fi

# Download actual setup script, and exit if the download fails
rm -f setup.sh                          >> ${SETUP_LOG} 2>&1 \
    && wget $SETUP_SCRIPTS_URL/setup.sh >> ${SETUP_LOG} 2>&1 \
    && chmod 750 setup.sh               >> ${SETUP_LOG} 2>&1
if [ $? -ne 0 ]; then
    echo "Unable to download '${SETUP_SCRIPTS_URL}/setup.sh'"
    cat ${SETUP_LOG}
    exit 1
fi

# Invoke setup script
./setup.sh "${PARAMS_COPY}" >> ${SETUP_LOG} 2>&1
RESULT=$?
echo "Exit code: $RESULT"
if [[ $RESULT -ne 0 ]]; then
    echo "Setup failed, please see log file '${SETUP_LOG}' for more information"
    cat ${SETUP_LOG}
    exit 1
fi
