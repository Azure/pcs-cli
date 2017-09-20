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
import { Questions, IQuestions } from './questions';
import { IK8sManager, K8sManager } from './k8smanager';
import { Config } from './config';

const packageJson = require('../package.json');

const solutionType: string = 'remotemonitoring';
enum solutionSkus {
    basic,
    standard,
    test
}

enum environments {
    azure,
    china,
    germany,
    usgovernment
}

const invalidUsernameMessage = 'Usernames can be a maximum of 20 characters in length and cannot end in a period (\'.\')';
/* tslint:disable */
const invalidPasswordMessage = 'The supplied password must be between 6-72 characters long and must satisfy at least 3 of password complexity requirements from the following: 1) Contains an uppercase character\n2) Contains a lowercase character\n3) Contains a numeric digit\n4) Contains a special character\n5) Control characters are not allowed';
/* tslint:enable */

const gitHubUrl: string = 'https://github.com/Azure/pcs-cli#azure-iot-pcs-cli';
const gitHubIssuesUrl: string = 'https://github.com/azure/azure-remote-monitoring-cli/issues/new';

const pcsTmpDir: string = os.homedir() + path.sep + '.pcs';
const cacheFilePath: string = pcsTmpDir + path.sep + 'cache.json';
const defaultSshPublicKeyPath = os.homedir() + path.sep + '.ssh' + path.sep + 'id_rsa.pub';

const MAX_RETRYCOUNT = 36;

