// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
"use strict";

import { ProductName } from "@microsoft/teamsfx-api";
import { ProgrammingLanguage } from "./constants";

export function generateTasks(
  includeFrontend: boolean,
  includeBackend: boolean,
  includeBot: boolean,
  includeAuth: boolean,
  isMigrateFromV1: boolean,
  programmingLanguage: string
): Record<string, unknown>[] {
  /**
   * Referenced by launch.json
   *   - Pre Debug Check
   *   - Start Frontend
   *   - Start Backend
   *   - Start Bot
   *
   * Referenced inside tasks.json
   *   - dependency check
   *   - start ngrok
   *   - prepare dev env
   *   - prepare local environment
   *   - frontend npm install
   *   - backend npm install
   *   - backend extensions install
   *   - bot npm install
   */
  const tasks: Record<string, unknown>[] = [preDebugCheck(includeBot, isMigrateFromV1)];
  if (!isMigrateFromV1) {
    tasks.push(dependencyCheck());
  }

  if (includeBot) {
    tasks.push(startNgrok());
  }
  tasks.push(prepareDevEnv(includeFrontend, includeBackend), prepareLocalEnvironment());
  if (includeFrontend) {
    tasks.push(startFrontend(includeAuth), frontendNpmInstall());
    if (includeBackend) {
      tasks.push(
        startBackend(programmingLanguage),
        backendExtensionsInstall(),
        backendNpmInstall()
      );
    }
  }
  if (includeBot) {
    tasks.push(startBot(), botNpmInstall());
  }

  return tasks;
}

export function generateInputs(): Record<string, unknown>[] {
  // call terminate with terminateAll args in input to not require user to select which task(s) to terminate
  return [
    {
      id: "terminate",
      type: "command",
      command: "workbench.action.tasks.terminate",
      args: "terminateAll",
    },
  ];
}

export function generateSpfxTasks(): Record<string, unknown>[] {
  return [
    {
      label: "dependency check",
      type: "shell",
      command: "echo ${command:fx-extension.validate-spfx-dependencies}",
    },
    {
      label: "spfx npm install",
      type: "shell",
      command: "npm install",
      options: {
        cwd: "${workspaceFolder}/SPFx",
      },
      dependsOn: "dependency check",
    },
    {
      label: "gulp trust-dev-cert",
      type: "process",
      command: "node",
      args: ["${workspaceFolder}/SPFx/node_modules/gulp/bin/gulp.js", "trust-dev-cert"],
      options: {
        cwd: "${workspaceFolder}/SPFx",
      },
      dependsOn: "spfx npm install",
    },
    {
      label: "gulp serve",
      type: "process",
      command: "node",
      args: ["${workspaceFolder}/SPFx/node_modules/gulp/bin/gulp.js", "serve", "--nobrowser"],
      problemMatcher: [
        {
          pattern: [
            {
              regexp: ".",
              file: 1,
              location: 2,
              message: 3,
            },
          ],
          background: {
            activeOnStart: true,
            beginsPattern: "^.*Starting gulp.*",
            endsPattern: "^.*Finished subtask 'reload'.*",
          },
        },
      ],
      isBackground: true,
      options: {
        cwd: "${workspaceFolder}/SPFx",
      },
      dependsOn: "gulp trust-dev-cert",
    },
    {
      label: "prepare local environment",
      type: "shell",
      command: "echo ${command:fx-extension.pre-debug-check}",
    },
    {
      label: "prepare dev env",
      dependsOn: ["prepare local environment", "gulp serve"],
      dependsOrder: "parallel",
    },
    {
      label: "Terminate All Tasks",
      command: "echo ${input:terminate}",
      type: "shell",
      problemMatcher: [],
    },
  ];
}

function preDebugCheck(includeBot: boolean, isMigrateFromV1: boolean): Record<string, unknown> {
  return {
    label: "Pre Debug Check",
    dependsOn: includeBot
      ? isMigrateFromV1
        ? ["start ngrok", "prepare dev env"]
        : ["dependency check", "start ngrok", "prepare dev env"]
      : isMigrateFromV1
      ? ["prepare dev env"]
      : ["dependency check", "prepare dev env"],
    dependsOrder: "sequence",
  };
}

function dependencyCheck(): Record<string, unknown> {
  return {
    label: "dependency check",
    type: "shell",
    command: "echo ${command:fx-extension.validate-dependencies}",
  };
}

function prepareDevEnv(includeFrontend: boolean, includeBackend: boolean): Record<string, unknown> {
  const result = {
    label: "prepare dev env",
    dependsOn: ["prepare local environment"],
    dependsOrder: "parallel",
  };
  if (includeFrontend) {
    result.dependsOn.push("frontend npm install");
    if (includeBackend) {
      result.dependsOn.push("backend npm install");
    }
  }
  return result;
}

function prepareLocalEnvironment(): Record<string, unknown> {
  return {
    label: "prepare local environment",
    type: "shell",
    command: "echo ${command:fx-extension.pre-debug-check}",
  };
}

function startFrontend(includeAuth: boolean): Record<string, unknown> {
  return {
    label: "Start Frontend",
    dependsOn: includeAuth
      ? [`${ProductName}: frontend start`, `${ProductName}: auth start`]
      : [`${ProductName}: frontend start`],
    dependsOrder: "parallel",
  };
}

function startBackend(programmingLanguage: string): Record<string, unknown> {
  if (programmingLanguage === ProgrammingLanguage.typescript) {
    return {
      label: "Start Backend",
      dependsOn: [`${ProductName}: backend watch`, `${ProductName}: backend start`],
      dependsOrder: "sequence",
    };
  } else {
    return {
      label: "Start Backend",
      dependsOn: `${ProductName}: backend start`,
    };
  }
}

function startBot(): Record<string, unknown> {
  return {
    label: "Start Bot",
    dependsOn: `${ProductName}: bot start`,
  };
}

function startNgrok(): Record<string, unknown> {
  return {
    label: "start ngrok",
    type: ProductName,
    command: "ngrok start",
    isBackground: true,
    dependsOn: ["bot npm install"],
  };
}

function frontendNpmInstall(): Record<string, unknown> {
  return {
    label: "frontend npm install",
    type: "shell",
    command: "npm install",
    options: {
      cwd: "${workspaceFolder}/tabs",
    },
  };
}

function backendNpmInstall(): Record<string, unknown> {
  return {
    label: "backend npm install",
    type: "shell",
    command: "npm install",
    options: {
      cwd: "${workspaceFolder}/api",
    },
    dependsOn: "backend extensions install",
  };
}

function backendExtensionsInstall(): Record<string, unknown> {
  return {
    label: "backend extensions install",
    type: "shell",
    command: "echo ${command:fx-extension.backend-extensions-install}",
  };
}

function botNpmInstall(): Record<string, unknown> {
  return {
    label: "bot npm install",
    type: "shell",
    command: "npm install",
    options: {
      cwd: "${workspaceFolder}/bot",
    },
  };
}
