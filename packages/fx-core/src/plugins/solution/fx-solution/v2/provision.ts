import {
  v2,
  Inputs,
  FxError,
  Result,
  ok,
  err,
  returnUserError,
  AzureAccountProvider,
  TokenProvider,
  Json,
  EnvInfo,
  ConfigMap,
  UserInteraction,
  ProjectSettings,
  Void,
  SolutionContext,
  returnSystemError,
} from "@microsoft/teamsfx-api";
import { getStrings, isArmSupportEnabled, isMultiEnvEnabled } from "../../../../common/tools";
import { executeConcurrently } from "./executor";
import {
  blockV1Project,
  combineRecords,
  ensurePermissionRequest,
  extractSolutionInputs,
  getAzureSolutionSettings,
  getSelectedPlugins,
  isAzureProject,
} from "./utils";
import {
  ARM_TEMPLATE_OUTPUT,
  GLOBAL_CONFIG,
  PluginNames,
  SolutionError,
  SUBSCRIPTION_ID,
  SUBSCRIPTION_NAME,
} from "../constants";
import * as util from "util";
import { isUndefined } from "lodash";
import { PluginDisplayName } from "../../../../common/constants";
import { ProvisionContextAdapter } from "./adaptor";
import { fillInCommonQuestions } from "../commonQuestions";
import { askTargetEnvironment } from "../../../../core/middleware/envInfoLoader";
import { deployArmTemplates } from "../arm";
import Container from "typedi";
import { ResourcePluginsV2 } from "../ResourcePluginContainer";
import _ from "lodash";
import { EnvInfoV2 } from "@microsoft/teamsfx-api/build/v2";

export async function provisionResource(
  ctx: v2.Context,
  inputs: Inputs,
  envInfo: v2.DeepReadonly<v2.EnvInfoV2>,
  tokenProvider: TokenProvider
): Promise<v2.FxResult<v2.SolutionProvisionOutput, FxError>> {
  if (inputs.projectPath === undefined) {
    return new v2.FxFailure(
      returnSystemError(
        new Error("projectPath is undefined"),
        "Solution",
        SolutionError.InternelError
      )
    );
  }
  const projectPath: string = inputs.projectPath;

  const blockResult = blockV1Project(ctx.projectSetting.solutionSettings);
  if (blockResult.isErr()) {
    return new v2.FxFailure(blockResult.error);
  }

  const azureSolutionSettings = getAzureSolutionSettings(ctx);
  // Just to trigger M365 login before the concurrent execution of provision.
  // Because concurrent exectution of provision may getAccessToken() concurrently, which
  // causes 2 M365 logins before the token caching in common lib takes effect.
  await tokenProvider.appStudioToken.getAccessToken();

  if (isAzureProject(azureSolutionSettings)) {
    const result = await ensurePermissionRequest(
      azureSolutionSettings,
      ctx.permissionRequestProvider
    );
    if (result.isErr()) {
      return new v2.FxFailure(result.error);
    }
  }

  const newEnvInfo: EnvInfoV2 = _.cloneDeep(envInfo);
  if (isAzureProject(azureSolutionSettings)) {
    const appName = ctx.projectSetting.appName;
    const contextAdaptor = new ProvisionContextAdapter([ctx, inputs, newEnvInfo, tokenProvider]);
    const res = await fillInCommonQuestions(
      contextAdaptor,
      appName,
      contextAdaptor.envInfo.profile,
      tokenProvider.azureAccountProvider,
      await tokenProvider.appStudioToken.getJsonObject()
    );
    if (res.isErr()) {
      return new v2.FxFailure(res.error);
    }
    // contextAdaptor deep-copies original JSON into a map. We need to convert it back.
    newEnvInfo.profile = (contextAdaptor.envInfo.profile as ConfigMap).toJSON();
    const consentResult = await askForProvisionConsent(contextAdaptor);
    if (consentResult.isErr()) {
      return new v2.FxFailure(consentResult.error);
    }
  }

  const plugins = getSelectedPlugins(azureSolutionSettings);
  const provisionThunks = plugins
    .filter((plugin) => !isUndefined(plugin.provisionResource))
    .map((plugin) => {
      return {
        pluginName: `${plugin.name}`,
        taskName: "provisionResource",
        thunk: () =>
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          plugin.provisionResource!(
            ctx,
            { ...inputs, ...extractSolutionInputs(newEnvInfo.profile), projectPath: projectPath },
            { ...newEnvInfo, profile: newEnvInfo.profile[plugin.name] },
            tokenProvider
          ),
      };
    });

  ctx.logProvider?.info(
    util.format(getStrings().solution.ProvisionStartNotice, PluginDisplayName.Solution)
  );
  const provisionResult = await executeConcurrently(provisionThunks, ctx.logProvider);
  if (provisionResult.kind === "failure") {
    return provisionResult;
  } else if (provisionResult.kind === "partialSuccess") {
    return new v2.FxPartialSuccess(combineRecords(provisionResult.output), provisionResult.error);
  } else {
    newEnvInfo.profile = combineRecords(provisionResult.output);
  }

  ctx.logProvider?.info(
    util.format(getStrings().solution.ProvisionFinishNotice, PluginDisplayName.Solution)
  );

  if (isArmSupportEnabled() && isAzureProject(azureSolutionSettings)) {
    const contextAdaptor = new ProvisionContextAdapter([ctx, inputs, newEnvInfo, tokenProvider]);
    const armDeploymentResult = await deployArmTemplates(contextAdaptor);
    if (armDeploymentResult.isErr()) {
      return new v2.FxPartialSuccess(
        combineRecords(provisionResult.output),
        armDeploymentResult.error
      );
    }
    // contextAdaptor deep-copies original JSON into a map. We need to convert it back.
    newEnvInfo.profile = (contextAdaptor.envInfo.profile as ConfigMap).toJSON();
  }

  const aadPlugin = Container.get<v2.ResourcePlugin>(ResourcePluginsV2.AadPlugin);
  if (plugins.some((plugin) => plugin.name === aadPlugin.name) && aadPlugin.executeUserTask) {
    const result = await aadPlugin.executeUserTask(ctx, inputs, {
      namespace: `${PluginNames.SOLUTION}/${PluginNames.AAD}`,
      method: "setApplicationInContext",
      params: { isLocal: false },
    });
    if (result.isErr()) {
      return new v2.FxPartialSuccess(combineRecords(provisionResult.output), result.error);
    }
  }

  const configureResourceThunks = plugins
    .filter((plugin) => !isUndefined(plugin.configureResource))
    .map((plugin) => {
      return {
        pluginName: `${plugin.name}`,
        taskName: "configureLocalResource",
        thunk: () =>
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          plugin.configureResource!(
            ctx,
            { ...inputs, ...extractSolutionInputs(newEnvInfo.profile), projectPath: projectPath },
            { ...newEnvInfo, profile: newEnvInfo.profile[plugin.name] },
            tokenProvider
          ),
      };
    });

  const configureResourceResult = await executeConcurrently(
    configureResourceThunks,
    ctx.logProvider
  );
  if (configureResourceResult.kind === "failure") {
    return configureResourceResult;
  } else if (configureResourceResult.kind === "partialSuccess") {
    return new v2.FxPartialSuccess(
      combineRecords(configureResourceResult.output),
      configureResourceResult.error
    );
  } else {
    if (
      newEnvInfo.profile[GLOBAL_CONFIG] &&
      newEnvInfo.profile[GLOBAL_CONFIG][ARM_TEMPLATE_OUTPUT]
    ) {
      delete newEnvInfo.profile[GLOBAL_CONFIG][ARM_TEMPLATE_OUTPUT];
    }
    ctx.logProvider?.info(
      util.format(getStrings().solution.ConfigurationFinishNotice, PluginDisplayName.Solution)
    );
    return new v2.FxSuccess(combineRecords(configureResourceResult.output));
  }
}

