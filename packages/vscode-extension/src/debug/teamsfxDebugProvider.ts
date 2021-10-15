// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as vscode from "vscode";

import AppStudioTokenInstance from "../commonlib/appStudioLogin";
import * as commonUtils from "./commonUtils";

export interface TeamsfxDebugConfiguration extends vscode.DebugConfiguration {
  teamsfxEnv?: string;
  teamsfxAppId?: string;
}

export class TeamsfxDebugProvider implements vscode.DebugConfigurationProvider {
  public async resolveDebugConfiguration?(
    folder: vscode.WorkspaceFolder | undefined,
    debugConfiguration: TeamsfxDebugConfiguration,
    token?: vscode.CancellationToken
  ): Promise<vscode.DebugConfiguration | undefined> {
    try {
      if (folder) {
        if (!(await commonUtils.isFxProject(folder.uri.fsPath))) {
          return debugConfiguration;
        }

        if (debugConfiguration.url === undefined) {
          return debugConfiguration;
        }

        const localTeamsAppIdPlaceholder = "${localTeamsAppId}";
        const isLocalSideloadingConfiguration: boolean = (
          debugConfiguration.url as string
        ).includes(localTeamsAppIdPlaceholder);
        const teamsAppIdPlaceholder = "${teamsAppId}";
        const isSideloadingConfiguration: boolean = (debugConfiguration.url as string).includes(
          teamsAppIdPlaceholder
        );

        if (!isLocalSideloadingConfiguration && !isSideloadingConfiguration) {
          return debugConfiguration;
        }

        if (debugConfiguration.timeout === undefined) {
          debugConfiguration.timeout = 20000;
        }

        const debugConfig = await commonUtils.getDebugConfig(isLocalSideloadingConfiguration);

        // Put env and appId in `debugConfiguration` so debug handlers can retrieve it and send telemetry
        debugConfiguration.teamsfxEnv = debugConfig?.env;
        debugConfiguration.teamsfxAppId = debugConfig?.appId;
        /* eslint-disable  @typescript-eslint/no-non-null-asserted-optional-chain */
        debugConfiguration.url = (debugConfiguration.url as string).replace(
          isLocalSideloadingConfiguration ? localTeamsAppIdPlaceholder : teamsAppIdPlaceholder,
          debugConfig?.appId!
        );
        /* eslint-enable  @typescript-eslint/no-non-null-asserted-optional-chain */

        const accountHintPlaceholder = "${account-hint}";
        const isaccountHintConfiguration: boolean = (debugConfiguration.url as string).includes(
          accountHintPlaceholder
        );
        if (isaccountHintConfiguration) {
          let tenantId = undefined,
            loginHint = undefined;
          try {
            const tokenObject = (await AppStudioTokenInstance.getStatus())?.accountInfo;
            if (tokenObject) {
              // user signed in
              tenantId = tokenObject.tid;
              loginHint = tokenObject.upn;
            } else {
              // no signed user
              tenantId = commonUtils.getTeamsAppTenantId();
              loginHint = "login_your_m365_account"; // a workaround that user has the chance to login
            }
          } catch {
            // ignore error
          }
          if (tenantId && loginHint) {
            debugConfiguration.url = (debugConfiguration.url as string).replace(
              accountHintPlaceholder,
              `appTenantId=${tenantId}&login_hint=${loginHint}`
            );
          } else {
            debugConfiguration.url = (debugConfiguration.url as string).replace(
              accountHintPlaceholder,
              ""
            );
          }
        }
      }
    } catch (err) {
      // TODO(kuojianlu): add log and telemetry
    } finally {
      return debugConfiguration;
    }
  }
}
