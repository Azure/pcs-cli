import * as chalk from 'chalk';
import * as inquirer from 'inquirer';
import * as ResourceManagement from 'azure-arm-resource';
import * as msRestAzure from 'ms-rest-azure';

type DeploymentOperationsListResult = ResourceManagement.ResourceModels.DeploymentOperationsListResult;
type DeploymentOperation = ResourceManagement.ResourceModels.DeploymentOperation;
type DeploymentOperationProperties = ResourceManagement.ResourceModels.DeploymentOperationProperties;
type TargetResource = ResourceManagement.ResourceModels.TargetResource;
type ResourceManagementClient = ResourceManagement.ResourceManagementClient;

class DeployUI {
    private deploying = 'Deploying...';
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
    private operationSet: Set<string>;
    private resourcesStatusAvailable: number;
    private errorMessages: Map<string, string>;

    constructor()  {
        this.resourcesStatusAvailable = 0;
        this.ui = new inquirer.ui.BottomBar();
    }

    public start(client: ResourceManagementClient, resourceGroupName: string, deploymentName: string, totalResources: number): void {
        console.log('');
        this.timer = setInterval(
            () => {
                client.deploymentOperations.list(resourceGroupName, deploymentName)
                .then((value: DeploymentOperationsListResult) => {
                    this.operationSet = new Set();
                    this.errorMessages = new Map();
                    const loader = this.loader[this.i++ % 4];
                    const operationsStatus = this.operationsStatusFormatter(value, loader);
                    if (operationsStatus) {
                        // Leaving empty lines to show status message as they appear
                        if (totalResources > this.resourcesStatusAvailable) {
                            while (value.length > this.resourcesStatusAvailable) {
                                console.log('');
                                this.resourcesStatusAvailable++;
                                if (totalResources === this.resourcesStatusAvailable) {
                                    break;
                                }
                            }
                        }
                        this.ui.updateBottomBar(operationsStatus);
                    } else {
                        this.ui.updateBottomBar(this.deploying + loader + '\n');
                    }
                })
                .catch((err: Error) => {
                    this.ui.updateBottomBar(this.deploying + this.loader[this.i++ % 4] + '\n');
                });
            },
            200);
    }

    public stop(err?: string): void {
        clearInterval(this.timer);
        let message = this.deployed;
        if (this.errorMessages) {
            message = 'Deployment failed \n';
            this.errorMessages.forEach((value: string) => {
                message += `${chalk.red(value)}` + '\n';
            });
        } else if (err) {
            message = 'Deployment failed \n' + `${chalk.red(err)}` + '\n';
        }

        this.ui.updateBottomBar(message);
        this.close();
    }

    public close(): void {
        this.ui.close();
    }

    private operationsStatusFormatter(operations: DeploymentOperationsListResult, loader: string): string {
        const operationsStatus: string[] = [];
        operations.forEach((operation: DeploymentOperation) => {
            const props: DeploymentOperationProperties = operation.properties as DeploymentOperationProperties;
            const targetResource: TargetResource = props.targetResource as TargetResource;
            if (targetResource && targetResource.resourceType && targetResource.resourceName) {
                const key: string = targetResource.id as string;
                if (!this.operationSet.has(key)) {
                    this.operationSet.add(key);
                    let iconState = loader;
                    if (props.provisioningState === 'Succeeded') {
                        iconState = `${chalk.green('\u2713')}`; // Check mark
                    } else if (props.provisioningState === 'Failed') {
                        iconState = `${chalk.red('\u2715')}`; // Cross sign
                        const message = props.statusMessage.error.message;
                        if (!this.errorMessages.has(key)) {
                            this.errorMessages.set(key, props.statusMessage.error.message);
                        }
                    }
                    operationsStatus.push('Resource Type: ' + targetResource.resourceType +
                    ', Provisioning State: ' + props.provisioningState + ' ' + iconState );
                }
            }
        });
        let combinedStatus: string = '';
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
                combinedStatus += status + '\n';
            });
            combinedStatus += this.deploying + loader + '\n';
        }
        return combinedStatus;
    }
}

export default DeployUI;
