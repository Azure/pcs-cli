[![Build][build-badge]][build-url]
[![Issues][issues-badge]][issues-url]
[![Gitter][gitter-badge]][gitter-url]

# Azure IoT PCS CLI Overview

Command Line Interface for deploying an IoT pre-configured solution into a user's subscription

This CLI has two SKUs available
1. Basic
2. Enterprise

## Basic
The purpose of the basic deployment is to demo the capabilities of the system and requires minimal setup. 

Basic deployment provisions following resources:
1. [Azure IoT Hub](https://azure.microsoft.com/en-us/services/iot-hub/)
1. [Azure Cosmos DB](https://docs.microsoft.com/en-us/azure/cosmos-db/create-documentdb-dotnet)
1. [Azure Storage](https://azure.microsoft.com/en-us/services/storage/)
1. [Single instance of Azure Virtual Machine with Docker Extension](https://azure.microsoft.com/en-us/services/virtual-machines/)

At the end of deployment Remote Monitoring Webapp and all the microservices are ready for demo pursposes

## Enterprise
The enterprise deployment offers a production ready deployment that can be scaled up or down as needed. It uses [Azure Container Service](https://azure.microsoft.com/en-us/services/container-service/) and [Kubernetes](https://kubernetes.io/) for orcenstration. It also requires some manual steps in running commands through different CLIs like [az](https://docs.microsoft.com/en-us/cli/azure/install-azure-cli) and [kubectl](https://docs.microsoft.com/en-us/cli/azure/install-azure-cli) in addition to ```pcs```

Enterprise deployment provisions following resources:
1. [Azure IoT Hub](https://azure.microsoft.com/en-us/services/iot-hub/)
1. [Azure Cosmos DB](https://docs.microsoft.com/en-us/azure/cosmos-db/create-documentdb-dotnet)
1. [Azure Container Service](https://azure.microsoft.com/en-us/services/container-service/)  which also provisions following:
    1. [Azure Storage](https://azure.microsoft.com/en-us/services/storage/)
    1. [Three instances of Azure Virtual Machine with Docker](https://azure.microsoft.com/en-us/services/virtual-machines/)

# How to use the CLI

## CLI setup
1) Clone the project
3) `npm install`
4) `npm start`
5) `npm link`

## Basic Deployment
### Deploy Azure Resources

1) `pcs` or `pcs -t remotemonitoring -s basic`
2) Follow the on-screen prompts
3) The results of the deployment will be saved to a file named output.json 

### Verify the Web UI and Microservices are deployed
Click on the link that is shown in the output window, it will take you to the Remote Monitoring WebApp

## Enterprise Deployment
### Dependendencies

- [Install Azure CLI 2.0](https://docs.microsoft.com/en-us/cli/azure/install-azure-cli)
- [Install kubectl](https://kubernetes.io/docs/tasks/tools/install-kubectl/)

> **Important** \
Make sure the path of az and kubectl are set in environment variables. You should be able to type 'az' or 'kubectl' in console window and see the help content.

### Deploy Azure Resources

1) `pcs -t remotemonitoring -s enterprise`
2) Follow the on-screen prompts
3) The results of the deployment will be saved to a file named {deployment-name}-output.json 

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

> **Important** \
To create a service principal, you must have permissions to register an application with \
your Azure Active Directory(AAD) tenant, and to assign the application to a role in your \
subscription. To see if you have the required permissions, [check in the Portal](https://docs.microsoft.com/en-us/azure/azure-resource-manager/resource-group-create-service-principal-portal#required-permissions).

### Create a Container Service for Kubernetes
1) `az login`
2) `az account set --subscription {subscriptionId }` from step 3 of [Deploy Azure Resources](README.md#deploy-azure-resources-1)
3) `az acs create -n {myClusterName} -d {myDNSPrefix} -g {resouceGroup} -t kubernetes --generate-ssh-keys` where resouceGroup from step 3 of [Deploy Azure Resources](README.md#deploy-azure-resources-1)
4) `az acs kubernetes get-credentials -g {myResorceGroupName} -n {myClusterName} --ssh-key-file {path to ssh key file to use}`

### Deploy Docker images through Kubernetes
To verify access test with `kubectl get nodes`
1) `kubectl create -f .\remotemonitoring\scripts\nginx-ingress-controller.yaml`
2) Go to your resource group on [portal.azure.com](http://portal.azure.com) and set up friendly DNS name for Public IP address that got created in step 3 of [Create a Container Service for Kubernetes](README.md#create-a-container-service-for-kubernetes). It will start with **{myClusterName}**. To confirm match the IP address with "LoadBalancer Ingress" by running `kubectl describe svc nginx-ingress`
3) Add actual values in the ConfigMap section in file [all-in-one.yaml](https://github.com/Azure/pcs-cli/blob/master/remotemonitoring/scripts/all-in-one.yaml) and [deployment-configmap.yaml](https://github.com/Azure/pcs-cli/blob/master/remotemonitoring/scripts/individual/deployment-configmap.yaml). \
Values to replace will be of format **"{...}"**. Some examples below.
    * **{DNS}** with value from step 2
    * **{IoT Hub connection string}**
    * **{DocumentDB connection string}**
4) `kubectl create -f .\remotemonitoring\scripts\all-in-one.yaml`

> **Important** \
If your account doesn't have the Azure Active Directory(AAD) and subscription permissions to create a service principal, the command generates an error similar to **Insufficient privileges to complete the operation.** \
Also when using **--generate-ssh-keys** if one already exists under ~/.ssh/id_rsa then it will be used

### Verify the Web UI and Microservices are deployed
1. Click on the link that is shown in the output window, it will take you to the Remote Monitoring WebApp
1. Go to {DNS}/hubmanager/v1/status to see HubManager microservice status
1. Go to {DNS}/devices/v1/status to see Devices microservice status

# Configuration

## Kubernetes Dashboard

To view Kubernetes dashboard run following command which will start local web proxy for your cluster (it will start a local server at 127.0.0.1:8001/ui) \
`az acs kubernetes browse -g {myResourceGroupName} -n {myClusterName} --ssh-key-file {path to ssh file}`

## CLI Options
To get help run `pcs -h` or `--help` \
To get the version run `pcs -v` or `--version`

# Feedback

Please enter issues, bugs, or suggestions as GitHub Issues here: https://github.com/Azure/pcs-cli/issues.

# Related

* [Contributing and Development setup](CONTRIBUTING.md)

[build-badge]: https://img.shields.io/travis/Azure/iot-pcs-cli.svg
[build-url]: https://travis-ci.com/Azure/iot-pcs-cli
[issues-badge]: https://img.shields.io/github/issues/azure/iot-pcs-cli.svg
[issues-url]: https://github.com/azure/iot-pcs-cli/issues
[gitter-badge]: https://img.shields.io/gitter/room/azure/iot-pcs.js.svg
[gitter-url]: https://gitter.im/azure/iot-pcs
