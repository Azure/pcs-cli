#!/usr/bin/env node

import * as chalk from 'chalk';
import * as inquirer from 'inquirer';
import * as msRestAzure from 'ms-rest-azure';

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
const invalidPasswordMessage = 'Passwords must be 12 - 123 characters in length and meet 3 out of the following 4 complexity requirements:\nHave lower characters\nHave upper characters\nHave a digit\nHave a special character';
/* tslint:enable */

const gitHubUrl: string = 'https://github.com/Azure/pcs-cli#azure-iot-pcs-cli';
const gitHubIssuesUrl: string = 'https://github.com/azure/azure-remote-monitoring-cli/issues/new';

const program = new Command(packageJson.name)
    .version(packageJson.version, '-v, --version')
    .usage('[options]')
    .option('-t, --type <type>', 'Soltuion Type', /^(remotemonitoring|test)$/i, 'remotemonitoring')
    .option('-s, --sku <sku>', 'SKU Type', /^(basic|enterprise|test)$/i, 'basic')
    .on('--help', () => {
        console.log(
            `    Default value for ${chalk.green('-t, --type')} is ${chalk.green('remotemonitoring')}.`
            );
        console.log(
            `    Default value for ${chalk.green('-s, --sku')} is ${chalk.green('basic')}.`
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

main();

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
    msRestAzure.interactiveLoginWithAuthResponse().then((authResponse: msRestAzure.AuthResponse) => {
        solutionType = program.type;
        let templateNamePrefix = solutionType;
        let solution = templateNamePrefix + '.json';
        let params = templateNamePrefix + 'Parameters.json';

        const subs: inquirer.ChoiceType[] = [];
        authResponse.subscriptions.map((subscription: msRestAzure.LinkedSubscription) => {
            if (subscription.state === 'Enabled') {
                subs.push({name: subscription.name, value: subscription.id});
            }
        });

        if (!subs || !subs.length) {
            console.log('Could not find any subscriptions in this account. /n \
            Please login with an account that has at least one active subscription');
        } else {
            const questions: IQuestions = new Questions();
            questions.insertQuestion(1, {
                choices: subs,
                message: 'Select a subscription:',
                name: 'subscriptionId',
                type: 'list',
            });

            console.log(program.sku);
            console.log(solutionSku[solutionSku.basic]);
            if (program.sku === solutionSku[solutionSku.basic]) {
                // Setting the ARM template that is meant to do demo deployment
                templateNamePrefix += 'WithSingleVM';
                solution = templateNamePrefix + '.json';
                params = templateNamePrefix + 'Parameters.json';

                questions.addQuestion({
                    message: 'Enter a user name for the Virtual Machine',
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

            try {
                template = require('../' + solutionType + '/templates/' + solution);
                parameters = require('../' + solutionType + '/templates/' + params);
            } catch (ex) {
                console.log('Could not find template or parameters file, Exception:', ex);
                return;
            }

            const deploymentManager: IDeploymentManager = new DeploymentManager(authResponse, solutionType, template, parameters);
            inquirer.prompt(questions.value)
            .then((answers: Answers) => {
                return deploymentManager.submit(answers);
            })
            .catch((error: Error) => {
                console.log('Prompt error: ' + error);
            });
        }
    });
}