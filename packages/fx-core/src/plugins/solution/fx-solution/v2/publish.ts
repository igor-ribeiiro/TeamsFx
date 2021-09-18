import {
  v2,
  Inputs,
  FxError,
  Result,
  ok,
  err,
  returnUserError,
  AppStudioTokenProvider,
  Void,
  EnvConfig,
  Json,
} from "@microsoft/teamsfx-api";
import { getStrings } from "../../../../common/tools";
import { executeConcurrently } from "./executor";
import { getAzureSolutionSettings, getSelectedPlugins, isAzureProject } from "./utils";
import { GLOBAL_CONFIG, SolutionError, SOLUTION_PROVISION_SUCCEEDED } from "../constants";
import * as util from "util";
import { isUndefined } from "lodash";
import { PluginDisplayName } from "../../../../common/constants";

export async function publishApplication(
  ctx: v2.Context,
  inputs: Inputs,
  provisionInputConfig: Json,
  provisionOutputs: Json,
  tokenProvider: AppStudioTokenProvider
): Promise<Result<Void, FxError>> {
  const inAzureProject = isAzureProject(getAzureSolutionSettings(ctx));
  const provisioned = provisionOutputs[GLOBAL_CONFIG][SOLUTION_PROVISION_SUCCEEDED];

  if (inAzureProject && !provisioned) {
    return err(
      returnUserError(
        new Error(
          util.format(getStrings().solution.NotProvisionedNotice, ctx.projectSetting.appName)
        ),
        "Solution",
        SolutionError.CannotDeployBeforeProvision
      )
    );
  }

  const plugins = getSelectedPlugins(getAzureSolutionSettings(ctx));
  const thunks = plugins
    .filter((plugin) => !isUndefined(plugin.publishApplication))
    .map((plugin) => {
      return {
        pluginName: `${plugin.name}`,
        taskName: "publishApplication",
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        thunk: () =>
          plugin.publishApplication!(
            ctx,
            inputs,
            provisionInputConfig,
            provisionOutputs,
            tokenProvider
          ),
      };
    });

  ctx.logProvider.info(
    util.format(getStrings().solution.PublishStartNotice, PluginDisplayName.Solution)
  );

  const result = await executeConcurrently(thunks, ctx.logProvider);

  if (result.kind !== "success") {
    const msg = util.format(getStrings().solution.PublishFailNotice, ctx.projectSetting.appName);
    ctx.logProvider?.info(msg);
    return err(result.error);
  }
  return ok(Void);
}
