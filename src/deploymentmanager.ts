import * as chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';

import { ResourceManagementClient, ResourceModels } from 'azure-arm-resource';
import { DeviceTokenCredentials, DeviceTokenCredentialsOptions } from 'ms-rest-azure';
import { Answers, Question } from 'inquirer';
import DeployUI from './deployui';

type ResourceGroup = ResourceModels.ResourceGroup;
type Deployment = ResourceModels.Deployment;
type DeploymentProperties = ResourceModels.DeploymentProperties;
type DeploymentExtended = ResourceModels.DeploymentExtended;
type DeploymentOperationsListResult = ResourceModels.DeploymentOperationsListResult;
type DeploymentOperation = ResourceModels.DeploymentOperation;
type DeploymentValidateResult = ResourceModels.DeploymentValidateResult;

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
        const resourceGroup: ResourceGroup = {
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
        const properties: DeploymentProperties = {
            mode: 'Incremental',
            parameters: this._parameters,
            template: this._template,
        };

        const deployment: Deployment = { properties };
        const deployUI = new DeployUI();
        const deploymentName = 'deployment-' + params.solutionName;
        return client.resourceGroups.createOrUpdate(params.solutionName, resourceGroup)
            .then((result: ResourceGroup) => {
                client.deployments
                .validate(params.solutionName, deploymentName, deployment)
                .then((validationResult: DeploymentValidateResult) => {
                    if (validationResult.error) {
                        deployUI.stop('Deployment validation failed:\n' + JSON.stringify(validationResult.error, null, 2));
                    } else {
                        deployUI.start(client, params.solutionName, deploymentName, properties.template.resources.length as number);
                        return client.deployments.createOrUpdate(result.name as string, deploymentName, deployment)
                        .then((res: DeploymentExtended) => {
                            const deployProperties: any = res.properties;
                            const fileName: string = process.cwd() + path.sep + deploymentName + '-output.json';
                            fs.writeFileSync(fileName, JSON.stringify(deployProperties.outputs, null, 2));
                            deployUI.stop();
                            if (deployProperties.outputs.vmFQDN) {
                                const webUrl = 'http://' + deployProperties.outputs.vmFQDN.value;
                                console.log('Please click %s %s %s', `${chalk.cyan(webUrl)}`,
                                            'to deployed solution:', `${chalk.green(params.solutionName)}`);
                            }
                            const resourceGroupUrl = 'https://portal.azure.com/#resource' + result.id;
                            console.log('Please click %s %s', `${chalk.cyan(resourceGroupUrl)}`,
                                        'to manage your deployed resources');
                            console.log('Output saved to file: %s', `${chalk.cyan(fileName)}`);
                        });
                    }
                });
            }).catch((err: Error) => {
                deployUI.stop();
            });
    }
}

export default DeploymentManager;