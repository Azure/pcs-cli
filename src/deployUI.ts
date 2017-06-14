import * as inquirer from "inquirer";

class DeployUI {
    private deploying = 'Deploying...'
    private deployed = 'Deployed successfully'
    private loader = [
        '/ ' + this.deploying,
        '| ' + this.deploying,
        '\\ ' + this.deploying,
        '- ' + this.deploying
        ];

    private i = 4;
    private ui = new inquirer.ui.BottomBar();

    private id: NodeJS.Timer;
    
    start(): void {
        let _this = this
        this.id = setInterval(function () {
            _this.ui.updateBottomBar(_this.loader[_this.i++ % 4]);
        }, 200);
    }

    stop(err?: Error): void {
        clearInterval(this.id);
        let message = this.deployed;
        if(err){
            message = 'Deployment failed ' + err;
        }

        this.ui.updateBottomBar(message);
    }
}

export default DeployUI;