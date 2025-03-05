import { type Action, type IAgentRuntime, type Memory, type ActionExample, type HandlerCallback, type State, generateText, ModelClass } from "@elizaos/core";
import { createPublicClient, http } from 'viem'
import { scrollSepolia } from 'viem/chains'
import { AaveV3PoolAddress, assets } from "./constant/aave";

export const createMultisigAction: Action = {
    name: "CREATE_MULTISIG",
    similes: ["CREATE_MULTISIG", "START_PLAN", "EXECUTE_PLAN"],
    validate: async (_runtime: IAgentRuntime, _message: Memory) => {
        return true;
    },
    description:
        "Create a multisig wallet for the user based on the user's criteria once a user had choosen the asset to invest in",
    handler: async ( _runtime: IAgentRuntime,
        _message: Memory,
        _state: State,
        _options: { [key: string]: unknown },
        _callback: HandlerCallback): Promise<boolean> => {
            
        // 
        return true;
    },
    examples: [
        [
            {
                user: "{{user1}}",
                content: { text: "Hey i would like to know whats the best investment i should make on AAVE" },
            },
            {
                user: "{{user2}}",
                content: { text: "Let me check for you", action: "GET_AAVE_DATA" },
            },
            {
                user: "{{user2}}",
                content: { text: "Based on the data i have, i would recommend you to invest in {{result}}", action: "NONE" },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: { text: "Hey i would like to know whats the best investment i should make on AAVE", action: "GET_AAVE_DATA" },
            },
        ]
    ] as ActionExample[][],
} as Action;
