// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import axios from "axios";
import * as chai from "chai";
import glob from "glob";
import path from "path";
import MockAzureAccountProvider from "../../src/commonlib/azureLoginUserPassword";

const baseUrlAppSettings = (subscriptionId: string, rg: string, name: string) =>
  `https://management.azure.com/subscriptions/${subscriptionId}/resourceGroups/${rg}/providers/Microsoft.Web/sites/${name}/config/appsettings/list?api-version=2019-08-01`;
const baseUrlPlan = (subscriptionId: string, rg: string, name: string) =>
  `https://management.azure.com/subscriptions/${subscriptionId}/resourceGroups/${rg}/providers/Microsoft.Web/serverfarms/${name}?api-version=2019-08-01`;
const baseUrlListDeployments = (subscriptionId: string, rg: string, name: string) =>
  `https://management.azure.com/subscriptions/${subscriptionId}/resourceGroups/${rg}/providers/Microsoft.Web/sites/${name}/deployments?api-version=2019-08-01`;
const baseUrlListDeploymentLogs = (subscriptionId: string, rg: string, name: string, id: string) =>
  `https://management.azure.com/subscriptions/${subscriptionId}/resourceGroups/${rg}/providers/Microsoft.Web/sites/${name}/deployments/${id}/log?api-version=2019-08-01`;

enum BaseConfig {
  M365_CLIENT_ID = "M365_CLIENT_ID",
  M365_CLIENT_SECRET = "M365_CLIENT_SECRET",
  M365_AUTHORITY_HOST = "M365_AUTHORITY_HOST",
  M365_TENANT_ID = "M365_TENANT_ID",
  ALLOWED_APP_IDS = "ALLOWED_APP_IDS",
  API_ENDPOINT = "API_ENDPOINT",
  M365_APPLICATION_ID_URI = "M365_APPLICATION_ID_URI",
}

enum SQLConfig {
  IDENTITY_ID = "IDENTITY_ID",
  SQL_DATABASE_NAME = "SQL_DATABASE_NAME",
  SQL_ENDPOINT = "SQL_ENDPOINT",
}

class DependentPluginInfo {
  public static readonly functionPluginName = "fx-resource-function";
  public static readonly apiEndpoint = "functionEndpoint";

  public static readonly solutionPluginName = "solution";
  public static readonly resourceGroupName: string = "resourceGroupName";
  public static readonly subscriptionId: string = "subscriptionId";
  public static readonly resourceNameSuffix: string = "resourceNameSuffix";
  public static readonly location: string = "location";
  public static readonly programmingLanguage: string = "programmingLanguage";

  public static readonly aadPluginName: string = "fx-resource-aad-app-for-teams";
  public static readonly aadClientId: string = "clientId";
  public static readonly aadClientSecret: string = "clientSecret";
  public static readonly oauthHost: string = "oauthHost";
  public static readonly teamsAppTenantId: string = "teamsAppTenantId";
  public static readonly applicationIdUris: string = "applicationIdUris";

  public static readonly sqlPluginName: string = "fx-resource-azure-sql";
  public static readonly databaseName: string = "databaseName";
  public static readonly sqlEndpoint: string = "sqlEndpoint";

  public static readonly identityPluginName: string = "fx-resource-identity";
  public static readonly identityId: string = "identityId";
  public static readonly identityName: string = "identityName";

  public static readonly frontendPluginName: string = "fx-resource-frontend-hosting";
  public static readonly frontendEndpoint: string = "endpoint";
  public static readonly frontendDomain: string = "domain";

  public static readonly apimPluginName: string = "fx-resource-apim";
  public static readonly apimAppId: string = "apimClientAADClientId";
}

interface IFunctionObject {
  functionAppName: string;
  appServicePlanName: string;
  expectValues: Map<string, string>;
}

export class FunctionValidator {
  private static subscriptionId: string;
  private static rg: string;

