export class Validator {
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
    public static passwordRegex: RegExp = /^((?=.*?[A-Z])(?=.*?[a-z])(?=.*?\d)|(?=.*?[A-Z])(?=.*?[a-z])(?=.*?[^a-zA-Z0-9])|(?=.*?[A-Z])(?=.*?\d)(?=.*?[^a-zA-Z0-9])|(?=.*?[a-z])(?=.*?\d)(?=.*?[^a-zA-Z0-9])).{12,72}$/;
    // tslint:enable
    public static notAllowedPasswords = ['abc@123', 'P@$$w0rd', '@ssw0rd', 'P@ssword123', 'Pa$$word',
                                        'pass@word1', 'Password!', 'Password1', 'Password22', 'iloveyou!'];
    public static solutionNameRegex: RegExp = /^[-\a-zA-Z0-9\._\(\)]{1,64}[^\.]$/;
    public static websiteHostNameRegex: RegExp = /^[-\a-zA-Z0-9]{1,60}$/;

    public static invalidUsernameMessage = 'Usernames can be a maximum of 20 characters in length and cannot end in a period (\'.\')';
    public static invalidPasswordMessage = 'The supplied password must be between 12-72 characters long and must satisfy at least ' +
    '3 of password complexity requirements from the following: 1) Contains an uppercase character\n2) ' + 
    'Contains a lowercase character\n3) Contains a numeric digit\n4) Contains a special character\n5) Control characters are not allowed';
    public static invalidSolutionNameMessage = 'solutionName parameter has invalid value. Please enter a valid solution name.\n' +
    'Valid characters are: ' +
    'alphanumeric (A-Z, a-z, 0-9), ' +
    'underscore (_), parentheses, ' +
    'hyphen(-), ' +
    'and period (.) except at the end of the solution name.';

    public static validateSolutionName(solutionName: any) {
        return Validator.solutionNameRegex.test(solutionName);
    }

    public static validateUsername(username: string) {
        return Validator.userNameRegex.test(username) && Validator.notAllowedUserNames.indexOf(username) === -1;
    }

    public static validatePassword(password: string) {
        return Validator.passwordRegex.test(password) && Validator.notAllowedPasswords.indexOf(password) === -1;
    }
}

export default Validator;
