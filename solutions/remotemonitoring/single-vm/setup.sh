#!/bin/bash -ex

APP_PATH="/app"
ENVVARS="${APP_PATH}/env-vars"
DOCKERCOMPOSE="${APP_PATH}/docker-compose.yml"
CERTS="${APP_PATH}/certs"
CERT="${CERTS}/tls.crt"
PKEY="${CERTS}/tls.key"

# ========================================================================

export HOST_NAME="localhost"
export PCS_LOG_LEVEL="Info"
export APP_RUNTIME="dotnet"
export PCS_APPLICATION_SECRET=$(cat /dev/urandom | LC_CTYPE=C tr -dc 'a-zA-Z0-9-,./;:[]\(\)_=^!~' | fold -w 64 | head -n 1)

while [ "$#" -gt 0 ]; do
    case "$1" in
        --hostname)                     HOST_NAME="$2" ;;
        --log-level)                    PCS_LOG_LEVEL="$2" ;;
        --runtime)                      APP_RUNTIME="$2" ;;
        --ssl-certificate)              PCS_CERTIFICATE="$2" ;;
        --ssl-certificate-key)          PCS_CERTIFICATE_KEY="$2" ;;
        --release-version)              PCS_RELEASE_VERSION="$2" ;;
        --docker-tag)                   PCS_DOCKER_TAG="$2" ;;
        --aad-appid)                    PCS_AAD_APPID="$2" ;;
        --aad-appsecret)                PCS_AAD_APPSECRET="$2" ;;
        --keyvault-name)                PCS_KEYVAULT_NAME="$2" ;;
    esac
    shift
done

# ========================================================================
# Validate parameters and exit if validation failed.

validate_parameters() {
    if [ -z "$PCS_RELEASE_VERSION" ]; then 
        echo "Release version not specified (see --release-version)" 
        exit 1 
    fi
}

validate_parameters
# ========================================================================

# TODO: move files to Remote Monitoring repositories
REPOSITORY="https://raw.githubusercontent.com/Azure/pcs-cli/${PCS_RELEASE_VERSION}/solutions/remotemonitoring/single-vm"
SCRIPTS_URL="${REPOSITORY}/scripts/"

# ========================================================================

### Install Docker
install_docker_ce() {
    if (echo $HOST_NAME | grep -c  "\.cn$") ; then
        # If the host name has .cn suffix, dockerhub in China will be used to avoid slow network traffic failure.
        DOCKER_DOWNLOAD_URL="https://mirror.azure.cn/docker-ce/linux/"
    else
        DOCKER_DOWNLOAD_URL="https://download.docker.com/linux/"
    fi

    # The package console-setup tries to prompt the user for an encoding on install thus causing timeouts 
    # on our installation. For this reason we hold this package.

    apt-get update -o Acquire::CompressionTypes::Order::=gz \
        && apt-mark hold walinuxagent \
        && apt-mark hold console-setup \
        && apt-get upgrade -y \
        && apt-get update \
        && apt-mark unhold walinuxagent \
        && apt-get remove docker docker-engine docker.io \
        && apt-get -y --allow-downgrades --allow-remove-essential --allow-change-held-packages --no-install-recommends install apt-transport-https ca-certificates curl gnupg2 software-properties-common \
        && curl -fsSL $DOCKER_DOWNLOAD_URL$(. /etc/os-release; echo "$ID")/gpg | sudo apt-key add - \
        && add-apt-repository "deb [arch=amd64] $DOCKER_DOWNLOAD_URL$(. /etc/os-release; echo "$ID") $(lsb_release -cs) stable" \
        && apt-get update \
        && apt-get -y --allow-downgrades install docker-ce docker-compose \
        && docker run --rm hello-world && docker rmi hello-world

    local RESULT=$?
    if [ $RESULT -ne 0 ]; then
        INSTALL_DOCKER_RESULT="FAIL"
    else
        INSTALL_DOCKER_RESULT="OK"
    fi
}

### Install docker and retry one more time if first try failed
install_docker_ce_retry() {
    set +e
    INSTALL_DOCKER_RESULT="OK"
    install_docker_ce
    if [ "$INSTALL_DOCKER_RESULT" != "OK" ]; then
        echo "Error: first attempt to install Docker failed, retrying..."
        # Retry once, in case apt wasn't ready
        sleep 30
        install_docker_ce
        if [ "$INSTALL_DOCKER_RESULT" != "OK" ]; then
            echo "Error: Docker installation failed"
            exit 1
        fi
    fi
    set -e
}

install_docker_ce_retry
# ========================================================================

# Configure Docker registry based on host name
# ToDo: Verify if needed still
config_for_azure_china() {
    set +e
    local host_name=$1
    if (echo $host_name | grep -c  "\.cn$") ; then
        # If the host name has .cn suffix, dockerhub in China will be used to avoid slow network traffic failure.
        local config_file='/etc/docker/daemon.json'
        echo "{\"registry-mirrors\": [\"https://registry.docker-cn.com\"]}" > ${config_file}
        service docker restart

        # Rewrite the AAD issuer in Azure China environment
        export PCS_AUTH_ISSUER="https://sts.chinacloudapi.cn/${PCS_AUTH_ISSUER}/"
    else
        export PCS_AUTH_ISSUER="https://sts.windows.net/${PCS_AUTH_ISSUER}/"
    fi
    set -e
}

