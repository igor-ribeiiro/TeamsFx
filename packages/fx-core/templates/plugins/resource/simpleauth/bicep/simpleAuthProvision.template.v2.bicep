param provisionParameters object

var resourceBaseName = provisionParameters.resourceBaseName
var sku = contains(provisionParameters, 'simpleAuthSku') ? provisionParameters['simpleAuthSku'] : 'F1'
var serverFarmsName = contains(provisionParameters, 'simpleAuthServerFarmsName') ? provisionParameters['simpleAuthServerFarmsName'] : '${resourceBaseName}-simpleAuth-serverfarms'
var webAppName = contains(provisionParameters, 'simpleAuthWebAppName') ? provisionParameters['simpleAuthWebAppName'] : '${resourceBaseName}-simpleAuth-webapp'
var simpelAuthPackageUri = contains(provisionParameters, 'simpleAuthPackageUri') ? provisionParameters['simpleAuthPackageUri'] : 'https://github.com/OfficeDev/TeamsFx/releases/download/simpleauth@0.1.0/Microsoft.TeamsFx.SimpleAuth_0.1.0.zip'

resource serverFarms 'Microsoft.Web/serverfarms@2020-06-01' = {
  name: serverFarmsName
  location: resourceGroup().location
  sku: {
    name: sku
  }
  kind: 'app'
}

resource webApp 'Microsoft.Web/sites@2020-06-01' = {
  kind: 'app'
  name: webAppName
  location: resourceGroup().location
  properties: {
    serverFarmId: serverFarms.id
  }
}

resource simpleAuthDeploy 'Microsoft.Web/sites/extensions@2021-01-15' = {
  parent: webApp
  name: 'MSDeploy'
  properties: {
    packageUri: simpelAuthPackageUri
  }
}

output webAppResourceId string = webApp.id
output endpoint string = 'https://${webApp.properties.defaultHostName}'