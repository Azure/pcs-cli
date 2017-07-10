[![Build][build-badge]][build-url]
[![Issues][issues-badge]][issues-url]
[![Gitter][gitter-badge]][gitter-url]

Azure Remote Monitoring CLI
=================

CLI for deploying remote monitoring solution into a user's subscription

Overview
========

To execute the script run `remote-cli` the prompts will walk you through steps \
To get help run `remote-cli -h` \
To get the version run `remote-cli -v`

Pre-requisite
=============

1) [Install Azure CLI 2.0](https://docs.microsoft.com/en-us/cli/azure/install-azure-cli)
2) [Install kubectl](https://kubernetes.io/docs/tasks/tools/install-kubectl/)

> **Important** \
Make sure both paths are set in environment variables on Windows. You should be able to type 'az' or 'kubectl' in console window and see the help content.

How to use it
=============

## Deploying azure resources for remote monitoring
1) Clone the project
2) `npm install -g`
3) `npm link`
4) `npm start`
5) `remote-cli`
6) Save output result of deployment

**Sample output format**
<pre><code>
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
    "value": "{"HostName={hubname}.azure-devices.net;
    SharedAccessKeyName={policy type};SharedAccessKey={Access Key}"}"
}
</pre></code>

> **Important** \
To create a service principal, you must have permissions to register an application with \
your Azure Active Directory(AAD) tenant, and to assign the application to a role in your \
subscription. To see if you have the required permissions, [check in the Portal](https://docs.microsoft.com/en-us/azure/azure-resource-manager/resource-group-create-service-principal-portal#required-permissions).

## Create a Container Service for Kubernetes
1) `az login`
2) `az account set --subscription {subscriptionId from step 6}`
3) `az acs create -n {myClusterName} -d {myDNSPrefix} -g {resouceGroup from step 6} --generate-ssh-keys --orchestrator-type kubernetes`
4) `az acs kubernetes get-credentials --resource-group={myResorceGroupName} --name={myClusterName} --ssh-key-file {path to ssh key file to use}`

> **Important** \
If your account doesn't have the Azure Active Directory(AAD) and subscription permissions to create a service principal, the command generates an error similar to **Insufficient privileges to complete the operation.**

## Deploy Docker images through Kubernetes
To verify access test with `kubectl get nodes`
1) `kubectl create -f .\scripts\nginx-ingress-controller.yaml`
2) Goto your resource group on [portal.azure.com](http://portal.azure.com) and set up friendly DNS name for Public IP address that got created in step 1. It will start with **{myClusterName}**. To confirm match the IP address with "LoadBalance Ingress" by running `kubectl describe svc nginx-ingress`
3) Replace following values in file .\scripts\all-in-one.yaml
    * **{Friendly DNS name}** with value from step 2
    * **{Your IoT Hub connection string}**
4) `kubectl create -f .\scripts\all-in-one.yaml`

## Verify the webui and microservices are deployed
1) Goto {Friendly DNS name} name in browser to see the webui
2) Goto {Friendly DNS name}/hubmanager/v1/status to see HubManager microservice status
3) Goto {Friendly DNS name}/devices/v1/status to see Devices microservice status

Configuration
=============

To view Kubernetes dashboard run following command \
`az acs kubernetes browse -g {myResourceGroupName} -n {myClusterName} --ssh-key-file {path to ssh file}`

Other documents
===============

* [Contributing and Development setup](CONTRIBUTING.md)
* [Development setup, scripts and tools](DEVELOPMENT.md)

[build-badge]: https://img.shields.io/travis/Azure/azure-remote-monitoring-cli.svg
[build-url]: https://travis-ci.com/Azure/azure-remote-monitoring-cli
[issues-badge]: https://img.shields.io/github/issues/azure/azure-remote-monitoring-cli.svg
[issues-url]: https://github.com/azure/azure-remote-monitoring-cli/issues
[gitter-badge]: https://img.shields.io/gitter/room/azure/iot-pcs.js.svg
[gitter-url]: https://gitter.im/azure/iot-pcs
