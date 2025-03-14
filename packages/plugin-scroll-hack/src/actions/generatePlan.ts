import { 
    type Action, 
    type IAgentRuntime, 
    type Memory, 
    type ActionExample, 
    type HandlerCallback, 
    type State,
    Content,
    ModelClass,
    generateText,
} from "@elizaos/core";
import { initWalletProvider } from "../providers/wallet";

export const generatePlanAction: Action = {
    name: "GENERATE_PLAN",
    similes: ["GENERATE_PLAN", "CREATE_PLAN", "EXECUTION_PLAN"],
    validate: async (_runtime: IAgentRuntime, _message: Memory) => {
        return true;
    },
    description:
        "Generate a plan for the user based on the user's criteria once a user had choosen the asset to invest in",
    handler: async (
        _runtime: IAgentRuntime,
        _message: Memory,
        _state: State,
        _options: { [key: string]: unknown },
        _callback: HandlerCallback): Promise<boolean> => {

       try {
        // get the user's criteria
        const userCriteriaPayload = await generateText({
            runtime: _runtime,
            modelClass: ModelClass.LARGE,
            context: "Generate a plan for the user based on the user's criteria once a user had choosen the asset to invest in",
        });
       }catch(error){
        console.error('[GENERATE_PLAN] Error:', error);
        return false;
       }
    },
    examples: [
        // Example 1: Standard flow where user already has wallet registered
        [
            {
                user: "{{user1}}",
                content: { text: "Hey i would like to know whats the best investment i should make on AAVE" },
            },
            {
                user: "{{user2}}",
                content: { text: "Based on the data i have, i would recommend you to invest in {{result}} would you like to create a multisig wallet for this?", action: "NONE" },
            },
            {
                user: "{{user1}}",
                content: { text: "Yes", action: "CREATE_MULTISIG" },
            },
            {
                user: "{{user2}}",
                content: { text: "Great news! I've successfully created a new multisig wallet for you. Here are the details: Multisig Wallet Address: 0xabc123, Status: Successfully created and deployed, Connected to your address: 0x456def. You can now use this multisig wallet for secure transactions. Would you like to know what you can do with it?", action: "CREATE_MULTISIG" },
            }
        ],
        // Example 2: Flow where user needs to provide wallet first
        [
            {
                user: "{{user1}}",
                content: { text: "I want to create a multisig wallet", action: "CREATE_MULTISIG" },
            },
            {
                user: "{{user2}}",
                content: { text: "Could you give me your wallet address? (I need it to create a multisig wallet for you)", action: "NONE" },
            },
            {
                user: "{{user1}}",
                content: { text: "0x1234567890abcdef", action: "GET_USER_WALLET" },
            },
            {
                user: "{{user2}}",
                content: { text: "Great news! I've successfully created a new multisig wallet for you. Here are the details: Multisig Wallet Address: 0x9876543210fedcba, Status: Successfully created and deployed, Connected to your address: 0x1234567890abcdef. You can now use this multisig wallet for secure transactions. Would you like to know what you can do with it?", action: "CREATE_MULTISIG" },
            }
        ],
        // Example 3: Flow starting from investment discussion
        [
            {
                user: "{{user1}}",
                content: { text: "What's the best way to invest in DeFi?", action: "NONE" },
            },
            {
                user: "{{user2}}",
                content: { text: "Based on your risk profile, I would recommend investing in Aave. Would you like to set up a multisig wallet for safer transactions?", action: "NONE" },
            },
            {
                user: "{{user1}}",
                content: { text: "Yes, that sounds good", action: "CREATE_MULTISIG" },
            },
            {
                user: "{{user2}}",
                content: { text: "I'll need your wallet address to create the multisig wallet. Could you please provide it?", action: "NONE" },
            },
            {
                user: "{{user1}}",
                content: { text: "Here it is: 0xdef456789", action: "GET_USER_WALLET" },
            },
            {
                user: "{{user2}}",
                content: { text: "Great news! I've successfully created a new multisig wallet for you. Here are the details: Multisig Wallet Address: 0xfed987654, Status: Successfully created and deployed, Connected to your address: 0xdef456789. You can now use this multisig wallet for secure transactions. Would you like to know what you can do with it?", action: "CREATE_MULTISIG" },
            }
        ],
        // Example 4: Direct multisig creation with existing wallet
        [
            {
                user: "{{user1}}",
                content: { text: "Create a multisig wallet for me please", action: "CREATE_MULTISIG" },
            },
            {
                user: "{{user2}}",
                content: { text: "Great news! I've successfully created a new multisig wallet for you. Here are the details: Multisig Wallet Address: 0x123abc456, Status: Successfully created and deployed, Connected to your address: 0x789def012. You can now use this multisig wallet for secure transactions. Would you like to know what you can do with it?", action: "CREATE_MULTISIG" },
            }
        ]
    ] as ActionExample[][],
} as Action;
