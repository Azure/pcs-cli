#!/bin/bash -e

list=$(docker ps -aq)

if [ -n "$list" ]; then
    docker rm -f $list
fi