  public static init(ctx: any): IFunctionObject {
    console.log("Start to init validator for Function.");

    const functionObject = ctx[DependentPluginInfo.functionPluginName] as IFunctionObject;
    chai.assert.exists(functionObject);

    this.subscriptionId =
      ctx[DependentPluginInfo.solutionPluginName][DependentPluginInfo.subscriptionId];
    chai.assert.exists(this.subscriptionId);

    this.rg = ctx[DependentPluginInfo.solutionPluginName][DependentPluginInfo.resourceGroupName];
    chai.assert.exists(this.rg);

    const expectValues = new Map<string, string>([]);
    expectValues.set(
      BaseConfig.API_ENDPOINT,
      ctx[DependentPluginInfo.functionPluginName][DependentPluginInfo.apiEndpoint] as string
    );
    expectValues.set(
      SQLConfig.SQL_ENDPOINT,
      ctx[DependentPluginInfo.sqlPluginName]?.[DependentPluginInfo.sqlEndpoint] as string
    );
    functionObject.expectValues = expectValues;

    console.log("Successfully init validator for Function.");
    return functionObject;
  }

  public static async validateScaffold(
    projectPath: string,
    programmingLanguage: string
  ): Promise<void> {
    const indexFile: { [key: string]: string } = {
      typescript: "index.ts",
      javascript: "index.js",
    };
    glob(
      `**/${indexFile[programmingLanguage]}`,
      { cwd: path.resolve(projectPath, "api") },
      (err, files) => {
        chai.assert.isAtLeast(files.length, 1);
      }
    );
  }

  public static async validateProvision(
    functionObject: IFunctionObject,
    sqlEnabled = true
  ): Promise<void> {
    console.log("Start to validate Function Provision.");

    const tokenProvider = MockAzureAccountProvider;
    const tokenCredential = await tokenProvider.getAccountCredentialAsync();
    const token = (await tokenCredential?.getToken())?.accessToken;

    enum BaseConfig {
      M365_CLIENT_ID = "M365_CLIENT_ID",
      M365_CLIENT_SECRET = "M365_CLIENT_SECRET",
      M365_AUTHORITY_HOST = "M365_AUTHORITY_HOST",
      M365_TENANT_ID = "M365_TENANT_ID",
      ALLOWED_APP_IDS = "ALLOWED_APP_IDS",
      API_ENDPOINT = "API_ENDPOINT",
      M365_APPLICATION_ID_URI = "M365_APPLICATION_ID_URI",
    }

    enum SQLConfig {
      IDENTITY_ID = "IDENTITY_ID",
      SQL_DATABASE_NAME = "SQL_DATABASE_NAME",
      SQL_ENDPOINT = "SQL_ENDPOINT",
    }

    console.log("Validating app settings.");
    const response = await this.getWebappConfigs(
      this.subscriptionId,
      this.rg,
      functionObject.functionAppName,
      token as string
    );
    chai.assert.exists(response);

    Object.values(BaseConfig).forEach((v: string) => {
      chai.assert.exists(response[v]);
      if (functionObject.expectValues.get(v)) {
        chai.assert.equal(functionObject.expectValues.get(v), response[v]);
      }
    });

    if (sqlEnabled) {
      Object.values(SQLConfig).forEach((v: string) => {
        chai.assert.exists(response[v]);
        if (functionObject.expectValues.get(v)) {
          chai.assert.equal(functionObject.expectValues.get(v), response[v]);
        }
      });
    }

    console.log("Validating app service plan.");
    const servicePlanResponse = await this.getWebappServicePlan(
      this.subscriptionId,
      this.rg,
      functionObject.appServicePlanName,
      token as string
    );
    chai.assert(servicePlanResponse, functionObject.appServicePlanName);

    console.log("Successfully validate Function Provision.");
  }

