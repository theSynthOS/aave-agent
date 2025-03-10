import { 
    type Action, 
    type IAgentRuntime, 
    type Memory, 
    type ActionExample, 
    type HandlerCallback, 
    type State,
    // type Content,
    // ModelClass 
} from "@elizaos/core";
// import { initWalletProvider } from "../providers/wallet";

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

        const memories = await _runtime.messageManager.getMemoriesByRoomIds({roomIds: [_message.roomId]});

        let userAddress = "";
        for (const memory of memories) {
            if (memory.content.actions === "GET_USER_WALLET") {
                userAddress = memory.content.wallet as string;
            }
        }

        if (!userAddress) {
            return false;
        }

//         const walletProvider = await initWalletProvider(_runtime);
//         const address = walletProvider.getAddress();
            
//         // TODO: Create a multisig wallet for the user
//         const data = await fetch("http://localhost:3001/wallet/create", {
//             method: "POST",
//             body: JSON.stringify({
//                 agentId: _runtime.agentId,
//                 agentAddress: address,
//                 address: userAddress,
//             }),
//         });

//         const response = await data.json();
//         console.log(response);

//         if (response.error) {
//             return false;
//         }

//         // Create a structured message instead of using generateText
//         const multisigAddress = response.address; // assuming the response includes the multisig address
//         const formattedResponse = `Great news! I've successfully created a new multisig wallet for you. 
// Here are the details:
// - Multisig Wallet Address: ${multisigAddress}
// - Status: Successfully created and deployed
// - Connected to your address: ${userAddress}

// You can now use this multisig wallet for secure transactions. Would you like to know what you can do with it?`;

//         const newMemory: Memory = {
//             userId: _message.agentId,
//             agentId: _message.agentId,
//             roomId: _message.roomId,
//             content: {
//                 text: formattedResponse,
//                 actions: "CREATE_MULTISIG",
//             } as Content,
//         };

//         await _runtime.messageManager.createMemory(newMemory);

        _callback({
            text: "Multisig wallet created successfully",
        })

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
