#!/usr/bin/env node

import * as ResourceManagement from 'azure-arm-resource';
import * as chalk from 'chalk';
import * as fs from 'fs';
import * as inquirer from 'inquirer';
import * as msRest from 'ms-rest';
import * as msRestAzure from 'ms-rest-azure';

import { Answers, Question, Questions } from 'inquirer';
import { BlobService, TableService } from 'azure';

import { Command } from 'commander';
import DeployUI from './deployUI';

const packageJson = require('../package.json');

type ResourceGroup = ResourceManagement.ResourceModels.ResourceGroup;
type Deployment = ResourceManagement.ResourceModels.Deployment;
type DeploymentProperties = ResourceManagement.ResourceModels.DeploymentProperties;
type DeviceTokenCredentials = msRestAzure.DeviceTokenCredentials;

const solutionNameRegex: RegExp = /^[a-z0-9]{1,17}$/;
const userNameRegex: RegExp = /^[a-zA-Z_][a-zA-Z0-9_@$#]{0,127}$/;

/* tslint:disable */
const passwordRegex: RegExp = /^(?!.*')((?=.*[a-z])(?=.*[0-9])(?=.*\W)|(?=.*[A-Z])(?=.*[0-9])(?=.*\W)|(?=.*[A-Z])(?=.*[a-z])(?=.*\W)|(?=.*[A-Z])(?=.*[a-z])(?=.*[0-9])|(?=.*[A-Z])(?=.*[a-z])(?=.*[0-9])(?=.*\W)).{8,128}$/;
/* tslint:enable */

const program = new Command(packageJson.name)
    .version(packageJson.version)
    .usage(`${chalk.green('<login>')} [options]`)
    .parse(process.argv);

const questions: Question[] = [
    {
        message: 'Enter a solution name:',
        name: 'solutionName',
        type: 'input',
        validate: (value: string) => {
            const pass: RegExpMatchArray | null = value.match(solutionNameRegex);
            if (pass) {
                return true;
            }

            return 'Please enter a valid solution name';
        },
    },
    {
        message: 'Enter a sql server username:',
        name: 'userName',
        type: 'input',
        validate: (value: string) => {
            const pass: RegExpMatchArray | null = value.match(userNameRegex);
            if (pass) {
                return true;
            }

            return 'Please enter a valid user name';
        },
    },
    {
        message: 'Enter a password:',
        name: 'sqlPassword',
        type: 'password',
        validate: (value: string) => {
            const pass: RegExpMatchArray | null = value.match(passwordRegex);
            if (pass) {
                return true;
            }

            return 'Please enter a valid user name';
        },
        // ,
        // TODO:
        // Currently the mask option is not available in the inquirer types.
        // I have submitted a PR and once it is release we can enable mask
        // https://github.com/DefinitelyTyped/DefinitelyTyped/pull/17094#issuecomment-307501936
        // mask: '*'
        //
    },
    {
        message: 'Enter a template file path:',
        name: 'templateFilePath',
        type: 'input',
    },
    {
        message: 'Enter a parameter file path:',
        name: 'parametersFilePath',
        type: 'input',
    }];

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

        authResponse.subscriptions.map((subscription: msRestAzure.LinkedSubscription) => {
            subs.push(subscription.name);
        });
        questions.push(
        {
            choices: subs,
            message: 'Select a subscription:',
            name: 'subscriptionsList',
            type: 'list',
        },
        {
            // TODO: List the locations based on selected subscription
            choices: ['westus', 'eastus'],
            message: 'Select a location',
            name: 'location',
            type: 'list',
        });

        inquirer.prompt(questions).then((answers: Answers) => {
            const selectedSubscription: msRestAzure.LinkedSubscription[] =
                authResponse.subscriptions.filter((linkedSubs: msRestAzure.LinkedSubscription) => {
                    if (linkedSubs.name === answers.subscriptionsList) {
                        return linkedSubs.id;
                    }
                });
            const client = new ResourceManagement
                .ResourceManagementClient(authResponse.credentials, selectedSubscription[0].id);
            const resourceGroup: ResourceGroup = {
                location: answers.location,
                name: answers.name,
                tags: { pcs: 'Pre-configured solution' },
            };

            let template: any;
            let parameters: any;

            try {
                const filePath: string = answers.templateFilePath;
                const buffer: Buffer = fs.readFileSync(filePath);
                template = JSON.parse(buffer.toString());
                parameters = JSON.parse(fs.readFileSync(answers.parametersFilePath).toString());
                parameters.sqlAdministratorLogin.value = answers.userName;
                parameters.sqlAdministratorLoginPassword.value = answers.sqlPassword;
            } catch (error) {
                console.log(error);
            }

            const properties: DeploymentProperties = {
                mode: 'Incremental',
                parameters,
                template,
            };
            const deployment: Deployment = { properties };
            const deployUI = new DeployUI();
            client.resourceGroups.createOrUpdate(answers.solutionName, resourceGroup)
                .then((result: ResourceGroup) => {
                    deployUI.start();
                    return client.deployments
                    .createOrUpdate(result.name as string, answers.solutionName + '-deployment', deployment)
                    .then(() => {
                        deployUI.stop();
                        process.exit();
                    });
                }).catch((err: Error) => {
                    deployUI.stop(err);
                    process.exit();
                });
        });
    });
}
