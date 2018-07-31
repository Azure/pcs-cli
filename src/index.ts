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
import { SubscriptionClient, SubscriptionModels } from 'azure-arm-resource';
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

enum environments {
    azurecloud,
    azurechinacloud,
    azuregermanycloud,
    azureusgovernment
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

const program = new Command(packageJson.name)
    .version(packageJson.version, '-v, --version')
    .option('-t, --type <type>', 'Solution Type: remotemonitoring',
            /^(remotemonitoring|test)$/i,
            'remotemonitoring')
    .option('-s, --sku <sku>', 'SKU Type (only for Remote Monitoring): basic, standard, or local', /^(basic|standard|local)$/i, 'basic')
    .option('-e, --environment <environment>',
            'Azure environments: AzureCloud or AzureChinaCloud',
            /^(AzureCloud|AzureChinaCloud)$/i, 'AzureCloud')
    .option('-r, --runtime <runtime>', 'Microservices runtime: dotnet or java', /^(dotnet|java)$/i, 'dotnet')
    .option('--servicePrincipalId <servicePrincipalId>', 'Service Principal Id')
    .option('--servicePrincipalSecret <servicePrincipalSecret>', 'Service Principal Secret')
    .option('--versionOverride <versionOverride>', 'Current accepted value is "master"')
    .option('--domainId <domainId>', 'This can either be an .onmicrosoft.com domain or the Azure object ID for the tenant')
    .option('--solutionName <solutionName>', 'Solution name for your Remote monitoring accelerator')
    .option('--subscriptionId <subscriptionId>', 'SubscriptionId on which this solution should be created')
    .option('-l, --location <location>', 'Locaion where the solution will be deployed')
    .option('-w, --websiteName <websiteName>', 'Name of the website, default is solution name')
    .option('-u, --username <username>', 'User name for the virtual machine that will be created as part of the solution')
    .option('-p, --password <password>', 'Password for the virtual machine that will be created as part of the solution')
    .option('--sshFilePath <sshFilePath>', 'Path to the ssh file path that will be used by standard deployment')
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
                if (program.subscriptionId) {
                    subPrompt = Promise.resolve<Answers>({ subscriptionId: program.subscriptionId});
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
                    if (program.location && (program.websiteName || program.solutionName) && program.username) {
                        const ans: Answers = {
                            adminUsername: program.username,
                            azureWebsiteName: program.websiteName || program.solutionName,
                            location: program.location,
                            solutionName: program.solutionName
                        };
                        if (program.sku.toLowerCase() === solutionSkus[solutionSkus.basic]) {
                            if ( program.password ) {
                                ans.pwdFirstAttempt = program.password;
                                ans.pwdSecondAttempt = program.password;
                            } else {
                                throw new Error('username and password are required for basic deployment');
                            }
                        } else if (program.sku.toLowerCase() === solutionSkus[solutionSkus.standard]) {
                            if (program.sshFilePath) {
                                ans.sshFilePath = program.sshFilePath;
                            } else {
                                throw new Error('sshFilePath is required for standard deployment type');
                            }
                        }
                        return Promise.resolve<Answers>(ans);
                    } else if (locations && locations.length > 0) {
                        return prompt(getDeploymentQuestions(locations));
                    }
                    throw new Error('Locations list cannot be empty');
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
                        // For local deployment we don't need to create Application in AAD hence skipping the creation by resolving empty promise
                        return Promise.resolve({
                            appId: '',
                            domainName: ans.domainName || '',
                            objectId: '',
                            servicePrincipalId: '',
                            servicePrincipalSecret: '' });
                    } else {
                        answers.adminPassword = ans.pwdFirstAttempt;
                        answers.sshFilePath = ans.sshFilePath;
                        deployUI.start('Registering application in the Azure Active Directory');
                        return createServicePrincipal(answers.azureWebsiteName,
                                                      answers.subscriptionId,
                                                      cachedAuthResponse.credentials,
                                                      cachedAuthResponse.isServicePrincipal);
                    }
                })
                .then(({appId, domainName, objectId, servicePrincipalId, servicePrincipalSecret}) => {
                    cachedAuthResponse.credentials.tokenAudience = null;
                    answers.deploymentSku = program.sku;
                    answers.runtime = program.runtime;
                    if (program.versionOverride) {
                        // In order to run latest code verion override to master is required
                        answers.version = program.versionOverride;
                        answers.dockerTag = 'testing';
                    } else {
                        // For a released version the docker tag and version should be same
                        // Default to latest released verion
                        const version = '1.0.0';
                        answers.version = version;
                        answers.dockerTag = version;
                    }

                    if (program.sku.toLowerCase() === solutionSkus[solutionSkus.local]) {
                        return deploymentManager.submit(answers);
                    } else if (appId && servicePrincipalSecret) {
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
                    return prompt(questions.value)
                        .then((ans: Answers) => {
                            answers = ans;
                            const index = cachedAuthResponse.subscriptions.findIndex((x: LinkedSubscription) => x.id === answers.subscriptionId);
                            if (index === -1) {
                                const errorMessage = 'Selected subscriptionId was not found in cache';
                                console.log(errorMessage);
                                throw new Error(errorMessage);
                            }
                            cachedAuthResponse.options.domain = cachedAuthResponse.subscriptions[index].tenantId;
                            deploymentManager = new DeploymentManager(cachedAuthResponse.options, answers.subscriptionId, program.type, program.sku);
                            return deploymentManager.getLocations();
                        })
                        .then((locations: string[]) => {
                            return prompt(getDeploymentQuestions(locations));
                        })
                        .then((ans: Answers) => {
                            answers.location = ans.location;
                            answers.azureWebsiteName = ans.azureWebsiteName;
                            answers.adminUsername = ans.adminUsername;
                            if (ans.pwdFirstAttempt !== ans.pwdSecondAttempt) {
                                return askPwdAgain();
                            }
                            return ans;
                        })
                        .then((ans: Answers) => {
                            answers.adminPassword = ans.pwdFirstAttempt;
                            answers.sshFilePath = ans.sshFilePath;
                            deployUI.start('Registering application in the Azure Active Directory');
                            return createServicePrincipal(answers.azureWebsiteName, answers.subscriptionId, cachedAuthResponse.options);
                        })
                        .then(({ appId, domainName, objectId, servicePrincipalSecret }) => {
                            if (appId && servicePrincipalSecret) {
                                const env = cachedAuthResponse.options.environment;
                                const appUrl = `${env.portalUrl}/${domainName}#blade/Microsoft_AAD_IAM/ApplicationBlade/objectId/${objectId}/appId/${appId}`;
                                deployUI.stop({ message: `Application registered: ${chalk.cyan(appUrl)} ` });
                                cachedAuthResponse.options.tokenAudience = null;
                                answers.appId = appId;
                                answers.aadAppUrl = appUrl;
                                answers.deploymentSku = program.sku;
                                answers.servicePrincipalSecret = servicePrincipalSecret;
                                answers.certData = createCertificate();
                                answers.aadTenantId = cachedAuthResponse.options.domain;
                                answers.runtime = program.runtime;
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
    const newServicePrincipalSecret: string = uuid.v4();
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
        return createAppRoleAssignment(adminAppRoleId, sp, graphClient, baseUri);
    })
    .then((sp: any) => {
        // Create role assignment only for standard deployment since ACS requires it
        if (program.sku.toLowerCase() === solutionSkus[solutionSkus.standard]) {
            const cachedAuthResp = getCachedAuthResponse();
            return createRoleAssignmentWithRetry(subscriptionId, sp.objectId, sp.appId, cachedAuthResp.credentials);
        }
        return sp.appId;
    })
    .then((appId: string) => {
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
            objectId = result.objectId;
            return graphClient.servicePrincipals.create(servicePrincipalCreateParameters);
        })
        .then((sp: any) => {
            if (program.sku.toLowerCase() === solutionSkus[solutionSkus.basic]) {
                return sp.appId;
            }

            // Create role assignment only for standard deployment since ACS requires it
            return createRoleAssignmentWithRetry(subscriptionId, sp.objectId, sp.appId, options);
        })
        .then((appId: string) => {
            return graphClient.domains.list()
                .then((domains: any[]) => {
                    let domainName: string = '';
                    domains.forEach((value: any) => {
                        if (value.isDefault) {
                            domainName = value.name;
                        }
                    });
                    return {
                        appId,
                        domainName,
                        objectId,
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

// After creating the new application the propogation takes sometime and hence we need to try
// multiple times until the role assignment is successful or it fails after max try.
function createRoleAssignmentWithRetry(
    subscriptionId: string,
    objectId: string,
    appId: string, options: DeviceTokenCredentialsOptions): Promise<any> {

    const roleId = '8e3af657-a8ff-443c-a75c-2fe8c4bcb635'; // that of a owner
    const scope = '/subscriptions/' + subscriptionId; // we shall be assigning the sp, a 'contributor' role at the subscription level
    const roleDefinitionId = scope + '/providers/Microsoft.Authorization/roleDefinitions/' + roleId;
    // clearing the token audience
    options.tokenAudience = undefined;
    const baseUri = options.environment ? options.environment.resourceManagerEndpointUrl : undefined;
    const authzClient = new AuthorizationManagementClient(getPatchedDeviceTokenCredentials(options), subscriptionId, baseUri);
    const assignmentGuid = uuid.v1();
    const roleCreateParams = {
        properties: {
            principalId: objectId,
            // have taken this from the comments made above
            roleDefinitionId,
            scope
        }
    };
    let retryCount = 0;
    const promise = new Promise<any>((resolve, reject) => {
        const timer: NodeJS.Timer = setInterval(
            () => {
                retryCount++;
                return authzClient.roleAssignments.create(scope, assignmentGuid, roleCreateParams)
                .then((roleResult: any) => {
                    // Sometimes after role assignment it takes some time before they get propagated
                    // this failes the ACS deployment since it thinks that credentials are not valid
                    setTimeout(
                        () => {
                            clearInterval(timer);
                            resolve(appId);
                        },
                        5000);
                })
                .catch ((error: Error) => {
                    if (retryCount >= MAX_RETRYCOUNT) {
                        clearInterval(timer);
                        resolve(appId);
                    })
                    .catch((error: Error) => {
                        if (retryCount >= MAX_RETRYCOUNT) {
                            clearInterval(timer);
                            console.log(error);
                            reject(error);
                        }
                    });
            },
            5000);
    });
    return promise;
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
    }

    // Only add ssh key file option for standard deployment
    if (program.sku.toLowerCase() === solutionSkus[solutionSkus.standard]) {
        questions.push({
            default: defaultSshPublicKeyPath,
            message: 'Enter path to SSH key file path:',
            name: 'sshFilePath',
            type: 'input',
            validate: (sshFilePath: string) => {
                // TODO Add ssh key validation
                // Issue: https://github.com/Azure/pcs-cli/issues/83
                return fs.existsSync(sshFilePath);
            },
        });
    } else if (program.sku.toLowerCase() === solutionSkus[solutionSkus.basic]) {
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
    let environment: any;
    const lowerCaseEnv = environmentName.toLowerCase();
    switch (lowerCaseEnv) {
        case environments[environments.azurecloud]:
            environment = AzureEnvironment.Azure;
            break;
        case environments[environments.azurechinacloud]:
            environment = AzureEnvironment.AzureChina;
            break;
        case environments[environments.azuregermanycloud]:
            environment = AzureEnvironment.AzureGermanCloud;
            break;
        case environments[environments.azureusgovernment]:
            environment = AzureEnvironment.AzureUSGovernment;
            break;
        default:
            environment = AzureEnvironment.Azure;
            break;
    }
    return environment;
}

function getPatchedDeviceTokenCredentials(options: any) {
    const credentials: any = new DeviceTokenCredentials(options);
    // clean the default username of 'user@example.com' which always fail the token search in cache when using service principal login option.
    if (credentials.hasOwnProperty('username') && credentials.username === 'user@example.com') {
        delete credentials.username;
    }
    return credentials;
}
