import logger = require('vsts-task-lib');
import request = require('request');
import fs = require('fs');
import marathonconfig = require('./marathonconfig');
import MarathonConfig = marathonconfig.MarathonConfig;

export class MarathonApi {
    config: MarathonConfig;
    deploymentLaunched: boolean;
    deploymentId: string;

    constructor(conf: MarathonConfig) {
        this.config = conf;
    }

    sendToMarathon() {
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
        request(options, this.sendToMarathonCallBack.bind(this))

        return this.deploymentId;
    }

    sendToMarathonCallBack(error, response, body) {
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
                this.deploymentId = this.createOrUpdateApp(this.config.marathonFilePath);
                break;
            case 200:
                let nbInstances = jsonResponse.app.instances;
                if (nbInstances > 0) {
                    logger.debug("App ".concat(this.config.identifier, " already exists in Marathon, overriding its config and restarting it to force an image pull"))
                    this.deploymentId = this.createOrUpdateApp(this.config.marathonFilePath);
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
    }

    createOrUpdateApp(marathonFilePath: string) {
        logger._writeLine("createOrUpdateApp method. Put request with marathon json file.");
        logger._writeLine(fs.readFileSync(marathonFilePath).toString());
        let marathonFullAppPath = this.config.baseUrl.concat("/v2/apps/", this.config.identifier);
        marathonFullAppPath = marathonFullAppPath.replace(/([^:]\/)\/+/g, "$1");
        let options: (request.UriOptions & request.CoreOptions) = {
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
        request(options, this.createOrUpdateAppCallBack.bind(this));

        return this.deploymentId;
    }

    createOrUpdateAppCallBack(error, response, body) {
        // Error occured during request.
        if (error) {
            throw new Error("Request marathon deploy error :".concat(error));
        }
        logger.debug(body);
        let jsonResponse = JSON.parse(body);
        if (response.statusCode >= 200 && response.statusCode < 400) {
            // At this point the deployment was created successfully.
            this.deploymentId = jsonResponse.deploymentId;
            
            // Check if the deployment is in progress (if there is not a deployment, we force a restart to force a Docker image pull)
            if (!this.isDeploymentLaunched(this.deploymentId)) {
                this.restartApp()
            }
        } else {
            throw new Error("Marathon deployment error :".concat(jsonResponse.message));
        }
    }

    isDeploymentLaunched(deploymentId: string) {
        this.deploymentLaunched = false;
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
        request(deploymentUrl, options, this.isDeploymentLaunchedCallBack.bind(deploymentId, this))

        return this.deploymentLaunched;
    }

    isDeploymentLaunchedCallBack(deploymentId, error, response, body) {
            // Error occured during request.
            if (error) {
                throw new Error("Request marathon error :".concat(error));
            }
            logger.debug(body);
            let jsonResponse = JSON.parse(body);
            let runningDeploymentMatcher = new RegExp(deploymentId).exec(body.trim());
            if (runningDeploymentMatcher) {
                this.deploymentLaunched = true;
            }
        }

    restartApp() {
        logger._writeLine("Restart Application");
        let restartUrl = this.config.baseUrl.concat("/v2/apps/", this.config.identifier , "/restart");
        restartUrl = restartUrl.replace(/([^:]\/)\/+/g, "$1");
        let options: (request.UriOptions & request.CoreOptions) = {
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
        request(options, this.restartAppCallBack.bind(this))

        return this.deploymentId;
    }

    restartAppCallBack(error, response, body) {
        // Error occured during request.
        if (error) {
            throw new Error("Request marathon restart App error :".concat(error));
        }
        logger.debug(body);
        let jsonResponse = JSON.parse(body);
        if (response.statusCode == 200) {
            this.deploymentId = jsonResponse.deploymentId;
        } else
            throw new Error("Marathon restart error :".concat(jsonResponse.message));
        }
    }
}