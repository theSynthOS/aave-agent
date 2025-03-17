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

export const getUserWalletAction: Action = {
    name: "GET_USER_WALLET",
    similes: ["GET_USER_WALLET", "USER_WALLET", "WALLET"],
    validate: async (_runtime: IAgentRuntime, _message: Memory, _state: State) => {
       try {
            // Check if this is a CONTINUE action
            if (_message.content?.actions === "CONTINUE") {
                console.log('[GET_USER_WALLET] Skipping CONTINUE action');
                return false;
            }

            // Check if we already have a plan proposed
            const memories = await _runtime.messageManager.getMemoriesByRoomIds({roomIds: [_message.roomId]});
            let planProposed = false;
            let walletProvided = false;
            
            for (const memory of memories) {
                if (memory.content?.action === "PROPOSE_PLAN") {
                    planProposed = true;
                }
                if (memory.content?.action === "GET_USER_WALLET" && memory.content.userAddress) {
                    walletProvided = true;
                }
            }
            
            // Only run this action if a plan has been proposed but no wallet has been provided
            return planProposed && !walletProvided;
       } catch(error) {
            console.error('[GET_USER_WALLET] Error in validate:', error);
            return false;
       }
    },
    description: "Get the user's wallet address",
    handler: async (
        _runtime: IAgentRuntime,
        _message: Memory,
        _state: State,
        _options: { [key: string]: unknown },
        _callback: HandlerCallback): Promise<boolean> => {
        try {
            console.log('[GET_USER_WALLET] Handler started');
            
            // Extract wallet address from recent messages
            const recentMessages = _state.recentMessagesData || [];
            console.log("[GET_USER_WALLET] Processing recent messages:", recentMessages.length);
            
            const conversationHistory = recentMessages.map(msg => 
                `${msg.id || 'User'}: ${msg.content?.text || ''}`).join('\n');
            
            console.log("[GET_USER_WALLET] Extracting wallet address from conversation");
            const extractionPrompt = extractWalletAddressTemplate.replace(
                '{{conversation}}', conversationHistory);
            
            const extractionResponse = await generateText({
                runtime: _runtime,
                modelClass: ModelClass.SMALL,
                context: extractionPrompt,
            });

            console.log('[GET_USER_WALLET] Extraction result:', extractionResponse);
            
            // Check if a valid wallet address was found
            const walletAddressRegex = /^0x[a-fA-F0-9]{40}$/;
            let userAddress = null;
            
            // Clean up the response - trim whitespace and extract just the address
            const cleanedResponse = extractionResponse.trim();
            console.log('[GET_USER_WALLET] Cleaned response:', cleanedResponse);

            // Check if the cleaned response is a valid Ethereum address
            if (walletAddressRegex.test(cleanedResponse)) {
                userAddress = cleanedResponse;
                console.log(`[GET_USER_WALLET] Found valid wallet address: ${userAddress}`);
                
                const userAddressMemory: Memory = {
                    userId: _message.userId,
                    agentId: _message.agentId,
                    roomId: _message.roomId,
                    content: {
                        text: "User wallet address",
                        action: "GET_USER_WALLET",
                        userAddress: userAddress
                    } as Content,
                };

                try{
                    await _runtime.messageManager.createMemory(userAddressMemory);
                }catch(error){
                    console.error('[GET_USER_WALLET] Error in createMemory:', error);
                }
                
                // Store the wallet address in memory
                await _callback({
                    text: `I've noted your wallet address (${userAddress}). I'll use this for your investment transaction.`,
                    action: "GET_USER_WALLET",
                    userAddress: userAddress
                });
                
                return true;
            } else {
                // The model might return "NO_WALLET_FOUND" or some other text
                console.log('[GET_USER_WALLET] No valid wallet address found in response');
                console.log('[GET_USER_WALLET] Asking user to provide wallet address');
                
                // Ask the user for their wallet address
                await _callback({
                    text: "To proceed with your investment, I'll need your Ethereum wallet address. Please provide your wallet address starting with '0x'.",
                    action: "GET_USER_WALLET",
                    userAddress: null
                });
                
                return true;
            }
        } catch(error) {
            console.error('[GET_USER_WALLET] Error in handler:', error);
            
            // Inform the user about the error
            await _callback({
                text: "I encountered an error while processing your wallet information. Please try again or provide your wallet address.",
                action: "GET_USER_WALLET",
                userAddress: null
            });
            
            return false;
        }
    },
    examples: [
        [
            {
                user: "{{user1}}",
                content: { text: "I want to invest in USDC on Aave" },
            },
            {
                user: "{{user2}}",
                content: { 
                    text: "To proceed with your investment, I'll need your Ethereum wallet address. Please provide your wallet address starting with '0x'.", 
                    action: "GET_USER_WALLET",
                    userAddress: null
                },
            }
        ],
        [
            {
                user: "{{user1}}",
                content: { text: "My wallet is 0x1234567890abcdef1234567890abcdef12345678" },
            },
            {
                user: "{{user2}}",
                content: { 
                    text: "I've noted your wallet address (0x1234567890abcdef1234567890abcdef12345678). I'll use this for your investment transaction.", 
                    action: "GET_USER_WALLET",
                    userAddress: "0x1234567890abcdef1234567890abcdef12345678"
                },
            }
        ]
    ],
} as Action; 