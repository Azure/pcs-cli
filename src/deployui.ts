import * as chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import * as inquirer from 'inquirer';
import * as ResourceManagement from 'azure-arm-resource';
import * as msRestAzure from 'ms-rest-azure';

type DeploymentOperationsListResult = ResourceManagement.ResourceModels.DeploymentOperationsListResult;
type DeploymentOperation = ResourceManagement.ResourceModels.DeploymentOperation;
type DeploymentOperationProperties = ResourceManagement.ResourceModels.DeploymentOperationProperties;
type TargetResource = ResourceManagement.ResourceModels.TargetResource;
type ResourceManagementClient = ResourceManagement.ResourceManagementClient;

class DeployUI {
    private static _instance: DeployUI;
    private deploying = 'Deploying...';
    private deployedResources = 'Deployed resources ';
    private deployed = 'Deployed successfully';
    private loader = [
        '/ ' ,
        '| ' ,
        '\\ ',
        '- ' ,
        ];

    private i = 4;
    private ui: inquirer.ui.BottomBar;
    private timer: NodeJS.Timer;
    private startTime: number;
    private operationSet: Set<string>;
    private resourcesStatusAvailable: number;
    private combinedStatus: string;
    private errorMessages: Map<string, string>;
    private totalResourceCount: number = 0;
    private completedResourceCount: number = 0;
    private checkMark = `${chalk.green('\u2713 ')}`;
    private crossMark = `${chalk.red('\u2715 ')}`;

    constructor()  {
        if (DeployUI._instance) {
            throw new Error('Error - use DeployUI.instance');
        }
        this.resourcesStatusAvailable = 0;
        this.ui = new inquirer.ui.BottomBar();
        DeployUI._instance = this;
    }

    public static get instance() {
        if (!this._instance) {
            return new DeployUI();
        }

        return this._instance;
    }

    public start(client: ResourceManagementClient, resourceGroupName: string, deploymentName: string, totalResources: number): void {
        this.startTime = Date.now();
        this.timer = setInterval(
            () => {
                client.deploymentOperations.list(resourceGroupName, deploymentName)
                .then((value: DeploymentOperationsListResult) => {
                    this.operationSet = new Set();
                    this.errorMessages = new Map();
                    const loader = this.loader[this.i++ % 4];
                    let operationsStatus = this.operationsStatusFormatter(value, loader);
                    if (operationsStatus) {
                        operationsStatus += loader + this.deployedResources +
                        `${chalk.cyan(this.completedResourceCount.toString(), 'of', this.totalResourceCount.toString())}`;
                        this.ui.updateBottomBar(operationsStatus);
                    } else {
                        this.ui.updateBottomBar(loader + this.deploying);
                    }
                })
                .catch((err: Error) => {
                    this.ui.updateBottomBar(this.loader[this.i++ % 4] + this.deploying);
                });
            },
            200);
    }

    public stop(err?: string): void {
        clearInterval(this.timer);
        let message: string = '';
        if (this.errorMessages && this.errorMessages.size > 0) {
            message = this.crossMark + `${chalk.red('Deployment failed \n')}`;
            this.errorMessages.forEach((value: string) => {
                message += `${chalk.red(value)}` + '\n';
            });
        } else if (err) {
            message = this.crossMark + `${chalk.red(err)}` + '\n';
        } else {
            const totalTime: Date = new Date(Date.now() - this.startTime);
            message += this.combinedStatus +
                       this.checkMark + `${chalk.green(this.deployed)}` +
                       `${chalk.green(', time taken:',
                                      totalTime.getMinutes().toString(), 'minutes &',
                                      totalTime.getSeconds().toString(), 'seconds')}` +
                        '\n';
        }

        this.ui.updateBottomBar(message);
        this.close();
    }

    public close(): void {
        this.ui.close();
    }

    private operationsStatusFormatter(operations: DeploymentOperationsListResult, loader: string): string {
        const operationsStatus: string[] = [];
        this.combinedStatus = '';
        this.totalResourceCount = 0;
        this.completedResourceCount = 0;
        operations.forEach((operation: DeploymentOperation) => {
            const props: DeploymentOperationProperties = operation.properties as DeploymentOperationProperties;
            const targetResource: TargetResource = props.targetResource as TargetResource;
            if (targetResource && targetResource.resourceType && targetResource.resourceName) {
                const key: string = targetResource.id as string;
                if (!this.operationSet.has(key)) {
                    this.totalResourceCount++;
                    this.operationSet.add(key);
                    let iconState = loader;
                    if (props.provisioningState === 'Succeeded') {
                        iconState = this.checkMark;
                        this.completedResourceCount++;
                    } else if (props.provisioningState === 'Failed') {
                        iconState = this.crossMark;
                        const message = JSON.stringify(props.statusMessage, null, 2);
                        if (!this.errorMessages.has(key)) {
                            // Add the error messages to the map so that we can show it at the end
                            // of deployment, we don't want to cancel it because you can run it again
                            // to do incremental deployment that will save time.
                            this.errorMessages.set(key, message);
                        }
                    }
                    operationsStatus.push(iconState + 'Provisioning State: ' + props.provisioningState +
                        '\tResource Type: ' + targetResource.resourceType);
                }
            }
        });
        if (operationsStatus && operationsStatus.length) {
            // Sort so that we show the running state last
            operationsStatus.sort((first: string, second: string) => {
                const f = first.search('Succeeded');
                const s = second.search('Succeeded');
                if (f > s) {
                    return -1;
                } else if (s > f) {
                    return 1;
                }
                return 0;
            });
            operationsStatus.forEach((status: string) => {
                this.combinedStatus += status + '\n';
            });
        }
        return this.combinedStatus;
    }
}

export default DeployUI;
