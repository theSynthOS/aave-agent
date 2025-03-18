import { 
    type Action, 
    type IAgentRuntime, 
    type Memory, 
    type HandlerCallback, 
    type State,
    ModelClass,
    generateText,
    Content,
} from "@elizaos/core";

// Template for extracting wallet address from conversation
const extractWalletAddressTemplate = `
You are an AI assistant helping to extract Ethereum wallet addresses from conversations.

CONVERSATION:
{{conversation}}

TASK:
Extract any Ethereum wallet address from the conversation. Ethereum addresses start with "0x" followed by 40 hexadecimal characters.
If multiple addresses are found, return the most recently mentioned one.
If no valid Ethereum address is found, return "NO_WALLET_FOUND".

RESPONSE FORMAT:
Return only the wallet address or "NO_WALLET_FOUND" with no additional text.
`;

export const changeUserWalletAction: Action = {
    name: "CHANGE_USER_WALLET",
    similes: ["CHANGE_USER_WALLET", "UPDATE_WALLET", "CHANGE_WALLET", "CORRECT_WALLET"],
    validate: async (_runtime: IAgentRuntime, _message: Memory, _state: State) => {
       try {
            // Check if this is a CONTINUE action
            if (_message.content?.actions === "CONTINUE") {
                console.log('[CHANGE_USER_WALLET] Skipping CONTINUE action');
                return false;
            }

            // Check if the message contains wallet-related keywords
            const messageText = _message.content?.text?.toLowerCase() || '';
            const walletKeywords = ['wallet', 'address', 'change', 'update', 'correct', 'wrong'];
            
            const containsWalletKeywords = walletKeywords.some(keyword => 
                messageText.includes(keyword));
                
            if (!containsWalletKeywords) {
                return false;
            }
            
            // Check if we already have a wallet address in memories
            const memories = await _runtime.messageManager.getMemoriesByRoomIds({roomIds: [_message.roomId]});
            let walletProvided = false;
            
            for (const memory of memories) {
                if (memory.content?.action === "GET_USER_WALLET" && memory.content.userAddress) {
                    walletProvided = true;
                    break;
                }
            }
            
            // Only run this action if a wallet has already been provided
            return walletProvided;
       } catch(error) {
            console.error('[CHANGE_USER_WALLET] Error in validate:', error);
            return false;
       }
    },
    description: "Change the user's wallet address",
    handler: async (
        _runtime: IAgentRuntime,
        _message: Memory,
        _state: State,
        _options: { [key: string]: unknown },
        _callback: HandlerCallback): Promise<boolean> => {
        try {
            console.log('[CHANGE_USER_WALLET] Handler started');
            
            // Extract wallet address from recent messages
            const recentMessages = _state.recentMessagesData || [];
            console.log("[CHANGE_USER_WALLET] Processing recent messages:", recentMessages.length);
            
            const conversationHistory = recentMessages.map(msg => 
                `${msg.userId || 'User'}: ${msg.content?.text || ''}`).join('\n');
            
            console.log("[CHANGE_USER_WALLET] Extracting wallet address from conversation");
            const extractionPrompt = extractWalletAddressTemplate.replace(
                '{{conversation}}', conversationHistory);
            
            const extractionResponse = await generateText({
                runtime: _runtime,
                modelClass: ModelClass.SMALL,
                context: extractionPrompt,
            });

            console.log('[CHANGE_USER_WALLET] Extraction result:', extractionResponse);
            
            // Check if a valid wallet address was found
            const walletAddressRegex = /^0x[a-fA-F0-9]{40}$/;
            let userAddress = null;
            
            // Clean up the response - trim whitespace and extract just the address
            const cleanedResponse = extractionResponse.trim();
            console.log('[CHANGE_USER_WALLET] Cleaned response:', cleanedResponse);

            // Check if the cleaned response is a valid Ethereum address
            if (walletAddressRegex.test(cleanedResponse)) {
                userAddress = cleanedResponse;
                console.log(`[CHANGE_USER_WALLET] Found valid wallet address: ${userAddress}`);
                
                // Get the previous wallet address
                const memories = await _runtime.messageManager.getMemoriesByRoomIds({roomIds: [_message.roomId]});
                let previousWallet = null;
                
                for (const memory of memories) {
                    if (memory.content?.action === "GET_USER_WALLET" && memory.content.userAddress) {
                        previousWallet = memory.content.userAddress;
                        break;
                    }
                }
                
                // Create a new memory with the updated wallet address
                const userAddressMemory: Memory = {
                    userId: _message.userId,
                    agentId: _message.agentId,
                    roomId: _message.roomId,
                    content: {
                        text: "Updated user wallet address",
                        action: "CHANGE_USER_WALLET",
                        userAddress: userAddress,
                        previousAddress: previousWallet
                    } as Content,
                };

                try {
                    await _runtime.messageManager.createMemory(userAddressMemory);
                    console.log('[CHANGE_USER_WALLET] Created memory with updated wallet address');
                } catch(error) {
                    console.error('[CHANGE_USER_WALLET] Error in createMemory:', error);
                }
                
                // Inform the user about the wallet address change
                await _callback({
                    text: `I've updated your wallet address from ${previousWallet} to ${userAddress}. I'll use this new address for your investment transaction.`,
                    action: "CHANGE_USER_WALLET",
                    userAddress: userAddress,
                    previousAddress: previousWallet
                });
                
                return true;
            } else {
                // No valid wallet address found
                console.log('[CHANGE_USER_WALLET] No valid wallet address found in response');
                
                // Ask the user to provide a new wallet address
                await _callback({
                    text: "I understand you want to change your wallet address. Please provide your new Ethereum wallet address starting with '0x'.",
                    action: "CHANGE_USER_WALLET",
                    userAddress: null
                });
                
                return true;
            }
        } catch(error) {
            console.error('[CHANGE_USER_WALLET] Error in handler:', error);
            
            // Inform the user about the error
            await _callback({
                text: "I encountered an error while trying to update your wallet information. Please try again by providing your new wallet address.",
                action: "CHANGE_USER_WALLET",
                userAddress: null
            });
            
            return false;
        }
    },
    examples: [
        [
            {
                user: "{{user1}}",
                content: { text: "I need to change my wallet address" },
            },
            {
                user: "{{user2}}",
                content: { 
                    text: "I understand you want to change your wallet address. Please provide your new Ethereum wallet address starting with '0x'.", 
                    action: "CHANGE_USER_WALLET",
                    userAddress: null
                },
            }
        ],
        [
            {
                user: "{{user1}}",
                content: { text: "My wallet address is wrong, it should be 0xabcdef1234567890abcdef1234567890abcdef12" },
            },
            {
                user: "{{user2}}",
                content: { 
                    text: "I've updated your wallet address from 0x1234567890abcdef1234567890abcdef12345678 to 0xabcdef1234567890abcdef1234567890abcdef12. I'll use this new address for your investment transaction.", 
                    action: "CHANGE_USER_WALLET",
                    userAddress: "0xabcdef1234567890abcdef1234567890abcdef12",
                    previousAddress: "0x1234567890abcdef1234567890abcdef12345678"
                },
            }
        ]
    ],
} as Action;
