import * as chalk from 'chalk';
import * as ResourceManagement from 'azure-arm-resource';
import * as msRestAzure from 'ms-rest-azure';

import { Answers, Question } from 'inquirer';
import DeployUI from './deployui';

type ResourceGroup = ResourceManagement.ResourceModels.ResourceGroup;
type Deployment = ResourceManagement.ResourceModels.Deployment;
type DeploymentProperties = ResourceManagement.ResourceModels.DeploymentProperties;
type DeploymentExtended = ResourceManagement.ResourceModels.DeploymentExtended;

export interface IDeploymentManager {
    submit(solutionName: string, subscriptionName: string, location: string): Promise<any>;
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

    public submit(solutionName: string, subscriptionId: string, location: string): Promise<any> {
        if (!!!solutionName || !!!subscriptionId || !!!location) {
            return Promise.reject('Solution, subscription and location cannot be empty');
        }

        const client = new ResourceManagement
            .ResourceManagementClient(this._authReponse.credentials, subscriptionId);
        const resourceGroup: ResourceGroup = {
            location,
            // TODO: Explore if it makes sense to add more tags, e.g. Language(Java/.Net), version etc
            tags: { IotSolutionType: this._solutionType },
        };

        this._parameters.solutionName.value = solutionName;
        const properties: DeploymentProperties = {
            mode: 'Incremental',
            parameters: this._parameters,
            template: this._template,
        };

        const deployment: Deployment = { properties };
        const deployUI = new DeployUI();
        return client.resourceGroups.createOrUpdate(solutionName, resourceGroup)
            .then((result: ResourceGroup) => {
                deployUI.start();
                return client.deployments
                .createOrUpdate(result.name as string, 'deployment-' + solutionName, deployment)
                .then((res: DeploymentExtended) => {
                    const deployProperties: any = res.properties;
                    console.log();
                    console.log(`${chalk.green('Please save following properties:')}`);
                    console.log(JSON.stringify(deployProperties.outputs, null, 2));
                    deployUI.stop();
                });
            }).catch((err: Error) => {
                deployUI.stop(err);
            });
    }
}

export default DeploymentManager;