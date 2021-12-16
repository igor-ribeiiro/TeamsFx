// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import {
  AzureAccountProvider,
  err,
  FxError,
  Inputs,
  ok,
  OptionItem,
  QTreeNode,
  Result,
  TokenProvider,
  v2,
  v3,
  Void,
} from "@microsoft/teamsfx-api";
import { Container, Service } from "typedi";
import { InvalidInputError, ResourceAlreadyAddedError } from "./error";
import { createSelectModuleQuestionNode, selectResourceQuestion } from "./questions";
import fs from "fs-extra";
import * as path from "path";
import { getModule } from "./utils";

@Service("fx-resource-azure-storage")
export class AzureStoragePlugin implements v3.ResourcePlugin {
  resourceType = "Azure Storage";
  description = "Azure Storage";
  name = "fx-resource-azure-storage";
  async generateResourceTemplate(
    ctx: v2.Context,
    inputs: v2.InputsWithProjectPath
  ): Promise<Result<v2.ResourceTemplate, FxError>> {
    if (!inputs.test) {
      await fs.ensureDir(path.join(inputs.projectPath, "templates", "azure"));
      await fs.writeFile(
        path.join(inputs.projectPath, "templates", "azure", "AzureStorage.bicep"),
        ""
      );
    }
    return ok({ kind: "bicep", template: {} });
  }

  async provisionResource(
    ctx: v2.Context,
    inputs: v2.InputsWithProjectPath,
    envInfo: v2.DeepReadonly<v3.EnvInfoV3>,
    tokenProvider: TokenProvider
  ): Promise<Result<v3.CloudResource, FxError>> {
    const config: v3.AzureStorage = {
      domain: "huajie1214dev35e42dtab.z19.web.core.windows.net",
      endpoint: "https://huajie1214dev35e42dtab.z19.web.core.windows.net",
      storageResourceId:
        "/subscriptions/63f43cd3-ab63-429d-80ad-950ec8359724/resourceGroups/fullcap-dev-rg/providers/Microsoft.Storage/storageAccounts/huajie1214dev35e42dtab",
    };
    return ok(config);
  }

  async deploy(
    ctx: v2.Context,
    inputs: v3.PluginDeployInputs,
    envInfo: v2.DeepReadonly<v3.EnvInfoV3>,
    tokenProvider: AzureAccountProvider
  ): Promise<Result<Void, FxError>> {
    return ok(Void);
  }
}
@Service("fx-resource-azure-bot")
export class AzureBotPlugin implements v3.ResourcePlugin {
  resourceType = "Azure Bot";
  description = "Azure Bot";
  name = "fx-resource-azure-bot";
  async pluginDependencies(ctx: v2.Context, inputs: Inputs): Promise<Result<string[], FxError>> {
    return ok(["fx-resource-azure-web-app"]);
  }
  async generateResourceTemplate(
    ctx: v2.Context,
    inputs: v2.InputsWithProjectPath
  ): Promise<Result<v2.ResourceTemplate, FxError>> {
    if (!inputs.test) {
      await fs.ensureDir(path.join(inputs.projectPath, "templates", "azure"));
      await fs.writeFile(path.join(inputs.projectPath, "templates", "azure", "AzureBot.bicep"), "");
    }
    return ok({ kind: "bicep", template: {} });
  }

  async provisionResource(
    ctx: v2.Context,
    inputs: v2.InputsWithProjectPath,
    envInfo: v2.DeepReadonly<v3.EnvInfoV3>,
    tokenProvider: TokenProvider
  ): Promise<Result<v3.CloudResource, FxError>> {
    const config: v3.AzureBot = {
      botId: "e01c3709-3700-45dd-9f23-bdbedc78392e",
      objectId: "ea553a03-0322-4c9a-8bd5-8d56d1d2b534",
      skuName: "F1",
      siteName: "huajie1214dev35e42dbot",
      validDomain: "huajie1214dev35e42dbot.azurewebsites.net",
      appServicePlanName: "huajie1214dev35e42dbot",
      botWebAppResourceId:
        "/subscriptions/63f43cd3-ab63-429d-80ad-950ec8359724/resourceGroups/fullcap-dev-rg/providers/Microsoft.Web/sites/huajie1214dev35e42dbot",
      siteEndpoint: "https://huajie1214dev35e42dbot.azurewebsites.net",
      botPassword: "{{fx-resource-bot.botPassword}}",
      secretFields: ["botPassword"],
    };
    return ok(config);
  }

  async deploy(
    ctx: v2.Context,
    inputs: v3.PluginDeployInputs,
    envInfo: v2.DeepReadonly<v3.EnvInfoV3>,
    tokenProvider: AzureAccountProvider
  ): Promise<Result<Void, FxError>> {
    return ok(Void);
  }
}
@Service("fx-resource-azure-web-app")
export class AzureWebAppPlugin implements v3.ResourcePlugin {
  resourceType = "Azure Web App";
  description = "Azure Web App";
  name = "fx-resource-azure-web-app";
  async generateResourceTemplate(
    ctx: v2.Context,
    inputs: v2.InputsWithProjectPath
  ): Promise<Result<v2.ResourceTemplate, FxError>> {
    if (!inputs.test) {
      await fs.ensureDir(path.join(inputs.projectPath, "templates", "azure"));
      await fs.writeFile(
        path.join(inputs.projectPath, "templates", "azure", "AzureWebApp.bicep"),
        ""
      );
    }
    return ok({ kind: "bicep", template: {} });
  }

