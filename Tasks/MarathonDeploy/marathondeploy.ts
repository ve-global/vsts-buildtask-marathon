import fs = require('fs');
import tl = require('vsts-task-lib');
import marathonconfig = require('./marathonconfig');
import MarathonConfig = marathonconfig.MarathonConfig;
import marathonapi = require('./marathonapi');
import MarathonApi = marathonapi.MarathonApi;

class Main {
    marathonApi: MarathonApi;

    async run() {        
        try {
            let config = this.initializeMarathonConfig();

            // will error and fail task if it doesn't exist
            tl.checkPath(config.marathonFilePath, 'jsonFilePath');

            tl._writeLine("marathon.json file path: ".concat(config.marathonFilePath));

            // if identifier not passed in parameter, read it from marathon.json
            if (!config.identifier) {
                let marathonJsonContent = fs.readFileSync(config.marathonFilePath);
                let marathonJson = JSON.parse(marathonJsonContent.toString());
                config.identifier = marathonJson.id;
            }

            // identifier not found , throw exception
            if (!config.identifier)
                throw new Error("Application id not found.");

            this.marathonApi = new MarathonApi(config);
            const deploymentId = await this.marathonApi.sendToMarathonAsync();

            this.waitUntilDeploymentFinishes(deploymentId);
            
            tl.setResult(tl.TaskResult.Succeeded, "Deployment Succeeded.");
        }
        catch (err) {
            let msg = err;
            if (err.message) {
                msg = err.message;
            }
            tl.setResult(tl.TaskResult.Failed, msg);
        }
    }

    initializeMarathonConfig(): MarathonConfig {
        let config = new MarathonConfig();
        let marathonEndpoint = tl.getInput('marathonEndpoint', true);
        config.baseUrl = tl.getEndpointUrl(marathonEndpoint, false);
        config.marathonUser = tl.getEndpointAuthorizationParameter(marathonEndpoint, "username", true);
        config.marathonPassword = tl.getEndpointAuthorizationParameter(marathonEndpoint, "password", true);
        config.useBasicAuthentication = false;
        if (config.marathonUser != null || config.marathonPassword != null) {
            config.useBasicAuthentication = true;
            if (config.marathonUser == null) {
                // PAT is set into password var
                config.marathonUser = "";
            }

            config.identifier = tl.getInput('identifier', false);
            config.marathonFilePath = tl.getPathInput('jsonFilePath', false);
            config.failOnScaledTo0 = tl.getBoolInput('failOnScaledTo0', false);
            config.showDeploymentProgress = tl.getBoolInput('showDeploymentProgress', false);
            return config;
        }
    }

    waitUntilDeploymentFinishes(deploymentId: string) {
        let deploymentInProgress = true;
        tl._writeLine("Deployment in progress: ".concat(deploymentId));
        let intervalID = setInterval(async ()=>{ deploymentInProgress = await this.marathonApi.isDeploymentLaunchedAsync(deploymentId) }, 500);

        try {
            while (deploymentInProgress) {
                // Waiting deployment...
            }
        }
        catch (err) {
        }

        tl._writeLine("Deployment finished: ".concat(deploymentId));
        clearTimeout(intervalID);                        
    }
}   

new Main().run();
