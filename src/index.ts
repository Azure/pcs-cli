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
import { AuthResponse, DeviceTokenCredentials, DeviceTokenCredentialsOptions,
    LinkedSubscription, interactiveLoginWithAuthResponse } from 'ms-rest-azure';
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

let solutionType: string = 'remotemonitoring';
let template = require('../' + solutionType + '/templates/remoteMonitoring.json');
let parameters = require('../' + solutionType + '/templates/remoteMonitoringParameters.json');
enum solutionSku {
    basic,
    enterprise,
    test
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
    .option('-t, --type <type>', 'Soltuion Type', /^(remotemonitoring|test)$/i, 'remotemonitoring')
    .option('-s, --sku <sku>', 'SKU Type', /^(basic|enterprise|test)$/i, 'basic')
    .action((type) => {
        if (type === 'login') {
            return login();
        } else if (type === 'logout') {
            return logout();
        } else {
            console.log(`${chalk.red('Invalid choice:', type)}`);
        }
    })
    .on('--help', () => {
        console.log(
            `    Default value for ${chalk.green('-t, --type')} is ${chalk.green('remotemonitoring')}.`
            );
        console.log(
            `    Default value for ${chalk.green('-s, --sku')} is ${chalk.green('basic')}.`
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
            `    If you have any problems, do not hesitate to file an issue:`
            );
        console.log(
            `    ${chalk.cyan(gitHubIssuesUrl)}`
            );
        console.log();
    })
    .parse(process.argv);

if (!program.args[0] || program.args[0] === '-t') {
    main();
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
    
    const config = new Config();
    config.AzureStorageAccountKey =         'somevalue';
    config.AzureStorageAccountName =        'somevalue';
    config.DNS =                            'somevalue';
    config.DocumentDBConnectionString =     'somevalue';
    config.IoTHubConnectionString =         'somevalue';
    config.IoTHubReactConnectionString =    'somevalue';
    config.IotHubReactEndpoint =            'somevalue';
    config.IotHubReactName =                'somevalue';
    config.IotHubReactPartitions =          'somevalue';
    config.LoadBalancerIP =                 'somevalue';

    const k8sManager: IK8sManager = new K8sManager('default', '/Users/parvezp/.kube/config', config);
    k8sManager.setupDeployment().then((result: any) => {
        console.log(result);
    })
    .catch((error: Error) => {
        console.log(error);
    });
    const cachedAuthResponse = getCachedAuthResponse();
    if (!cachedAuthResponse) {
        console.log('Please run %s', `${chalk.yellow('pcs login')}`);
    } else {
        const client = new SubscriptionClient(new DeviceTokenCredentials(cachedAuthResponse.options));
        return client.subscriptions.list()
        .then(() => {
            const subs: ChoiceType[] = [];
            cachedAuthResponse.subscriptions.map((subscription: LinkedSubscription) => {
                if (subscription.state === 'Enabled') {
                    subs.push({name: subscription.name, value: subscription.id});
                }
            });
            solutionType = program.type;
            let templateNamePrefix = solutionType;
            let solution = templateNamePrefix + '.json';
            let params = templateNamePrefix + 'Parameters.json';
        
            if (!subs || !subs.length) {
                console.log('Could not find any subscriptions in this account.');
                console.log('Please login with an account that has at least one active subscription');
            } else {
                const questions: IQuestions = new Questions();
                questions.insertQuestion(1, {
                    choices: subs,
                    message: 'Select a subscription:',
                    name: 'subscriptionId',
                    type: 'list'
                });
                
                if (program.sku === solutionSku[solutionSku.basic]) {
                    // Setting the ARM template that is meant to do demo deployment
                    templateNamePrefix += 'WithSingleVM';
                    solution = templateNamePrefix + '.json';
                    params = templateNamePrefix + 'Parameters.json';
                }
                addMoreDeploymentQuestions(questions);

                try {
                    template = require('../' + solutionType + '/templates/' + solution);
                    parameters = require('../' + solutionType + '/templates/' + params);
                } catch (ex) {
                    console.log('Could not find template or parameters file, Exception:', ex);
                    return;
                }
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
                    return cachedAuthResponse.subscriptions[index];
                })
                .then((subscription: LinkedSubscription) => {
                    cachedAuthResponse.options.domain = subscription.tenantId;
                    return createServicePrincipal(answers.solutionName,
                                                  subscription.id, answers.adminPassword, cachedAuthResponse.options);
                })
                .then((appId: string) => {
                    if (appId) {
                        cachedAuthResponse.options.tokenAudience = null;
                        const deploymentManager: IDeploymentManager = 
                        new DeploymentManager(cachedAuthResponse.options, solutionType, template, parameters);
                        answers.appId = appId;
                        answers.deploymentSku = program.sku;
                        answers.certData = createCertificate();
                        return deploymentManager.submit(answers);
                    }
                })
                .catch((error: Error) => {
                    console.log('Prompt error: ' + error);
                });
            }
        })
        .catch((error: any) => {
            // In case of login error it is better to ask user to login again
            console.log('Please run %s', `${chalk.yellow('pcs login')}`);
        });
    }
}

