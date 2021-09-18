// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import {
  AppPackageFolderName,
  AzureSolutionSettings,
  ConfigFolderName,
  EnvConfig,
  err,
  InputConfigsFolderName,
  Inputs,
  ProjectSettings,
  ProjectSettingsFileName,
  PublishProfilesFolderName,
  returnSystemError,
  TeamsAppManifest,
} from "@microsoft/teamsfx-api";
import {
  CoreHookContext,
  deserializeDict,
  NoProjectOpenedError,
  serializeDict,
  SolutionConfigError,
  ProjectSettingError,
  environmentManager,
} from "../..";
import { LocalSettingsProvider } from "../../common/localSettingsProvider";
import { Middleware, NextFunction } from "@feathersjs/hooks/lib";
import fs from "fs-extra";
import path from "path";
import { readJson } from "../../common/fileUtils";
import { PluginNames } from "../../plugins/solution/fx-solution/constants";
import { FxCore } from "..";
import { isMultiEnvEnabled, isArmSupportEnabled, getStrings } from "../../common/tools";
import { loadProjectSettings } from "./projectSettingsLoader";
import { generateArmTemplate } from "../../plugins/solution/fx-solution/arm";
import { loadSolutionContext } from "./envInfoLoader";
import { ResourcePlugins } from "../../common/constants";
import { getActivatedResourcePlugins } from "../../plugins/solution/fx-solution/ResourcePluginContainer";
import { LocalDebugConfigKeys } from "../../plugins/resource/localdebug/constants";

const programmingLanguage = "programmingLanguage";
const defaultFunctionName = "defaultFunctionName";
const learnMoreText = "Learn More";
const migrationGuideUrl = "https://aka.ms/teamsfx-migration-guide";

class EnvConfigName {
  static readonly StorageName = "storageName";
  static readonly IdentityName = "identity";
  static readonly SqlEndpoint = "sqlEndpoint";
  static readonly SqlDataBase = "databaseName";
  static readonly SkuName = "skuName";
  static readonly AppServicePlanName = "appServicePlanName";
  static readonly StorageAccountName = "storageAccountName";
  static readonly FuncAppName = "functionAppName";
}

class ArmParameters {
  static readonly FEStorageName = "frontendHosting_storageName";
  static readonly IdentityName = "identity_managedIdentityName";
  static readonly SQLServer = "azureSql_serverName";
  static readonly SQLDatabase = "azureSql_databaseName";
  static readonly SimpleAuthSku = "simpleAuth_sku";
  static readonly functionServerName = "function_serverfarmsName";
  static readonly functionStorageName = "function_storageName";
  static readonly functionAppName = "function_webappName";
}

export const ProjectMigratorMW: Middleware = async (ctx: CoreHookContext, next: NextFunction) => {
  if (await needMigrateToArmAndMultiEnv(ctx)) {
    const core = ctx.self as FxCore;
    const res = await core.tools.ui.showMessage(
      "warn",
      getStrings().solution.MigrationToArmAndMultiEnvMessage,
      true,
      "OK"
    );
    const answer = res?.isOk() ? res.value : undefined;
    if (!answer || answer != "OK") {
      return;
    }
    await migrateToArmAndMultiEnv(ctx);
  }
  await next();
};

async function migrateToArmAndMultiEnv(ctx: CoreHookContext): Promise<void> {
  const inputs = ctx.arguments[ctx.arguments.length - 1] as Inputs;
  const projectPath = inputs.projectPath as string;
  try {
    await removeBotConfig(ctx);
    await migrateMultiEnv(projectPath);
    await migrateArm(ctx);
  } catch (err) {
    await cleanup(projectPath);
    throw err;
  }
  await removeOldProjectFiles(projectPath);
  const core = ctx.self as FxCore;
  core.tools.ui
    .showMessage(
      "info",
      getStrings().solution.MigrationToArmAndMultiEnvSuccessMessage,
      false,
      learnMoreText
    )
    .then((result) => {
      const userSelected = result.isOk() ? result.value : undefined;
      if (userSelected === learnMoreText) {
        core.tools.ui!.openUrl(migrationGuideUrl);
      }
    });
}