const program = new Command(packageJson.name)
    .version(packageJson.version, '-v, --version')
    .option('-t, --type <type>', 'Solution Type: remotemonitoring', /^(remotemonitoring|test)$/i, 'remotemonitoring')
    .option('-s, --sku <sku>', 'SKU Type: basic, standard, or test', /^(basic|standard|test)$/i, 'basic')
    .option('-e, --environment <environment>',
            'Azure environments: Azure or China',
            /^(Azure|China)$/i, 'Azure')
    .option('-r, --runtime <runtime>', 'Microservices runtime: dotnet or java', /^(dotnet|java)$/i, 'dotnet')
    .on('--help', () => {
        console.log(
            `    Default value for ${chalk.green('-t, --type')} is ${chalk.green('remotemonitoring')}.`
            );
        console.log(
            `    Default value for ${chalk.green('-s, --sku')} is ${chalk.green('basic')}.`
            );
        console.log(
            `    Example for executing a basic deployment:  ${chalk.green('pcs -t remotemonitoring -s basic')}.`
            );
        console.log(
            `    Example for executing a standard deployment:  ${chalk.green('pcs -t remotemonitoring -s standard')}.`
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
    main();
} else if (program.args[0] === 'login') {
    login();
} else if (program.args[0] === 'logout') {
    logout();
} else {
    console.log(`${chalk.red('Invalid choice:', program.args.toString())}`);
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
    const cachedAuthResponse = getCachedAuthResponse();
    if (!cachedAuthResponse) {
        console.log('Please run %s', `${chalk.yellow('pcs login')}`);
    } else {
        let client = new SubscriptionClient(new DeviceTokenCredentials(cachedAuthResponse.options));
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

                let answers: Answers = {};
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
                    client = new SubscriptionClient(new DeviceTokenCredentials(cachedAuthResponse.options));
                    return client.subscriptions.listLocations(answers.subscriptionId)
                    .then((locationsResult: SubscriptionModels.LocationListResult) => {
                        const locations: string[] = [];
                        locationsResult.forEach((location: SubscriptionModels.Location) => {
                            const name = location.displayName as string;
                            locations.push(name);
                        });
                        return locations;
                    });
                })
                .then((locations: string[]) => {
                    return prompt(getDeploymentQuestions(locations));
                })
                .then((ans: Answers) => {
                    answers.location = ans.location;
                    answers.adminUsername = ans.adminUsername;
                    if (ans.pwdFirstAttempt !== ans.pwdSecondAttempt) {
                        return askPwdAgain();
                    }
                    return ans;
                })
                .then((ans: Answers) => {
                    answers.adminPassword = ans.pwdFirstAttempt;
                    answers.sshFilePath = ans.sshFilePath;
                    return createServicePrincipal(answers.azureWebsiteName, answers.subscriptionId, cachedAuthResponse.options);
                })
                .then(({appId, servicePrincipalSecret}) => {
                    if (appId && servicePrincipalSecret) {
                        cachedAuthResponse.options.tokenAudience = null;
                        const deploymentManager: IDeploymentManager = 
                        new DeploymentManager(cachedAuthResponse.options, solutionType);
                        answers.appId = appId;
                        answers.adminPassword = servicePrincipalSecret;
                        answers.deploymentSku = program.sku;
                        answers.certData = createCertificate();
                        answers.aadTenantId = cachedAuthResponse.options.domain;
                        answers.runtime = program.runtime;
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
        case environments[environments.azure]:
            environment = AzureEnvironment.Azure;
            break;
        case environments[environments.china]:
            environment = AzureEnvironment.AzureChina;
            break;
        case environments[environments.germany]:
            environment = AzureEnvironment.AzureGermanCloud;
            break;
        case environments[environments.usgovernment]:
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

function createServicePrincipal(azureWebsiteName: string, subscriptionId: string,
                                options: DeviceTokenCredentialsOptions): Promise<{appId: string, servicePrincipalSecret: string}> {
    let domain = '.azurewebsites.net';
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
    const homepage = 'https://' + azureWebsiteName + domain;
    const graphOptions = options;
    graphOptions.tokenAudience = 'graph';
    const graphClient = new GraphRbacManagementClient(new DeviceTokenCredentials(graphOptions), options.domain ? options.domain : '' );
    const startDate = new Date(Date.now());
    let endDate = new Date(startDate.toISOString());
    const m = momemt(endDate);
    m.add(1, 'years');
    endDate = new Date(m.toISOString());
    const identifierUris = [ homepage ];
    const servicePrincipalSecret: string = uuid.v4();
    const applicationCreateParameters = {
        availableToOtherTenants: false,
        displayName: azureWebsiteName,
        homepage,
        identifierUris,
        passwordCredentials: [{
                endDate,
                keyId: uuid.v1(),
                startDate,
                value: servicePrincipalSecret
            }
        ]
    };
    
    return graphClient.applications.create(applicationCreateParameters)
    .then((result: any) => {
        const servicePrincipalCreateParameters = {
            accountEnabled: true,
            appId: result.appId
            };
        return graphClient.servicePrincipals.create(servicePrincipalCreateParameters);
    })
    .then((sp: any) => {
        return createRoleAssignmentWithRetry(subscriptionId, sp.objectId, sp.appId, options);
    })
    .then((appId: string) => {
        return {
            appId,
            servicePrincipalSecret
        };
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
    const authzClient = new AuthorizationManagementClient(new DeviceTokenCredentials(options), subscriptionId);
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
        const timer: NodeJS.Timer = setInterval(() => {
            retryCount++;
            return authzClient.roleAssignments.create(scope, assignmentGuid, roleCreateParams)
            .then((roleResult: any) => {
                clearInterval(timer);
                resolve(appId);
            })
            .catch ((error: Error) => {
                if (retryCount >= MAX_RETRYCOUNT) {
                    clearInterval(timer);
                    console.log(error);
                    reject(error);
                } else {
                    console.log(`${chalk.yellow('Retrying role assignment creation:', retryCount.toString(), 'of', MAX_RETRYCOUNT.toString())}`);
                }
            });
        },                                      5000);
    });
    return promise;
}

function createCertificate(): any {
    const pki: any = forge.pki;
    // generate a keypair and create an X.509v3 certificate
    const keys = pki.rsa.generateKeyPair(2048);
    const cert = pki.createCertificate();
    cert.publicKey = keys.publicKey;
    cert.serialNumber = '01';
    cert.validity.notBefore = new Date(Date.now());
    cert.validity.notAfter = new Date(Date.now());
    cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1);
    // self-sign certificate
    cert.sign(keys.privateKey);
    const fingerPrint = pki.getPublicKeyFingerprint(keys.publicKey, {encoding: 'hex', delimiter: ':'});
    return {
        cert: forge.pki.certificateToPem(cert),
        fingerPrint,
        key: forge.pki.privateKeyToPem(keys.privateKey)
    };
}

function getDeploymentQuestions(locations: string[]) {
    const questions: Question[] = [];
    questions.push({
        choices: locations,
        message: 'Select a location:',
        name: 'location',
        type: 'list',
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
    } else {
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
        validate: (password: string, answers: Answers) => {
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