config_for_azure_china $HOST_NAME $5

# ========================================================================
# Configure SSH to not use weak HostKeys, algorithms, ciphers and MAC algorithms.
# Comment out the option if exists or ignore it.
switch_off() {
    local key=$1
    local value=$2
    local config_path=$3
    sed -i "s~#*$key\s*$value~#$key $value~g" $config_path
}

# Change existing option if found or append specified key value pair.
switch_on() {
    local key=$1
    local value=$2
    local config_path=$3
    grep -q "$key" $config_path && sed -i -e "s/$key.*/$key $value/g" $config_path || sed -i -e "\$a$key $value" $config_path
}

config_ssh() {
    local config_path="${1:-/etc/ssh/sshd_config}"
    switch_off 'HostKey' '/etc/ssh/ssh_host_dsa_key' $config_path
    switch_off 'HostKey' '/etc/ssh/ssh_host_ecdsa_key' $config_path
    switch_on 'KexAlgorithms' 'curve25519-sha256@libssh.org,diffie-hellman-group-exchange-sha256' $config_path
    switch_on 'Ciphers' 'chacha20-poly1305@openssh.com,aes256-gcm@openssh.com,aes128-gcm@openssh.com,aes256-ctr,aes192-ctr,aes128-ctr' $config_path
    switch_on 'MACs' 'hmac-sha2-512-etm@openssh.com,hmac-sha2-256-etm@openssh.com,hmac-ripemd160-etm@openssh.com,umac-128-etm@openssh.com,hmac-sha2-512,hmac-sha2-256,hmac-ripemd160,umac-128@openssh.com' $config_path
    service ssh restart
}

config_ssh

# ========================================================================

mkdir -p ${APP_PATH}
chmod ugo+rX ${APP_PATH}
cd ${APP_PATH}

# ========================================================================

# Docker compose file

# Note: the "APP_RUNTIME" var needs to be defined before getting here
DOCKERCOMPOSE_SOURCE="${REPOSITORY}/docker-compose.${APP_RUNTIME}.yml"
wget $DOCKERCOMPOSE_SOURCE -O ${DOCKERCOMPOSE}
sed -i 's/${PCS_DOCKER_TAG}/'${PCS_DOCKER_TAG}'/g' ${DOCKERCOMPOSE}

# ========================================================================

# HTTPS certificates
mkdir -p ${CERTS}
touch ${CERT} && chmod 444 ${CERT}
touch ${PKEY} && chmod 444 ${PKEY}
# Always have quotes around the certificate and key value to preserve the formatting
echo "${PCS_CERTIFICATE}"      > ${CERT}
echo "${PCS_CERTIFICATE_KEY}"  > ${PKEY}

# ========================================================================

# Download scripts
wget $SCRIPTS_URL/logs.sh     -O /app/logs.sh     && chmod 750 /app/logs.sh
wget $SCRIPTS_URL/simulate.sh -O /app/simulate.sh && chmod 750 /app/simulate.sh
wget $SCRIPTS_URL/start.sh    -O /app/start.sh    && chmod 750 /app/start.sh
wget $SCRIPTS_URL/auth.sh     -O /app/auth.sh     && chmod 750 /app/auth.sh
wget $SCRIPTS_URL/stats.sh    -O /app/stats.sh    && chmod 750 /app/stats.sh
wget $SCRIPTS_URL/status.sh   -O /app/status.sh   && chmod 750 /app/status.sh
wget $SCRIPTS_URL/stop.sh     -O /app/stop.sh     && chmod 750 /app/stop.sh
wget $SCRIPTS_URL/update.sh   -O /app/update.sh   && chmod 750 /app/update.sh

# Temporarily disabled - The update scenario requires some work
# wget $SCRIPTS_REPO/update.sh   -O /app/update.sh   && chmod 750 /app/update.sh

# ========================================================================

# Environment variables
touch ${ENVVARS} && chmod 440 ${ENVVARS}

echo "export HOST_NAME=\"${HOST_NAME}\""                                                                 >> ${ENVVARS}
echo "export APP_RUNTIME=\"${APP_RUNTIME}\""                                                             >> ${ENVVARS}
echo "export PCS_KEYVAULT_NAME=\"${PCS_KEYVAULT_NAME}\""                                                 >> ${ENVVARS}
echo "export PCS_AAD_APPID=\"${PCS_AAD_APPID}\""                                                         >> ${ENVVARS}
echo "export PCS_AAD_APPSECRET=\"${PCS_AAD_APPSECRET}\""                                                 >> ${ENVVARS}
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

nohup /app/start.sh > /dev/null 2>&1&