async function migrateMultiEnv(projectPath: string): Promise<void> {
  const { fx, fxConfig, templateAppPackage, fxPublishProfile } = await getMultiEnvFolders(
    projectPath
  );
  const { hasFrontend, hasBackend, hasBot, hasProvision } = await queryProjectStatus(fx);

  //localSettings.json
  const localSettingsProvider = new LocalSettingsProvider(projectPath);
  await localSettingsProvider.save(localSettingsProvider.init(hasFrontend, hasBackend, hasBot));
  //projectSettings.json
  const projectSettings = path.join(fxConfig, ProjectSettingsFileName);
  await fs.copy(path.join(fx, "settings.json"), projectSettings);
  await ensureProjectSettings(projectSettings, path.join(fx, "env.default.json"));

  //config.dev.json
  await fs.writeFile(
    path.join(fxConfig, "config.dev.json"),
    JSON.stringify(getConfigDevJson(await getAppName(projectSettings)), null, 4)
  );

  // appPackage
  await fs.copy(path.join(projectPath, AppPackageFolderName), templateAppPackage);
  await fs.rename(
    path.join(templateAppPackage, "manifest.source.json"),
    path.join(templateAppPackage, "manifest.template.json")
  );
  await moveIconsToResourceFolder(templateAppPackage);

  if (hasProvision) {
    const devProfile = path.join(fxPublishProfile, "profile.dev.json");
    const devUserData = path.join(fxPublishProfile, "dev.userdata");
    await fs.copy(path.join(fx, "new.env.default.json"), devProfile);
    await fs.copy(path.join(fx, "default.userdata"), devUserData);
    await removeExpiredFields(devProfile, devUserData);
  }
}

async function moveIconsToResourceFolder(templateAppPackage: string): Promise<void> {
  // see AppStudioPluginImpl.buildTeamsAppPackage()
  const manifest: TeamsAppManifest = await readJson(
    path.join(templateAppPackage, "manifest.template.json")
  );
  const hasColorIcon = manifest.icons.color && !manifest.icons.color.startsWith("https://");
  const hasOutlineIcon = manifest.icons.outline && !manifest.icons.outline.startsWith("https://");
  if (!hasColorIcon || !hasOutlineIcon) {
    return;
  }
  // move to resources
  const resource = path.join(templateAppPackage, "resources");
  await fs.ensureDir(resource);
  await fs.move(
    path.join(templateAppPackage, manifest.icons.color),
    path.join(resource, manifest.icons.color)
  );

  await fs.move(
    path.join(templateAppPackage, manifest.icons.outline),
    path.join(resource, manifest.icons.outline)
  );
  // update icons
  manifest.icons.color = `resources/${manifest.icons.color}`;
  manifest.icons.outline = `resources/${manifest.icons.outline}`;
  await fs.writeFile(
    path.join(templateAppPackage, "manifest.template.json"),
    JSON.stringify(manifest, null, 4)
  );
}

async function removeExpiredFields(devProfile: string, devUserData: string): Promise<void> {
  const profileData = await readJson(devProfile);
  const secrets: Record<string, string> = deserializeDict(await fs.readFile(devUserData, "UTF-8"));

  const expiredProfileKeys: [string, string][] = [
    [PluginNames.LDEBUG, ""],
    [PluginNames.SOLUTION, programmingLanguage],
    [PluginNames.SOLUTION, defaultFunctionName],
    [PluginNames.SOLUTION, "localDebugTeamsAppId"],
    [PluginNames.AAD, "local_clientId"],
    [PluginNames.AAD, "local_objectId"],
    [PluginNames.AAD, "local_tenantId"],
    [PluginNames.AAD, "local_clientSecret"],
    [PluginNames.AAD, "local_oauth2PermissionScopeId"],
    [PluginNames.AAD, "local_applicationIdUris"],
    [PluginNames.SA, "filePath"],
    [PluginNames.SA, "environmentVariableParams"],
  ];
  for (const [k, v] of expiredProfileKeys) {
    if (profileData[k]) {
      if (!v) {
        delete profileData[k];
      } else if (profileData[k][v]) {
        delete profileData[k][v];
      }
    }
  }

  for (const [_, value] of Object.entries(LocalDebugConfigKeys)) {
    deleteUserDataKey(secrets, `${PluginNames.LDEBUG}.${value}`);
  }
  deleteUserDataKey(secrets, `${PluginNames.AAD}.local_clientSecret`);

  await fs.writeFile(devProfile, JSON.stringify(profileData, null, 4), { encoding: "UTF-8" });
  await fs.writeFile(devUserData, serializeDict(secrets), { encoding: "UTF-8" });
}

