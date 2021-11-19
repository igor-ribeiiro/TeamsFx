// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import fs from "fs-extra";
import path from "path";

import { ApimValidator } from "../../commonlib";

import {
  execAsync,
  execAsyncWithRetry,
  getSubscriptionId,
  getTestFolder,
  getUniqueAppName,
  setSimpleAuthSkuNameToB1,
  getConfigFileName,
  cleanUp,
  readContext,
  setSimpleAuthSkuNameToB1Bicep,
  readContextMultiEnv,
} from "../commonUtils";
import AzureLogin from "../../../src/commonlib/azureLogin";
import GraphLogin from "../../../src/commonlib/graphLogin";
import { environmentManager, isMultiEnvEnabled } from "@microsoft/teamsfx-core";

describe("Create a new API Management Service", function () {
  const testFolder = getTestFolder();
  const appName = getUniqueAppName();
  const subscriptionId = getSubscriptionId();
  const projectPath = path.resolve(testFolder, appName);

  it(`Import API into a new API Management Service`, async function () {
    // new a project
    let result = await execAsync(`teamsfx new --app-name ${appName} --interactive false`, {
      cwd: testFolder,
      env: process.env,
      timeout: 0,
    });
    console.log(`Create new project. Error message: ${result.stderr}`);

    if (isMultiEnvEnabled()) {
      await setSimpleAuthSkuNameToB1Bicep(projectPath, environmentManager.getDefaultEnvName());
    } else {
      await setSimpleAuthSkuNameToB1(projectPath);
    }

    await ApimValidator.init(subscriptionId, AzureLogin, GraphLogin);

    result = await execAsyncWithRetry(
      `teamsfx resource add azure-apim --subscription ${subscriptionId}`,
      {
        cwd: projectPath,
        env: process.env,
        timeout: 0,
      }
    );
    console.log(`Add APIM resource. Error message: ${result.stderr}`);

    result = await execAsyncWithRetry(`teamsfx provision`, {
      cwd: projectPath,
      env: process.env,
      timeout: 0,
    });
    console.log(`Provision. Error message: ${result.stderr}`);

    if (isMultiEnvEnabled()) {
      const provisionContext = await readContextMultiEnv(
        projectPath,
        environmentManager.getDefaultEnvName()
      );
      await ApimValidator.validateProvisionMultiEnv(provisionContext, appName);
    } else {
      const provisionContext = await readContext(projectPath);
      await ApimValidator.validateProvision(provisionContext, appName);
    }

    result = await execAsyncWithRetry(
      `teamsfx deploy apim --open-api-document openapi/openapi.json --api-prefix ${appName} --api-version v1`,
      {
        cwd: projectPath,
        env: process.env,
        timeout: 0,
      },
      3,
      `teamsfx deploy apim --open-api-document openapi/openapi.json --api-version v1`
    );
    console.log(`Deploy. Error message: ${result.stderr}`);

    if (isMultiEnvEnabled()) {
      const deployContext = await fs.readJSON(getConfigFileName(appName, true));
      await ApimValidator.validateDeployMultiEnv(deployContext, projectPath, appName, "v1");
    } else {
      const deployContext = await fs.readJSON(getConfigFileName(appName));
      await ApimValidator.validateDeployMultiEnv(deployContext, projectPath, appName, "v1");
    }
  });

  after(async () => {
    // clean up
    if (isMultiEnvEnabled()) {
      await cleanUp(appName, projectPath, true, false, true, true);
    } else {
      await cleanUp(appName, projectPath, true, false, true);
    }
  });
});
