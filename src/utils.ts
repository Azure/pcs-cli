import * as uuid from 'uuid';

function genPassword(): string {
    // Using GUID since it is alphanumeric combination separated by special character '-'
    // This satisfies the complexity and length requirement
    return uuid.v1();
}

export { genPassword };