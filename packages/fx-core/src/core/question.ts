// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import {
  FolderQuestion,
  OptionItem,
  Platform,
  SingleSelectQuestion,
  TextInputQuestion,
  FuncQuestion,
  Inputs,
} from "@microsoft/teamsfx-api";
import * as jsonschema from "jsonschema";
import * as path from "path";
import * as fs from "fs-extra";
import { environmentManager } from "./environment";

export enum CoreQuestionNames {
  AppName = "app-name",
  DefaultAppNameFunc = "default-app-name-func",
  Folder = "folder",
  Solution = "solution",
  CreateFromScratch = "scratch",
  Samples = "samples",
  Stage = "stage",
  SubStage = "substage",
  SourceEnvName = "sourceEnvName",
  TargetEnvName = "targetEnvName",
  TargetResourceGroupName = "targetResourceGroupName",
  NewResourceGroupName = "newResourceGroupName",
  NewResourceGroupLocation = "newResourceGroupLocation",
  NewTargetEnvName = "newTargetEnvName",
}

export const ProjectNamePattern = "^[a-zA-Z][\\da-zA-Z]+$";

export const QuestionAppName: TextInputQuestion = {
  type: "text",
  name: CoreQuestionNames.AppName,
  title: "Application name",
  validation: {
    validFunc: async (input: string, previousInputs?: Inputs): Promise<string | undefined> => {
      const folder = previousInputs![CoreQuestionNames.Folder] as string;
      if (!folder) return undefined;
      const schema = {
        pattern: ProjectNamePattern,
      };
      const appName = input as string;
      const validateResult = jsonschema.validate(appName, schema);
      if (validateResult.errors && validateResult.errors.length > 0) {
        return "Application name must start with a letter and can only contain letters and digits.";
      }
      const projectPath = path.resolve(folder, appName);
      const exists = await fs.pathExists(projectPath);
      if (exists) return `Path exists: ${projectPath}. Select a different application name.`;
      return undefined;
    },
  },
  placeholder: "Application name",
};

export const QuestionV1AppName: TextInputQuestion = {
  type: "text",
  name: CoreQuestionNames.AppName,
  title: "Application name",
  validation: {
    validFunc: async (input: string, previousInputs?: Inputs): Promise<string | undefined> => {
      const schema = {
        pattern: ProjectNamePattern,
      };
      const appName = input as string;
      const validateResult = jsonschema.validate(appName, schema);
      if (validateResult.errors && validateResult.errors.length > 0) {
        return "Application name must start with a letter and can only contain letters and digits.";
      }
      return undefined;
    },
  },
  placeholder: "Application name",
};

export const DefaultAppNameFunc: FuncQuestion = {
  type: "func",
  name: CoreQuestionNames.DefaultAppNameFunc,
  func: (inputs: Inputs) => {
    const appName = path.basename(inputs.projectPath ?? "");
    const schema = {
      pattern: ProjectNamePattern,
    };
    const validateResult = jsonschema.validate(appName, schema);
    if (validateResult.errors && validateResult.errors.length > 0) {
      return undefined;
    }

    return appName;
  },
};

export const QuestionRootFolder: FolderQuestion = {
  type: "folder",
  name: CoreQuestionNames.Folder,
  title: "Workspace folder",
};

export const QuestionSelectTargetEnvironment: SingleSelectQuestion = {
  type: "singleSelect",
  name: CoreQuestionNames.TargetEnvName,
  title: "Select an environment",
  staticOptions: [],
  skipSingleOption: true,
  forgetLastValue: true,
};

export function getQuestionNewTargetEnvironmentName(projectPath: string): TextInputQuestion {
  return {
    type: "text",
    name: CoreQuestionNames.NewTargetEnvName,
    title: "New environment name",
    validation: {
      validFunc: async (input: string): Promise<string | undefined> => {
        const targetEnvName = input as string;
        const match = targetEnvName.match(environmentManager.envNameRegex);
        if (!match) {
          return "Environment name can only contain letters, digits, _ and -.";
        }

        const envConfigs = await environmentManager.listEnvConfigs(projectPath);

        if (!envConfigs.isErr() && envConfigs.value!.indexOf(targetEnvName!) >= 0) {
          return `Project environment ${targetEnvName} already exists.`;
        }

        return undefined;
      },
    },
    placeholder: "New environment name",
  };
}

