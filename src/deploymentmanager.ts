import * as chalk from 'chalk';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { ResourceManagementClient, ResourceModels } from 'azure-arm-resource';
import { DeviceTokenCredentials, DeviceTokenCredentialsOptions } from 'ms-rest-azure';
import { Answers, Question } from 'inquirer';
import DeployUI from './deployui';
import { Client, ConnectConfig, SFTPWrapper } from 'ssh2';

type ResourceGroup = ResourceModels.ResourceGroup;
type Deployment = ResourceModels.Deployment;
type DeploymentProperties = ResourceModels.DeploymentProperties;
type DeploymentExtended = ResourceModels.DeploymentExtended;
type DeploymentOperationsListResult = ResourceModels.DeploymentOperationsListResult;
type DeploymentOperation = ResourceModels.DeploymentOperation;
type DeploymentValidateResult = ResourceModels.DeploymentValidateResult;

const MAX_RETRY = 36;

export interface IDeploymentManager {
    submit(params: Answers | undefined): Promise<any>;
}

export class DeploymentManager implements IDeploymentManager {
    private _options: DeviceTokenCredentialsOptions;
    private _solutionType: string;
    private _template: any;
    private _parameters: any;

    constructor(options: DeviceTokenCredentialsOptions, solutionType: string, template: any, parameters: any) {
        this._options = options;
        this._solutionType = solutionType;
        this._template = template;
        this._parameters = parameters;
    }

    public submit(params: Answers): Promise<any> {
        if (!!!params || !!!params.solutionName || !!!params.subscriptionId || !!!params.location) {
            return Promise.reject('Solution name, subscription id and location cannot be empty');
        }
        const client = new ResourceManagementClient(new DeviceTokenCredentials(this._options), params.subscriptionId);
        const location = params.location;
        let resourceGroup: ResourceGroup = {
            location,
            // TODO: Explore if it makes sense to add more tags, e.g. Language(Java/.Net), version etc
            tags: { IotSolutionType: this._solutionType },
        };

        this._parameters.solutionName.value = params.solutionName;
        // Temporary check, in future both types of deployment will always have username and passord
        // If the parameters file has adminUsername section then add the value that was passed in by user
        if (this._parameters.adminUsername) {
            this._parameters.adminUsername.value = params.adminUsername;
        }
        // If the parameters file has adminPassword section then add the value that was passed in by user
        if (this._parameters.adminPassword) {
            this._parameters.adminPassword.value = params.adminPassword;
        }
        if (this._parameters.servicePrincipalClientId) {
            this._parameters.servicePrincipalClientId.value = params.appId;
        }
        if (this._parameters.sshRSAPublicKey) {
            this._parameters.sshRSAPublicKey.value = fs.readFileSync(params.sshFilePath, 'UTF-8');
        }
        if (this._parameters.azureWebsiteName) {
            this._parameters.azureWebsiteName.value = params.azureWebsiteName;
        }
        if (this._parameters.remoteEndpointSSLThumbprint) {
            this._parameters.remoteEndpointSSLThumbprint.value = params.certData.fingerprint;
        }
        if (this._parameters.remoteEndpointCertificate) {
            this._parameters.remoteEndpointCertificate.value = params.certData.cert;
        }
        if (this._parameters.remoteEndpointCertificateKey) {
            this._parameters.remoteEndpointCertificateKey.value = params.certData.privateKey;
        }
        const properties: DeploymentProperties = {
            mode: 'Incremental',
            parameters: this._parameters,
            template: this._template,
        };

        const deployment: Deployment = { properties };
        const deployUI = DeployUI.instance;
        const deploymentName = 'deployment-' + params.solutionName;
        let deploymentProperties: any = null;
        return client.resourceGroups.createOrUpdate(params.solutionName, resourceGroup)
            .then((result: ResourceGroup) => {
                resourceGroup = result;
                return client.deployments.validate(params.solutionName, deploymentName, deployment);
            })
            .then((validationResult: DeploymentValidateResult) => {
                if (validationResult.error) {
                    deployUI.stop('Deployment validation failed:\n' + JSON.stringify(validationResult.error, null, 2));
                    throw new Error(JSON.stringify(validationResult.error));
                }

                deployUI.start(client, params.solutionName, deploymentName, properties.template.resources.length as number);
                return client.deployments.createOrUpdate(params.solutionName as string, deploymentName, deployment);
            })
            .then((res: DeploymentExtended) => {
                deployUI.stop();
                deploymentProperties = res.properties;
                if (params.deploymentSku === 'enterprise') {
                    console.log('Downloading the kubeconfig file from:', `${chalk.cyan(deploymentProperties.outputs.masterFQDN.value)}`);
                    return this.downloadKubeConfig(deploymentProperties.outputs, params.sshFilePath);
                }
            })
            .then(() => {
                const directoryPath = process.cwd() + path.sep + 'deployments';
                if (!fs.existsSync(directoryPath)) {
                    fs.mkdirSync(directoryPath);
                }
                const fileName: string = directoryPath + path.sep + deploymentName + '-output.json';
                fs.writeFileSync(fileName, JSON.stringify(deploymentProperties.outputs, null, 2));
                if (deploymentProperties.outputs.azureWebsite) {
                    const webUrl = deploymentProperties.outputs.azureWebsite.value;
                    if (params.deploymentSku === 'enterprise') {
                        console.log('The app will be available on following url after kubernetes setup is done:');
                    }
                    console.log('Please click %s %s %s', `${chalk.cyan(webUrl)}`,
                                'to deployed solution:', `${chalk.green(params.solutionName)}`);
                }
                const resourceGroupUrl = 'https://portal.azure.com/#resource' + resourceGroup.id;
                console.log('Please click %s %s', `${chalk.cyan(resourceGroupUrl)}`,
                            'to manage your deployed resources');
                console.log('Output saved to file: %s', `${chalk.cyan(fileName)}`);
            })
            .catch((err: Error) => {
                deployUI.stop(JSON.stringify(err));
            });
    }

    private downloadKubeConfig(outputs: any, sshFilePath: string): Promise<any> {
        const kubeDir = os.homedir() + path.sep + '.kube';
        if (!fs.existsSync) {
            fs.mkdirSync(kubeDir);
        }
        const localKubeCofigPath: string = kubeDir + path.sep + 'config' + '-' + outputs.resourceGroup.value;
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
                            sftp.fastGet(remoteKubeConfig, localKubeCofigPath, (err: Error) => {
                                sshClient.end();
                                if (err) {
                                    reject(err);
                                    return;
                                }
                                console.log('kubectl config file downloaded to: %s', `${chalk.cyan(localKubeCofigPath)}`);
                                clearInterval(timer);
                                resolve();
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
}

export default DeploymentManager;