export async function askForProvisionConsent(ctx: SolutionContext): Promise<Result<Void, FxError>> {
  const azureToken = await ctx.azureAccountProvider?.getAccountCredentialAsync();

  // Only Azure project requires this confirm dialog
  const username = (azureToken as any).username ? (azureToken as any).username : "";
  const subscriptionId = ctx.envInfo.profile.get(GLOBAL_CONFIG)?.get(SUBSCRIPTION_ID) as string;
  const subscriptionName = ctx.envInfo.profile.get(GLOBAL_CONFIG)?.get(SUBSCRIPTION_NAME) as string;

  const msg = util.format(
    getStrings().solution.ProvisionConfirmNotice,
    username,
    subscriptionName ? subscriptionName : subscriptionId
  );
  let confirmRes = undefined;
  if (isMultiEnvEnabled()) {
    const msgNew = util.format(
      getStrings().solution.ProvisionConfirmEnvNotice,
      ctx.projectSettings!.activeEnvironment,
      username,
      subscriptionName ? subscriptionName : subscriptionId
    );
    confirmRes = await ctx.ui?.showMessage(
      "warn",
      msgNew,
      true,
      "Provision",
      "Switch environment",
      "Pricing calculator"
    );
  } else {
    confirmRes = await ctx.ui?.showMessage("warn", msg, true, "Provision", "Pricing calculator");
  }
  const confirm = confirmRes?.isOk() ? confirmRes.value : undefined;

  if (confirm !== "Provision") {
    if (confirm === "Pricing calculator") {
      ctx.ui?.openUrl("https://azure.microsoft.com/en-us/pricing/calculator/");
    } else if (confirm === "Switch environment") {
      const envName = await askTargetEnvironment(ctx as any, ctx.answers!);
      if (envName) {
        ctx.projectSettings!.activeEnvironment = envName;
        ctx.ui?.showMessage(
          "info",
          `[${envName}] is activated. Please try to do provision again.`,
          false
        );
      }
    }
    return err(
      returnUserError(
        new Error(getStrings().solution.CancelProvision),
        "Solution",
        getStrings().solution.CancelProvision
      )
    );
  }
  return ok(Void);
}
