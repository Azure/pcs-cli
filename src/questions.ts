import { Answers, Question } from 'inquirer';

export interface IQuestions {
    value: Question[];
    addQuestion(question: Question): void;
    addQuestions(questions: Question[]): void;
}

export class Questions implements Questions {
    public solutionNameRegex: RegExp = /^[a-z0-9]{1,17}$/;

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
        }];
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
}

export default Questions;