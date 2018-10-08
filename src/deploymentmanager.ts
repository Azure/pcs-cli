import * as chalk from 'chalk';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as fetch from 'node-fetch';
import * as cp from 'child_process';

import { ResourceManagementClient, ResourceModels } from 'azure-arm-resource';
import { AzureEnvironment, DeviceTokenCredentials, DeviceTokenCredentialsOptions, ApplicationTokenCredentials } from 'ms-rest-azure';
import StreamAnalyticsManagementClient = require('azure-arm-streamanalytics');
import { Answers, Question } from 'inquirer';
import DeployUI from './deployui';
import { Client, ConnectConfig, SFTPWrapper } from 'ssh2';
import { IK8sManager, K8sManager } from './k8smanager';
import { Config } from './config';
import { genPassword } from './utils';
import { TokenCredentials, ServiceClientCredentials } from 'ms-rest';

type ResourceGroup = ResourceModels.ResourceGroup;
type Deployment = ResourceModels.Deployment;
type DeploymentProperties = ResourceModels.DeploymentProperties;
type DeploymentExtended = ResourceModels.DeploymentExtended;
type DeploymentOperationsListResult = ResourceModels.DeploymentOperationsListResult;
type DeploymentOperation = ResourceModels.DeploymentOperation;
type DeploymentValidateResult = ResourceModels.DeploymentValidateResult;

const MAX_RETRY = 60;
const KUBEDIR = os.homedir() + path.sep + '.kube';

export interface IDeploymentManager {
    submit(answers: Answers | undefined): Promise<any>;
    getLocations(): Promise<string[] | undefined>;
}

export class DeploymentManager implements IDeploymentManager {
    private _credentials: ServiceClientCredentials;
    private _environment: AzureEnvironment;
    private _solutionType: string;
    private _sku: string;
    private _template: any;
    private _parameters: any;
    private _subscriptionId: string;
    private _client: ResourceManagementClient;
    private _streamAnalyticsClient: StreamAnalyticsManagementClient;

    constructor(credentials: ServiceClientCredentials,
                environment: AzureEnvironment,
                subscriptionId: string,
                solutionType: string,
                sku: string) {
        this._credentials = credentials;
        this._environment = environment;
        this._solutionType = solutionType;
        this._sku = sku;
        this._subscriptionId = subscriptionId;
        const baseUri = environment ? environment.resourceManagerEndpointUrl : undefined;
        this._client = new ResourceManagementClient(this._credentials, subscriptionId, baseUri);
        this._streamAnalyticsClient = new StreamAnalyticsManagementClient(this._credentials, subscriptionId, baseUri);
    }

    public getLocations(): Promise<string[] | undefined> {
        // Currently IotHub is not supported in all the regions so using it to get the available locations
        return this._client.providers.get('Microsoft.Devices')
        .then((providers: ResourceModels.Provider) => {
            if (providers.resourceTypes) {
                const resourceType = providers.resourceTypes.filter((x) => x.resourceType && x.resourceType.toLowerCase() === 'iothubs');
                if (resourceType && resourceType.length) {
                    return resourceType[0].locations;
                }
            }
        });
    }

