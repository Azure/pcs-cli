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

   public static validateSolutionName(solutionName: any) {
       const isValid = Validator.solutionNameRegex.test(solutionName);
       if (!isValid) {
           console.log('solutionName parameter has invalid value. Please enter a valid solution name.\n' +
           'Valid characters are: ' +
           'alphanumeric (A-Z, a-z, 0-9), ' +
           'underscore (_), parentheses, ' +
           'hyphen(-), ' +
           'and period (.) except at the end of the solution name.');
       }
       return isValid;
   }
}

export default Validator;
