// Resources web app
module azureWebAppProvision './provision/azureWebApp.bicep' = {
  name: 'azureWebAppProvision'
  params: {
    provisionParameters: provisionParameters
  }
}


output azureWebAppOutput object = {
  componentId: 'azure-web-app'
  sku: azureWebAppProvision.outputs.sku
  appName: azureWebAppProvision.outputs.appName
  domain: azureWebAppProvision.outputs.domain
  appServicePlanName: azureWebAppProvision.outputs.appServicePlanName
  resourceId: azureWebAppProvision.outputs.resourceId
  endpoint: azureWebAppProvision.outputs.endpoint
}