    public submit(answers: Answers): Promise<any> {
        if (!!!answers || !!!answers.solutionName || !!!answers.subscriptionId || !!!answers.location) {
            return Promise.reject('Solution name, subscription id and location cannot be empty');
        }

        const location = answers.location;
        const deployment: Deployment = {
            properties: {
                mode: 'Incremental',
            }
        };
        const deployUI = DeployUI.instance;
        const deploymentName = 'deployment-' + answers.solutionName;
        let deploymentProperties: any = null;
        let resourceGroupUrl: string;
        let resourceGroup: ResourceGroup = {
            location,
            // TODO: Explore if it makes sense to add more tags, e.g. Language(Java/.Net), version etc
            tags: { IotSolutionType: this._solutionType },
        };

        const environment = this._environment;
        let portalUrl = 'https://portal.azure.com';
        let storageEndpointSuffix: string;
        let azureVMFQDNSuffix: string;
        let activeDirectoryEndpointUrl: string;

        if (this._solutionType === 'remotemonitoring') {
            const armTemplatePath = __dirname + path.sep + 'solutions' + path.sep + this._solutionType + path.sep + 'armtemplates' + path.sep;
            this._parameters = require(armTemplatePath + this._sku + '-parameters.json');
            // using static map for China environment by default since Azure Maps resource is not available.
            if (environment && environment.name === AzureEnvironment.AzureChina.name) {
                this._sku += '-static-map';
            }
            this._template = require(armTemplatePath + this._sku + '.json');
        } else {
            const armTemplatePath = __dirname + path.sep + 'solutions' + path.sep + this._solutionType + path.sep + 'armtemplate' + path.sep;
            this._template = require(armTemplatePath + 'template.json');
            this._parameters = require(armTemplatePath + 'parameters.json');
        }
        try {
            // Change the default suffix for basic sku based on current environment
            if (environment) {
                switch (environment.name) {
                    case AzureEnvironment.AzureChina.name:
                        azureVMFQDNSuffix = 'cloudapp.chinacloudapi.cn';
                        break;
                    case AzureEnvironment.AzureGermanCloud.name:
                        azureVMFQDNSuffix = 'cloudapp.azure.de';
                        break;
                    case AzureEnvironment.AzureUSGovernment.name:
                        azureVMFQDNSuffix = 'cloudapp.azure.us';
                        break;
                    default:
                        // use default parameter values of global azure environment
                        azureVMFQDNSuffix = 'cloudapp.azure.com';
                }
                storageEndpointSuffix = environment.storageEndpointSuffix;
                activeDirectoryEndpointUrl = environment.activeDirectoryEndpointUrl;
                if (storageEndpointSuffix.startsWith('.')) {
                    storageEndpointSuffix = storageEndpointSuffix.substring(1);
                }
                if (answers.deploymentSku === 'basic') {
                    this._parameters.storageEndpointSuffix = { value: storageEndpointSuffix };
                    this._parameters.vmFQDNSuffix = { value: azureVMFQDNSuffix };
                    this._parameters.aadInstance = { value: activeDirectoryEndpointUrl };
                }
                if (this._solutionType === 'remotemonitoring') {
                  let serviceBusEndpointSuffix = 'servicebus.windows.net';
                  if (environment.name === AzureEnvironment.AzureChina.name) {
                    serviceBusEndpointSuffix = 'servicebus.chinacloudapi.cn';
                  }
                  this._parameters.serviceBusEndpointSuffix = { value: serviceBusEndpointSuffix };
                }
            }
            this.setupParameters(answers);
        } catch (ex) {
            throw new Error('Could not find template or parameters file, Exception:');
        }

        deployment.properties.parameters = this._parameters;
        deployment.properties.template = this._template;
        deployUI.start(`Creating resource group: ${chalk.cyan(answers.solutionName)}`);
        return this._client.resourceGroups.createOrUpdate(answers.solutionName, resourceGroup)
            .then((result: ResourceGroup) => {
                resourceGroup = result;
                if (environment && environment.portalUrl) {
                    portalUrl = environment.portalUrl;
                }
                resourceGroupUrl = `${portalUrl}/${answers.domainName}#resource${resourceGroup.id}`;
                deployUI.stop({ message: `Created resource group: ${chalk.cyan(resourceGroupUrl)}` });
                deployUI.start('Running validation before deploying resources');
                return this._client.deployments.validate(answers.solutionName, deploymentName, deployment);
            })
            .then((validationResult: DeploymentValidateResult) => {
                if (validationResult.error) {
                    const status = {
                        err: 'Deployment validation failed:\n' + JSON.stringify(validationResult.error, null, 2)
                    };
                    deployUI.stop(status);
                    throw new Error(JSON.stringify(validationResult.error));
                }
                const options = {
                    client: this._client,
                    deploymentName,
                    resourceGroupName: answers.solutionName,
                    totalResources: deployment.properties.template.resources.length as number
                };
                deployUI.start('', options);
                return this._client.deployments.createOrUpdate(answers.solutionName as string, deploymentName, deployment);
            })
            .then((res: DeploymentExtended) => {
                deployUI.stop();
                deploymentProperties = res.properties;

                if (answers.deploymentSku === 'standard') {
                    deployUI.start(`Downloading credentials to setup Kubernetes from: ${chalk.cyan(deploymentProperties.outputs.masterFQDN.value)}`);
                    return this.downloadKubeConfig(deploymentProperties.outputs, answers.sshFilePath);
                }

                if (answers.deploymentSku === 'local') {
                    this.setAndPrintEnvironmentVariables(deploymentProperties.outputs, answers, storageEndpointSuffix);
                }
                return Promise.resolve('');
            })
            .then((kubeConfigPath: string) => {
                if (answers.deploymentSku === 'standard') {
                    deployUI.stop({ message: `Credentials downloaded to config: ${chalk.cyan(kubeConfigPath)}` });
                    const outputs = deploymentProperties.outputs;
                    const config = new Config();
                    config.AADTenantId = answers.aadTenantId;
                    config.AADLoginURL = activeDirectoryEndpointUrl;
                    config.ApplicationId = answers.appId;
                    config.ServicePrincipalSecret = answers.servicePrincipalSecret;
                    config.AzureStorageAccountKey = outputs.storageAccountKey.value;
                    config.AzureStorageAccountName = outputs.storageAccountName.value;
                    config.AzureStorageEndpointSuffix = storageEndpointSuffix;
                    // If we are under the plan limit then we should have received a query key
                    config.AzureMapsKey = outputs.azureMapsKey.value;
                    config.CloudType = this.getCloudType(this._environment.name);
                    config.SolutionName = answers.solutionName;
                    config.IotHubName = outputs.iotHubHostName.value;
                    config.SubscriptionId = outputs.subscriptionId.value;
                    config.DeploymentId = answers.deploymentId;
                    config.DiagnosticsEndpointUrl = answers.diagnosticsEndpointUrl;
                    config.DockerTag = answers.dockerTag;
                    config.DNS = outputs.agentFQDN.value;
                    config.DocumentDBConnectionString = outputs.documentDBConnectionString.value;
                    config.EventHubEndpoint = outputs.eventHubEndpoint.value;
                    config.EventHubName = outputs.eventHubName.value;
                    config.EventHubPartitions = outputs.eventHubPartitions.value.toString();
                    config.IoTHubConnectionString = outputs.iotHubConnectionString.value;
                    config.LoadBalancerIP = outputs.loadBalancerIp.value;
                    config.Runtime = answers.runtime;
                    config.SolutionType = this._solutionType;
                    config.TLS = answers.certData;
                    config.MessagesEventHubConnectionString = outputs.messagesEventHubConnectionString.value;
                    config.MessagesEventHubName = outputs.messagesEventHubName.value;
                    config.ActionsEventHubConnectionString = outputs.actionsEventHubConnectionString.value;
                    config.ActionsEventHubName = outputs.actionsEventHubName.value;
                    config.TelemetryStorgeType = outputs.telemetryStorageType.value;
                    config.TSIDataAccessFQDN = outputs.tsiDataAccessFQDN.value;
                    config.Office365ConnectionUrl = outputs.office365ConnectionUrl.value;
                    config.LogicAppEndpointUrl = outputs.logicAppEndpointUrl.value;
                    const k8sMananger: IK8sManager = new K8sManager('default', kubeConfigPath, config);
                    deployUI.start('Setting up Kubernetes');
                    return k8sMananger.setupAll();
                }
                return Promise.resolve();
            })
            .then(() => {
                if (this._solutionType === 'remotemonitoring') {
                  // wait for streaming jobs to start if it is included in template and sku is not local
                  const outputJobName = deploymentProperties.outputs.streamingJobsName;
                  if (outputJobName) {
                    if (answers.deploymentSku === 'local') {
                      const jobUrl =
                        `${resourceGroupUrl}/providers/Microsoft.StreamAnalytics/streamingjobs/${outputJobName.value}`;
                      console.log(chalk.yellow(
                        `Please start streaming jobs mannually once local containers are running: ${jobUrl} `));
                    } else {
                        deployUI.start(`Waiting for streaming jobs to be started, this could take up to a few minutes.`);
                        return this.waitForStreamingJobsToStart(answers.solutionName, outputJobName.value);
                    }
                  }
                }
                return Promise.resolve(true);
            })
            .then(() => {
                if (answers.deploymentSku !== 'local') {
                    const webUrl = deploymentProperties.outputs.azureWebsite.value;
                    deployUI.start(`Waiting for ${chalk.cyan(webUrl)} to be ready, this could take up to 5 minutes`);
                    return this.waitForWebsiteToBeReady(webUrl);
                }
                return Promise.resolve(true);
            })
            .then((done: boolean) => {
                const directoryPath = process.cwd() + path.sep + 'deployments';
                if (!fs.existsSync(directoryPath)) {
                    fs.mkdirSync(directoryPath);
                }
                const fileName: string = directoryPath + path.sep + deploymentName + '-output.json';
                const troubleshootingGuide = this._solutionType === 'remotemonitoring' ? 'https://aka.ms/iot-rm-tsg' : '';

                if (answers.deploymentSku === 'local') {
                    return Promise.resolve();
                } else if (deploymentProperties.outputs.azureWebsite) {
                    const webUrl = deploymentProperties.outputs.azureWebsite.value;
                    const status = {
                        message: `Solution: ${chalk.cyan(answers.solutionName)} is deployed at ${chalk.cyan(webUrl)}`
                    };
                    if (!done) {
                        status.message += `\n${chalk.yellow('Website not yet available, please refer to troubleshooting guide here:')}\n` +
                            `${chalk.cyan(troubleshootingGuide)}`;
                    }
                    deployUI.stop(status);
                    const output = {
                        aadAppUrl: answers.aadAppUrl,
                        resourceGroupUrl,
                        troubleshootingGuide,
                        website: deploymentProperties.outputs.azureWebsite.value,
                    };
                    fs.writeFileSync(fileName, JSON.stringify(output, null, 2));
                    console.log('Output saved to file: %s', `${chalk.cyan(fileName)}`);
                    return Promise.resolve();
                } else {
                    return Promise.reject('Azure website url not found in deployment output');
                }
            })
            .catch((error: Error) => {
                let err = error.toString();
                console.log(err);
                if (err.includes('Entry not found in cache.')) {
                    err = 'Session expired, Please run pcs login again.';
                }
                deployUI.stop({ err });
            });
    }

