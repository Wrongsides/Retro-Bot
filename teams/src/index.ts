import "dotenv/config";
import express from "express";
import {
  CloudAdapter,
  ConfigurationBotFrameworkAuthentication,
  ConfigurationBotFrameworkAuthenticationOptions,
} from "botbuilder";
import { config } from "./config.js";
import { TeamsRetroBot } from "./teamsBot.js";

const authConfig: ConfigurationBotFrameworkAuthenticationOptions = {
  MicrosoftAppType: config.microsoftAppType,
  MicrosoftAppId: config.microsoftAppId,
  MicrosoftAppPassword: config.microsoftAppPassword,
  MicrosoftAppTenantId: config.microsoftAppTenantId,
};

const botFrameworkAuthentication = new ConfigurationBotFrameworkAuthentication(authConfig);
const adapter = new CloudAdapter(botFrameworkAuthentication);

adapter.onTurnError = async (context, error) => {
  console.error("[onTurnError]", error);
  await context.sendActivity("Sorry, something went wrong processing that.");
};

const bot = new TeamsRetroBot();

const app = express();
app.use(express.json());

app.post("/api/messages", async (req, res) => {
  await adapter.process(req, res, (context) => bot.run(context));
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.listen(config.port, () => {
  console.log(`teams bot listening on port ${config.port} (POST /api/messages)`);
  console.log(`Proxying MCP tool calls to ${config.mcpServerUrl}`);
});

