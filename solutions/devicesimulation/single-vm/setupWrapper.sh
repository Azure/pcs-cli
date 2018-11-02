#!/usr/bin/env bash
# Copyright (c) Microsoft. All rights reserved.
# Note: Windows Bash doesn't support shebang extra params

./setup.sh $@ > /dev/null 2>setup-errors.log

if [ $? -eq 0 ]; then
    exit 0
else
    echo "Setup.sh script failed with an error. Please check file setup-errors.log for more information."
    exit 1
fi
