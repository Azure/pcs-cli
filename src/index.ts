#!/usr/bin/env node

import * as fs from 'fs';
import * as ResourceManagement from 'azure-arm-resource';
import * as msRest from "ms-rest";
import * as msRestAzure from "ms-rest-azure";
import { TableService, BlobService } from "@types/azure";
import * as inquirer from "inquirer";
import { Questions, Question, Answers } from 'inquirer';
import { Command } from 'commander';
import * as chalk from 'chalk';
import DeployUI from './deployUI'
var packageJson = require('../package.json');

type ResourceGroup = ResourceManagement.ResourceModels.ResourceGroup;
type Deployment = ResourceManagement.ResourceModels.Deployment;
type DeploymentProperties = ResourceManagement.ResourceModels.DeploymentProperties;
type DeviceTokenCredentials = msRestAzure.DeviceTokenCredentials;

const solutionNameRegex:RegExp = /^[a-z0-9]{1,17}$/;
const userNameRegex:RegExp = /^[a-zA-Z_][a-zA-Z0-9_@$#]{0,127}$/;
const passwordRegex:RegExp = /^(?!.*')((?=.*[a-z])(?=.*[0-9])(?=.*\W)|(?=.*[A-Z])(?=.*[0-9])(?=.*\W)|(?=.*[A-Z])(?=.*[a-z])(?=.*\W)|(?=.*[A-Z])(?=.*[a-z])(?=.*[0-9])|(?=.*[A-Z])(?=.*[a-z])(?=.*[0-9])(?=.*\W)).{8,128}$/;

const program = new Command(packageJson.name)
    .version(packageJson.version)
    .usage(`${chalk.green('<login>')} [options]`)
    .parse(process.argv);

var questions:Question[] = [
    {
        type: 'input',
        message: 'Enter a solution name:',
        name: 'solutionName',
        validate: function(value:string) {
            let pass:RegExpMatchArray | null = value.match(solutionNameRegex);
            if(pass){
                return true;
            }

            return "Please enter a valid solution name";
        }
    },
    {
        type: 'input',
        message: 'Enter a sql server username:',
        name: 'userName',
        validate: function(value:string) {
            let pass:RegExpMatchArray | null = value.match(userNameRegex);
            if(pass){
                return true;
            }

            return "Please enter a valid user name";
        }
    },
    {
        type: 'password',
        message: 'Enter a password:',
        name: 'sqlPassword',
        validate: function(value:string) {
            let pass:RegExpMatchArray | null = value.match(passwordRegex);
            if(pass){
                return true;
            }

            return "Please enter a valid password";
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
        type: 'input',
        message: 'Enter a template file path:',
        name: 'templateFilePath'
    },
    {
        type: 'input',
        message: 'Enter a parameter file path:',
        name: 'parametersFilePath'
    }];


function validate(value:string, exp:RegExp){
    return value.match(exp);
}

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
        let subs:string[] = [];
        var creds:any = authResponse.credentials;
        creds.tokenCache;
        authResponse.subscriptions.map((subscription: msRestAzure.LinkedSubscription) => {
            subs.push(subscription.name);
        });
        questions.push({
            type: 'list',
            message: 'Select a subscription:',
            name: 'subscriptionsList',
            choices: subs
        },
        {
            // TODO: List the locations based on selected subscription
            type: 'list',
            message: "Select a location",
            name: 'location',
            choices: ['westus', 'eastus']
        });

        inquirer.prompt(questions).then((answers: Answers) => {            
            let selectedSubscription: msRestAzure.LinkedSubscription[]  = authResponse.subscriptions.filter( (subs: msRestAzure.LinkedSubscription) => {
                if(subs.name == answers['subscriptionsList']) {
                    return subs.id;
                }
            });
            let client = new ResourceManagement.ResourceManagementClient(authResponse.credentials, selectedSubscription[0].id);
            let resourceGroup: ResourceGroup = {
                name: answers['name'],
                location: answers['location'],
                tags: { 'pcs': 'Pre-configured solution' }
            }

            let template:any;
            let templateParameters:any
            try 
            {
                let filePath:string = answers['templateFilePath'];
                let buffer:Buffer = fs.readFileSync(filePath);
                template = JSON.parse(buffer.toString());
                templateParameters = JSON.parse(fs.readFileSync(answers['parametersFilePath']).toString());
                templateParameters.sqlAdministratorLogin.value = answers['userName'];
                templateParameters.sqlAdministratorLoginPassword.value = answers['sqlPassword'];
            } catch (error) {
                console.log(error);
            }

            let properties: DeploymentProperties = {
                template: template,
                parameters: templateParameters,
                mode: 'Incremental'
            };
            let deployment: Deployment = {
                properties: properties
            }
            let deployUI = new DeployUI();
            client.resourceGroups.createOrUpdate(answers['solutionName'], resourceGroup).then((resourceGroup: ResourceGroup) => {
                deployUI.start();
                return client.deployments.createOrUpdate(resourceGroup.name as string, answers['solutionName'] + '-deployment', deployment).then(() => {
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