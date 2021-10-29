module userAssignedIdentityProvision '{{PluginOutput.fx-resource-identity.Modules.identityProvision.ProvisionPath}}' = {
  name: 'userAssignedIdentityProvision'
  params: {
    provisionParameters: provisionParameters
  }
}

output identityOutput object = {
  teamsFxPluginId: 'fx-resource-identity'
  identityName: userAssignedIdentityProvision.outputs.identityName
  identityResourceId: userAssignedIdentityProvision.outputs.identityResourceId
  identityClientId: userAssignedIdentityProvision.outputs.identityClientId
}