function deleteUserDataKey(secrets: Record<string, string>, key: string) {
  if (secrets[key]) {
    delete secrets[key];
  }
}

function getConfigDevJson(appName: string): EnvConfig {
  return environmentManager.newEnvConfigData(appName);
}

async function queryProjectStatus(fx: string): Promise<any> {
  const settings: ProjectSettings = await readJson(path.join(fx, "settings.json"));
  const solutionSettings: AzureSolutionSettings =
    settings.solutionSettings as AzureSolutionSettings;
  const plugins = getActivatedResourcePlugins(solutionSettings);
  const envDefaultJson: { solution: { provisionSucceeded: boolean } } = await readJson(
    path.join(fx, "env.default.json")
  );
  const hasFrontend = plugins?.some((plugin) => plugin.name === PluginNames.FE);
  const hasBackend = plugins?.some((plugin) => plugin.name === PluginNames.FUNC);
  const hasBot = plugins?.some((plugin) => plugin.name === PluginNames.BOT);
  const hasProvision = envDefaultJson.solution?.provisionSucceeded as boolean;
  return { hasFrontend, hasBackend, hasBot, hasProvision };
}

async function getMultiEnvFolders(projectPath: string): Promise<any> {
  const fx = path.join(projectPath, `.${ConfigFolderName}`);
  const fxConfig = path.join(fx, InputConfigsFolderName);
  const templateAppPackage = path.join(projectPath, "templates", AppPackageFolderName);
  const fxPublishProfile = path.join(fx, PublishProfilesFolderName);
  await fs.ensureDir(fxConfig);
  await fs.ensureDir(templateAppPackage);
  return { fx, fxConfig, templateAppPackage, fxPublishProfile };
}

async function removeOldProjectFiles(projectPath: string): Promise<void> {
  const fx = path.join(projectPath, `.${ConfigFolderName}`);
  // backup the env.default.json to migrationbackup folder.
  await fs.ensureDir(path.join(fx, "migrationbackup"));
  await fs.move(
    path.join(fx, "env.default.json"),
    path.join(fx, "migrationbackup", "env.default.json")
  );
  await fs.remove(path.join(fx, "default.userdata"));
  await fs.remove(path.join(fx, "settings.json"));
  await fs.remove(path.join(fx, "local.env"));
  await fs.remove(path.join(projectPath, AppPackageFolderName));
  await fs.remove(path.join(fx, "new.env.default.json"));
  // version <= 2.4.1, remove .fx/appPackage.
  await fs.remove(path.join(fx, AppPackageFolderName));
}

async function ensureProjectSettings(
  projectSettingPath: string,
  envDefaultPath: string
): Promise<void> {
  const settings: ProjectSettings = await readJson(projectSettingPath);
  if (!settings.programmingLanguage || !settings.defaultFunctionName) {
    const envDefault = await readJson(envDefaultPath);
    settings.programmingLanguage = envDefault[PluginNames.SOLUTION][programmingLanguage];
    settings.defaultFunctionName = envDefault[PluginNames.FUNC][defaultFunctionName];
  }
  if (!settings.activeEnvironment) {
    settings.activeEnvironment = "dev";
  }
  if (!settings.version) {
    settings.version = "1.0.0";
  }
  await fs.writeFile(projectSettingPath, JSON.stringify(settings, null, 4), {
    encoding: "UTF-8",
  });
}

async function getAppName(projectSettingPath: string): Promise<string> {
  const settings: ProjectSettings = await readJson(projectSettingPath);
  return settings.appName;
}

