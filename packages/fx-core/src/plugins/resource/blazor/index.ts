// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import {
  Plugin,
  PluginContext,
  err,
  SystemError,
  UserError,
  AzureSolutionSettings,
} from "@microsoft/teamsfx-api";

import {
  ErrorType,
  BlazorPluginError,
  UnhandledErrorCode,
  UnhandledErrorMessage,
} from "./resources/errors";
import { Logger } from "./utils/logger";
import { ProgressHelper } from "./utils/progress-helper";
import { ErrorFactory, TeamsFxResult } from "./error-factory";
import { HostTypeOptionAzure } from "../../solution/fx-solution/question";
import { Service } from "typedi";
import { ResourcePlugins } from "../../solution/fx-solution/ResourcePluginContainer";
import { BlazorPluginImpl } from "./plugin";

@Service(ResourcePlugins.BlazorPlugin)
export class BlazorPlugin implements Plugin {
  name = "fx-resource-blazor";
  displayName = "Blazor";
  activate(solutionSettings: AzureSolutionSettings): boolean {
    const hostType = solutionSettings.hostType || "";
    return hostType === HostTypeOptionAzure.id;
  }
  blazorPluginImpl = new BlazorPluginImpl();

  private static setContext(ctx: PluginContext): void {
    Logger.setLogger(ctx.logProvider);
  }

  public async preProvision(ctx: PluginContext): Promise<TeamsFxResult> {
    BlazorPlugin.setContext(ctx);
    return await this.runWithErrorHandling(() => this.blazorPluginImpl.preProvision(ctx));
  }

  public async provision(ctx: PluginContext): Promise<TeamsFxResult> {
    BlazorPlugin.setContext(ctx);
    return await this.runWithErrorHandling(() => this.blazorPluginImpl.provision(ctx));
  }

  public async postProvision(ctx: PluginContext): Promise<TeamsFxResult> {
    BlazorPlugin.setContext(ctx);
    return await this.runWithErrorHandling(() => this.blazorPluginImpl.postProvision(ctx));
  }

  public async deploy(ctx: PluginContext): Promise<TeamsFxResult> {
    BlazorPlugin.setContext(ctx);
    return await this.runWithErrorHandling(() => this.blazorPluginImpl.deploy(ctx));
  }

  private async runWithErrorHandling(fn: () => Promise<TeamsFxResult>): Promise<TeamsFxResult> {
    try {
      const result = await fn();
      return result;
    } catch (e) {
      await ProgressHelper.endAllHandlers(false);

      if (e instanceof BlazorPluginError) {
        const error =
          e.errorType === ErrorType.User
            ? ErrorFactory.UserError(e.code, e.getMessage(), undefined, undefined, e.helpLink)
            : ErrorFactory.SystemError(
                e.code,
                e.getMessage(),
                e.getInnerError(),
                e.getInnerError()?.stack
              );
        return err(error);
      }

      if (e instanceof UserError || e instanceof SystemError) {
        return err(e);
      }

      const error = ErrorFactory.SystemError(UnhandledErrorCode, UnhandledErrorMessage, e, e.stack);
      return err(error);
    }
  }
}

export default new BlazorPlugin();
