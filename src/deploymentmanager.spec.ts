import { DeviceTokenCredentials } from 'ms-rest-azure';
import { Answers } from 'inquirer';
import { DeploymentManager, IDeploymentManager } from './deploymentmanager';

const solutionType: string = 'RemoteMonitoring';

describe('Template deployment through DeploymentManager', () => {
    let deploymentManager: IDeploymentManager;
    beforeAll(() => {
        deploymentManager = new DeploymentManager(new DeviceTokenCredentials(), solutionType, null, null);
    });

    test('Empty solution, subscription or location should fail', () => {
        return deploymentManager
        .submit(undefined)
        .catch((error) => { 
            expect(error).toBeDefined();
        });
    });
});