async function ensureActiveEnv(projectSettingPath: string): Promise<void> {
  const settings: ProjectSettings = await readJson(projectSettingPath);
  if (!settings.activeEnvironment) {
    settings.activeEnvironment = "dev";
    await fs.writeFile(projectSettingPath, JSON.stringify(settings, null, 4), {
      encoding: "UTF-8",
    });
  }
}

async function cleanup(projectPath: string): Promise<void> {
  const { _, fxConfig, templateAppPackage, fxPublishProfile } = await getMultiEnvFolders(
    projectPath
  );
  await fs.remove(fxConfig);
  await fs.remove(templateAppPackage);
  await fs.remove(fxPublishProfile);
  await fs.remove(path.join(templateAppPackage, ".."));
  if (await fs.pathExists(path.join(fxConfig, "..", "new.env.default.json"))) {
    await fs.remove(path.join(fxConfig, "..", "new.env.default.json"));
  }
}

async function needMigrateToArmAndMultiEnv(ctx: CoreHookContext): Promise<boolean> {
  if (!preCheckEnvEnabled()) {
    return false;
  }
  const inputs = ctx.arguments[ctx.arguments.length - 1] as Inputs;
  const fxExist = await fs.pathExists(path.join(inputs.projectPath as string, ".fx"));
  if (!fxExist) {
    return false;
  }

  const envFileExist = await fs.pathExists(
    path.join(inputs.projectPath as string, ".fx", "env.default.json")
  );
  const configDirExist = await fs.pathExists(
    path.join(inputs.projectPath as string, ".fx", "configs")
  );
  const armParameterExist = await fs.pathExists(
    path.join(inputs.projectPath as string, ".fx", "configs", "azure.parameters.dev.json")
  );
  if (envFileExist && (!armParameterExist || !configDirExist)) {
    return true;
  }
  return false;
}

function preCheckEnvEnabled() {
  if (isMultiEnvEnabled() && isArmSupportEnabled()) {
    return true;
  }
  return false;
}

export async function migrateArm(ctx: CoreHookContext) {
  await generateArmTempaltesFiles(ctx);
  await generateArmParameterJson(ctx);
}

async function removeBotConfig(ctx: CoreHookContext) {
  const inputs = ctx.arguments[ctx.arguments.length - 1] as Inputs;
  const fx = path.join(inputs.projectPath as string, `.${ConfigFolderName}`);
  const envConfig = await fs.readJson(path.join(fx, "env.default.json"));
  if (envConfig[ResourcePlugins.Bot]) {
    delete envConfig[ResourcePlugins.Bot];
    envConfig[ResourcePlugins.Bot] = { wayToRegisterBot: "create-new" };
  }
  await fs.writeFile(path.join(fx, "new.env.default.json"), JSON.stringify(envConfig, null, 4));
}

async function generateArmTempaltesFiles(ctx: CoreHookContext) {
  const minorCtx: CoreHookContext = { arguments: ctx.arguments };
  const inputs = ctx.arguments[ctx.arguments.length - 1] as Inputs;
  const core = ctx.self as FxCore;

  const fx = path.join(inputs.projectPath as string, `.${ConfigFolderName}`);
  const fxConfig = path.join(fx, InputConfigsFolderName);
  const templateAzure = path.join(inputs.projectPath as string, "templates", "azure");
  await fs.ensureDir(fxConfig);
  await fs.ensureDir(templateAzure);
  // load local settings.json
  const loadRes = await loadProjectSettings(inputs);
  if (loadRes.isErr()) {
    throw ProjectSettingError();
  }
  const [projectSettings, projectIdMissing] = loadRes.value;
  minorCtx.projectSettings = projectSettings;
  minorCtx.projectIdMissing = projectIdMissing;

  const targetEnvName = "dev";
  const result = await loadSolutionContext(
    core.tools,
    inputs,
    minorCtx.projectSettings,
    minorCtx.projectIdMissing,
    targetEnvName,
    inputs.ignoreEnvInfo
  );
  if (result.isErr()) {
    throw SolutionConfigError();
  }
  minorCtx.solutionContext = result.value;
  // generate bicep files.
  try {
    await generateArmTemplate(minorCtx.solutionContext);
  } catch (error) {
    throw error;
  }
  if (await fs.pathExists(path.join(templateAzure, "parameters.template.json"))) {
    await fs.move(
      path.join(templateAzure, "parameters.template.json"),
      path.join(fxConfig, "azure.parameters.dev.json")
    );
  } else {
    throw err(
      returnSystemError(
        new Error("Failed to generate parameter.dev.json"),
        "Solution",
        "GenerateArmTemplateFailed"
      )
    );
  }
}

