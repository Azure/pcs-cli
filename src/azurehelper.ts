import * as uuid from 'uuid';
import { AzureEnvironment, DeviceTokenCredentials } from 'ms-rest-azure';
import { ServiceClientCredentials } from 'ms-rest';
import AuthorizationManagementClient = require('azure-arm-authorization');

export interface IAzureHelper {
    assignContributorRoleOnSubscription(principalId: string): Promise<boolean>;
    assignContributorRoleOnResourceGroup(principalId: string, resourceGroupName: string): Promise<boolean>;
    assignOwnerRoleOnSubscription(principalId: string): Promise<boolean>;
    assignOwnerRoleOnResourceGroup(principalId: string, resourceGroupName: string): Promise<boolean>;
    createRoleAssignmentWithRetry(principalId: string, roleId: string, scope: string): Promise<boolean>;
}

export class AzureHelper implements IAzureHelper {
    private _environment: AzureEnvironment;
    private _credentials: ServiceClientCredentials;
    private _subscriptionId: string;
    private MAX_RETRYCOUNT = 36;
    private SLEEP_TIME = 5000;

    constructor(environment: AzureEnvironment, subscriptionId: string, credentials: ServiceClientCredentials) {
        this._environment = environment;
        this._subscriptionId = subscriptionId;
        this._credentials = credentials;
    }

    public assignContributorRoleOnSubscription(principalId: string): Promise<boolean> {
        const roleId = 'b24988ac-6180-42a0-ab88-20f7382dd24c';
        const scope = `/subscriptions/${this._subscriptionId}`;
        return this.createRoleAssignmentWithRetry(principalId, scope, roleId);
    }

    public assignContributorRoleOnResourceGroup(principalId: string, resourceGroupName: string): Promise<boolean> {
        const roleId = 'b24988ac-6180-42a0-ab88-20f7382dd24c';
        const scope = `/subscriptions/${this._subscriptionId}/resourceGroups/${resourceGroupName}`;
        return this.createRoleAssignmentWithRetry(principalId, scope, roleId);
    }

    public assignOwnerRoleOnSubscription(principalId: string): Promise<boolean> {
        const roleId = '8e3af657-a8ff-443c-a75c-2fe8c4bcb635';
        const scope = `/subscriptions/${this._subscriptionId}`;
        return this.createRoleAssignmentWithRetry(principalId, scope, roleId);
    }

    public assignOwnerRoleOnResourceGroup(principalId: string, resourceGroupName: string): Promise<boolean> {
        const roleId = '8e3af657-a8ff-443c-a75c-2fe8c4bcb635';
        const scope = `/subscriptions/${this._subscriptionId}/resourceGroups/${resourceGroupName}`;
        return this.createRoleAssignmentWithRetry(principalId, scope, roleId);
    }

    // After creating the new application the propogation takes sometime and hence we need to try
    // multiple times until the role assignment is successful or it fails after max try.
    public createRoleAssignmentWithRetry(principalId: string, scope: string, roleId: string): Promise<boolean> {
        const roleDefinitionId = `${scope}/providers/Microsoft.Authorization/roleDefinitions/${roleId}`;
        // clearing the token audience
        const baseUri = this._environment ? this._environment.resourceManagerEndpointUrl : undefined;
        const authzClient = new AuthorizationManagementClient(this.getPatchedDeviceTokenCredentials(this._credentials), this._subscriptionId, baseUri);
        const assignmentName = uuid.v1();
        const roleAssignment = {
            properties: {
                principalId,
                roleDefinitionId,
                scope
            }
        };
        let retryCount = 0;
        const promise = new Promise<any>((resolve, reject) => {
            const timer: NodeJS.Timer = setInterval(
                () => {
                    retryCount++;
                    return authzClient.roleAssignments.create(scope, assignmentName, roleAssignment)
                        .then((roleResult: any) => {
                            // Sometimes after role assignment it takes some time before they get propagated
                            // this failes the ACS deployment since it thinks that credentials are not valid
                            setTimeout(
                                () => {
                                    clearInterval(timer);
                                    resolve(true);
                                },
                                this.SLEEP_TIME);
                        })
                        .catch((error: Error) => {
                            if (retryCount >= this.MAX_RETRYCOUNT) {
                                clearInterval(timer);
                                console.log(error);
                                reject(error);
                            }
                        });
                },
                this.SLEEP_TIME);
        });
        return promise;
    }

    private getPatchedDeviceTokenCredentials(options: any) {
        const credentials: any = new DeviceTokenCredentials(options);
        // clean the default username of 'user@example.com' which always fail the token search in cache when using service principal login option.
        if (credentials.hasOwnProperty('username') && credentials.username === 'user@example.com') {
            delete credentials.username;
        }
        return credentials;
    }
}
