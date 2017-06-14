import * as inquirer from 'inquirer';

class DeployUI {
    private deploying = 'Deploying...';
    private deployed = 'Deployed successfully';
    private loader = [
        '/ ' + this.deploying,
        '| ' + this.deploying,
        '\\ ' + this.deploying,
        '- ' + this.deploying,
        ];

    private i = 4;
    private ui = new inquirer.ui.BottomBar();

    private timer: NodeJS.Timer;

    public start(): void {
        this.timer = setInterval(
            () => {
                this.ui.updateBottomBar(this.loader[this.i++ % 4]);
            }, 
            200);
    }

    public stop(err?: Error): void {
        clearInterval(this.timer);
        let message = this.deployed;
        if (err) {
            message = 'Deployment failed ' + err;
        }

        this.ui.updateBottomBar(message);
    }
}

export default DeployUI;
