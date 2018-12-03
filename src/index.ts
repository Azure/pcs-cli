#!/usr/bin/env node
const adal = require('adal-node');

import * as chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as util from 'util';
import * as uuid from 'uuid';
import * as forge from 'node-forge';
import * as momemt from 'moment';

import { exec } from 'child_process';
import { ChoiceType, prompt } from 'inquirer';
import {
    AuthResponse, AzureEnvironment, AzureTokenCredentialsOptions, DeviceTokenCredentials, DeviceTokenCredentialsOptions,
    LinkedSubscription, InteractiveLoginOptions, interactiveLoginWithAuthResponse,
    loginWithServicePrincipalSecretWithAuthResponse,
    UserTokenCredentials,
    ApplicationTokenCredentials
} from 'ms-rest-azure';
import { SubscriptionClient, SubscriptionModels, ResourceManagementClient, ResourceModels } from 'azure-arm-resource';
import GraphRbacManagementClient from 'azure-graph';
import AuthorizationManagementClient = require('azure-arm-authorization');
import ComputeManagementClient = require('azure-arm-compute');
import { Command } from 'commander';

import { Answers, Question } from 'inquirer';
import { DeploymentManager, IDeploymentManager } from './deploymentmanager';
import DeployUI from './deployui';
import { Questions, IQuestions } from './questions';
import { IK8sManager, K8sManager } from './k8smanager';
import { Config } from './config';
import { genPassword } from './utils';
import { IAzureHelper, AzureHelper } from './azurehelper';
import {
    Application,
    ServicePrincipal,
    ApplicationListResult,
    ApplicationCreateParameters,
    ServicePrincipalListResult
} from 'azure-graph/lib/models';
import { SubscriptionListResult } from 'azure-arm-resource/lib/subscription/models';
import { TokenCredentials, ServiceClientCredentials } from 'ms-rest';

const WebSiteManagementClient = require('azure-arm-website');

const packageJson = require('../package.json');

const solutionType: string = 'remotemonitoring';
enum solutionSkus {
    basic,
    standard,
    local
}

const invalidUsernameMessage = 'Usernames can be a maximum of 20 characters in length and cannot end in a period (\'.\')';
/* tslint:disable */
const invalidPasswordMessage = 'The supplied password must be between 12-72 characters long and must satisfy at least 3 of password complexity requirements from the following: 1) Contains an uppercase character\n2) Contains a lowercase character\n3) Contains a numeric digit\n4) Contains a special character\n5) Control characters are not allowed';
/* tslint:enable */

const gitHubUrl: string = 'https://github.com/Azure/pcs-cli';
const gitHubIssuesUrl: string = 'https://github.com/azure/pcs-cli/issues/new';

const pcsTmpDir: string = os.homedir() + path.sep + '.pcs';
const cacheFilePath: string = pcsTmpDir + path.sep + 'cache.json';
const defaultSshPublicKeyPath = os.homedir() + path.sep + '.ssh' + path.sep + 'id_rsa.pub';

const MAX_RETRYCOUNT = 36;
const RELEASE_VERSION_PATTERN: RegExp = /((\d*\.){2}(\d*\-preview.)(\d*))(\.\d*)*$/;

let cachedAuthResponse: any;
let answers: Answers = {};
let userPrincipalObjectId: string;

