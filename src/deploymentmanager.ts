import * as chalk from 'chalk';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { ResourceManagementClient, ResourceModels } from 'azure-arm-resource';
import { DeviceTokenCredentials, DeviceTokenCredentialsOptions } from 'ms-rest-azure';
import { Answers, Question } from 'inquirer';
import DeployUI from './deployui';
import { Client, ConnectConfig, SFTPWrapper } from 'ssh2';
import { IK8sManager, K8sManager } from './k8smanager';
import { Config } from './config';

type ResourceGroup = ResourceModels.ResourceGroup;
type Deployment = ResourceModels.Deployment;
type DeploymentProperties = ResourceModels.DeploymentProperties;
type DeploymentExtended = ResourceModels.DeploymentExtended;
type DeploymentOperationsListResult = ResourceModels.DeploymentOperationsListResult;
type DeploymentOperation = ResourceModels.DeploymentOperation;
type DeploymentValidateResult = ResourceModels.DeploymentValidateResult;

const MAX_RETRY = 36;
const KUBEDIR = os.homedir() + path.sep + '.kube';
// We are using BingMap APIs with plan = internal1
// It only allows to have 2 apis per subscription
const MAX_BING_MAP_APIS_FOR_INTERNAL1_PLAN = 2;

export interface IDeploymentManager {
    submit(answers: Answers | undefined): Promise<any>;
}

export class DeploymentManager implements IDeploymentManager {
    private _options: DeviceTokenCredentialsOptions;
    private _solutionType: string;
    private _template: any;
    private _parameters: any;

    constructor(options: DeviceTokenCredentialsOptions, solutionType: string) {
        this._options = options;
        this._solutionType = solutionType;
    }

    public submit(answers: Answers): Promise<any> {
        if (!!!answers || !!!answers.solutionName || !!!answers.subscriptionId || !!!answers.location) {
            return Promise.reject('Solution name, subscription id and location cannot be empty');
        }

        const client = new ResourceManagementClient(new DeviceTokenCredentials(this._options), answers.subscriptionId);
        const location = answers.location;
        const deployment: Deployment = { properties: {
            mode: 'Incremental',
        }};
        const deployUI = DeployUI.instance;
        const deploymentName = 'deployment-' + answers.solutionName;
        let deploymentProperties: any = null;
        let resourceGroupUrl: string;
        let freeBingMapResourceCount: number = 0;
        let resourceGroup: ResourceGroup = {
            location,
            // TODO: Explore if it makes sense to add more tags, e.g. Language(Java/.Net), version etc
            tags: { IotSolutionType: this._solutionType },
        };

        this.setupParameters(answers);

        return client.resources.list({filter: 'resourceType eq \'Microsoft.BingMaps/mapApis\''})
        .then((resources: ResourceModels.ResourceListResult) => {
            resources.forEach((resource: ResourceModels.GenericResource) => {
                if (resource.plan && resource.plan.name && resource.plan.name.toLowerCase() === 'internal1') {
                    freeBingMapResourceCount++;
                }
            });
            let solutionSku = answers.deploymentSku;
            if (freeBingMapResourceCount > MAX_BING_MAP_APIS_FOR_INTERNAL1_PLAN) {
                solutionSku += '-static-map';
            }
            const solutionFileName = solutionSku + '.json';
            const parametersFileName = solutionSku + '-parameters.json';
            try {
                this._template = require('../' + this._solutionType + '/armtemplates/' + solutionFileName);
                this._parameters = require('../' + this._solutionType + '/armtemplates/' + parametersFileName);
            } catch (ex) {
                throw new Error('Could not find template or parameters file, Exception:');
            }
            deployment.properties.parameters = this._parameters;
            deployment.properties.template = this._template;
            return deployment;
        })
        .then((properties: Deployment) => {
            return client.resourceGroups.createOrUpdate(answers.solutionName, resourceGroup);
        })
        .then((result: ResourceGroup) => {
            resourceGroup = result;
            resourceGroupUrl = 'https://portal.azure.com/#resource' + resourceGroup.id;
            return client.deployments.validate(answers.solutionName, deploymentName, deployment);
        })
        .then((validationResult: DeploymentValidateResult) => {
            if (validationResult.error) {
                deployUI.stop('Deployment validation failed:\n' + JSON.stringify(validationResult.error, null, 2));
                throw new Error(JSON.stringify(validationResult.error));
            }

            deployUI.start(client, answers.solutionName, deploymentName, deployment.properties.template.resources.length as number);
            return client.deployments.createOrUpdate(answers.solutionName as string, deploymentName, deployment);
        })
        .then((res: DeploymentExtended) => {
            deployUI.stop();
            deploymentProperties = res.properties;
            const directoryPath = process.cwd() + path.sep + 'deployments';
            if (!fs.existsSync(directoryPath)) {
                fs.mkdirSync(directoryPath);
            }
            const fileName: string = directoryPath + path.sep + deploymentName + '-output.json';
            fs.writeFileSync(fileName, JSON.stringify(deploymentProperties.outputs, null, 2));
            if (deploymentProperties.outputs.azureWebsite) {
                const webUrl = deploymentProperties.outputs.azureWebsite.value;
                if (answers.deploymentSku === 'standard') {
                    console.log('The app will be available on following url after kubernetes setup is done:');
                }
                console.log('Please click %s %s %s', `${chalk.cyan(webUrl)}`,
                            'to deployed solution:', `${chalk.green(answers.solutionName)}`);
            }
            console.log('Please click %s %s', `${chalk.cyan(resourceGroupUrl)}`,
                        'to manage your deployed resources');
            console.log('Output saved to file: %s', `${chalk.cyan(fileName)}`);

            if (answers.deploymentSku === 'standard') {
                console.log('Downloading the kubeconfig file from:', `${chalk.cyan(deploymentProperties.outputs.masterFQDN.value)}`);
                return this.downloadKubeConfig(deploymentProperties.outputs, answers.sshFilePath);
            }
            return Promise.resolve('');
        })
        .then((kubeConfigPath: string) => {
            if (answers.deploymentSku === 'standard') {
                const outputs = deploymentProperties.outputs;
                const config = new Config();
                config.AADTenantId = answers.aadTenantId;
                config.ApplicationId = answers.appId;
                config.AzureStorageAccountKey = outputs.storageAccountKey.value;
                config.AzureStorageAccountName = outputs.storageAccountName.value;
                // If we are under the plan limi then we should have received a query key
                if (freeBingMapResourceCount < MAX_BING_MAP_APIS_FOR_INTERNAL1_PLAN) {
                    config.BingMapApiQueryKey = outputs.mapApiQueryKey.value;
                }
                config.DNS = outputs.agentFQDN.value;
                config.DocumentDBConnectionString = outputs.documentDBConnectionString.value;
                config.EventHubEndpoint = outputs.eventHubEndpoint.value;
                config.EventHubName = outputs.eventHubName.value;
                config.EventHubPartitions = outputs.eventHubPartitions.value.toString();
                config.IoTHubConnectionString = outputs.iotHubConnectionString.value;
                config.LoadBalancerIP = outputs.loadBalancerIp.value;
                config.Runtime = answers.runtime;
                config.TLS = answers.certData;
                const k8sMananger: IK8sManager = new K8sManager('default', kubeConfigPath, config);
                console.log(`${chalk.cyan('Setting up kubernetes')}`);
                return k8sMananger.setupAll()
                .catch((err: any) => {
                    console.log(err);
                });
            }
            return Promise.resolve();
        })
        .then(() => {
            console.log('Setup done sucessfully, the website will be ready in 2-5 minutes');
        })
        .catch((err: Error) => {
            let errorMessage = err.toString();
            if (err.toString().includes('Entry not found in cache.')) {
                errorMessage = 'Session expired, Please run pcs login again. \n\
                Resources are being deployed at ' + resourceGroupUrl;
            }
            deployUI.stop(errorMessage);
        });
    }