  async provisionResource(
    ctx: v2.Context,
    inputs: v2.InputsWithProjectPath,
    envInfo: v2.DeepReadonly<v3.EnvInfoV3>,
    tokenProvider: TokenProvider
  ): Promise<Result<v3.CloudResource, FxError>> {
    const config: v3.CloudResource = {
      resourceId:
        "/subscriptions/63f43cd3-ab63-429d-80ad-950ec8359724/resourceGroups/fullcap-dev-rg/providers/Microsoft.Web/sites/huajie1214dev35e42dbot",
      endpoint: "https://huajie1214dev35e42dbot.azurewebsites.net",
    };
    return ok(config);
  }
}

function getAllResourcePlugins(): v3.ResourcePlugin[] {
  return [
    Container.get<v3.ResourcePlugin>("fx-resource-azure-storage"),
    Container.get<v3.ResourcePlugin>("fx-resource-azure-bot"),
    Container.get<v3.ResourcePlugin>("fx-resource-azure-web-app"),
  ];
}

export async function getQuestionsForAddResource(
  ctx: v2.Context,
  inputs: v2.InputsWithProjectPath
): Promise<Result<QTreeNode | undefined, FxError>> {
  const solutionSettings = ctx.projectSetting.solutionSettings as v3.TeamsFxSolutionSettings;
  const node = new QTreeNode({ type: "group" });
  const moduleNode = createSelectModuleQuestionNode(solutionSettings.modules);
  node.addChild(moduleNode);
  const resourcePlugins = getAllResourcePlugins();
  const resourceNode = new QTreeNode(selectResourceQuestion);
  const staticOptions: OptionItem[] = [];
  for (const plugin of resourcePlugins) {
    staticOptions.push({
      id: plugin.name,
      label: plugin.resourceType,
      detail: plugin.description,
    });
  }
  selectResourceQuestion.staticOptions = staticOptions;
  node.addChild(resourceNode);
  return ok(node);
}
export async function addResource(
  ctx: v2.Context,
  inputs: v2.InputsWithProjectPath & { module?: string; resource?: string }
): Promise<Result<Void, FxError>> {
  if (!inputs.resource) {
    return err(new InvalidInputError(inputs, "inputs.resource undefined"));
  }
  const solutionSettings = ctx.projectSetting.solutionSettings as v3.TeamsFxSolutionSettings;
  if (inputs.module !== undefined) {
    const module = getModule(solutionSettings, inputs.module);
    if (module) {
      if (module.hostingPlugin === inputs.resource) {
        return err(new ResourceAlreadyAddedError(inputs.resource));
      }
      module.hostingPlugin = inputs.resource;
    }
  }
  // resolve resource dependencies
  const addedResourceNames = new Set<string>();
  const existingResourceNames = new Set<string>();
  const allResourceNames = new Set<string>();
  solutionSettings.activeResourcePlugins.forEach((s) => existingResourceNames.add(s));
  addedResourceNames.add(inputs.resource);
  const resolveRes = await resolveResourceDependencies(ctx, inputs, addedResourceNames);
  if (resolveRes.isErr()) return err(resolveRes.error);
  addedResourceNames.forEach((s) => allResourceNames.add(s));
  existingResourceNames.forEach((s) => allResourceNames.add(s));
  solutionSettings.activeResourcePlugins = Array.from(allResourceNames);
  //TODO collect resource templates
  for (const pluginName of allResourceNames.values()) {
    const plugin = Container.get<v3.ResourcePlugin>(pluginName);
    if (addedResourceNames.has(pluginName) && !existingResourceNames.has(pluginName)) {
      if (plugin.addResource) {
        const res = await plugin.addResource(ctx, inputs);
        if (res.isErr()) {
          return err(res.error);
        }
      }
      if (plugin.generateResourceTemplate) {
        const res = await plugin.generateResourceTemplate(ctx, inputs);
        if (res.isErr()) {
          return err(res.error);
        }
      }
    }
    if (plugin.updateResourceTemplate) {
      const res = await plugin.updateResourceTemplate(ctx, inputs);
      if (res.isErr()) {
        return err(res.error);
      }
    }
  }
  return ok(Void);
}

async function resolveResourceDependencies(
  ctx: v2.Context,
  inputs: v2.InputsWithProjectPath & { module?: string; resource?: string },
  addedResourceNames: Set<string>
): Promise<Result<undefined, FxError>> {
  while (true) {
    const size1 = addedResourceNames.size;
    for (const name of addedResourceNames) {
      const plugin = Container.get<v3.ResourcePlugin>(name);
      if (plugin.pluginDependencies) {
        const depRes = await plugin.pluginDependencies(ctx, inputs);
        if (depRes.isErr()) {
          return err(depRes.error);
        }
        for (const dep of depRes.value) {
          addedResourceNames.add(dep);
        }
      }
    }
    const size2 = addedResourceNames.size;
    if (size1 === size2) break;
  }
  return ok(undefined);
}