const program = new Command(packageJson.name)
    .version(packageJson.version, '-v, --version')
    .option('-t, --type <type>', 'Solution Type: remotemonitoring, devicesimulation, devicesimulation-nohub',
            /^(remotemonitoring|devicesimulation|devicesimulation-nohub|test)$/i,
            'remotemonitoring')
    .option('-s, --sku <sku>', 'SKU Type (only for Remote Monitoring): basic, standard, or local', /^(basic|standard|local)$/i, 'basic')
    .option('-e, --environment <environment>',
            'Azure environments: AzureCloud or AzureChinaCloud',
            /^(AzureCloud|AzureChinaCloud)$/i, 'AzureCloud')
    .option('-r, --runtime <runtime>', 'Microservices runtime (only for Remote Monitoring): dotnet or java', /^(dotnet|java)$/i, 'dotnet')
    .option('--servicePrincipalId <servicePrincipalId>', 'Service Principal Id')
    .option('--servicePrincipalSecret <servicePrincipalSecret>', 'Service Principal Secret')
    .option('--versionOverride <versionOverride>', 'Current accepted value is "master"')
    .option('--dockerTagOverride <dockerTagOverride>', 'Override value for Docker image tag')
    .option('--domainId <domainId>', 'This can either be an .onmicrosoft.com domain or the Azure object ID for the tenant')
    .option('--solutionName <solutionName>', 'Solution name for your Remote monitoring accelerator')
    .option('--subscriptionId <subscriptionId>', 'SubscriptionId on which this solution should be created')
    .option('-l, --location <location>', 'Location where the solution will be deployed')
    .option('-w, --websiteName <websiteName>', 'Name of the website, default is solution name')
    .option('-u, --username <username>', 'User name for the virtual machine that will be created as part of the solution')
    .option('-p, --password <password>', 'Password for the virtual machine that will be created as part of the solution')
    .option('--diagnosticUrl <diagnosticUrl>', 'Azure function app url for the diagnostics service')
    .on('--help', () => {
        console.log(
            `    Default value for ${chalk.green('-t, --type')} is ${chalk.green('remotemonitoring')}.`
        );
        console.log(
            `    Default value for ${chalk.green('-s, --sku')} is ${chalk.green('basic')}.`
        );
        console.log(
            `    Example for deploying Remote Monitoring Basic:  ${chalk.green('pcs -t remotemonitoring -s basic')}.`
        );
        console.log(
            `    Example for deploying Remote Monitoring Standard:  ${chalk.green('pcs -t remotemonitoring -s standard')}.`
        );
        console.log(
            `    Example for deploying Remote Monitoring for local development:  ${chalk.green('pcs -t remotemonitoring -s local')}.`
        );
        console.log(
          `    Example for deploying Device Simulation:  ${chalk.green('pcs -t devicesimulation')}.`
        );
        console.log(
          `    Example for deploying Device Simulation:  ${chalk.green('pcs -t devicesimulation-nohub')}.`
        );
        console.log();
        console.log(
            '  Commands:'
        );
        console.log();
        console.log(
            '    login:         Log in to access Azure subscriptions.'
        );
        console.log(
            '    logout:        Log out to remove access to Azure subscriptions.'
        );
        console.log();
        console.log(
            `    For further documentation, please visit:`
        );
        console.log(
            `    ${chalk.cyan(gitHubUrl)}`
        );
        console.log(
            `    If you have any problems please file an issue:`
        );
        console.log(
            `    ${chalk.cyan(gitHubIssuesUrl)}`
        );
        console.log();
    })
    .parse(process.argv);

if (!program.args[0] || program.args[0] === '-t') {
    if (program.servicePrincipalId) {
        if (!program.servicePrincipalSecret) {
            console.log('If servicePrincipalId is provided then servicePrincipalSecret is also required');
        } else {
            const tokenCredentialsOptions: AzureTokenCredentialsOptions = {
                environment: getAzureEnvironment(program.environment)
            };
            loginWithServicePrincipalSecretWithAuthResponse(
                program.servicePrincipalId,
                program.servicePrincipalSecret,
                program.domainId,
                tokenCredentialsOptions)
                .then((response: AuthResponse) => {
                    saveAuthResponse(response);
                    main();
                })
                .catch((error: Error) => {
                    console.log(error);
                });
        }
    } else {
        main();
    }
} else if (program.args[0] === 'login') {
    login();
} else if (program.args[0] === 'logout') {
    logout();
} else {
    console.log(`${chalk.red('Invalid choice:', program.args.toString())}`);
    console.log('For help, %s', `${chalk.yellow('pcs -h')}`);
}

