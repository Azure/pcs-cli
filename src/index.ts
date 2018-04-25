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
import { AuthResponse, AzureEnvironment, DeviceTokenCredentials, DeviceTokenCredentialsOptions,
    LinkedSubscription, InteractiveLoginOptions, interactiveLoginWithAuthResponse } from 'ms-rest-azure';
import { SubscriptionClient, SubscriptionModels } from 'azure-arm-resource';
import GraphRbacManagementClient = require('azure-graph');
import AuthorizationManagementClient = require('azure-arm-authorization');
import ComputeManagementClient = require('azure-arm-compute');
import { Command } from 'commander';

import { Answers, Question } from 'inquirer';
import { DeploymentManager, IDeploymentManager } from './deploymentmanager';
import DeployUI from './deployui';
import { Questions, IQuestions } from './questions';
import { IK8sManager, K8sManager } from './k8smanager';
import { Config } from './config';

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
    if (program.servicePrincipalId && !program.servicePrincipalSecret) {
        console.log('If service principal is provided then servicePrincipalSecret is required');
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
    cachedAuthResponse = getCachedAuthResponse();
    if (!cachedAuthResponse) {
        console.log('Please run %s', `${chalk.yellow('pcs login')}`);
    } else {
        const baseUri = cachedAuthResponse.options.environment.resourceManagerEndpointUrl;
        const client = new SubscriptionClient(new DeviceTokenCredentials(cachedAuthResponse.options), baseUri);
        return client.subscriptions.list()
        .then(() => {
            const subs: ChoiceType[] = [];
            cachedAuthResponse.subscriptions.map((subscription: LinkedSubscription) => {
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
                .then((locations: string[] | undefined) => {
                    if (locations && locations.length > 0) {
                        return prompt(getDeploymentQuestions(locations));
                    }
                    throw new Error('Locations list cannot be empty');
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
                    if (program.sku.toLowerCase() === solutionSkus[solutionSkus.local]) {
                        // For local deployment we don't need to create Application in AAD hence skipping the creation by resolving empty promise
                        return Promise.resolve({
                            appId: '', 
                            domainName: '',
                            objectId: '',
                            servicePrincipalId: '',
                            servicePrincipalSecret: '' });
                    } else {
                        answers.adminPassword = ans.pwdFirstAttempt;
                        answers.sshFilePath = ans.sshFilePath;
                        deployUI.start('Registering application in the Azure Active Directory');
                        return createServicePrincipal(answers.azureWebsiteName, answers.subscriptionId, cachedAuthResponse.options);
                    }
                })
                .then(({appId, domainName, objectId, servicePrincipalId, servicePrincipalSecret}) => {
                    cachedAuthResponse.options.tokenAudience = null;
                    answers.deploymentSku = program.sku;
                    answers.runtime = program.runtime;
                    if (program.versionOverride) {
                        // In order to run latest code verion override to master is required
                        answers.version = program.versionOverride;
                        answers.dockerTag = 'testing';
                    } else {
                        // For a released version the docker tag and version should be same
                        // Default to master and then try to get the version number from package.json
                        answers.verion = 'master';
                        const list = RELEASE_VERSION_PATTERN.exec(packageJson.version);
                        if (list) {
                            answers.version = list[1];
                        }
                        answers.dockerTag = answers.version;
                    }

                    if (program.sku.toLowerCase() === solutionSkus[solutionSkus.local]) {
                        return deploymentManager.submit(answers);
                    } else if (appId && servicePrincipalSecret) {
                        const env = cachedAuthResponse.options.environment;
                        const appUrl = `${env.portalUrl}/${domainName}#blade/Microsoft_AAD_IAM/ApplicationBlade/objectId/${objectId}/appId/${appId}`;
                        deployUI.stop({message: `Application registered: ${chalk.cyan(appUrl)} `});
                        answers.appId = appId;
                        answers.aadAppUrl = appUrl;
                        answers.servicePrincipalId = servicePrincipalId;
                        answers.servicePrincipalSecret = servicePrincipalSecret;
                        answers.certData = createCertificate();
                        answers.aadTenantId = cachedAuthResponse.options.domain;
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
    let environment: any;
    const lowerCaseEnv = program.environment.toLowerCase();
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
    const loginOptions: InteractiveLoginOptions = {
        environment
    };
    return interactiveLoginWithAuthResponse(loginOptions).then((response: AuthResponse) => {
        const credentials = response.credentials as any;
        if (!fs.existsSync(pcsTmpDir)) {
            fs.mkdir(pcsTmpDir);
        }
        const data = {
            credentials,
            linkedSubscriptions: response.subscriptions
        };
        fs.writeFileSync(cacheFilePath, JSON.stringify(data));
        console.log(`${chalk.green('Successfully logged in')}`);
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

function getCachedAuthResponse(): any {
    if (!fs.existsSync(cacheFilePath)) {
        return null;
    } else {
        const cache = JSON.parse(fs.readFileSync(cacheFilePath, 'UTF-8'));
        const tokenCache = new adal.MemoryCache();
        const options: DeviceTokenCredentialsOptions = cache.credentials;
        tokenCache.add(options.tokenCache._entries, () => {
            // empty function
        });
        options.tokenCache = tokenCache;
        // Environment names: AzureCloud, AzureChina, USGovernment, GermanCloud, or your own Dogfood environment
        program.environment = options.environment && options.environment.name;
        return {
            options,
            subscriptions: cache.linkedSubscriptions
        };
    }
}

function createServicePrincipal(azureWebsiteName: string, 
                                subscriptionId: string,
                                options: DeviceTokenCredentialsOptions):
                                Promise<{appId: string, domainName: string, objectId: string,
                                    servicePrincipalId: string, servicePrincipalSecret: string}> {
    const homepage = getWebsiteUrl(azureWebsiteName);
    const graphOptions = options;
    graphOptions.tokenAudience = 'graph';
    const baseUri = options.environment ? options.environment.activeDirectoryGraphResourceId : undefined;
    const graphClient = new GraphRbacManagementClient(new DeviceTokenCredentials(graphOptions), options.domain ? options.domain : '', baseUri);
    const startDate = new Date(Date.now());
    let endDate = new Date(startDate.toISOString());
    const m = momemt(endDate);
    m.add(1, 'years');
    endDate = new Date(m.toISOString());
    const identifierUris = [ homepage ];
    const replyUrls = [ homepage ];
    const newServicePrincipalSecret: string = uuid.v4();
    const existingServicePrincipalSecret: string = program.servicePrincipalSecret;
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
        availableToOtherTenants: false,
        displayName: azureWebsiteName,
        homepage,
        identifierUris,
        oauth2AllowImplicitFlow: true,
        passwordCredentials: [{
                endDate,
                keyId: uuid.v1(),
                startDate,
                value: newServicePrincipalSecret
            }
        ],
        replyUrls,
        requiredResourceAccess
    };
    let objectId: string = '';
    return graphClient.applications.create(applicationCreateParameters)
    .then((result: any) => {
        const servicePrincipalCreateParameters = {
            accountEnabled: true,
            appId: result.appId
        };
        objectId = result.objectId;
        return graphClient.servicePrincipals.create(servicePrincipalCreateParameters);
    })
    .then((sp: any) => {
        if (program.sku.toLowerCase() === solutionSkus[solutionSkus.basic] || program.sku.toLowerCase() === solutionSkus[solutionSkus.local] ||
         (program.servicePrincipalId && program.servicePrincipalSecret)) {
            return sp.appId;
        }

        // Create role assignment only for standard deployment since ACS requires it
        return createRoleAssignmentWithRetry(subscriptionId, sp.objectId, sp.appId, options);
    })
    .then((appId: string) => {
        return graphClient.domains.list()
        .then((domains: any[]) => {
            let domainName: string = '';
            const servicePrincipalId = program.servicePrincipalId ? program.servicePrincipalId : appId;
            const servicePrincipalSecret = existingServicePrincipalSecret ? existingServicePrincipalSecret : newServicePrincipalSecret;
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

// After creating the new application the propogation takes sometime and hence we need to try
// multiple times until the role assignment is successful or it fails after max try.
function createRoleAssignmentWithRetry(subscriptionId: string, objectId: string,
                                       appId: string, options: DeviceTokenCredentialsOptions): Promise<any> {
    const roleId = '8e3af657-a8ff-443c-a75c-2fe8c4bcb635'; // that of a owner
    const scope = '/subscriptions/' + subscriptionId; // we shall be assigning the sp, a 'contributor' role at the subscription level
    const roleDefinitionId = scope + '/providers/Microsoft.Authorization/roleDefinitions/' + roleId;
    // clearing the token audience
    options.tokenAudience = undefined;
    const baseUri = options.environment ? options.environment.resourceManagerEndpointUrl : undefined;
    const authzClient = new AuthorizationManagementClient(new DeviceTokenCredentials(options), subscriptionId, baseUri);
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
    const baseUri = cachedAuthResponse.options.environment.resourceManagerEndpointUrl;
    const client = new WebSiteManagementClient(new DeviceTokenCredentials(cachedAuthResponse.options), subscriptionId, baseUri);
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
