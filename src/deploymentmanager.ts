import * as chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import * as ResourceManagement from 'azure-arm-resource';
import * as msRestAzure from 'ms-rest-azure';

import { Answers, Question } from 'inquirer';
import DeployUI from './deployui';

type ResourceGroup = ResourceManagement.ResourceModels.ResourceGroup;
type Deployment = ResourceManagement.ResourceModels.Deployment;
type DeploymentProperties = ResourceManagement.ResourceModels.DeploymentProperties;
type DeploymentExtended = ResourceManagement.ResourceModels.DeploymentExtended;

export interface IDeploymentManager {
    submit(params: Answers | undefined): Promise<any>;
}

export class DeploymentManager implements IDeploymentManager {
    private _authReponse: msRestAzure.AuthResponse;
    private _solutionType: string;
    private _template: any;
    private _parameters: any;

    constructor(authResonse: msRestAzure.AuthResponse, solutionType: string, template: any, parameters: any) {
        this._authReponse = authResonse;
        this._solutionType = solutionType;
        this._template = template;
        this._parameters = parameters;
    }

    public submit(params: Answers): Promise<any> {
        if (!!!params || !!!params.solutionName || !!!params.subscriptionId || !!!params.location) {
            return Promise.reject('Solution name, subscription id and location cannot be empty');
        }

        const client = new ResourceManagement.ResourceManagementClient(this._authReponse.credentials, params.subscriptionId);
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
        const properties: DeploymentProperties = {
            mode: 'Incremental',
            parameters: this._parameters,
            template: this._template,
        };

        const deployment: Deployment = { properties };
        const deployUI = new DeployUI();
        return client.resourceGroups.createOrUpdate(params.solutionName, resourceGroup)
            .then((result: ResourceGroup) => {
                deployUI.start();
                return client.deployments
                .createOrUpdate(result.name as string, 'deployment-' + params.solutionName, deployment)
                .then((res: DeploymentExtended) => {
                    const deployProperties: any = res.properties;
                    const fileName: string = process.cwd() + path.sep + 'output.json';
                    fs.writeFileSync(fileName, JSON.stringify(deployProperties.outputs, null, 2));
                    console.log();
                    if (deployProperties.outputs.vmFQDN) {
                        console.log('Please click %s%s %s',
                                    `${chalk.cyan('http://')}`, `${chalk.cyan(deployProperties.outputs.vmFQDN.value)}`,
                                    'to deployed solution:', `${chalk.green(params.solutionName)}`);
                    }
                    console.log('Output saved to file: %s', `${chalk.cyan(fileName)}`);
                    deployUI.stop();
                });
            }).catch((err: Error) => {
                deployUI.stop(err);
            });
    }
}

export default DeploymentManager;