function main() {
    /** Pre-req
     * Login through https://aka.ms/devicelogin and code prompt
     */

    /** Data needed to create template deployment
     * Get solution/resourceGroup name
     * Get user name and pwd if required
     * Get the local arm template
     * Create parameters json from options so far
     * Subscriptions list from either DeviceTokenCredentials or SubscriptionsManagementClient
     * Get location information
     */

    /** Actions on data collected
     * Create resource group
     * Submit deployment
     */
    cachedAuthResponse = cachedAuthResponse || getCachedAuthResponse();
    if (!cachedAuthResponse || !program.servicePrincipalId && cachedAuthResponse.isServicePrincipal) {
        console.log('Please run %s', `${chalk.yellow('pcs login')}`);
    } else {
        const baseUri = cachedAuthResponse.credentials.environment.resourceManagerEndpointUrl;
        const client = cachedAuthResponse.isServicePrincipal ?
            new SubscriptionClient(cachedAuthResponse.credentials, baseUri) :
            new SubscriptionClient(new DeviceTokenCredentials(cachedAuthResponse.credentials), baseUri);
        return client.subscriptions.list()
        .then((subs1: SubscriptionListResult) => {
            const subs: ChoiceType[] = [];
            cachedAuthResponse.linkedSubscriptions.map((subscription: LinkedSubscription) => {
                if (subscription.state === 'Enabled') {
                    subs.push({name: subscription.name, value: subscription.id});
                }
            });

            if (!subs || !subs.length) {
                console.log('Could not find any subscriptions in this account.');
                console.log('Please login with an account that has at least one active subscription');
            } else {
                const questions: IQuestions = new Questions(program.environment);
                questions.addQuestion({
                    choices: subs,
                    message: 'Select a subscription:',
                    name: 'subscriptionId',
                    type: 'list'
                });

                const deployUI = DeployUI.instance;
                let deploymentManager: IDeploymentManager;
                let subPrompt: Promise<Answers>;
                if (program.servicePrincipalId) {
                    subPrompt = Promise.resolve<Answers>({
                        azureWebsiteName: program.websiteName || program.solutionName,
                        location: program.location,
                        solutionName: program.solutionName,
                        subscriptionId: program.subscriptionId,
                    });
                } else {
                    subPrompt = prompt(questions.value);
                }
                return subPrompt
                .then((ans: Answers) => {
                    answers = ans;
                    const index = cachedAuthResponse.linkedSubscriptions.findIndex((x: LinkedSubscription) => x.id === answers.subscriptionId);
                    if (index === -1) {
                        const errorMessage = 'Selected subscriptionId was not found in cache';
                        console.log(errorMessage);
                        throw new Error(errorMessage);
                    }
                    cachedAuthResponse.credentials.domain = cachedAuthResponse.linkedSubscriptions[index].tenantId;
                    answers.domainName = cachedAuthResponse.credentials.domain;
                    const serviceClientCredentials: ServiceClientCredentials = cachedAuthResponse.isServicePrincipal ?
                        cachedAuthResponse.credentials : new DeviceTokenCredentials(cachedAuthResponse.credentials);
                    deploymentManager = new DeploymentManager(
                        serviceClientCredentials,
                        cachedAuthResponse.credentials.environment,
                        answers.subscriptionId,
                        program.type,
                        program.sku);
                    return deploymentManager.getLocations();
                })
                .then((locations: string[] | undefined) => {
                    if (program.location && (program.websiteName || program.solutionName)) {
                        const ans: Answers = {
                            adminUsername: program.username,
                            azureWebsiteName: program.websiteName || program.solutionName,
                            location: program.location,
                            solutionName: program.solutionName
                        };
                        if (program.sku.toLowerCase() === solutionSkus[solutionSkus.basic]) {
                            if (program.password) {
                                ans.pwdFirstAttempt = program.password;
                                ans.pwdSecondAttempt = program.password;
                            } else {
                                throw new Error('username and password are required for basic deployment');
                            }
                        }
                        return Promise.resolve<Answers>(ans);
                    } else if (locations && locations.length > 0) {
                        return prompt(getDeploymentQuestions(locations));
                    }
                    throw new Error('Locations list cannot be empty');
                })
                .then((ans: Answers) => {
                    // Use Cosmos DB for telemetry storage for China environment
                    if (program.environment === AzureEnvironment.AzureChina.name) {
                        return Promise.resolve(ans);
                    }
                    // Check if the selected location support Time Series Insights resource type for Global environment
                    // Use the default value of template when the location does not support it
                    const resourceManagementClient = new ResourceManagementClient(
                        cachedAuthResponse.isServicePrincipal ?
                        cachedAuthResponse.credentials : new DeviceTokenCredentials(cachedAuthResponse.credentials),
                        answers.subscriptionId,
                        baseUri);

                    ans.telemetryStorageType = 'tsi';

                    const promises = new Array<Promise<any>>();
                    promises.push(resourceManagementClient.providers.get('Microsoft.TimeSeriesInsights')
                    .then((providers: ResourceModels.Provider) => {
                        if (providers.resourceTypes) {
                            const resourceType = providers.resourceTypes.filter((x) => x.resourceType && x.resourceType.toLowerCase() === 'environments');
                            if (resourceType && resourceType.length) {
                                if (new Set(resourceType[0].locations).has(ans.location)) {
                                    ans.tsiLocation = ans.location.split(' ').join('').toLowerCase();
                                }
                            }
                        }
                    }));

                    promises.push(resourceManagementClient.providers.get('Microsoft.Devices')
                    .then((providers: ResourceModels.Provider) => {
                        if (providers.resourceTypes) {
                            const resourceType = providers.resourceTypes.filter((x) => x.resourceType
                                && x.resourceType.toLowerCase() === 'provisioningservices');
                            if (resourceType && resourceType.length) {
                                if (new Set(resourceType[0].locations).has(ans.location)) {
                                    ans.provisioningServiceLocation = ans.location.split(' ').join('').toLowerCase();
                                }
                            }
                        }
                    }));

                    return Promise.all(promises).then(() => Promise.resolve(ans));
                })
                .then((ans: Answers) => {
                    answers = {...answers, ...ans};
                    if (ans.pwdFirstAttempt !== ans.pwdSecondAttempt) {
                        return askPwdAgain();
                    }
                    return ans;
                })
                .then((ans: Answers) => {
                    if (program.sku.toLowerCase() === solutionSkus[solutionSkus.local]) {
                        answers.azureWebsiteName = answers.solutionName || program.solutionName;
                    } else {
                        answers.adminPassword = ans.pwdFirstAttempt;
                        answers.sshFilePath = ans.sshFilePath;
                    }
                    deployUI.start('Registering application in the Azure Active Directory');
                    return createServicePrincipal(answers.azureWebsiteName,
                                                  answers.subscriptionId,
                                                  cachedAuthResponse.credentials,
                                                  cachedAuthResponse.isServicePrincipal);
                })
                .then(({appId, domainName, objectId, servicePrincipalId, servicePrincipalSecret}) => {
                    cachedAuthResponse.credentials.tokenAudience = null;
                    answers.deploymentSku = program.sku;
                    answers.runtime = program.runtime;
                    answers.deploymentId = uuid.v1();
                    answers.diagnosticsEndpointUrl = program.diagnosticUrl;
                    answers.userPrincipalObjectId = userPrincipalObjectId;
                    if (program.versionOverride && program.dockerTagOverride) {
                        answers.version = program.versionOverride;
                        answers.dockerTag = program.dockerTagOverride;
                    } else if (program.versionOverride) {
                        // In order to run latest code verion override to master is required
                        answers.version = program.versionOverride;
                        answers.dockerTag = 'testing';
                    } else if (program.dockerTagOverride) {
                        answers.dockerTag = program.dockerTagOverride;
                    } else {
                        // For a released version the docker tag and version should be same
                        // Default to latest released verion (different for remotemonitoring and devicesimulation)
                        const version = (program.type === 'remotemonitoring') ? '2.1.0' : 'DS-2.0.1';
                        answers.version = version;
                        answers.dockerTag = version;
                    }

                    if (appId && servicePrincipalSecret) {
                        const env = cachedAuthResponse.credentials.environment;
                        const appUrl = `${env.portalUrl}/${domainName}#blade/Microsoft_AAD_IAM/ApplicationBlade/objectId/${objectId}/appId/${appId}`;
                        deployUI.stop({message: `Application registered: ${chalk.cyan(appUrl)} `});
                        answers.appId = appId;
                        answers.aadAppUrl = appUrl;
                        answers.servicePrincipalId = servicePrincipalId;
                        answers.servicePrincipalSecret = servicePrincipalSecret;
                        answers.certData = createCertificate();
                        answers.aadTenantId = cachedAuthResponse.credentials.domain;
                        answers.domainName = domainName;
                        return deploymentManager.submit(answers);
                    } else {
                        const message = 'To create a service principal, you must have permissions to register an ' +
                        'application with your Azure Active Directory (AAD) tenant, and to assign ' +
                        'the application to a role in your subscription. To see if you have the ' +
                        'required permissions, check here https://docs.microsoft.com/en-us/azure/azure-resource-manager/' +
                        'resource-group-create-service-principal-portal#required-permissions.';
                        console.log(`${chalk.red(message)}`);
                    }
                })
                .catch((error: any) => {
                    if (error.request) {
                        console.log(JSON.stringify(error, null, 2));
                    } else {
                        console.log(error);
                    }
                });
            }
        })
        .catch((error: any) => {
            // In case of login error it is better to ask user to login again
            console.log('Please run %s', `${chalk.yellow('\"pcs login\"')}`);
        });
    }
}

