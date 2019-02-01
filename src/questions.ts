import { Answers, Question } from 'inquirer';

export interface IQuestions {
    value: any[];
    addQuestion(question: any): void;
    addQuestions(questions: any[]): void;
    insertQuestion(index: number, question: any): void;
}

export class Questions implements IQuestions {
    private _questions: Question[] = [];
    
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
