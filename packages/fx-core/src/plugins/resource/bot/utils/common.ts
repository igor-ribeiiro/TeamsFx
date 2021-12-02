// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import { Base64 } from "js-base64";
import { Uuid } from "node-ts-uuid";
import { exec } from "child_process";
import { default as urlParse } from "url-parse";
import AdmZip from "adm-zip";

import { ConfigValue, PluginContext } from "@microsoft/teamsfx-api";
import { RegularExprs, WebAppConstants } from "../constants";
import { ProgrammingLanguage } from "../enums/programmingLanguage";
import * as appService from "@azure/arm-appservice";

export function toBase64(source: string): string {
  return Base64.encode(source);
}

export function genUUID(): string {
  return Uuid.generate();
}

export function zipAFolder(
  sourceDir: string,
  notIncluded?: string[],
  mustIncluded?: string[]
): Buffer {
  const zip = new AdmZip();
  zip.addLocalFolder(sourceDir, "", (filename: string) => {
    if (mustIncluded) {
      const hit = mustIncluded.find((mustItem) => {
        return filename.startsWith(mustItem);
      });

      if (hit) {
        return true;
      }
    }

    if (notIncluded) {
      const hit = notIncluded.find((notIncludedItem) => {
        return filename.startsWith(notIncludedItem);
      });

      return !hit;
    }

    return true;
  });

  return zip.toBuffer();
}

export function isValidWebAppSiteName(name: string): boolean {
  return RegularExprs.WEB_APP_SITE_NAME.test(name);
}

export function isValidAppServicePlanName(name: string): boolean {
  return RegularExprs.APP_SERVICE_PLAN_NAME.test(name);
}

export function isValidBotChannelRegName(name: string): boolean {
  return RegularExprs.BOT_CHANNEL_REG_NAME.test(name);
}

export function isDomainValidForAzureWebApp(url: string): boolean {
  return urlParse(url).hostname.endsWith(WebAppConstants.WEB_APP_SITE_DOMAIN);
}

export async function execute(command: string, workingDir?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!workingDir) {
      workingDir = __dirname;
    }
    exec(command, { cwd: workingDir }, (error, standardOutput) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(standardOutput);
    });
  });
}

export function checkAndSaveConfig(context: PluginContext, key: string, value: ConfigValue): void {
  if (!value) {
    return;
  }

  context.config.set(key, value);
}

export function existsInEnumValues<T extends string>(
  value: string,
  targetEnum: { [key: string]: T }
): boolean {
  return Object.values(targetEnum).find((itemValue: string) => value === itemValue) !== undefined;
}

export function isHttpCodeOkOrCreated(code: number): boolean {
  return [200, 201].includes(code);
}

export function convertToLangKey(programmingLanguage: ProgrammingLanguage): string {
  switch (programmingLanguage) {
    case ProgrammingLanguage.JavaScript: {
      return "js";
    }
    case ProgrammingLanguage.TypeScript: {
      return "ts";
    }
    default: {
      return "js";
    }
  }
}

export function convertToTelemetryName(raw: string): string {
  return raw.toLowerCase().replace(/ /g, "-");
}

export function generateAppServicePlanConfig(
  location: string,
  skuName: string
): appService.WebSiteManagementModels.AppServicePlan {
  return {
    location: location,
    kind: "app",
    sku: {
      name: skuName,
    },
  };
}
