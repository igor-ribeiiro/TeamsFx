{
  "Logging": {
    "LogLevel": {
      "Default": "Information",
      "Microsoft": "Warning",
      "Microsoft.Hosting.Lifetime": "Information"
    }
  },
  "AllowedHosts": "*"{{#IS_TAB}},
  "CLIENT_ID": "$clientId$",
  "CLIENT_SECRET": "$client-secret$",
  "IDENTIFIER_URI": "$identifierUri$",
  "TAB_APP_ENDPOINT": "$appEndPoint$",
  "OAUTH_AUTHORITY": "$oauthAuthority$",
  "AAD_METADATA_ADDRESS": "$aadMetadataAddress$",
  "ALLOWED_APP_IDS": "1fec8e78-bce4-4aaf-ab1b-5451cc387264;5e3ce6c0-2b1f-4285-8d4b-75ee78787346",
  "TeamsFx": {
    "Authentication": {
      "ClientId": "$clientId$",
      "SimpleAuthEndpoint": "$appEndPoint$",
      "InitiateLoginEndpoint": "$appEndPoint$auth-start.html"
    }
  }{{/IS_TAB}}{{#IS_BOT}},
  "BOT_ID": "$botId$",
  "BOT_PASSWORD": "$bot-password$"
{{/IS_BOT}}
}