import logger = require('vsts-task-lib');
import request = require('request');
import fs = require('fs');
import marathonconfig = require('./marathonconfig');
import MarathonConfig = marathonconfig.MarathonConfig;

export class MarathonApi {
    config: MarathonConfig;

    constructor(conf: MarathonConfig) {
        this.config = conf;
    }

    sendToMarathonAsync() {
        let marathonFullAppPath = this.config.baseUrl.concat("/v2/apps/", this.config.identifier)
        marathonFullAppPath = marathonFullAppPath.replace(/([^:]\/)\/+/g, "$1");
        logger.debug("marathonFullAppPath : " + marathonFullAppPath);

        let options: (request.UriOptions & request.CoreOptions) = {
            uri: marathonFullAppPath
        };
        if (this.config.useBasicAuthentication) {
            options.auth = {
                user: this.config.marathonUser,
                pass: this.config.marathonPassword
            };
        }
        return new Promise<string>((resolve, _) => request(options, 
            (error, response, body) => resolve(this.sendToMarathonCallBack(error, response, body))));
    }

    async sendToMarathonCallBack(error, response, body) {
        let deploymentId: string;        
        logger.debug("Identifier : " + this.config.identifier);
        // Error occured during request.
        if (error) {
            throw new Error("Request marathon error :".concat(error));
        }
        logger.debug(body);
        let jsonResponse = JSON.parse(body);

        switch (response.statusCode) {
            case 401:
            case 403:
                throw new Error("Request marathon permission error :".concat(jsonResponse.message));
            case 404:
                deploymentId = await this.createOrUpdateAppAsync(this.config.marathonFilePath);
                break;
            case 200:
                let nbInstances = jsonResponse.app.instances;
                if (nbInstances > 0) {
                    logger.debug("App ".concat(this.config.identifier, " already exists in Marathon, overriding its config and restarting it to force an image pull"))
                    deploymentId = await this.createOrUpdateAppAsync(this.config.marathonFilePath);
                } else {
                    var messageScaled =  "Application was previously scaled to 0. We won't override its config and won't restart it";
                    if(this.config.failOnScaledTo0){
                        throw new Error(messageScaled);
                    }
                    else{
                        logger.warning(messageScaled);
                    }
                }
        }

        return deploymentId;
    }

    createOrUpdateAppAsync(marathonFilePath: string) {
        logger._writeLine("createOrUpdateApp method. Put request with marathon json file.");
        logger._writeLine(fs.readFileSync(marathonFilePath).toString());
        let marathonFullAppPath = this.config.baseUrl.concat("/v2/apps/", this.config.identifier);
        marathonFullAppPath = marathonFullAppPath.replace(/([^:]\/)\/+/g, "$1");

        let options: request.UriOptions & request.CoreOptions = {
            uri: marathonFullAppPath,
            qs: { force: true }, //Query string data
            method: 'PUT',
            body: fs.createReadStream(marathonFilePath)
        };
        if (this.config.useBasicAuthentication) {
            options.auth = {
                user: this.config.marathonUser,
                pass: this.config.marathonPassword
            };
        }
                
        return new Promise<string>((resolve, _) => request(options,
            (error, response, body) => resolve(this.createOrUpdateAppCallBack(error, response, body))));
    }

    async createOrUpdateAppCallBack(error, response, body) {
        let deploymentId: string;

        // Error occured during request.
        if (error) {
            throw new Error("Request marathon deploy error :".concat(error));
        }
        logger.debug(body);
        let jsonResponse = JSON.parse(body);
        if (response.statusCode >= 200 && response.statusCode < 400) {
            // At this point the deployment was created successfully.
            deploymentId = jsonResponse.deploymentId;
            
            // Check if the deployment is in progress (if there is not a deployment, we force a restart to force a Docker image pull)
            if (!await this.isDeploymentLaunchedAsync(deploymentId)) {
                deploymentId = await this.restartAppAsync()
            }
        } else {
            throw new Error("Marathon deployment error :".concat(jsonResponse.message));
        }

        return deploymentId;
    }

    async isDeploymentLaunchedAsync(deploymentId: string) {
        logger._writeLine("Check if deployment launched for specific application");
        let deploymentUrl = this.config.baseUrl.concat("/v2/deployments");
        deploymentUrl = deploymentUrl.replace(/([^:]\/)\/+/g, "$1");

        let options: request.CoreOptions = {};
        if (this.config.useBasicAuthentication) {
            options.auth = {
                user: this.config.marathonUser,
                pass: this.config.marathonPassword
            };
        }

        return new Promise<boolean>((resolve, _) => request(deploymentUrl, options,
            (error, response, body) => resolve(this.isDeploymentLaunchedCallBack(deploymentId, error, response, body))));
    }

    async isDeploymentLaunchedCallBack(deploymentId, error, response, body) {
        let deploymentLaunched = false;
        // Error occured during request.
        if (error) {
            throw new Error("Request marathon error :".concat(error));
        }
        logger.debug(body);
        let jsonResponse = JSON.parse(body);
        let runningDeploymentMatcher = new RegExp(deploymentId).exec(body.trim());
        if (runningDeploymentMatcher) {
            deploymentLaunched = true;
        }

        return deploymentLaunched;
    }

    async restartAppAsync() {
        logger._writeLine("Restart Application");
        let restartUrl = this.config.baseUrl.concat("/v2/apps/", this.config.identifier , "/restart");
        restartUrl = restartUrl.replace(/([^:]\/)\/+/g, "$1");
        
        let options: request.UriOptions & request.CoreOptions = {
            uri: restartUrl,
            qs: { force: true }, //Query string data
            method: 'POST',
            headers: {
                'content-type': 'application/json'
            }
        };
        if (this.config.useBasicAuthentication) {
            options.auth = {
                user: this.config.marathonUser,
                pass: this.config.marathonPassword
            };
        }
        
        return new Promise<string>((resolve, _) => request(options,
            (error, response, body) => resolve(this.restartAppCallBack(error, response, body))));
    }

    restartAppCallBack(error, response, body) {
        let deploymentId: string;

        // Error occured during request.
        if (error) {
            throw new Error("Request marathon restart App error :".concat(error));
        }
        logger.debug(body);
        let jsonResponse = JSON.parse(body);
        if (response.statusCode == 200) {
            deploymentId = jsonResponse.deploymentId;
        } else {
            throw new Error("Marathon restart error :".concat(jsonResponse.message));
        }

        return deploymentId;
    }
}