function login(): Promise<void> {
    const environment = getAzureEnvironment(program.environment);
    const loginOptions: InteractiveLoginOptions = {
        environment
    };

    return interactiveLoginWithAuthResponse(loginOptions).then((response: AuthResponse) => {
        saveAuthResponse(response);
    })
    .catch((error: Error) => {
        console.log(error);
    });
}

function logout() {
    if (fs.existsSync(cacheFilePath)) {
        fs.unlinkSync(cacheFilePath);
    }
    console.log(`${chalk.green('Successfully logged out')}`);
}

function saveAuthResponse(response: AuthResponse): any {
    const isServicePrincipal = response.credentials.constructor.name === 'ApplicationTokenCredentials';
    const data = {
        credentials: response.credentials,
        isServicePrincipal,
        linkedSubscriptions: response.subscriptions
    };
    cachedAuthResponse = data;
    if (!fs.existsSync(pcsTmpDir)) {
        fs.mkdirSync(pcsTmpDir);
    }
    fs.writeFileSync(cacheFilePath, JSON.stringify(data));
    console.log(`${chalk.green('Successfully logged in')}`);
}

function getCachedAuthResponse(): any {
    if (!fs.existsSync(cacheFilePath)) {
        return null;
    } else {
        const cache = JSON.parse(fs.readFileSync(cacheFilePath, 'UTF-8'));
        const tokenCache = new adal.MemoryCache();
        const credentials: DeviceTokenCredentialsOptions = cache.credentials;
        tokenCache.add(credentials.tokenCache._entries, () => {
            // empty function
        });
        credentials.tokenCache = tokenCache;
        // Environment names: AzureCloud, AzureChina, USGovernment, GermanCloud, or your own Dogfood environment
        program.environment = credentials.environment && credentials.environment.name;
        return {
            credentials,
            isServicePrincipal: cache.isServicePrincipal,
            linkedSubscriptions: cache.linkedSubscriptions
        };
    }
}

