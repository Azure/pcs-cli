import * as msRestAzure from 'ms-rest-azure';
import { Answers } from 'inquirer';
import { DeploymentManager, IDeploymentManager } from './deploymentmanager';

const solutionType: string = 'RemoteMonitoring';

describe('Template deployment through DeploymentManager', () => {
    let deploymentManager: IDeploymentManager;
    beforeAll(() => {
        const authResponse: msRestAzure.AuthResponse = { 
            credentials: new msRestAzure.DeviceTokenCredentials(),
            subscriptions: []
        };
        deploymentManager = new DeploymentManager(authResponse, solutionType, null, null);
    });

    test('Empty solution, subscription or location should fail', () => {
        return deploymentManager
        .submit(undefined)
        .catch((error) => { 
            expect(error).toBeDefined();
        });
    });
});