async function generateArmParameterJson(ctx: CoreHookContext) {
  const inputs = ctx.arguments[ctx.arguments.length - 1] as Inputs;
  const fx = path.join(inputs.projectPath as string, `.${ConfigFolderName}`);
  const fxConfig = path.join(fx, InputConfigsFolderName);
  const envConfig = await fs.readJson(path.join(fx, "env.default.json"));
  const targetJson = await fs.readJson(path.join(fxConfig, "azure.parameters.dev.json"));
  const ArmParameter = "parameters";
  // frontend hosting
  if (envConfig[ResourcePlugins.FrontendHosting]) {
    if (envConfig[ResourcePlugins.FrontendHosting][EnvConfigName.StorageName]) {
      targetJson[ArmParameter][ArmParameters.FEStorageName] = {
        value: envConfig[ResourcePlugins.FrontendHosting][EnvConfigName.StorageName],
      };
    }
  }
  // manage identity
  if (envConfig[ResourcePlugins.Identity]) {
    if (envConfig[ResourcePlugins.Identity][EnvConfigName.IdentityName]) {
      targetJson[ArmParameter][ArmParameters.IdentityName] = {
        value: envConfig[ResourcePlugins.Identity][EnvConfigName.IdentityName],
      };
    }
  }
  // azure SQL
  if (envConfig[ResourcePlugins.AzureSQL]) {
    if (envConfig[ResourcePlugins.AzureSQL][EnvConfigName.SqlEndpoint]) {
      targetJson[ArmParameter][ArmParameters.SQLServer] = {
        value:
          envConfig[ResourcePlugins.AzureSQL][EnvConfigName.SqlEndpoint].split(
            ".database.windows.net"
          )[0],
      };
    }
    if (envConfig[ResourcePlugins.AzureSQL][EnvConfigName.SqlDataBase]) {
      targetJson[ArmParameter][ArmParameters.SQLDatabase] = {
        value: envConfig[ResourcePlugins.AzureSQL][EnvConfigName.SqlDataBase],
      };
    }
  }
  // SimpleAuth
  if (envConfig[ResourcePlugins.SimpleAuth]) {
    if (envConfig[ResourcePlugins.SimpleAuth][EnvConfigName.SkuName]) {
      targetJson[ArmParameter][ArmParameters.SimpleAuthSku] = {
        value: envConfig[ResourcePlugins.SimpleAuth][EnvConfigName.SkuName],
      };
    }
  }
  // Function
  if (envConfig[ResourcePlugins.Function]) {
    if (envConfig[ResourcePlugins.Function][EnvConfigName.AppServicePlanName]) {
      targetJson[ArmParameter][ArmParameters.functionServerName] = {
        value: envConfig[ResourcePlugins.Function][EnvConfigName.AppServicePlanName],
      };
    }
    if (envConfig[ResourcePlugins.Function][EnvConfigName.StorageAccountName]) {
      targetJson[ArmParameter][ArmParameters.functionStorageName] = {
        value: envConfig[ResourcePlugins.Function][EnvConfigName.StorageAccountName],
      };
    }
    if (envConfig[ResourcePlugins.Function][EnvConfigName.FuncAppName]) {
      targetJson[ArmParameter][ArmParameters.functionAppName] = {
        value: envConfig[ResourcePlugins.Function][EnvConfigName.FuncAppName],
      };
    }
  }
  await fs.writeFile(
    path.join(fxConfig, "azure.parameters.dev.json"),
    JSON.stringify(targetJson, null, 4)
  );
}