    private downloadKubeConfig(outputs: any, sshFilePath: string): Promise<string> {
        if (!fs.existsSync(KUBEDIR)) {
            fs.mkdirSync(KUBEDIR);
        }
        const localKubeConfigPath: string = KUBEDIR + path.sep + 'config' + '-' + outputs.containerServiceName.value;
        const remoteKubeConfig: string = '.kube/config';
        const sshDir = sshFilePath.substring(0, sshFilePath.lastIndexOf(path.sep));
        const sshPrivateKeyPath: string = sshDir + path.sep + 'id_rsa';
        const pk: string = fs.readFileSync(sshPrivateKeyPath, 'UTF-8');
        const sshClient = new Client();
        const config: ConnectConfig = {
            host: outputs.masterFQDN.value,
            port: 22,
            privateKey: pk,
            username: outputs.adminUsername.value
        };
        return new Promise<any>((resolve, reject) => {
            let retryCount = 0;
            const timer = setInterval(
                () => {
                    // First remove all listeteners so that we don't have duplicates
                    sshClient.removeAllListeners();

                    sshClient
                        .on('ready', (message: any) => {
                            sshClient.sftp((error: Error, sftp: SFTPWrapper) => {
                                if (error) {
                                    sshClient.end();
                                    reject(error);
                                    clearInterval(timer);
                                    return;
                                }
                                sftp.fastGet(remoteKubeConfig, localKubeConfigPath, (err: Error) => {
                                    sshClient.end();
                                    clearInterval(timer);
                                    if (err) {
                                        reject(err);
                                        return;
                                    }
                                    resolve(localKubeConfigPath);
                                });
                            });
                        })
                        .on('error', (err: Error) => {
                            if (retryCount++ > MAX_RETRY) {
                                clearInterval(timer);
                                reject(err);
                            }
                        })
                        .on('timeout', () => {
                            if (retryCount++ > MAX_RETRY) {
                                clearInterval(timer);
                                reject(new Error('Failed after maximum number of tries'));
                            }
                        })
                        .connect(config);
                },
                5000);
        });
    }

