module botProvision '\{{PluginOutput.fx-resource-bot.Modules.botProvision.Path}}' = {
  name: 'botProvision'
  params: {
    botServerfarmsName: bot_serverfarmsName
    botServiceName: bot_serviceName
    botAadClientId: bot_aadClientId
    botDisplayName: bot_displayName
    botServiceSKU: bot_serviceSKU
    botWebAppName: bot_sitesName
    botWebAppSKU: bot_webAppSKU
    {{#contains 'fx-resource-identity' Plugins}}
    identityResourceId: \{{PluginOutput.fx-resource-identity.Outputs.identityResourceId}}
    {{/contains}}
  }
}
module botConfiguration '\{{PluginOutput.fx-resource-bot.Modules.botConfiguration.Path}}' = {
  name: 'botConfiguration'
  dependsOn: [
    botProvision
  ]
  params: {
    botAadClientId: bot_aadClientId
    botAadClientSecret: bot_aadClientSecret
    botServiceName: bot_serviceName
    botWebAppName: bot_sitesName
    authLoginUriSuffix: authLoginUriSuffix
    botEndpoint: botProvision.outputs.botWebAppEndpoint
    m365ApplicationIdUri: m365ApplicationIdUri
    m365ClientId: m365ClientId
    m365ClientSecret: m365ClientSecret
    m365TenantId: m365TenantId
    m365OauthAuthorityHost: m365OauthAuthorityHost
    {{#contains 'fx-resource-function' Plugins}}
    functionEndpoint: \{{PluginOutput.fx-resource-function.Outputs.functionEndpoint}}
    {{/contains}}
    {{#contains 'fx-resource-azure-sql' Plugins}}
    sqlDatabaseName: \{{PluginOutput.fx-resource-azure-sql.Outputs.databaseName}}
    sqlEndpoint: \{{PluginOutput.fx-resource-azure-sql.Outputs.sqlEndpoint}}
    {{/contains}}
    {{#contains 'fx-resource-identity' Plugins}}
    identityClientId: \{{PluginOutput.fx-resource-identity.Outputs.identityClientId}}
    {{/contains}}
  }
}
