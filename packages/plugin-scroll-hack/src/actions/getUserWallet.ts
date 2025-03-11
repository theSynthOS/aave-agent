import { type Action, type IAgentRuntime, type Memory, type ActionExample, type HandlerCallback, type State, generateText, ModelClass, Content } from "@elizaos/core";

// Add utility function to validate Ethereum addresses
const isValidEthereumAddress = (address: string): boolean => {
    // Check if it's a string and matches Ethereum address format (0x followed by 40 hex characters)
    const addressRegex = /^0x[a-fA-F0-9]{40}$/;
    return typeof address === 'string' && addressRegex.test(address);
};

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
            console.log('[GET_USER_WALLET] No wallet address found in message');
            return false;
        }

        // Clean the wallet address (remove spaces, new lines, etc)
        const cleanWalletAddress = promptGetWallet.trim();

        // Validate the wallet address
        if (!isValidEthereumAddress(cleanWalletAddress)) {
            console.log('[GET_USER_WALLET] Invalid Ethereum address format:', cleanWalletAddress);
            return false;
        }

        console.log('[GET_USER_WALLET] Valid Ethereum address found:', cleanWalletAddress);

        // Store the wallet in memory
        const newMemory: Memory = {
            userId: _message.agentId,
            agentId: _message.agentId,
            roomId: _message.roomId,
            content: {
                text: cleanWalletAddress,
                actions: "GET_USER_WALLET",
                source: _message.content?.source,
                wallet: cleanWalletAddress,
            } as Content,
        };

        await _runtime.messageManager.createMemory(newMemory);
        console.log('[GET_USER_WALLET] Stored wallet address in memory');

        return true;
    },
    examples: [
        // Example 1: Direct wallet address provision
        [
            {
                user: "{{user1}}",
                content: { text: "My wallet address is 0x1234567890abcdef", action: "GET_USER_WALLET" },
            },
            {
                user: "{{user2}}",
                content: { text: "Thank you, I've stored your wallet address.", action: "NONE" },
            }
        ],
        // Example 2: Wallet address in conversation context
        [
            {
                user: "{{user1}}",
                content: { text: "I want to create a multisig wallet", action: "CREATE_MULTISIG" },
            },
            {
                user: "{{user2}}",
                content: { text: "I'll need your wallet address first. Could you please provide it?", action: "NONE" },
            },
            {
                user: "{{user1}}",
                content: { text: "Sure, it's 0xabc123def456", action: "GET_USER_WALLET" },
            }
        ],
        // Example 3: Wallet address with additional context
        [
            {
                user: "{{user1}}",
                content: { text: "Please use my address 0x789abcdef123 for the multisig", action: "GET_USER_WALLET" },
            }
        ],
        // Example 4: Response to direct request for wallet
        [
            {
                user: "{{user2}}",
                content: { text: "Could you share your wallet address?", action: "NONE" },
            },
            {
                user: "{{user1}}",
                content: { text: "Here's my wallet: 0xfedcba987654", action: "GET_USER_WALLET" },
            }
        ],
        // Example 5: Wallet address in technical discussion
        [
            {
                user: "{{user1}}",
                content: { text: "I'd like to connect my wallet 0x456789abcdef to the protocol", action: "GET_USER_WALLET" },
            }
        ]
    ] as ActionExample[][],
} as Action;