function login(): Promise<void> {
    return interactiveLoginWithAuthResponse().then((response: AuthResponse) => {
        const credentials = response.credentials as any;
        if (!fs.existsSync(pcsTmpDir)) {
            fs.mkdir(pcsTmpDir);
        }
        const data = {
            linkedSubscriptions: response.subscriptions,
            tokens: credentials.context._cache._entries
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
        const tokens = cache.tokens;
        let username = '';
        tokens.forEach((token: any) => {
            token.expiresOn = new Date(token.expiresOn);
            username = token.userId;
        });
        tokenCache.add(tokens, () => {
            // empty function
        });
        const options: DeviceTokenCredentialsOptions = {
            tokenCache,
            username
        };
        return {
            options,
            subscriptions: cache.linkedSubscriptions
        };
    }
}

function createServicePrincipal(solutionName: string, subscriptionId: string,
                                passwordForSp: string, options: DeviceTokenCredentialsOptions): Promise<any> {
    const graphOptions = options;
    graphOptions.tokenAudience = 'graph';
    const graphClient = new GraphRbacManagementClient(new DeviceTokenCredentials(graphOptions), options.domain ? options.domain : '' );
    const startDate = new Date(Date.now());
    let endDate = new Date(startDate.toISOString());
    const m = momemt(endDate);
    m.add(1, 'years');
    endDate = new Date(m.toISOString());
    const homepage = solutionName;
    const identifierUris = [ homepage ];
    const applicationCreateParameters = {
        availableToOtherTenants: false,
        displayName: solutionName,
        homepage,
        identifierUris,
        passwordCredentials: [{
        endDate,
        keyId: uuid.v1(),
        startDate,
        value: passwordForSp
        }]
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
    .catch((error: any) => {
        console.log(`${chalk.red('Error while creating applciaiton:', solutionName, error.body.message)}`);
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
    const fingerprint = pki.getPublicKeyFingerprint(keys.publicKey, {encoding: 'hex', delimiter: ':'});
    return {
        cert: forge.pki.certificateToPem(cert),
        fingerprint,
        privateKey: forge.pki.privateKeyToPem(keys.privateKey)
    };
}

function addMoreDeploymentQuestions(questions: IQuestions) {
    questions.addQuestion({
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
    questions.addQuestion({
        mask: '*',
        message: 'Enter a password, this will be used for both virtual machine and service principal secret:',
        name: 'adminPassword',
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
        },
    });
    // Only add ssh key file option for enterprise deployment
    if (program.sku === solutionSku[solutionSku.enterprise]) {
        questions.addQuestion({
            default: defaultSshPublicKeyPath,
            message: 'Enter path to SSH key file path:',
            name: 'sshFilePath',
            type: 'input',
            validate: (sshFilePath: string) => {
                // TODO Add ssh key validation
                // Issue: https://github.com/Azure/pcs-cli/issues/83
                return true;
            },
        });
    }
}
