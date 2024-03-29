// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

const path = require('path');
const restify = require('restify');
const { BotFrameworkAdapter, ConversationState, MemoryStorage, UserState } = require('botbuilder');
const { BotConfiguration } = require('botframework-config');
const { LuisBot } = require('./bot');
const { LuisRecognizer } = require('botbuilder-ai');

const req = require('request');

//using global tunnel to use proxy for nodejs to connect via proxy
// var globalTunnel = require('global-tunnel-ng');
// process.env.http_proxy = 'http://proxy.etn.com:8080';
// process.env.https_proxy = 'http://proxy.etn.com:8080';
// globalTunnel.initialize({
//     host    :   'proxy.etn.com',
//     port    :   '8080',
// });  

//create states
const memStorage = new MemoryStorage();

const userState =  new UserState(memStorage);
const convState =  new ConversationState(memStorage);


// Read botFilePath and botFileSecret from .env file.
// Note: Ensure you have a .env file and include botFilePath and botFileSecret.
const ENV_FILE = path.join(__dirname, '.env');
require('dotenv').config({ path: ENV_FILE });

// .bot file path.
const BOT_FILE = path.join(__dirname, (process.env.botFilePath || ''));
let botConfig;
try {
    // Read configuration from .bot file.
    botConfig = BotConfiguration.loadSync(BOT_FILE, process.env.botFileSecret);
} catch (err) {
    console.error(`\nError reading bot file. Please ensure you have valid botFilePath and botFileSecret set for your environment.`);
    console.error(`\n - The botFileSecret is available under appsettings for your Azure Bot Service bot.`);
    console.error(`\n - If you are running this bot locally, consider adding a .env file with botFilePath and botFileSecret.\n\n`);
    console.error(err.stack)
    process.exit();

}

// For local development configuration as defined in .bot file.
const DEV_ENVIRONMENT = 'development';

// Bot name as defined in .bot file or from runtime.
// See https://aka.ms/about-bot-file to learn more about .bot files.
const BOT_CONFIGURATION = (process.env.NODE_ENV || DEV_ENVIRONMENT);

// Language Understanding (LUIS) service name as defined in the .bot file.
const LUIS_CONFIGURATION = 'LuisBot';

if (!LUIS_CONFIGURATION) {
    console.error('Make sure to update the index.js file with a LUIS_CONFIGURATION name that matches your .bot file.');
    process.exit();
}

// Get endpoint and LUIS configurations by service name.
const endpointConfig = botConfig.findServiceByNameOrId(BOT_CONFIGURATION);
const luisConfig = botConfig.findServiceByNameOrId(LUIS_CONFIGURATION);

// Map the contents to the required format for `LuisRecognizer`.
const luisApplication = {
    applicationId: luisConfig.appId,
    // CAUTION: Authoring key is used in this example as it is appropriate for prototyping.
    // When implimenting for deployment/production, assign and use a subscription key instead of an authoring key.
    endpointKey: luisConfig.authoringKey,
    endpoint: luisConfig.getEndpoint()
};

// Create configuration for LuisRecognizer's runtime behavior.
const luisPredictionOptions = {
    includeAllIntents: true,
    log: true,
    staging: false
};

// Create adapter. See https://aka.ms/about-bot-adapter to learn more about adapters.
const adapter = new BotFrameworkAdapter({
    appId: endpointConfig.appId || process.env.MicrosoftAppId,
    appPassword: endpointConfig.appPassword || process.env.MicrosoftAppPassword
});

// Catch-all for errors.
adapter.onTurnError = async (context, error) => {
    console.error(`\n [onTurnError]: ${ error.stack }`);
    await context.sendActivity(`Oops. Something went wrong!`);
};

// Create the LuisBot.
let bot;
try {
    bot = new LuisBot(luisApplication, luisPredictionOptions, true, userState, convState);
} catch (err) {
    console.error(`[botInitializationError]: ${ err.stack }`);
    process.exit();
}

// Create HTTP server.
let server = restify.createServer();

//try to log the data.
// server.pre(function(req,res, next){
//     console.log("**********   New Request **********")
//     console.log("**********   New Request - HEADER **********")
//     console.log(req.headers);
//     console.log("**********   New Request - URL **********")
//     console.log(req.getHref());
//     //console.log(req);
//     console.log("**********  End Request **********")
// });
//Change ends.

server.listen(process.env.port || process.env.PORT || 3978, function() {
    console.log(`\n${ server.name } listening to ${ server.url }.`);
    console.log(`\nGet Bot Framework Emulator: https://aka.ms/botframework-emulator.`);
    console.log(`\nTo talk to your bot, open nlp-with-luis.bot file in the emulator.`);
});

// Listen for incoming requests.
server.post('/api/messages', (req, res) => {
    adapter.processActivity(req, res, async (turnContext    ) => {
        await bot.onTurn(turnContext);
    });
});


