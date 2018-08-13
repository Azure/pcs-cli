[![Build][build-badge]][build-url]
[![Issues][issues-badge]][issues-url]
[![Gitter][gitter-badge]][gitter-url]

Azure IoT PCS CLI Overview
==========================

Command Line Interface for deploying an [Azure IoT Solution Accelerator](https://www.azureiotsolutions.com) into a
user's Azure subscription.

An IoT Solution Accelerator is open source implementation of common IoT solution patterns that can be
deployed to Azure using an Azure subscription. Each solution combines custom code and services to
implement a specific IoT scenario or scenarios. Any of the solutions can be customized to meet any
specific requirements. Visit [azureiotsolutions.com](https://www.azureiotsolutions.com) for more
details or to deploy using the GUI.

### Solution Types

This CLI has the ability to deploy the following solution types:

1. Remote Monitoring.
1. Device Simulation.
   
### Features

This CLI has the ability to deploy the following configurations of solutions:

1. [basic](#basic) - deploys all resources to a single VM.
1. [standard](#standard) - deploys resources using Azure Container Service and Kubernetes across multiple VMs.
1. [local](#local) - deploys resources to be used for running and debugging microservices locally.

### Documentation

[Deploy remote monitoring using the CLI](https://docs.microsoft.com/azure/iot-suite/iot-suite-remote-monitoring-deploy-cli)

How to use the CLI
==================

## 1. Prerequisites

* [nodejs](https://nodejs.org/) used as the runtime for the CLI.  Please install node before attempting a deployment.
* [Azure Subscription](https://azure.microsoft.com/free/) (also see [permissions guidelines](https://docs.microsoft.com/azure/iot-suite/iot-suite-permissions))

## 2. Install the CLI
### Using package published to npm

 `npm install -g iot-solutions`

### For developers making changes to the cli

### Clone the CLI repository

`git clone https://github.com/Azure/pcs-cli.git`

### Build the CLI
1. `cd {your-local-repo}` in command line.
1. `npm install`
1. `npm start`
1. `npm link`

## 3. Sign in
Sign in using `pcs login` and credentials for an Azure account.

## 4. Create a deployment
*   ## Remote Monitoring
    ### Basic Deployment
    #### Deploy Azure Resources

    1. Run `pcs -t remotemonitoring -s basic`.  This will deploy a basic deployment (i.e. a deployment to a single VM).
    2. Follow the on-screen prompts
    3. The results of the deployment will be saved to a file named `output.json`

    #### Verify the Web UI and Microservices are deployed

    Click on the link that is shown in the output window to go to the Remote Monitoring web application.

    ### Standard Deployment

    #### Deploy Azure Resources

    1. `pcs -t remotemonitoring -s standard --servicePrincipalId {servicePrincipalId} --servicePrincipalSecret {servicePrincipalSecret}`
    2. Follow the on-screen prompts
    3. The results of the deployment will be saved to a file named {deployment-name}-output.json

    **Tip:**

    > To get more info about service principal creation please go
    [here](https://docs.microsoft.com/cli/azure/create-an-azure-service-principal-azure-cli). Use the `--password` option for service principal creation.

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

    #### Verify the Web UI and Microservices are deployed

    1. Click on the link that is shown in the output window to go to the Remote Monitoring web application.
    2. It can take upto 5 minutes for the webapp to be ready
    3. Go to {azurewebitesurl}/hubmanager/v1/status to see HubManager microservice status
    4. Go to {azurewebitesurl}/devices/v1/status to see Devices microservice status

    ### Local Deployment
    Please look [here](https://docs.microsoft.com/azure/iot-suite/iot-suite-remote-monitoring-deploy-local for more information for using this option)
    1. `pcs -s local`
    2. Follow onscreen prompts to start the deployment

*   ## Device Simulation
    ### Deployment With Hub
    #### Deploy Azure Resources

    1. Run `pcs -t devicesimulation`.  This will deploy a basic deployment (i.e. a deployment to a single VM).
    1. Follow the on-screen prompts
    2. The results of the deployment will be saved to a file named `output.json`

    #### Verify the Web UI and Microservices are deployed

    Click on the link that is shown in the output window to go to the Device Simulation web application.

    ### Deployment Without Hub
    #### Deploy Azure Resources

    1. Run `pcs -t devicesimulation-nohub`.  This will deploy a basic deployment (i.e. a deployment to a single VM) without an IoT hub.
    1. Follow the on-screen prompts
    2. The results of the deployment will be saved to a file named `output.json`

    #### Verify the Web UI and Microservices are deployed

    Click on the link that is shown in the output window to go to the Device Simulation web application.


Deployment Options
==================
> These are availble for `remotemonitoring` solution type only.

## Overview

When deploying the preconfigured solution, there are several options that configure the deployment process:

| Option | Values | Description |
| ------ | ------ | ----------- |
| SKU    | `basic`, `standard`, `local` | A _basic_ deployment is intended for test and demonstrations, it deploys all the microservices to a single virtual machine. A _standard_ deployment is intended for production, it deploys the microservices to multiple virtual machines. A _local_ deployment configures a Docker container to run the microservices locally, and uses Azure services, such as storage and Cosmos DB, in the cloud. |
| Runtime | `dotnet`, `java` | Selects the language implementation of the microservices. |

To learn about how to use the local deployment, see [Running the remote monitoring solution locally](https://github.com/Azure/azure-iot-pcs-remote-monitoring-dotnet/wiki/Running-the-Remote-Monitoring-Solution-Locally#deploy-azure-services-and-set-environment-variables).

## Basic

The purpose of the basic deployment is to demo the capabilities of the system
and requires minimal setup, deploying all resources to a single VM.

Creating a basic solution will result in the following Azure services being
provisioned into the subscription:

| Resource                       | Used For  |
|--------------------------------|-----------|
| [Linux Virtual Machine][virtual-machines]  | Hosting microservices |
| [Azure IoT Hub][iot-hub]                   | Device management and communication |
| [Azure Cosmos DB][cosmos-db]               | Stores configuration data, and device telemetry like rules, alerts, and messages |
| [Azure Storage Account][storage-account]   | Storage for checkpoints |
| [Azure Stream Analytics][stream-analytics] | Transforms data into messages and alerts<br/>Processes and stores telemetry, and create alarms |
| [Azure Event Hub][event-hub]               | Used for device notifications |
| [App Service][web-application]             | Application gateway with valid SSL certificate |

## Standard

The standard deployment is a production-ready deployment a developer can
customize and extend to meet their needs. The standard deployment option should be used when
ready to customize a production-ready architecture, built for scale and
extensibility. Application microservices are built as Docker containers and deployed using an orchestrator
([Kubernetes](https://kubernetes.io/) by default). The orchestrator is
responsible for deployment, scaling, and management of the application.

Creating a standard solution will result in the following Azure services being
provisioned into the subscription:

| Resource                                     | Used For |
|----------------------------------------------|----------|
| [Linux Virtual Machines][virtual-machines]   | 1 master and 3 agents for hosting microservices with redundancy |
| [Azure IoT Hub][iot-hub]                     | Device management, command and control |
| [Azure Container Service][container-service] | [Kubernetes](https://kubernetes.io) orchestrator |
| [Azure Cosmos DB][cosmos-db]                 | Stores configuration data, and device telemetry like rules, alerts, and messages |
| [Azure Storage Accounts][storage-account]    | 4 for VM storage, and 1 for the streaming checkpoints |
| [Azure Stream Analytics][stream-analytics]   | Transforms data into messages and alerts<br/>Processes and stores telemetry, and create alarms |
| [App Service][web-application]             | Application gateway with valid SSL certificate |

## Local
The purpose of the local deployment is to deploy the minimal set of services required to set up
the solution for local development.

Creating a local deployment will result in the following Azure services being
provisioned into the subscription:

| Resource                                   | Used For  |
|--------------------------------------------|-----------|
| [Azure IoT Hub][iot-hub]                   | Device management and communication |
| [Azure Cosmos DB][cosmos-db]               | Storing configuration data, and device telemetry like rules, alerts, and messages |
| [Azure Storage Account][storage-account]   | Storage for checkpoints |

> Pricing information for these services can be found
[here](https://azure.microsoft.com/pricing). Usage amounts and billing details
for a subscription can be found in the
[Azure Portal](https://portal.azure.com/).

Configuration
=============

## Kubernetes Dashboard

1. Go to ~\{HOMEDIR}\.kube\config-{solutionname}-cluster and rename it to ~\{HOMEDIR}\.kube\config. Please take a backup of your ~\{HOMEDIR}\.kube\config file if it exists
1. {HOMEDIR} for windows - C:\Users\xyz, for mac - /Users/xyz
1. To view Kubernetes dashboard, run the following command, which will start a local
web proxy for your cluster (it will start a local server at http://127.0.0.1:8001/api/v1/namespaces/kube-system/services/kubernetes-dashboard/proxy/):

`kubectl proxy`

## CLI Options

To get help run `pcs -h` or `--help` \
To get the version run `pcs -v` or `--version`

Feedback
========

Please enter issues, bugs, or suggestions as GitHub Issues here: https://github.com/Azure/pcs-cli/issues.

Contributing
=======

See [Contributing.md](CONTRIBUTING.md)

# License

Copyright (c) Microsoft Corporation. All rights reserved.
Licensed under the [MIT](LICENSE) License.

[build-badge]: https://img.shields.io/travis/Azure/pcs-cli.svg
[build-url]: https://travis-ci.org/Azure/pcs-cli
[issues-badge]: https://img.shields.io/github/issues/azure/pcs-cli.svg
[issues-url]: https://github.com/azure/pcs-cli/issues
[gitter-badge]: https://img.shields.io/gitter/room/azure/iot-solutions.js.svg
[gitter-url]: https://gitter.im/azure/iot-solutions

[stream-analytics]: https://azure.microsoft.com/services/stream-analytics
[event-hub]: https://azure.microsoft.com/services/event-hubs
[azure-active-directory]: https://azure.microsoft.com/services/active-directory
[iot-hub]: https://azure.microsoft.com/services/iot-hub
[cosmos-db]: https://azure.microsoft.com/services/cosmos-db
[container-service]: https://azure.microsoft.com/services/container-service
[storage-account]: https://docs.microsoft.com/azure/storage/common/storage-introduction#types-of-storage-accounts
[virtual-machines]: https://azure.microsoft.com/services/virtual-machines
[web-application]: https://azure.microsoft.com/services/app-service/web