function createServicePrincipal(azureWebsiteName: string, 
                                subscriptionId: string,
                                options: DeviceTokenCredentialsOptions,
                                usingServicePrincipal: boolean):
                                Promise<{appId: string, domainName: string, objectId: string,
                                    servicePrincipalId: string, servicePrincipalSecret: string}> {
    const homepage = getWebsiteUrl(azureWebsiteName);
    const baseUri = options.environment ? options.environment.activeDirectoryGraphResourceId : 'https://graph.windows.net/';
    const existingServicePrincipalSecret: string = program.servicePrincipalSecret;
    const newServicePrincipalSecret: string = genPassword();
    const adminAppRoleId = 'a400a00b-f67c-42b7-ba9a-f73d8c67e433';
    const readOnlyAppRoleId = 'e5bbd0f5-128e-4362-9dd1-8f253c6082d7';
    let newServicePrincipal: ServicePrincipal;
    let objectId: string = '';

    let servicePrincipalCreateParameters;
    let graphClient: GraphRbacManagementClient;

    options.tokenAudience = 'graph';
    let graphClientPromise: Promise<GraphRbacManagementClient>;
    if (usingServicePrincipal) {
        graphClientPromise = loginWithServicePrincipalSecretWithAuthResponse(
            program.servicePrincipalId,
            program.servicePrincipalSecret,
            program.domainId,
            options)
            .then((response: AuthResponse) => {
                return new GraphRbacManagementClient(response.credentials, options.domain || '', baseUri);
            });
    } else {
        graphClient = new GraphRbacManagementClient(new DeviceTokenCredentials(options), options.domain || '', baseUri);
        graphClientPromise = Promise.resolve<GraphRbacManagementClient>(graphClient);
    }

    return graphClientPromise.
    then((client: GraphRbacManagementClient) => {
        graphClient = client;
        const startDate = new Date(Date.now());
        let endDate = new Date(startDate.toISOString());
        const m = momemt(endDate);
        m.add(1, 'years');
        endDate = new Date(m.toISOString());
        const identifierUris = [ homepage ];
        const replyUrls = [ homepage ];
        // Allowing Graph API to sign in and read user profile for newly created application
        const requiredResourceAccess = [{
            resourceAccess: [
                {
                    // This guid represents Sign in and read user profile
                    // http://www.cloudidentity.com/blog/2015/09/01/azure-ad-permissions-summary-table/
                    id: '311a71cc-e848-46a1-bdf8-97ff7156d8e6',
                    type: 'Scope'
                }
            ],
            // This guid represents Directory Graph API ID
            resourceAppId: '00000002-0000-0000-c000-000000000000'
        }];
        const applicationCreateParameters = {
            appRoles: [{
                allowedMemberTypes: [
                  'User'
                ],
                description: 'Administrator access to the application',
                displayName: 'Admin',
                id: adminAppRoleId,
                isEnabled: true,
                value: 'Admin'
              },
              {
                allowedMemberTypes: [
                  'User'
                ],
                description: 'Read only access to device information',
                displayName: 'Read Only',
                id: readOnlyAppRoleId,
                isEnabled: true,
                value: 'ReadOnly'
              }],
            availableToOtherTenants: false,
            displayName: azureWebsiteName,
            homepage,
            identifierUris,
            oauth2AllowImplicitFlow: true,
            optionalClaims: {
                idToken: [
                    {
                      essential: true,
                      name: 'role'
                    }
              ]
            },
            passwordCredentials: [{
                endDate,
                keyId: uuid.v1(),
                startDate,
                value: newServicePrincipalSecret
            }],
            replyUrls,
            requiredResourceAccess
        };

        return graphClient.applications.create(applicationCreateParameters)
        .then((result: Application) => {
            return result;
        })
        .catch((error) => {
            throw new Error(`Could not create new application in this tenant: ${error.message || (error.body && error.body.message)}`);
        });
    })
    .then((result: any) => {
        servicePrincipalCreateParameters = {
            accountEnabled: true,
            appId: result.appId
        };
        objectId = result.objectId;
        return graphClient.servicePrincipals.create(servicePrincipalCreateParameters);
    })
    .then((sp: any) => {
        newServicePrincipal = sp;
        if (usingServicePrincipal) {
            // use login service principal id
            userPrincipalObjectId = program.servicePrincipalId;
            return Promise.resolve(newServicePrincipal);
        }
        return createAppRoleAssignment(adminAppRoleId, sp, graphClient, baseUri);
    })
    .then((sp: any) => {
        const appId = sp.appId;
        return graphClient.domains.list()
        .then((domains: any[]) => {
            let domainName: string = '';
            const servicePrincipalId = newServicePrincipal.objectId || program.servicePrincipalId;
            const servicePrincipalSecret = newServicePrincipalSecret || existingServicePrincipalSecret;
            domains.forEach((value: any) => {
                if (value.isDefault) {
                    domainName = value.name;
                }
            });
            return {
                appId,
                domainName,
                objectId,
                servicePrincipalId,
                servicePrincipalSecret
            };
        });
    })
    .catch((error: Error) => {
        throw error;
    });
}

