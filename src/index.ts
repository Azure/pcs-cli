#!/usr/bin/env node

import * as chalk from 'chalk';
import * as fs from 'fs';
import * as inquirer from 'inquirer';
import * as msRestAzure from 'ms-rest-azure';

import { Answers, Question } from 'inquirer';
import { DeploymentManager, IDeploymentManager} from './deploymentmanager';
import { Questions, IQuestions } from './questions';
import { Command } from 'commander';

const packageJson = require('../package.json');

let solutionType: string = 'RemoteMonitoring';
let template = require('../templates/remoteMonitoring.json');
let parameters = require('../templates/remoteMonitoringParameters.json');

const program = new Command(packageJson.name)
    .version(packageJson.version, '-v, --version')
    .usage(`${chalk.green('<solutiontype>')} [options]`)
    .action((type)  => {
        if  (type) {
            solutionType = type;
            const solution = type + '.json';
            const params = type + 'Parameters.json';
            template = require('../templates/' + solution);
            parameters = require('../templates/' + params);
        }
    })
    .on('--help', () => {
        console.log(
            `    Default value for ${chalk.green('<solutiontype>')} is ${chalk.green('RemoteMonitoring')}.`
            );
        console.log();
        console.log(
            `    If you have any problems, do not hesitate to file an issue:`
            );
        console.log(
            `    ${chalk.cyan('https://github.com/azure/azure-remote-monitoring-cli/issues/new')}`
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
        const subs: string[] = [];
        const deploymentManager: IDeploymentManager = new DeploymentManager(authResponse, solutionType, template, parameters);

        const questions: IQuestions = new Questions();
        questions.addQuestions([
        {
            choices: subs,
            message: 'Select a subscription:',
            name: 'subscription',
            type: 'list',
        },
        {
            // TODO: List the locations based on selected subscription
            choices: ['East US', 'North Europe', 'East Asia', 'West US', 'West Europe', 'Southeast Asia', 
                     'Japan East', 'Japan West', 'Australia East', 'Australia Southeast'],
            message: 'Select a location',
            name: 'location',
            type: 'list',
        }]);

        inquirer.prompt(questions.value)
        .then((answers: Answers) => {
            return deploymentManager.submit(answers.solutionName, answers.subscription, answers.location);
        })
        .catch((error: Error) => {
            console.log('Prompt error: ' + error);
        });
    });
}
