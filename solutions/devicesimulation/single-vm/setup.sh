#!/usr/bin/env bash
# Copyright (c) Microsoft. All rights reserved.
# Note: Windows Bash doesn't support shebang extra params

# This script is used to invoke setupInternal.sh script and check errors returned by the script.
# In case of failures, log them to a file and return custom error string.
# This will prevent secrets from leaking out to logs on azureiotsolutions.com

APP_PATH="/app"

while [ "$#" -gt 0 ]; do
    case "$1" in
        --release-version)         PCS_RELEASE_VERSION="$2" ;;
    esac
    shift
done

SETUP_SCRIPTS_URL="https://raw.githubusercontent.com/Azure/pcs-cli/${PCS_RELEASE_VERSION}/solutions/devicesimulation/single-vm/"

mkdir -p ${APP_PATH}
cd ${APP_PATH}

# Download setup internal script
wget $SETUP_SCRIPTS_URL/setupInternal.sh     -O /app/setupInternal.sh     && chmod 750 /app/setupInternal.sh

# Invoke setupInternal script
/app/setupInternal.sh $@ > /dev/null 2>setup-errors.log

if [ $? -eq 0 ]; then
    exit 0
else
    echo "SetupInternal.sh script failed with an error. Please check file setup-errors.log for more information."
    exit 1
fi