function createAppRoleAssignment(
    roleId: string,
    sp: ServicePrincipal,
    graphClient: GraphRbacManagementClient,
    baseUri: string): Promise<ServicePrincipal> {
    const meOptions: any = {
        method: 'GET',
        url: `${baseUri}/me?api-version=1.6`
    };
    return graphClient.sendRequest(meOptions)
    .then((me: any) => {
        userPrincipalObjectId = me.objectId;
        const options: any = {
            body: {
                id: roleId,
                principalId: me.objectId,
                resourceId: sp.objectId,
            },
            method: 'POST',
            url: `${baseUri}/me/appRoleAssignments?api-version=1.6`,
        };
        return graphClient.sendRequest(options)
        .then((result: any) => {
            return sp;
        })
        .catch((error) => {
            throw new Error('Could not assign app admin role to you');
        });
    });
}

function createCertificate(): any {
    const pki: any = forge.pki;
    // generate a keypair and create an X.509v3 certificate
    const keys = pki.rsa.generateKeyPair(2048);
    const certificate = pki.createCertificate();
    certificate.publicKey = keys.publicKey;
    certificate.serialNumber = '01';
    certificate.validity.notBefore = new Date(Date.now());
    certificate.validity.notAfter = new Date(Date.now());
    certificate.validity.notAfter.setFullYear(certificate.validity.notBefore.getFullYear() + 1);
    // self-sign certificate
    certificate.sign(keys.privateKey);
    const cert = forge.pki.certificateToPem(certificate);
    const fingerPrint = forge.md.sha1.create().update(forge.asn1.toDer(pki.certificateToAsn1(certificate)).getBytes()).digest().toHex();
    return {
        cert,
        fingerPrint,
        key: forge.pki.privateKeyToPem(keys.privateKey)
    };
}

