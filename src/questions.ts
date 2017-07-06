import * as inquirer from 'inquirer';
import { Answers, Question } from 'inquirer';

export interface IQuestions {
    value: Question[];
    addQuestion(question: Question): void;
    addQuestions(questions: Question[]): void;
    insertQuestion(index: number, question: Question): void;
}

export class Questions implements Questions {
    public solutionNameRegex: RegExp = /^[a-z0-9]{1,17}$/;

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

                return 'Please enter a valid solution name';
            },
        },
        {
            // TODO: List the locations based on selected subscription
            choices: this.locations,
            message: 'Select a location',
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