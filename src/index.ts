#!/usr/bin/env node
const adal = require('adal-node');

import * as chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import { ChoiceType, prompt } from 'inquirer';
import { AuthResponse, DeviceTokenCredentials, InteractiveLoginOptions, LinkedSubscription, interactiveLoginWithAuthResponse } from 'ms-rest-azure';
import { SubscriptionClient, SubscriptionModels } from 'azure-arm-resource';

import { Answers, Question } from 'inquirer';
import { DeploymentManager, IDeploymentManager } from './deploymentmanager';
import { Questions, IQuestions } from './questions';
import { Command } from 'commander';

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

const fileName: string = process.cwd() + path.sep + 'creds';
let deviceTokenCredentials: any = null;

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
    let creds = '';
    const subs: ChoiceType[] = [];
    if (!fs.existsSync(fileName)) {
        console.log('Please run %s', `${chalk.yellow('pcs login')}`);
    } else {
        creds = fs.readFileSync(fileName, 'UTF-8');
        const options = JSON.parse(creds);
        const tokenCache = new adal.MemoryCache();
        tokenCache.add(options.tokenCache._entries, () => {
            // empty function
        });
        options.tokenCache = tokenCache;
        // const authorityUrl = options.environment.activeDirectoryEndpointUrl + options.domain;
        // const context = new adal.AuthenticationContext(authorityUrl, options.environment.validateAuthority, options.tokenCache);
        // context.acquireTokenWithRefreshToken(options.tokenCache._entries[0].refreshToken, options.clientId, null, (err: any, result: any) => {
        //     if (err) {
        //         console.log(err);
        //     }
        //     console.log(result);
        // });
        deviceTokenCredentials = new DeviceTokenCredentials(options) as any;
        const client = new SubscriptionClient(deviceTokenCredentials);
        client.subscriptions.list()
        .then((values: SubscriptionModels.SubscriptionListResult) => {
            values.map((subscription: SubscriptionModels.Subscription) => {
                if (subscription.state === 'Enabled') {
                    subs.push({name: subscription.displayName, value: subscription.subscriptionId});
                }
            });
        })
        .then(() => {
            solutionType = program.type;
            let templateNamePrefix = solutionType;
            let solution = templateNamePrefix + '.json';
            let params = templateNamePrefix + 'Parameters.json';
        
            if (!subs || !subs.length) {
                console.log('Could not find any subscriptions in this account.\n \
                Please login with an account that has at least one active subscription');
            } else {
                const questions: IQuestions = new Questions();
                questions.insertQuestion(1, {
                    choices: subs,
                    message: 'Select a subscription:',
                    name: 'subscriptionId',
                    type: 'list',
                });
                
                if (program.sku === solutionSku[solutionSku.basic]) {
                    // Setting the ARM template that is meant to do demo deployment
                    templateNamePrefix += 'WithSingleVM';
                    solution = templateNamePrefix + '.json';
                    params = templateNamePrefix + 'Parameters.json';
                    addBasicDeploymentQuestions(questions);
                }

                try {
                    template = require('../' + solutionType + '/templates/' + solution);
                    parameters = require('../' + solutionType + '/templates/' + params);
                } catch (ex) {
                    console.log('Could not find template or parameters file, Exception:', ex);
                    return;
                }
    
                const deploymentManager: IDeploymentManager = new DeploymentManager(deviceTokenCredentials, solutionType, template, parameters);
                prompt(questions.value)
                .then((answers: Answers) => {
                    return deploymentManager.submit(answers);
                })
                .catch((error: Error) => {
                    console.log('Prompt error: ' + error);
                });
            }
        })
        .catch((error: any) => {
            if (error.code === 'ExpiredAuthenticationToken') {
                console.log('Please run %s', `${chalk.yellow('pcs login')}`);
            } else {
                console.log(error);
            }
        });
    }
}

function login(): Promise<void> {
    return interactiveLoginWithAuthResponse().then((authResponse: AuthResponse) => {
        const credentials = authResponse.credentials as any;
        fs.writeFileSync(fileName, JSON.stringify(credentials));
        console.log(`${chalk.green('Successfully logged in')}`);
    })
    .catch((error: Error) => {
        console.log(error);
    });
}

function logout() {
    if (fs.existsSync(fileName)) {
        fs.unlinkSync(fileName);
    }
    console.log(`${chalk.green('Successfully logged out')}`);
}

function addBasicDeploymentQuestions(questions: IQuestions) {
    questions.addQuestion({
        message: 'Enter a user name for the virtual machine',
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
        message: 'Enter a password',
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
}