export const QuestionSelectSourceEnvironment: SingleSelectQuestion = {
  type: "singleSelect",
  name: CoreQuestionNames.SourceEnvName,
  title: "Select an environment to create copy",
  staticOptions: [],
  skipSingleOption: true,
  forgetLastValue: true,
};

export const QuestionSelectResourceGroup: SingleSelectQuestion = {
  type: "singleSelect",
  name: CoreQuestionNames.TargetResourceGroupName,
  title: "Select a resource group",
  staticOptions: [],
  skipSingleOption: true,
  forgetLastValue: true,
};

export const QuestionNewResourceGroupName: TextInputQuestion = {
  type: "text",
  name: CoreQuestionNames.NewResourceGroupName,
  title: "New resource group name",
  validation: {
    validFunc: async (input: string): Promise<string | undefined> => {
      const name = input as string;
      // https://docs.microsoft.com/en-us/rest/api/resources/resource-groups/create-or-update#uri-parameters
      const match = name.match(/^[-\w._()]+$/);
      if (!match) {
        return "The name can only contain alphanumeric characters or the symbols ._-()";
      }

      return undefined;
    },
  },
  placeholder: "New resource group name",
  // default resource group name will change with env name
  forgetLastValue: true,
};

export const QuestionNewResourceGroupLocation: SingleSelectQuestion = {
  type: "singleSelect",
  name: CoreQuestionNames.NewResourceGroupLocation,
  title: "Location for the new resource group",
  staticOptions: [],
};

export const QuestionSelectSolution: SingleSelectQuestion = {
  type: "singleSelect",
  name: CoreQuestionNames.Solution,
  title: "Select a solution",
  staticOptions: [],
  skipSingleOption: true,
};

export const ScratchOptionYesVSC: OptionItem = {
  id: "yes",
  label: "$(new-folder) Create a new Teams app",
  detail: "Use the Teams Toolkit to create a new application.",
};

export const ScratchOptionNoVSC: OptionItem = {
  id: "no",
  label: "$(heart) Start from a sample",
  detail: "Use an existing sample as a starting point for your new application.",
};

export const ScratchOptionYes: OptionItem = {
  id: "yes",
  label: "Create a new Teams app",
  detail: "Use the Teams Toolkit to create a new application.",
};

export const ScratchOptionNo: OptionItem = {
  id: "no",
  label: "Start from a sample",
  detail: "Use an existing sample as a starting point for your new application.",
};

export function getCreateNewOrFromSampleQuestion(platform: Platform): SingleSelectQuestion {
  return {
    type: "singleSelect",
    name: CoreQuestionNames.CreateFromScratch,
    title: "Teams Toolkit: Create a new Teams app",
    staticOptions:
      platform === Platform.VSCode
        ? [ScratchOptionYesVSC, ScratchOptionNoVSC]
        : [ScratchOptionYes, ScratchOptionNo],
    default: ScratchOptionYes.id,
    placeholder: "Select an option",
    skipSingleOption: true,
  };
}

export const SampleSelect: SingleSelectQuestion = {
  type: "singleSelect",
  name: CoreQuestionNames.Samples,
  title: "Start from a sample",
  staticOptions: [
    {
      id: "todo-list-with-Azure-backend",
      label: "Todo List with backend on Azure",
      detail: "Todo List app with Azure Function backend and Azure SQL database",
      data: "https://github.com/OfficeDev/TeamsFx-Samples/archive/refs/heads/main.zip",
    },
    {
      id: "todo-list-SPFx",
      label: "Todo List with SPFx",
      detail: "Todo List app hosting on SharePoint",
      data: "https://github.com/OfficeDev/TeamsFx-Samples/archive/refs/heads/main.zip",
    },
    {
      id: "share-now",
      label: "Share Now",
      detail: "Knowledge sharing app contains a Tab and a Message Extension",
      data: "https://github.com/OfficeDev/TeamsFx-Samples/archive/refs/heads/main.zip",
    },
    {
      id: "in-meeting-app",
      label: "In-meeting App",
      detail: "A template for apps using only in the context of a Teams meeting",
      data: "https://github.com/OfficeDev/TeamsFx-Samples/archive/refs/heads/main.zip",
    },
    {
      id: "faq-plus",
      label: "FAQ Plus",
      detail:
        "Conversational Bot which answers common questions, looping human when bots unable to help",
      data: "https://github.com/OfficeDev/TeamsFx-Samples/archive/refs/heads/main.zip",
    },
  ],
  placeholder: "Select a sample",
  returnObject: true,
};
