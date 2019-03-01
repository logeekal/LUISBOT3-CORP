//import { WaterfallBot } from '../waterfall-bot/bot';
/**
 * This is a bot which forms Waterfall dialog as well as LUIS Contacts
 * 
 * For EAch intent i have created a waterfall dialog to collect all the Entities..
 * Once i have all the entities, condition in the intent will be corrected and IT will produce the result.
 * 
 */
//import { UserProfile } from '../my-complex-dialog-bot/dialogs/greeting/userProfile';


//import { WaterfallBot } from '../waterfall-bot/bot';
//import { ConversationState } from 'botbuilder';
const { ActivityTypes } = require('botbuilder');
const { LuisRecognizer } = require('./node_modules/botbuilder-ai');
const { DialogSet, WaterfallDialog, TextPrompt, DialogTurnStatus, WaterFallStepInfo, ChoicePrompt} = require('botbuilder-dialogs');
const fs = require('fs');
const path = require('path');

const DIALOG_STATE_PROP = 'dialogProp';
const USER_PROFILE_PROP = 'userProfile'
const TICKET_PRIORITY_CHOICES = ['High','Medium','Low'];




const TICKET_PROMPT = 'ticket_prompt';
const CASE_FIND_DIALOG = 'case_find_dialog';
const USER_INFO = 'user_info';
const CASE_CREATION = 'case_creation';
const TICKET_SUMMARY = 'ticket_summary';
const TICKET_PRIORITY = 'ticket_priority';
const GREETINGS = 'greetings';
const NAME_PROMPT = 'namePrompt';
const case_creation_dialogs = [CASE_CREATION, TICKET_PRIORITY, TICKET_SUMMARY];
const TICKET_FILE_NAME = 'ticketDetails.json';
const TICKER_DIR = path.join(__dirname, 'database');


/*
    A Simple bot that responds to utterances with answers from
    LUIS.

    if an answer is not found for an utterance, the bot responds 

*/

class LuisBot {

    /**
     * LuisBot Constructor will need one argument i.e. application
     * which is used to create the instance of LuisRecognizer.
     * 
     * @param {LuisApplication}
     * @param {LuisPrediction options}
     */
    constructor(application, luisPredOptions, includeApiResults, userState, convState) {
        this.luisRecog = new LuisRecognizer(application, luisPredOptions, true);

        this.activeDialog = '';
        //create the state property accessors
        this.dialogState = convState.createProperty(DIALOG_STATE_PROP);
        this.userProfileAccesor = userState.createProperty(USER_PROFILE_PROP);

        this.userState = userState;
        this.convState = convState;

        this.dialogSet = new DialogSet(this.dialogState);

        this.dialogSet.add(new TextPrompt(TICKET_PROMPT));
        this.dialogSet.add(new TextPrompt(TICKET_SUMMARY));
        this.dialogSet.add(new ChoicePrompt(TICKET_PRIORITY));
        this.dialogSet.add(new TextPrompt(NAME_PROMPT));


        this.dialogSet.add(new WaterfallDialog(CASE_FIND_DIALOG, [
            this.getTicketNumber.bind(this),
            this.sendTicketStatus.bind(this)
        ]));

        this.caseCreationDialog = new WaterfallDialog(CASE_CREATION, [
            this.getCaseSummary.bind(this),
            this.getPriority.bind(this),
            this.createCase.bind(this)
        ]);

        this.dialogSet.add(this.caseCreationDialog);

        this.dialogSet.add(new WaterfallDialog(GREETINGS, [
            this.getName.bind(this),
            this.acknowledgeName.bind(this)
        ]));

        this.currCaseDetails = {};
        this.caseDetais = {};

    }

