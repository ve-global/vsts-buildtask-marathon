import fs = require('fs');
import tl = require('vsts-task-lib');
import marathonconfig = require('./marathonconfig');
import MarathonConfig = marathonconfig.MarathonConfig;
import marathonapi = require('./marathonapi');
import MarathonApi = marathonapi.MarathonApi;
import { setInterval } from 'timers';

class Main {
  marathonApi: MarathonApi;

  async run() {
    try {
      let config = this.initializeMarathonConfig();

      // will error and fail task if it doesn't exist
      tl.checkPath(config.marathonFilePath, 'jsonFilePath');

      tl._writeLine(
        'marathon.json file path: '.concat(config.marathonFilePath)
      );

      // if identifier not passed in parameter, read it from marathon.json
      if (!config.identifier) {
        let marathonJsonContent = fs.readFileSync(config.marathonFilePath);
        let marathonJson = JSON.parse(marathonJsonContent.toString());
        config.identifier = marathonJson.id;
      }

      // identifier not found , throw exception
      if (!config.identifier) throw new Error('Application id not found.');

      this.marathonApi = new MarathonApi(config);
      tl._writeLine(' ++ RUN ++');
      const deploymentId = await this.marathonApi.sendToMarathonAsync();
      tl._writeLine(' ++ sendToMarathonAsync PASSED  ++');
      await this.waitUntilDeploymentFinishes(deploymentId);
      tl._writeLine(' ++ waitUntilDeploymentFinishes PASSED  ++');

      tl.setResult(tl.TaskResult.Succeeded, 'Deployment Succeeded.');
    } catch (err) {
      let msg = err;
      if (err.message) {
        msg = err.message;
      }
      tl.setResult(tl.TaskResult.Failed, msg);
    }
  }

  initializeMarathonConfig(): MarathonConfig {
    return {
      ...new MarathonConfig(),
      baseUrl: 'http://v-ci-mess-ms-01.ve-ci.com:8080/', //tl.getEndpointUrl(marathonEndpoint, false),
      marathonUser: 'fakeUser', //tl.getEndpointAuthorizationParameter(marathonEndpoint, "username", true),
      marathonPassword: 'fakePass', //tl.getEndpointAuthorizationParameter(marathonEndpoint, "password", true),
      useBasicAuthentication: false,

      identifier: 'verome/ve.rome.baseapi.service', // tl.getInput('identifier', false),
      marathonFilePath: 'Tasks/MarathonDeploy/marathon.json', //tl.getPathInput('jsonFilePath', false),
      failOnScaledTo0: false, //tl.getBoolInput('failOnScaledTo0', false),
      showDeploymentProgress: true //tl.getBoolInput(
    };
    // }
  }

  async waitUntilDeploymentFinishes(deploymentId: string){
    let deploymentInProgress = true;
    tl._writeLine('Deployment in progress: '.concat(deploymentId));
    deploymentInProgress = await this.marathonApi.isDeploymentLaunchedAsync(
      deploymentId
    );
    if(!deploymentInProgress){
      tl._writeLine('Deployment finished: '.concat(deploymentId));      
    } else {
      setTimeout(()=>{
        this.waitUntilDeploymentFinishes(deploymentId);
      },5000);
    }
  }
  

  async waitUntilDeploymentFinishes_2(deploymentId: string) {
    let deploymentInProgress = true;
    tl._writeLine('Deployment in progress: '.concat(deploymentId));
    // var promise = new Promise<string>(function(resolve) {
    //   setTimeout(function() {
    //     resolve("fakeId");
    //   }, 3000);
    // });    
    // var p = new Promise<boolean>(resolve => {
    //   setTimeout(() => {
    //     resolve(true);
    //   }, 3000);
    // });
    // return p;
    // let intervalID = setInterval(async () => {
    //   deploymentInProgress = await this.marathonApi.isDeploymentLaunchedAsync(
    //     deploymentId
    //   );
    // }, 500);

    try {
      while (deploymentInProgress) {
        // //BRUTE FORCE
        // deploymentInProgress = await this.marathonApi.isDeploymentLaunchedAsync(
        //   deploymentId
        // );
      }
    } catch (err) {}

    tl._writeLine('Deployment finished: '.concat(deploymentId));
    // clearTimeout(intervalID);
  }
}

new Main().run();
