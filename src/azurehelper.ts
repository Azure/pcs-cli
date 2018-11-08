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
    getAuthIssuserUrl(tenantId: string): string;
    getStorageEndpointSuffix(): string;
    getVMFQDNSuffix(): string;
    getServiceBusEndpointSuffix(): string;
    getPortalUrl(): string;
    getCloudType(): string;
}

export class AzureHelper implements IAzureHelper {
    private _environment: AzureEnvironment;
    private _credentials: ServiceClientCredentials;
    private _subscriptionId: string;
    private MAX_RETRYCOUNT = 36;
    private SLEEP_TIME = 5000;
    private CONTRIBUTOR_ROLE_ID = 'b24988ac-6180-42a0-ab88-20f7382dd24c';
    private OWNER_ROLE_ID = '8e3af657-a8ff-443c-a75c-2fe8c4bcb635';

    constructor(environment: AzureEnvironment, subscriptionId: string, credentials: ServiceClientCredentials) {
        this._environment = environment;
        this._subscriptionId = subscriptionId;
        this._credentials = credentials;
    }

    public assignContributorRoleOnSubscription(principalId: string): Promise<boolean> {
        const scope = `/subscriptions/${this._subscriptionId}`;
        return this.createRoleAssignmentWithRetry(principalId, scope, this.CONTRIBUTOR_ROLE_ID);
    }

    public assignContributorRoleOnResourceGroup(principalId: string, resourceGroupName: string): Promise<boolean> {
        const scope = `/subscriptions/${this._subscriptionId}/resourceGroups/${resourceGroupName}`;
        return this.createRoleAssignmentWithRetry(principalId, scope, this.CONTRIBUTOR_ROLE_ID);
    }

    public assignOwnerRoleOnSubscription(principalId: string): Promise<boolean> {
        const scope = `/subscriptions/${this._subscriptionId}`;
        return this.createRoleAssignmentWithRetry(principalId, scope, this.OWNER_ROLE_ID);
    }

    public assignOwnerRoleOnResourceGroup(principalId: string, resourceGroupName: string): Promise<boolean> {
        const scope = `/subscriptions/${this._subscriptionId}/resourceGroups/${resourceGroupName}`;
        return this.createRoleAssignmentWithRetry(principalId, scope, this.OWNER_ROLE_ID);
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
                        .catch((error: Error | any) => {
                            if (retryCount >= this.MAX_RETRYCOUNT) {
                                clearInterval(timer);
                                console.log(error);
                                reject(error);
                            } else if (error.statusCode && error.statusCode === 403) {
                                // Current user do not have permission to assign the role
                                clearInterval(timer);
                                resolve(false);
                            }
                        });
                },
                this.SLEEP_TIME);
        });
        return promise;
    }

    public getAuthIssuserUrl(tenantId: string): string {
        switch (this._environment.name) {
            case AzureEnvironment.AzureChina.name:
                return `https://sts.chinacloudapi.cn/${tenantId}/`;
            default:
                // use default parameter values of global azure environment
                return `https://sts.windows.net/${tenantId}/`;
        }
    }

    public getStorageEndpointSuffix(): string {
        let storageEndpointSuffix = this._environment.storageEndpointSuffix;
        if (storageEndpointSuffix.startsWith('.')) {
            storageEndpointSuffix = storageEndpointSuffix.substring(1);
        }
        return storageEndpointSuffix;
    }

    public getVMFQDNSuffix(): string {
        switch (this._environment.name) {
            case AzureEnvironment.AzureChina.name:
                return 'cloudapp.chinacloudapi.cn';
            case AzureEnvironment.AzureGermanCloud.name:
                return 'cloudapp.azure.de';
            case AzureEnvironment.AzureUSGovernment.name:
                return 'cloudapp.azure.us';
            default:
                // use default parameter values of global azure environment
                return 'cloudapp.azure.com';
        }
    }

    public getServiceBusEndpointSuffix(): string {
        switch (this._environment.name) {
            case AzureEnvironment.AzureChina.name:
                return 'servicebus.chinacloudapi.cn';
            default:
                // use default parameter values of global azure environment
                return 'servicebus.windows.net';
        }
    }

    public getPortalUrl(): string {
        return this._environment.portalUrl || AzureEnvironment.Azure.portalUrl;
    }

    // Internal cloud names for diagnostics
    public getCloudType(): string {
        const cloudTypeMaps = {
            [AzureEnvironment.Azure.name]: 'Global',
            [AzureEnvironment.AzureChina.name]: 'China',
            [AzureEnvironment.AzureUSGovernment.name]: 'Fairfax',
            [AzureEnvironment.AzureGermanCloud.name]: 'Germany',
        };
        return cloudTypeMaps[this._environment.name];
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
