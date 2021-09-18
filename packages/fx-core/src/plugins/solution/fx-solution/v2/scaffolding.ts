import {
  v2,
  Inputs,
  FxError,
  Result,
  ok,
  err,
  Void,
  AzureSolutionSettings,
} from "@microsoft/teamsfx-api";
import { getStrings, isMultiEnvEnabled } from "../../../../common/tools";
import {
  AzureResourceFunction,
  BotOptionItem,
  MessageExtensionItem,
  TabOptionItem,
} from "../question";
import { executeConcurrently, NamedThunk } from "./executor";
import {
  blockV1Project,
  combineRecords,
  getAzureSolutionSettings,
  getSelectedPlugins,
  fillInSolutionSettings,
} from "./utils";
import path from "path";
import fs from "fs-extra";
import { getTemplatesFolder } from "../../../..";
import { LocalSettingsProvider } from "../../../../common/localSettingsProvider";

export async function scaffoldSourceCode(
  ctx: v2.Context,
  inputs: Inputs
): Promise<Result<Void, FxError>> {
  const blockResult = blockV1Project(ctx.projectSetting.solutionSettings);
  if (blockResult.isErr()) {
    return err(blockResult.error);
  }
  const solutionSettings: AzureSolutionSettings = getAzureSolutionSettings(ctx);
  const fillinRes = fillInSolutionSettings(solutionSettings, inputs);
  if (fillinRes.isErr()) return err(fillinRes.error);
  const plugins = getSelectedPlugins(solutionSettings);

  const thunks: NamedThunk<Void>[] = plugins
    .filter((plugin) => !!plugin.scaffoldSourceCode)
    .map((plugin) => {
      return {
        pluginName: `${plugin.name}`,
        taskName: "scaffoldSourceCode",
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        thunk: () => plugin.scaffoldSourceCode!(ctx, inputs),
      };
    });

  const result = await executeConcurrently(thunks, ctx.logProvider);
  if (result.kind === "success") {
    const capabilities = solutionSettings.capabilities;
    const azureResources = solutionSettings.azureResources;

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    await scaffoldReadmeAndLocalSettings(capabilities, azureResources, inputs.projectPath!);

    ctx.userInteraction.showMessage(
      "info",
      `Success: ${getStrings().solution.ScaffoldSuccessNotice}`,
      false
    );
    return ok(Void);
  } else {
    return err(result.error);
  }
}

export async function scaffoldByPlugins(
  ctx: v2.Context,
  inputs: Inputs,
  plugins: v2.ResourcePlugin[]
): Promise<Result<Void, FxError>> {
  const blockResult = blockV1Project(ctx.projectSetting.solutionSettings);
  if (blockResult.isErr()) {
    return err(blockResult.error);
  }
  const thunks: NamedThunk<Void>[] = plugins
    .filter((plugin) => !!plugin.scaffoldSourceCode)
    .map((plugin) => {
      return {
        pluginName: `${plugin.name}`,
        taskName: "scaffoldSourceCode",
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        thunk: () => plugin.scaffoldSourceCode!(ctx, inputs),
      };
    });

  const result = await executeConcurrently(thunks, ctx.logProvider);
  const solutionSettings = getAzureSolutionSettings(ctx);
  if (result.kind === "success") {
    const capabilities = solutionSettings.capabilities;
    const azureResources = solutionSettings.azureResources;

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    await scaffoldReadmeAndLocalSettings(capabilities, azureResources, inputs.projectPath!);

    ctx.userInteraction.showMessage(
      "info",
      `Success: ${getStrings().solution.ScaffoldSuccessNotice}`,
      false
    );
    return ok(Void);
  } else {
    return err(result.error);
  }
}

export async function scaffoldReadmeAndLocalSettings(
  capabilities: string[],
  azureResources: string[],
  projectPath: string,
  migrateFromV1?: boolean
): Promise<void> {
  const hasBot = capabilities.includes(BotOptionItem.id);
  const hasMsgExt = capabilities.includes(MessageExtensionItem.id);
  const hasTab = capabilities.includes(TabOptionItem.id);
  if (hasTab && (hasBot || hasMsgExt)) {
    const readme = path.join(getTemplatesFolder(), "plugins", "solution", "README.md");
    if (await fs.pathExists(readme)) {
      await fs.copy(readme, `${projectPath}/README.md`);
    }
  }

  if (migrateFromV1) {
    const readme = path.join(getTemplatesFolder(), "plugins", "solution", "v1", "README.md");
    if (await fs.pathExists(readme)) {
      await fs.copy(readme, `${projectPath}/README.md`);
    }
  }

  const hasBackend = azureResources.includes(AzureResourceFunction.id);

  if (isMultiEnvEnabled()) {
    const localSettingsProvider = new LocalSettingsProvider(projectPath);
    const localSettings = await localSettingsProvider.load();

    if (localSettings !== undefined) {
      // Add local settings for the new added capability/resource
      await localSettingsProvider.save(
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        localSettingsProvider.incrementalInit(localSettings!, hasBackend, hasBot)
      );
    } else {
      // Initialize a local settings on scaffolding
      await localSettingsProvider.save(localSettingsProvider.init(hasTab, hasBackend, hasBot));
    }
  }
}
