// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { hooks } from "@feathersjs/hooks/lib";
import {
  ConfigFolderName,
  FxError,
  InputConfigsFolderName,
  Inputs,
  ok,
  Platform,
  ProjectSettingsFileName,
  Result,
  Stage,
} from "@microsoft/teamsfx-api";
import { assert } from "chai";
import sinon from "sinon";
import * as os from "os";
import * as path from "path";
import fs from "fs-extra";
import "mocha";
import mockedEnv, { RestoreFn } from "mocked-env";
import { CoreHookContext, isV2, NoProjectOpenedError, PathNotExistError } from "../../../src";
import { ContextInjectorMW, ProjectSettingsLoaderMW } from "../../../src/core/middleware";
import { MockProjectSettings, MockTools, randomAppName } from "../utils";

describe("Middleware - ProjectSettingsLoaderMW, ContextInjectorMW: part 1", () => {
  class MyClass {
    async getQuestions(
      stage: Stage,
      inputs: Inputs,
      ctx?: CoreHookContext
    ): Promise<Result<any, FxError>> {
      assert.isTrue(ctx !== undefined && ctx.projectSettings === undefined);
      return ok("");
    }
    async other(inputs: Inputs, ctx?: CoreHookContext): Promise<Result<any, FxError>> {
      assert.isTrue(ctx !== undefined && ctx.projectSettings === undefined);
      return ok("");
    }
  }
  hooks(MyClass, {
    getQuestions: [ProjectSettingsLoaderMW, ContextInjectorMW],
    other: [ProjectSettingsLoaderMW, ContextInjectorMW],
  });

  it("ignore loading project settings", async () => {
    const my = new MyClass();
    const inputs: Inputs = { platform: Platform.VSCode };
    await my.getQuestions(Stage.create, inputs);
    inputs.platform = Platform.CLI_HELP;
    await my.other(inputs);
    inputs.platform = Platform.VS;
    await my.other(inputs);
  });

  it("failed to load: NoProjectOpenedError, PathNotExistError", async () => {
    const my = new MyClass();
    const inputs: Inputs = { platform: Platform.VSCode };
    const res = await my.other(inputs);
    assert.isTrue(res.isErr() && res.error.name === NoProjectOpenedError().name);
    inputs.projectPath = path.join(os.tmpdir(), randomAppName());
    const res2 = await my.other(inputs);
    assert.isTrue(res2.isErr() && res2.error.name === PathNotExistError(inputs.projectPath).name);
  });
});

describe("Middleware - ProjectSettingsLoaderMW, ContextInjectorMW: part 2", () => {
  const sandbox = sinon.createSandbox();
  const appName = randomAppName();
  const projectSettings = MockProjectSettings(appName);
  const inputs: Inputs = { platform: Platform.VSCode };
  inputs.projectPath = path.join(os.tmpdir(), appName);
  const confFolderPath = path.resolve(inputs.projectPath, `.${ConfigFolderName}`);
  const settingsFiles = [
    path.resolve(confFolderPath, "settings.json"),
    path.resolve(confFolderPath, InputConfigsFolderName, ProjectSettingsFileName),
  ];

  beforeEach(() => {
    sandbox.stub<any, any>(fs, "readJson").callsFake(async (file: string) => {
      if (settingsFiles.includes(file)) return projectSettings;
      return undefined;
    });
    sandbox.stub<any, any>(fs, "pathExists").callsFake(async (file: string) => {
      if (settingsFiles.includes(file)) return true;
      if (inputs.projectPath === file) return true;
      return false;
    });
  });

  afterEach(() => {
    sandbox.restore();
  });
  const EnvParams = [
    { TEAMSFX_APIV2: "false", TEAMSFX_INSIDER_PREVIEW: "false" },
    { TEAMSFX_APIV2: "false", TEAMSFX_INSIDER_PREVIEW: "true" },
    { TEAMSFX_APIV2: "true", TEAMSFX_INSIDER_PREVIEW: "false" },
    { TEAMSFX_APIV2: "true", TEAMSFX_INSIDER_PREVIEW: "true" },
  ];
  for (const param of EnvParams) {
    describe(`Multi-Env: ${param.TEAMSFX_INSIDER_PREVIEW}, API V2:${param.TEAMSFX_APIV2}`, () => {
      let mockedEnvRestore: RestoreFn;
      beforeEach(() => {
        mockedEnvRestore = mockedEnv(param);
      });

      afterEach(() => {
        mockedEnvRestore();
      });
      class MyClass {
        tools = new MockTools();
        async other(inputs: Inputs, ctx?: CoreHookContext): Promise<Result<any, FxError>> {
          assert.isTrue(ctx !== undefined);
          if (ctx) {
            assert.deepEqual(projectSettings, ctx.projectSettings);
            if (isV2()) {
              assert.isTrue(ctx.contextV2 !== undefined);
            }
          }
          return ok("");
        }
      }
      hooks(MyClass, {
        other: [ProjectSettingsLoaderMW, ContextInjectorMW],
      });
      it(`success to load project settings`, async () => {
        const my = new MyClass();
        const res = await my.other(inputs);
        assert.isTrue(res.isOk() && res.value === "");
      });

      it(`case when missing activeEnvironment`, async () => {
        const my = new MyClass();
        delete projectSettings.activeEnvironment;
        const res = await my.other(inputs);
        if (param.TEAMSFX_INSIDER_PREVIEW === "true") {
          assert.isTrue(
            res.isErr() &&
              res.error.message.includes(
                `activeEnvironment is missing or not a string in ${ProjectSettingsFileName}`
              )
          );
        } else {
          assert.isTrue(res.isOk());
        }
        projectSettings.activeEnvironment = "dev";
      });
    });
  }
});