    private setupParameters(answers: Answers) {
        this._parameters.solutionName.value = answers.solutionName;
        // Temporary check, in future both types of deployment will always have username and passord
        // If the parameters file has adminUsername section then add the value that was passed in by user
        if (this._parameters.adminUsername) {
            this._parameters.adminUsername.value = answers.adminUsername;
        }
        // If the parameters file has adminPassword section then add the value that was passed in by user
        if (this._parameters.adminPassword) {
            this._parameters.adminPassword.value = answers.adminPassword;
        }
        if (this._parameters.servicePrincipalSecret) {
            this._parameters.servicePrincipalSecret.value = answers.servicePrincipalSecret;
        }
        if (this._parameters.sshRSAPublicKey) {
            this._parameters.sshRSAPublicKey.value = fs.readFileSync(answers.sshFilePath, 'UTF-8');
        }
        if (this._parameters.azureWebsiteName) {
            this._parameters.azureWebsiteName.value = answers.azureWebsiteName;
        }
        if (this._parameters.remoteEndpointSSLThumbprint) {
            this._parameters.remoteEndpointSSLThumbprint.value = answers.certData.fingerPrint;
        }
        if (this._parameters.remoteEndpointCertificate) {
            this._parameters.remoteEndpointCertificate.value = answers.certData.cert;
        }
        if (this._parameters.remoteEndpointCertificateKey) {
            this._parameters.remoteEndpointCertificateKey.value = answers.certData.key;
        }
        if (this._parameters.aadTenantId) {
            this._parameters.aadTenantId.value = answers.aadTenantId;
        }
        if (this._parameters.aadClientId) {
            this._parameters.aadClientId.value = answers.appId;
        }
        if (this._parameters.aadClientServicePrincipalId && answers.servicePrincipalId) {
            this._parameters.aadClientServicePrincipalId.value = answers.servicePrincipalId;
        }
        if (this._parameters.aadClientSecret) {
            // reuse the service principal secret value without creating new value
            this._parameters.aadClientSecret.value = answers.servicePrincipalSecret;
        }
        if (this._parameters.userPrincipalObjectId) {
            this._parameters.userPrincipalObjectId.value = answers.userPrincipalObjectId;
        }
        if (this._parameters.microServiceRuntime) {
            this._parameters.microServiceRuntime.value = answers.runtime;
        }
        if (this._parameters.pcsReleaseVersion) {
            this._parameters.pcsReleaseVersion.value = answers.version;
        }
        if (this._parameters.pcsDockerTag) {
            this._parameters.pcsDockerTag.value = answers.dockerTag;
        }
        if (this._parameters.deploymentId) {
            this._parameters.deploymentId.value = answers.deploymentId;
        } else if (this._template.parameters.deploymentId) {
            this._parameters.deploymentId = { value: answers.deploymentId };
        }
        if (answers.diagnosticsEndpointUrl) {
            if (this._parameters.diagnosticsEndpointUrl) {
                this._parameters.diagnosticsEndpointUrl.value = answers.diagnosticsEndpointUrl;
            } else if (this._template.parameters.diagnosticsEndpointUrl) {
                this._parameters.diagnosticsEndpointUrl =  { value: answers.diagnosticsEndpointUrl };
            }
        }
        if (this._template.parameters.telemetryStorageType && answers.telemetryStorageType) {
            this._parameters.telemetryStorageType = { value: answers.telemetryStorageType };
        }
        if (this._template.parameters.tsiLocation && answers.tsiLocation) {
            this._parameters.tsiLocation = { value: answers.tsiLocation };
        }
        if (this._template.parameters.provisioningServiceLocation && answers.provisioningServiceLocation) {
            this._parameters.provisioningServiceLocation = { value: answers.provisioningServiceLocation };
        }
        if (this._template.parameters.cloudType) {
            this._parameters.cloudType = { value: this.getCloudType(this._environment.name) };
        }
        if (this._template.parameters.azurePortalUrl) {
            this._parameters.azurePortalUrl = { value: this._environment.portalUrl };
        }
    }

