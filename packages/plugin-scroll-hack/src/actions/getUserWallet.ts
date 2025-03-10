import { type Action, type IAgentRuntime, type Memory, type ActionExample, type HandlerCallback, type State, generateText, ModelClass, Content } from "@elizaos/core";

export const getUserWalletAction: Action = {
    name: "GET_USER_WALLET",
    similes: ["GET_USER_WALLET", "GET_WALLET", "GET_ADDRESS"],
    validate: async (_runtime: IAgentRuntime, _message: Memory) => {
        return true;
    },
    description:
        "Get the wallet of the user before creating a multisig wallet for the user",
    handler: async ( _runtime: IAgentRuntime,
        _message: Memory,
        _state: State,
        _options: { [key: string]: unknown },
        _callback: HandlerCallback): Promise<boolean> => {
        const promptGetWallet = await generateText({
            runtime: _runtime,
            modelClass: ModelClass.SMALL,
            context: `Get the wallet of the user from the message ${_message.content.text} and only return the wallet address and nothing else`,
        });

        if (!promptGetWallet) {
            return false;
        }

       // Store the wallet in memory
       const newMemory: Memory = {
            userId: _message.agentId,
            agentId: _message.agentId,
            roomId: _message.roomId,
            content: {
                text: promptGetWallet,
                actions: "GET_USER_WALLET",
                source: _message.content?.source,
                wallet: promptGetWallet,
            } as Content,
        };

        await _runtime.messageManager.createMemory(newMemory);


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