    async writeToFile(fileName, dir, string, mode) {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir);
        }
        fs.writeFileSync(path.join(dir, fileName), string);
    }
    async getName(step) {
        return await step.prompt(NAME_PROMPT, ' Before we Start can i please know your name?');
    }

    async acknowledgeName(step) {
        const userProfile = await this.userProfileAccesor.get(step.context, {});
        userProfile.name = step.result;
        await this.userProfileAccesor.set(step.context, userProfile);
        await this.userState.saveChanges(step.context);
        var createMessage = 'You can tell me if you are having issues and i will create a ticket for you';
        var searchMessage = 'If you have already created a ticket, I can help you with status of those tickets as well.';
        await step.context.sendActivity(`Thanks for the info, ***${userProfile.name}***. \n \n Go ahead and Tell me why are you here today. \n I \
                                        can help you with 2 things : \n\n **${createMessage}** \ 
                                        \n\n **${searchMessage}**
                                        \n\n Remember your ticket number starts with INC and you can type 'Show All' for the all tickets assigned to you.`);
        return await step.endDialog();
    }

    async getTicketNumber(step) {
        this.activeDialog = CASE_FIND_DIALOG;
        return await step.prompt(TICKET_PROMPT, `I will need ticket number to proceed. \
                                                 \
                                                 If you do not have the ticket/case number, you can write 'Show All' \
                                                 to see all of your tickets`);

    }

    async sendTicketStatus(step) {
        //await step.context.sendActivity(`you ticket ${step.result} has been resolved`);
        await this.searchTickets(step.context, step.result);
        return step.endDialog('END', () => { this.activeDialog = "" });
    }


    async searchTickets(turnContext, ticketNumber) {
        var ticket = ticketNumber.toUpperCase();
        var allTicketsString = await this.readFile(TICKER_DIR, TICKET_FILE_NAME);
        console.log(allTicketsString);
        var allTickets = JSON.parse(allTicketsString);
        var userProfile = await this.userProfileAccesor.get(turnContext, {});
        var returnText = '';
        var sorryText = '';

        if (allTickets.hasOwnProperty(ticket)) {
            returnText = `Here are the details of the ticket \
                          \n----------------------------------------------------------------------------     \
                                      \n Ticket # : ${ticket} \
                                      \n Summary  : ${allTickets[ticket].summary} \
                                      \n Priority : ${allTickets[ticket].priority} \
                          \n---------------------------------------------------------------------------`;
        }else
        {
            if (ticket !== 'SHOW ALL') {
                sorryText = 'I cannot find specified ticket number, here are all tickets raised by you.';
            }
            for (var key in allTickets) {
                if (allTickets[key].user === userProfile.name) {
                    returnText = returnText + `\n \
                                    \n----------------------------------------------------------------------------     \
                                                \n Ticket #  :   ${key} \
                                                \n Summary   :   ${allTickets[key].summary} \ 
                                                \n Priority  :   ${allTickets[key].priority} \
                                    \n---------------------------------------------------------------------------`;
                }
            }
        }

        if (returnText === '') {
            sorryText = 'I cannot find any active ticket raised by you.'
        }
        return await turnContext.sendActivity(sorryText + returnText);

    }

    async searchEntities(luisEntities, searchKey, searchValue) {
        //this will search for a particular key and value
        var i = 0;
        let currObj;
        for (i = 0; luisEntities.length > i; i += 1) {
            currObj = luisEntities[i];
            if (searchKey in currObj) {
                if (currObj[searchKey] == searchValue) {
                    return { exists: true, index: i };
                }
            }
        }
        return { exists: false, index: -1 };
    }

    async getCaseSummary(step) {
        if ('summary' in this.currCaseDetails) {
            await step.next(this.currCaseDetails['summary']);
        } else {
            return await step.prompt(TICKET_SUMMARY, 'It looks like you want to create a case.\n Please enter the summary of the ticket you want to enter');
        }
    }

    async getPriority(step) {
        this.currCaseDetails['summary'] = step.result;
        if ('priority' in this.currCaseDetails) {
            await step.next(this.currCaseDetails['priotiy']);
        } else {
            return await step.prompt(TICKET_PRIORITY, {
                prompt : 'Please enter the priority of the ticket.',
                retryPrompt : 'Please choose the right choice.',
                choices :   TICKET_PRIORITY_CHOICES
            });
        }
    }


    async readFile(dir, fileName) {
        var result = fs.readFileSync(path.join(dir, fileName));
        return result;
    }


    async createCase(step) {
        this.currCaseDetails['priority'] = step.result.value;
        const userProfile = await this.userProfileAccesor.get(step.context, {});
        this.currCaseDetails['user'] = userProfile.name;
        var ticketNumPart = Math.floor(Math.random(10000) * 10000);
        var ticketFullNum = `INC${ticketNumPart}`;
        // this.caseDetais = {};
        //this.caseDetais[ticketFullNum] = this.currCaseDetails;

        //Read current JSON tickets

        var ticketDetails = await this.readFile(TICKER_DIR, TICKET_FILE_NAME);

        var ticketDetailsJson = await JSON.parse(ticketDetails);

        ticketDetailsJson[ticketFullNum] = this.currCaseDetails;

        await this.writeToFile(TICKET_FILE_NAME, TICKER_DIR, JSON.stringify(ticketDetailsJson));
    //  await step.context.sendActivity(`Your case has been create with : \n\nSummary : ${this.currCaseDetails['summary']} \n and \nPriority : ${this.currCaseDetails['priority']}.\nYou're ticket/Casse number is ${ticketFullNum}`);
        await this.searchTickets(step.context,ticketFullNum);
        this.currCaseDetails = {};
        return await step.endDialog();
    }

    /**
     * Every conversation turn calls this method.
     * @param {turnContext of type TurnContext}
     */
    async onTurn(turnContext) {
        //By checking the incoming activity Type, 
        //the bot only calls Luis in appropriate cases.
        const userProfile = await this.userProfileAccesor.get(turnContext, {});
        const dialogContext = await this.dialogSet.createContext(turnContext, { promptedForName: false });
        console.log(`${turnContext.activity.type} detected`);
        //On azure when conversation starts only bot is the active member but when running on emulator, you are the first person.
        //Hence, for azure deployment, changing !== to === to make sure that greeting runs as soon as Bot joins the conversation.
        //for emulator !== should be used.
        if (turnContext.activity.type === ActivityTypes.ConversationUpdate && turnContext.activity.recipient.id === turnContext.activity.membersAdded[0].id) {
            //Sends greetings.
            //await turnContext.sendActivity('Hey! Robo here.. Please let me know how can i help you today.');
            if (!userProfile.name) {
                if (!dialogContext.promptedForName) {
                    await dialogContext.beginDialog(GREETINGS);
                    dialogContext.promptedForName = true;
                    this.convState.saveChanges(turnContext);
                    return;
                } else {
                    await dialogContext.continueDialog();
                    dialogContext.promptedForName = false
                    return;
                }
            }
            //console.log('pass');


        }else if(turnContext.activity.type === ActivityTypes.ConversationUpdate){
            return;
        }
         else if (turnContext.activity.type === ActivityTypes.Message)  {
            if (['cancel', 'stop'].includes(turnContext.activity.text.toLowerCase())) {
                dialogContext.cancelAllDialogs();
                this.convState.saveChanges(turnContext);
                return;
            }
            const response = await dialogContext.continueDialog();
            switch (response.status) {
                case DialogTurnStatus.waiting:
                    this.convState.saveChanges(turnContext);
                    return;
                case DialogTurnStatus.complete:
                    this.convState.saveChanges(turnContext);
                    return;
            }

            //Perform Luis Search
            const result = await this.luisRecog.recognize(turnContext);
            const entities = result.luisResult.entities;
            const topIntent = result.luisResult.topScoringIntent;

            console.log(topIntent.intent);
            var currIntent = topIntent.intent;

            switch (currIntent) {

                case 'Case-Find':
                    /*
                    Validate if you got all the entities for finding the case
                    Entities required for finding the status are :
                    1. Incident Number
                    2. Owner Number
                    // checking the incident number now
                    */
                    if (this.activeDialog !== CASE_FIND_DIALOG) {
                        dialogContext.endActiveDialog();
                    }
                    var ticketDetails = await this.searchEntities(result.luisResult.entities, 'type', 'Ticket Details');
                    console.log(ticketDetails);
                    console.log(entities);
                    if (ticketDetails.exists) {

                        await this.searchTickets(turnContext, entities[ticketDetails.index].entity);
                    } else {
                        if (turnContext.activity.text.toLowerCase() === 'show all') {
                            await this.searchTickets(turnContext, 'show all');
                        } else {
                            await dialogContext.beginDialog(CASE_FIND_DIALOG);
                        }
                    }
                    break;
                case 'Case-Creation':
                    /**
                     * first make the list of entities you need.
                     * 1 We need a problem statement
                     * 2 We need a Case/Ticket priority
                     * 
                     * Once we have the list, we will create a dialog accordingly
                     *  
                     *  */
                    if (this.activeDialog in case_creation_dialogs) {
                        await dialogContext.continueDialog();
                    } else {
                        await dialogContext.endActiveDialog();
                    }


                    var ticketSummary = await this.searchEntities(result.luisResult.entities, 'type', 'TicketSummary');
                    var ticketPriority = await this.searchEntities(result.luisResult.entities, 'type', 'TicketPriority');
                    if (ticketSummary.exists) {
                        this.currCaseDetails['summary'] = entities[ticketSummary.index].entity;
                    }
                    if (ticketPriority.exists) {
                        this.currCaseDetails['priority'] = entities[ticketPriority.index].entity;
                    }
                    await dialogContext.beginDialog(CASE_CREATION);
                    break;
                case 'ThanksReply':
                    /**
                     * It will just ackloeged the user is being helped
                     */
                    await turnContext.sendActivity('Anything else i may help you with.');
                    break;
                case 'None':
                    await turnContext.sendActivity(`I didn't understand it.\nCould you please be more detailed?`);
                    break;
            }

            this.convState.saveChanges(turnContext);

        } else if (turnContext.activity.type !== ActivityTypes.ConversationUpdate) {
            await turnContext.sendActivity(`[${turnContext.activity.type}]-type activity detected.`);
        }

    }



}

module.exports.LuisBot = LuisBot;