    private waitForWebsiteToBeReady(url: string): Promise<boolean> {
        const status: string = url + '/ssl-proxy-status';
        const req = new fetch.Request(status, { method: 'GET' });
        let retryCount = 0;
        return new Promise((resolve, reject) => {
            const timer = setInterval(
                () => {
                    fetch.default(req)
                        .then((value: fetch.Response) => {
                            return value.json();
                        })
                        .then((body: any) => {
                            if (body.Status.includes('Alive') || retryCount > MAX_RETRY) {
                                clearInterval(timer);
                                if (retryCount > MAX_RETRY) {
                                    resolve(false);
                                } else {
                                    resolve(true);
                                }
                            }
                        })
                        .catch((error: any) => {
                            // Continue
                            if (retryCount > MAX_RETRY) {
                                clearInterval(timer);
                                resolve(false);
                            }
                        });
                    retryCount++;
                },
                10000);
        });
    }

    private waitForStreamingJobsToStart(resourceGroupName: string, streamingJobsName: string): Promise<boolean> {
        let retryCount = 0;
        return new Promise((resolve, reject) => {
            const timer = setInterval(
                () => {
                    // check streaming jobs state and start it if it is not running
                    this._streamAnalyticsClient.streamingJobs.get(resourceGroupName, streamingJobsName)
                        .then((streamingJobs: any) => {
                            if (streamingJobs.jobState.toLowerCase() === 'running') {
                                clearInterval(timer);
                                resolve(true);
                            } else if (retryCount > MAX_RETRY) {
                                clearInterval(timer);
                                resolve(false);
                            } else if (['created', 'failed'].indexOf(streamingJobs.jobState.toLowerCase()) > -1) {
                                // try to start streaming jobs if it is in 'Created' or 'Failed' state
                                this._streamAnalyticsClient.streamingJobs.start(resourceGroupName, streamingJobsName)
                                    .catch((error: any) => {
                                        // ignore error of connecting to Cosmos database when starting streaming jobs
                                    });
                            }
                        })
                        .catch((error: any) => {
                            // Continue
                            if (retryCount > MAX_RETRY) {
                                clearInterval(timer);
                                resolve(false);
                            }
                        });
                    retryCount++;
                },
                10000);
        });
    }

