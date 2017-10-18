[![Build][build-badge]][build-url]
[![Issues][issues-badge]][issues-url]
[![Gitter][gitter-badge]][gitter-url]

Azure IoT PCS CLI Overview
==========================

Command Line Interface for deploying an IoT preconfigured solution into a
user's subscription.

This CLI has the ability to deploy two configurations of PCS solutions:

1. Basic - deploys all resources to a single VM.
2. Standard - deploys resources using Azure Container Service and Kubernetes across multiple VMs.

Dependencies
============
The command line interface depends on:

* [nodejs](https://nodejs.org/en/) used as the runtime for the CLI.  Please install node before attempting a deployment.

## Basic

The purpose of the basic deployment is to demo the capabilities of the system
and requires minimal setup, deploying all resources to a single VM.

Basic deployment provisions following resources:

1. [Azure IoT Hub](https://azure.microsoft.com/en-us/services/iot-hub/)
2. [Azure Cosmos DB](https://docs.microsoft.com/en-us/azure/cosmos-db/create-documentdb-dotnet)
3. [Azure Storage](https://azure.microsoft.com/en-us/services/storage/)
4. [Single instance of Azure Virtual Machine with Docker Extension](https://azure.microsoft.com/en-us/services/virtual-machines/)

At the end of deployment, Remote Monitoring WebApp and all the microservices
are ready for demo pursposes.

## Standard

The Standard deployment offers a production ready deployment that can be
scaled up or down as needed. It uses
[Azure Container Service](https://azure.microsoft.com/en-us/services/container-service/)
and [Kubernetes](https://kubernetes.io/) for orchestration. It would be nice to have installed
[kubectl](https://docs.microsoft.com/en-us/cli/azure/install-azure-cli) for running commands on kubernetes
in addition to ```pcs```.

Standard deployment provisions following resources:

1. [Azure IoT Hub](https://azure.microsoft.com/en-us/services/iot-hub/)
2. [Azure Cosmos DB](https://docs.microsoft.com/en-us/azure/cosmos-db/create-documentdb-dotnet)
3. [Azure Container Service](https://azure.microsoft.com/en-us/services/container-service/)
   which also provisions following:
   1. [Azure Storage](https://azure.microsoft.com/en-us/services/storage/)
   2. [Three instances of Azure Virtual Machine with Docker](https://azure.microsoft.com/en-us/services/virtual-machines/)

How to use the CLI
==================
## Clone the CLI repository
1. `git clone https://github.com/Azure/pcs-cli.git`

## Install CLI
In locally cloned directory run
1. `npm install`
1. `npm start`
1. `npm link`


## Basic Deployment

### Deploy Azure Resources

1. If you haven't logged in with your Azure account from the command prompt run `pcs login`.
1. Run either `pcs` or `pcs -t remotemonitoring -s basic`.  These are equivalent in that they will both deploy a basic deployment (i.e. a deployment to a single VM).
1. Follow the on-screen prompts
1. The results of the deployment will be saved to a file named `output.json`

### Verify the Web UI and Microservices are deployed

Click on the link that is shown in the output window, it will take you to
the Remote Monitoring WebApp

## Standard Deployment

### Deploy Azure Resources

1. `pcs -t remotemonitoring -s standard`
2. Follow the on-screen prompts
3. The results of the deployment will be saved to a file named {deployment-name}-output.json 

**Sample output format:**
```json
"resourceGroup" : {
    "type": "string",
    "value": "{myResourceGroupName}"
},
"iotHubHostName": {
    "type": "string",
    "value": "{myIoTHubHostName}"
},
"iotHubConnectionString": {
    "type": "string",
    "value": "{HostName={hubname}.azure-devices.net;
    SharedAccessKeyName={policy type};SharedAccessKey={Access Key};}"
},
"documentDBConnectionString" : {
    "type": "string",
    "value": "{AccountEndpoint={URI};AccountKey={Key};}"
}
```

### Verify the Web UI and Microservices are deployed

1. Click on the link that is shown in the output window, it will take you to
   the Remote Monitoring WebApp
1. It can take upto 5 minutes for the webapp to be ready
1. Go to {azurewebitesurl}/hubmanager/v1/status to see HubManager microservice status
1. Go to {azurewebitesurl}/devices/v1/status to see Devices microservice status

Configuration
=============

## Kubernetes Dashboard

To view Kubernetes dashboard, run the following command, which will start a local
web proxy for your cluster (it will start a local server at http://127.0.0.1:8001/ui):

`kubectl proxy`

## CLI Options

To get help run `pcs -h` or `--help` \
To get the version run `pcs -v` or `--version`

Feedback
========

Please enter issues, bugs, or suggestions as GitHub Issues here: https://github.com/Azure/pcs-cli/issues.

Related
=======

* [Contributing](CONTRIBUTING.md)

[build-badge]: https://img.shields.io/travis/Azure/pcs-cli.svg
[build-url]: https://travis-ci.org/Azure/pcs-cli
[issues-badge]: https://img.shields.io/github/issues/azure/pcs-cli.svg
[issues-url]: https://github.com/azure/pcs-cli/issues
[gitter-badge]: https://img.shields.io/gitter/room/azure/iot-solutions.js.svg
[gitter-url]: https://gitter.im/azure/iot-solutions
