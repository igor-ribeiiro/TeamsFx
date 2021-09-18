// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import path from "path";
import { AzureSolutionSettings, PluginContext } from "@microsoft/teamsfx-api";
import { DependentPluginInfo, FrontendPathInfo } from "../constants";
import { InvalidTabLanguageError } from "./errors";
import { getTemplatesFolder } from "../../../..";
import { templatesVersion } from "../../../../common/templates";

export interface TemplateVariable {
  showFunction: boolean;
}

export class TabLanguage {
  static readonly JavaScript = "javascript";
  static readonly TypeScript = "typescript";
}

export class Scenario {
  static readonly Default = "default";
  static readonly WithFunction = "with-function";
}

export class TemplateInfo {
  group: string;
  language: string;
  scenario: string;
  version: string;
  localTemplateBaseName: string;
  localTemplatePath: string;
  variables: TemplateVariable;

  constructor(ctx: PluginContext) {
    this.group = TemplateInfo.TemplateGroupName;
    this.version = TemplateInfo.version;

    const tabLanguage =
      (ctx.projectSettings?.programmingLanguage as string) ?? TabLanguage.JavaScript;
    this.language = this.validateTabLanguage(tabLanguage);

    const selectedPlugins = (ctx.projectSettings?.solutionSettings as AzureSolutionSettings)
      .activeResourcePlugins;
    const isFunctionPlugin = selectedPlugins.some(
      (pluginName) => pluginName === DependentPluginInfo.FunctionPluginName
    );
    this.variables = {
      showFunction: isFunctionPlugin,
    };

    this.scenario = Scenario.Default;

    this.localTemplateBaseName = [this.group, this.language, this.scenario].join(".");
    this.localTemplatePath = path.join(
      getTemplatesFolder(),
      FrontendPathInfo.TemplateRelativeDir,
      this.localTemplateBaseName + FrontendPathInfo.TemplatePackageExt
    );
  }

  private validateTabLanguage(language: string): string {
    if (language.toLowerCase() === TabLanguage.JavaScript) {
      return "js";
    }

    if (language.toLowerCase() === TabLanguage.TypeScript) {
      return "ts";
    }

    throw new InvalidTabLanguageError();
  }

  static readonly TemplateGroupName = "tab";
  static readonly version = templatesVersion;
}