    private setAndPrintEnvironmentVariables(outputs: any, answers: Answers, storageEndpointSuffix: string) {
        const data = [] as string[];
        data.push(`PCS_IOTHUBREACT_ACCESS_CONNSTRING="${outputs.iotHubConnectionString.value}"`);
        data.push(`PCS_IOTHUB_CONNSTRING="${outputs.iotHubConnectionString.value}"`);
        data.push(`PCS_STORAGEADAPTER_DOCUMENTDB_CONNSTRING="${outputs.documentDBConnectionString.value}"`);
        data.push(`PCS_TELEMETRY_DOCUMENTDB_CONNSTRING="${outputs.documentDBConnectionString.value}"`);
        data.push(`PCS_TELEMETRYAGENT_DOCUMENTDB_CONNSTRING="${outputs.documentDBConnectionString.value}"`);
        data.push(`PCS_ASA_DATA_AZUREBLOB_ACCOUNT=${outputs.storageAccountName.value}`);
        data.push(`PCS_ASA_DATA_AZUREBLOB_KEY="${outputs.storageAccountKey.value}"`);
        data.push(`PCS_ASA_DATA_AZUREBLOB_ENDPOINT_SUFFIX=${storageEndpointSuffix}`);
        data.push(`PCS_AZUREBLOB_ACCOUNT=${outputs.storageAccountName.value}`);
        data.push(`PCS_AZUREBLOB_KEY="${outputs.storageAccountKey.value}"`);
        data.push(`PCS_AZUREBLOB_ENDPOINT_SUFFIX=${storageEndpointSuffix}`);
        data.push(`PCS_EVENTHUB_CONNSTRING="${outputs.messagesEventHubConnectionString.value}"`);
        data.push(`PCS_EVENTHUB_NAME="${outputs.messagesEventHubName.value}"`);
        data.push(`PCS_ACTION_EVENTHUB_CONNSTRING="${outputs.actionsEventHubConnectionString.value}"`);
        data.push(`PCS_ACTION_EVENTHUB_NAME="${outputs.actionsEventHubName.value}"`);
        data.push(`PCS_AUTH_REQUIRED=false`);
        data.push(`PCS_AZUREMAPS_KEY=static`);
        data.push(`PCS_TELEMETRY_STORAGE_TYPE=${outputs.telemetryStorageType.value}`);
        data.push(`PCS_TSI_FQDN="${outputs.tsiDataAccessFQDN.value}"`);
        data.push(`PCS_AAD_TENANT=${answers.aadTenantId}`);
        data.push(`PCS_AAD_APPID=${answers.appId}`);
        data.push(`PCS_AAD_APPSECRET="${answers.servicePrincipalSecret}"`);
        data.push(`PCS_SEED_TEMPLATE=default`);
        data.push(`PCS_CLOUD_TYPE=${this.getCloudType(this._environment.name)}`);
        data.push(`PCS_SUBSCRIPTION_ID=${this._subscriptionId}`);
        data.push(`PCS_SOLUTION_TYPE=${this._solutionType}`);
        data.push(`PCS_SOLUTION_NAME=${answers.solutionName}`);
        data.push(`PCS_DEPLOYMENT_ID=${answers.deploymentId}`);
        data.push(`PCS_IOTHUB_NAME=${outputs.iotHubName.value}`);
        data.push(`PCS_DIAGNOSTICS_ENDPOINT_URL=${answers.diagnosticsEndpointUrl || ''}`);
        data.push(`PCS_APPLICATION_SECRET="${genPassword()}"`);
        data.push(`PCS_OFFICE365_CONNECTION_URL="${outputs.office365ConnectionUrl.value}"`);
        data.push(`PCS_LOGICAPP_ENDPOINT_URL="${outputs.logicAppEndpointUrl.value}"`);

        this.setEnvironmentVariables(data);

        console.log('Please save the following environment variables to /scripts/local/.env file: \n\ %s', `${chalk.cyan(data.join('\n'))}`);
    }

    private setEnvironmentVariables(data: string[]) {
        data.forEach((envvar) => {
            let cmd = '';
            switch ( os.type() ) {
                case 'Windows_NT': {
                    envvar = envvar.replace('=', ' ');
                    cmd = 'SETX ' + envvar;
                    break;
                }
                case 'Darwin': {
                    envvar = envvar.replace('=', ' ');
                    cmd = 'launchctl setenv ' + envvar;
                    break;
                }
                case 'Linux': {
                    cmd = 'echo ' + envvar + ' >> /etc/environment';
                    break;
                }
                default: { 
                    console.log('The environment could not be set. unable to determine OS.');
                    break; 
                 }
            }
            cp.exec(cmd);
        });
    }

    // Internal cloud names for diagnostics
    private getCloudType(environmentName: string): string {
        const cloudTypeMaps = {
            [AzureEnvironment.Azure.name]: 'Global',
            [AzureEnvironment.AzureChina.name]: 'China',
            [AzureEnvironment.AzureUSGovernment.name]: 'Fairfax',
            [AzureEnvironment.AzureGermanCloud.name]: 'Germany',
        };
        return cloudTypeMaps[environmentName];
    }
}

export default DeploymentManager;