    private downloadKubeConfig(outputs: any, sshFilePath: string): Promise<string> {
        if (!fs.existsSync) {
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
                        sshClient.sftp( (error: Error, sftp: SFTPWrapper) => {
                            if (error) {
                                sshClient.end();
                                reject(error);
                                clearInterval(timer); 
                                return;
                            }
                            sftp.fastGet(remoteKubeConfig, localKubeConfigPath, (err: Error) => {
                                sshClient.end();
                                if (err) {
                                    reject(err);
                                    return;
                                }
                                console.log('kubectl config file downloaded to: %s', `${chalk.cyan(localKubeConfigPath)}`);
                                clearInterval(timer);
                                resolve(localKubeConfigPath);
                            });
                        });
                    })
                    .on('error', (err: Error) => {
                        if (retryCount++ > MAX_RETRY) {
                            clearInterval(timer);
                            reject(err);
                        } else {
                            console.log(`${chalk.yellow('Retrying connection to: ' +
                            outputs.masterFQDN.value + ' ' + retryCount + ' of ' + MAX_RETRY)}`);
                        }
                    })
                    .on('timeout', () => {
                        if (retryCount++ > MAX_RETRY) {
                            clearInterval(timer);
                            reject(new Error('Failed after maximum number of tries'));
                        } else {
                            console.log(`${chalk.yellow('Retrying connection to: ' +
                            outputs.masterFQDN.value + ' ' + retryCount + ' of ' + MAX_RETRY)}`);
                        }
                    })
                    .connect(config);
                },
                5000);
        });
    }

    private setupParameters(answers: any) {
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
        if (this._parameters.servicePrincipalClientId) {
            this._parameters.servicePrincipalClientId.value = answers.appId;
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
        if (this._parameters.microServiceRuntime) {
            this._parameters.microServiceRuntime.value = answers.runtime;
        }
    }
}

export default DeploymentManager;