import * as inquirer from 'inquirer';
import { Answers, Question } from 'inquirer';

export interface IQuestions {
    value: Question[];
    addQuestion(question: Question): void;
    addQuestions(questions: Question[]): void;
    insertQuestion(index: number, question: Question): void;
}

export class Questions implements Questions {
    /* User name requirements: https://docs.microsoft.com/en-us/azure/virtual-machines/windows/faq
                               #what-are-the-username-requirements-when-creating-a-vm
       Usernames can be a maximum of 20 characters in length and cannot end in a period ('.').
    */
    public static userNameRegex: RegExp = /^(.(?!\.$)){1,20}$/;
    public static notAllowedUserNames = [ 'administrator', 'admin', 'user', 'user1',
                                          'test', 'user2', 'test1', 'user3',
                                          'admin1', '1', '123', 'a',
                                          'actuser', 'adm', 'admin2', 'aspnet',
                                          'backup', 'console', 'david', 'guest',
                                          'john', 'owner', 'root', 'server', 'sql',
                                          'support', 'support_388945a0', 'sys',
                                          'test2', 'test3', 'user4', 'user5' ];
    /* Password requirements: https://docs.microsoft.com/en-us/azure/virtual-machines/windows/faq
                              #what-are-the-password-requirements-when-creating-a-vm
       Passwords must be 12 - 123 characters in length and meet 3 out of the following 4 complexity requirements:
       Have lower characters
       Have upper characters
       Have a digit
       Have a special character (Regex match [\W_])
    */
// tslint:disable
    public static passwordRegex: RegExp = /^((?=.*?[A-Z])(?=.*?[a-z])(?=.*?\d)|(?=.*?[A-Z])(?=.*?[a-z])(?=.*?[^a-zA-Z0-9])|(?=.*?[A-Z])(?=.*?\d)(?=.*?[^a-zA-Z0-9])|(?=.*?[a-z])(?=.*?\d)(?=.*?[^a-zA-Z0-9])).{6,72}$/;
// tslint:enable
    public static notAllowedPasswords = ['abc@123', 'P@$$w0rd', '@ssw0rd', 'P@ssword123', 'Pa$$word',
                                        'pass@word1', 'Password!', 'Password1', 'Password22', 'iloveyou!'];
    public solutionNameRegex: RegExp = /^[-\w\._\(\)]{1,64}[^\.]$/;
    public locations: string[] = ['East US', 'North Europe', 'East Asia', 'West US', 'West Europe', 'Southeast Asia',
                     'Japan East', 'Japan West', 'Australia East', 'Australia Southeast'];  

    private _questions: Question[] ;

    constructor() {
        this._questions = [{
            message: 'Enter a solution name:',
            name: 'solutionName',
            type: 'input',
            validate: (value: string) => {
                const pass: RegExpMatchArray | null = value.match(this.solutionNameRegex);
                if (pass) {
                    return true;
                }

                return 'Please enter a valid solution name.\n' +
                       'Valid characters for the name: alphanumeric (A-Z, a-z), underscore (_), parentheses, hyphen(-), and period (.) except at the end of the solution name.)';
            }
        },
        {
            // TODO: parvezp - Add availability check for the URL
            // Issue: https://github.com/Azure/pcs-cli/issues/81
            default: (answers: Answers): any => {
                return answers.solutionName;
            },
            message: 'Enter prefix for .azurewebsites.net:',
            name: 'azureWebsiteName',
            type: 'input'
        },
        {
            // TODO: List the locations based on selected subscription
            // Issue: https://github.com/Azure/pcs-cli/issues/82
            choices: this.locations,
            message: 'Select a location:',
            name: 'location',
            type: 'list',
        }
        ];
    }

    public get value(): Question[] {
        return this._questions;
    }

    public addQuestion(question: Question): void {
        this._questions.push(question);
    }

    public addQuestions(questions: Question[]): void {
        questions.forEach((question: Question) => {
            this.addQuestion(question);
        });
    }

    public insertQuestion(index: number, question: Question): void {
        this._questions.splice(index, 0, question);
    }
}

export default Questions;