function getDeploymentQuestions(locations: string[]) {
    const questions: any[] = [];
    questions.push({
        choices: locations,
        message: 'Select a location:',
        name: 'location',
        type: 'list',
    });

    if (program.sku.toLowerCase() !== solutionSkus[solutionSkus.local]) {
        questions.push({
            default: (): any => {
                return answers.solutionName;
            },
            message: 'Enter prefix for ' + getDomain() + ':',
            name: 'azureWebsiteName',
            type: 'input',
            validate: (value: string) => {
                if (!value.match(Questions.websiteHostNameRegex)) {
                    return 'Please enter a valid prefix for azure website.\n' +
                        'Valid characters are: ' +
                        'alphanumeric (A-Z, a-z, 0-9), ' +
                        'and hyphen(-)';
                }
                return checkUrlExists(value, answers.subscriptionId);
            }
        });
    }

    if (program.sku.toLowerCase() === solutionSkus[solutionSkus.basic]) {
        questions.push({
            message: 'Enter a user name for the virtual machine:',
            name: 'adminUsername',
            type: 'input',
            validate: (userName: string) => {
                const pass: RegExpMatchArray | null = userName.match(Questions.userNameRegex);
                const notAllowedUserNames = Questions.notAllowedUserNames.filter((u: string) => {
                    return u === userName;
                });
                if (pass && notAllowedUserNames.length === 0) {
                    return true;
                }

                return invalidUsernameMessage;
            },
        });
        
        questions.push(pwdQuestion('pwdFirstAttempt'));
        questions.push(pwdQuestion('pwdSecondAttempt', 'Confirm your password:'));
    }
    return questions;
}

