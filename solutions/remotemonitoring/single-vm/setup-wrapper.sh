#!/usr/bin/env bash
# Copyright (c) Microsoft. All rights reserved.

# Solution: remote monitoring

# Important:
# 1. The script runs in an environment with old/strict shell support, so don't rely on Bash niceties
# 2. The script is designed NOT to throw errors, to avoid secrets ending in azureiotsolutions.com logs
# 3. In case of errors, the script terminates with exit code "1" which must be caught by the deployment service to inform the user.
# 4. The script invokes setup.sh script and checks for errors returned by the script, logging to a file in the VM.

# Enable this for debugging only
##set -ex

APP_PATH="/app"
SETUP_LOG="${APP_PATH}/setup.log"

mkdir -p ${APP_PATH}

# Create log file, make it writable and empty (for local tests)
touch ${SETUP_LOG} && chmod 660 ${SETUP_LOG} && echo > ${SETUP_LOG}
if [ $? -ne 0 ]; then
    echo "Unable to create log file '${SETUP_LOG}'"
    exit 1
fi

# Invoke setup script
./setup.sh "${@}" >> ${SETUP_LOG} 2>&1
RESULT=$?
echo "Exit code: $RESULT"
if [ $RESULT -ne 0 ]; then
    echo "Setup failed, please see log file '${SETUP_LOG}' for more information"
    exit 1
fi