  private static async runWithRetry<T>(fn: () => Promise<T>) {
    const maxTryCount = 3;
    const defaultRetryAfterInSecond = 2;
    const maxRetryAfterInSecond = 3 * 60;
    const secondInMilliseconds = 1000;

    for (let i = 0; i < maxTryCount - 1; i++) {
      try {
        const ret = await fn();
        return ret;
      } catch (e) {
        let retryAfterInSecond = defaultRetryAfterInSecond;
        if (e.response?.status === 429) {
          // See https://docs.microsoft.com/en-us/azure/azure-resource-manager/management/request-limits-and-throttling#error-code.
          const suggestedRetryAfter = e.response?.headers?.["retry-after"];
          // Explicit check, _retryAfter can be 0.
          if (suggestedRetryAfter !== undefined) {
            if (suggestedRetryAfter > maxRetryAfterInSecond) {
              // Don't wait too long.
              throw e;
            } else {
              // Take one more second for time error.
              retryAfterInSecond = suggestedRetryAfter + 1;
            }
          }
        }
        await new Promise((resolve) =>
          setTimeout(resolve, retryAfterInSecond * secondInMilliseconds)
        );
      }
    }

    return fn();
  }

  public static async validateDeploy(functionObject: IFunctionObject): Promise<void> {
    console.log("Start to validate Function Deployment.");

    // Disable validate deployment since we have too many requests and the test is not stable.
    const tokenCredential = await MockAzureAccountProvider.getAccountCredentialAsync();
    const token = (await tokenCredential?.getToken())?.accessToken;

    const deployments = await this.getDeployments(
      this.subscriptionId,
      this.rg,
      functionObject.functionAppName,
      token as string
    );
    const deploymentId = deployments?.[0]?.properties?.id;
    const deploymentLog = await this.getDeploymentLog(
      this.subscriptionId,
      this.rg,
      functionObject.functionAppName,
      token as string,
      deploymentId!
    );

    chai.assert.exists(
      deploymentLog?.find((item: any) => item.properties.message === "Deployment successful.")
    );

    console.log("Successfully validate Function Deployment.");
  }

  private static async getDeployments(
    subscriptionId: string,
    rg: string,
    name: string,
    token: string
  ) {
    try {
      axios.defaults.headers.common["Authorization"] = `Bearer ${token}`;
      const functionGetResponse = await this.runWithRetry(() =>
        axios.get(baseUrlListDeployments(subscriptionId, rg, name))
      );

      return functionGetResponse?.data?.value;
    } catch (error) {
      console.log(error);
      return undefined;
    }
  }

  private static async getDeploymentLog(
    subscriptionId: string,
    rg: string,
    name: string,
    token: string,
    id: string
  ) {
    try {
      axios.defaults.headers.common["Authorization"] = `Bearer ${token}`;
      const functionGetResponse = await this.runWithRetry(() =>
        axios.get(baseUrlListDeploymentLogs(subscriptionId, rg, name, id))
      );

      return functionGetResponse?.data?.value;
    } catch (error) {
      console.log(error);
      return undefined;
    }
  }

  private static async getWebappConfigs(
    subscriptionId: string,
    rg: string,
    name: string,
    token: string
  ) {
    try {
      axios.defaults.headers.common["Authorization"] = `Bearer ${token}`;
      const functionGetResponse = await this.runWithRetry(() =>
        axios.post(baseUrlAppSettings(subscriptionId, rg, name))
      );
      if (
        !functionGetResponse ||
        !functionGetResponse.data ||
        !functionGetResponse.data.properties
      ) {
        return undefined;
      }

      return functionGetResponse.data.properties;
    } catch (error) {
      console.log(error);
      return undefined;
    }
  }

  private static async getWebappServicePlan(
    subscriptionId: string,
    rg: string,
    name: string,
    token: string
  ) {
    try {
      axios.defaults.headers.common["Authorization"] = `Bearer ${token}`;
      const functionPlanResponse = await this.runWithRetry(() =>
        axios.get(baseUrlPlan(subscriptionId, rg, name))
      );
      if (
        !functionPlanResponse ||
        !functionPlanResponse.data ||
        !functionPlanResponse.data.sku ||
        !functionPlanResponse.data.sku.name
      ) {
        return undefined;
      }

      return functionPlanResponse.data.sku.name;
    } catch (error) {
      console.log(error);
      return undefined;
    }
  }
}