function pwdQuestion(name: string, message?: string): Question {
    if (!message) {
        message = 'Enter a password for the virtual machine:';
    }
    return {
        mask: '*',
        message,
        name,
        type: 'password',
        validate: (password: string) => {
            const pass: RegExpMatchArray | null = password.match(Questions.passwordRegex);
            const notAllowedPasswords = Questions.notAllowedPasswords.filter((p: string) => {
                return p === password;
            });
            if (pass && notAllowedPasswords.length === 0) {
                return true;
            }
            return invalidPasswordMessage;
        }
    };
}

function askPwdAgain(): Promise<Answers> {
    const questions: Question[] = [
        pwdQuestion('pwdFirstAttempt', 'Password did not match, please enter again:'),
        pwdQuestion('pwdSecondAttempt', 'Confirm your password:')
    ];
    return prompt(questions)
    .then((ans: Answers) => {
        if (ans.pwdFirstAttempt !== ans.pwdSecondAttempt) {
            return askPwdAgain();
        }
        return ans;
    });
}

function checkUrlExists(hostName: string, subscriptionId: string): Promise<string | boolean> {
    const baseUri = cachedAuthResponse.credentials.environment.resourceManagerEndpointUrl;
    const client = new WebSiteManagementClient(new DeviceTokenCredentials(cachedAuthResponse.credentials), subscriptionId, baseUri);
    return client.checkNameAvailability(hostName, 'Site')
    .then((result: any) => {
        if (!result.nameAvailable) {
            return result.message;
        }
        return result.nameAvailable;
    })
    .catch((err) => {
        return true;
    });
}

function getDomain(): string {
    let domain: string = '.azurewebsites.net';
    switch (program.environment) {
        case AzureEnvironment.Azure.name:
            domain = '.azurewebsites.net';
            break;
        case AzureEnvironment.AzureChina.name:
            domain = '.chinacloudsites.cn';
            break;
        case AzureEnvironment.AzureGermanCloud.name:
            domain = '.azurewebsites.de';
            break;
        case AzureEnvironment.AzureUSGovernment.name:
            domain = '.azurewebsites.us';
            break;
        default:
            domain = '.azurewebsites.net';
            break;
    }
    return domain;
}

function getWebsiteUrl(hostName: string): string {
    const domain = getDomain();
    return `https://${hostName}${domain}`;
}

function getAzureEnvironment(environmentName: string): AzureEnvironment {
    const azureEnvironmentMaps = {
        azurechinacloud: AzureEnvironment.AzureChina,
        azurecloud: AzureEnvironment.Azure,
        azuregermancloud: AzureEnvironment.AzureGermanCloud,
        azureusgovernment: AzureEnvironment.AzureUSGovernment,
    };
    return azureEnvironmentMaps[environmentName.toLowerCase()];
}
