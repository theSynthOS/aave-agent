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
    // type Content,
    // ModelClass 
} from "@elizaos/core";
import { initWalletProvider } from "../providers/wallet";
// import { initWalletProvider } from "../providers/wallet";

// Add utility function to validate Ethereum addresses
const isValidEthereumAddress = (address: string): boolean => {
    // Check if it's a string and matches Ethereum address format (0x followed by 40 hex characters)
    const addressRegex = /^0x[a-fA-F0-9]{40}$/;
    return typeof address === 'string' && addressRegex.test(address);
};

interface MultisigPayload {
    address: string,
    userAddress: string,
    agentAddress: string

}

export const createMultisigAction: Action = {
    name: "CREATE_MULTISIG",
    similes: ["CREATE_MULTISIG", "START_PLAN", "EXECUTE_PLAN"],
    validate: async (_runtime: IAgentRuntime, _message: Memory, _state: State) => {
        try {
            
            // First check if we already have a multisig in state
            if (_state?.multisigWallet) {
                console.log('[CREATE_MULTISIG] Multisig already exists in state:', JSON.stringify(_state.multisigWallet));
                return false;
            }
            
            // Get user wallet address from state or memories
            let userAddress = "";
            const memories = await _runtime.messageManager.getMemoriesByRoomIds({roomIds: [_message.roomId]});
            
            // Check for existing wallet in memories
            for (const memory of memories) {
                if (memory.content.actions === "GET_USER_WALLET" && 
                    memory.content.wallet && 
                    isValidEthereumAddress(memory.content.wallet as string)) {
                    userAddress = memory.content.wallet as string;
                    break;
                }
            }
            
            if (!userAddress) {
                console.log('[CREATE_MULTISIG] No user wallet found, cannot check for existing multisig');
                return false;
            }
            
            // Initialize wallet provider to get agent address
            const walletProvider = await initWalletProvider(_runtime);
            const agentAddress = walletProvider.getAddress();
            
            // Check if multisig already exists for this user by calling the API
            console.log('[CREATE_MULTISIG] Checking if multisig exists for user:', userAddress);
            const response = await fetch(`http://localhost:3001/api/wallet/get/multisig`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({
                    agentAddress: agentAddress,
                    userAddress: userAddress
                })
            });
            
            if (response.ok) {
                const data = await response.json();
                if (data && data.multisig_address) {
                    console.log('[CREATE_MULTISIG] Found existing multisig:', data.multisig_address);
                    
                    // Update state with the existing multisig address
                    await _runtime.composeState(_message, {
                        multisigWallet: {
                            address: data.multisig_address,
                            userAddress: userAddress,
                            agentAddress: agentAddress
                        }
                    });
                    
                    return false; // Don't create a new multisig
                }
            }
            
            // Regular validation logic for multisig creation
            const text = _message.content?.text?.toLowerCase() || "";
            return text.includes("create") && text.includes("multisig");
        } catch (error) {
            console.error('[CREATE_MULTISIG] Error in validate:', error);
            return false;
        }
    },
    description:
        "Create a multisig wallet for the user based on the user's criteria once a user had choosen the asset to invest in",
    handler: async (
        _runtime: IAgentRuntime,
        _message: Memory,
        _state: State,
        _options: { [key: string]: unknown },
        _callback: HandlerCallback): Promise<boolean> => {

        // First check existing memories for a wallet
        const memories = await _runtime.messageManager.getMemoriesByRoomIds({roomIds: [_message.roomId]});
        console.log('[CREATE_MULTISIG] Retrieved memories:', memories.length);

        let userAddress = "";
        // Check for existing wallet in memories
        for (const memory of memories) {
            if (memory.content.actions === "GET_USER_WALLET" && 
                memory.content.wallet && 
                isValidEthereumAddress(memory.content.wallet as string)) {
                userAddress = memory.content.wallet as string;
                console.log('[CREATE_MULTISIG] Found existing valid user wallet address:', userAddress);
                break;
            }
        }

        // If no wallet found in memories, try to extract from current message
        if (!userAddress) {
            console.log('[CREATE_MULTISIG] No existing wallet found, checking current message');
            const promptGetWallet = await generateText({
                runtime: _runtime,
                modelClass: ModelClass.SMALL,
                context: `Get the wallet of the user from the message ${_message.content.text} and only return the wallet address and nothing else`,
            });

            if (promptGetWallet) {
                const cleanWalletAddress = promptGetWallet.trim();
                if (isValidEthereumAddress(cleanWalletAddress)) {
                    console.log('[CREATE_MULTISIG] Found valid wallet in current message:', cleanWalletAddress);
                    
                    // Save the wallet address using GET_USER_WALLET action
                    const walletMemory: Memory = {
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

                    await _runtime.messageManager.createMemory(walletMemory);
                    console.log('[CREATE_MULTISIG] Saved new wallet address to memory');
                    userAddress = cleanWalletAddress;
                }
            }
        }

        // If still no valid wallet address, ask user to provide one
        if (!userAddress) {
            console.log('[CREATE_MULTISIG] No valid wallet address found');
            _callback({
                text: "I'll need your wallet address to create a multisig wallet. Could you please provide it?",
            });
            return false;
        }

        console.log('[CREATE_MULTISIG] Proceeding with multisig creation for address:', userAddress);

        // Rest of the multisig creation logic
        console.log('[CREATE_MULTISIG] Initializing wallet provider');
        const walletProvider = await initWalletProvider(_runtime);
        const address = walletProvider.getAddress();
        console.log('[CREATE_MULTISIG] Agent wallet address:', address);
            
        console.log('[CREATE_MULTISIG] Making API request with payload:', {
            agentId: _runtime.agentId,
            agentAddress: address,
            address: userAddress,
        });

        console.log('[CREATE_MULTISIG] Starting handler execution');
        const response = await fetch(`http://localhost:3001/api/wallet/get/multisig`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                agentAddress: address,
                userAddress: userAddress
            })
        });

        if (response.ok) {
            const data = await response.json();
            if (data) {
                console.log('[CREATE_MULTISIG] Multisig wallet address:', data);
                _callback({
                    text: `Your multisig wallet address is: ${data.multisig_address}`
                });
                return true;
            }
        }
        
        try {
            const response = await fetch("http://localhost:3001/api/wallet/create", {
                method: "POST",
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({
                    agentId: _runtime.agentId,
                    agentAddress: address,
                    userAddress: userAddress,
                }),
            });

            // Log the raw response first
            console.log('[CREATE_MULTISIG] Response status:', response.status);
            
            // Check if response is ok before trying to parse JSON
            if (!response.ok) {
                const errorText = await response.text();
                console.error('[CREATE_MULTISIG] Server returned error:', errorText);
                throw new Error(`Server returned ${response.status}: ${errorText}`);
            }

            const responseData = await response.json();
            console.log('[CREATE_MULTISIG] API response:', responseData);

            if (responseData.error) {
                console.log('[CREATE_MULTISIG] API returned error:', responseData.error);
                return false;
            }

            const multisigAddress = responseData.data.safeAddress;
            console.log('[CREATE_MULTISIG] Multisig wallet created at:', multisigAddress);

            const formattedResponse = `Great news! I've successfully created a new multisig wallet for you. 
Here are the details:
- Multisig Wallet Address: ${multisigAddress}
- Status: Successfully created and deployed
- Connected to your address: ${userAddress}

You can now use this multisig wallet for secure transactions. Would you like to know what you can do with it?`;

            const newMemory: Memory = {
                userId: _message.agentId,
                agentId: _message.agentId,
                roomId: _message.roomId,
                content: {
                    text: formattedResponse,
                    actions: "CREATE_MULTISIG",
                } as Content,
            };

            console.log('[CREATE_MULTISIG] Creating memory with response');
            await _runtime.messageManager.createMemory(newMemory);

            _callback({
                text: "Multisig wallet created successfully",
            })

            console.log('[CREATE_MULTISIG] Handler completed successfully');
            return true;
        } catch (error) {
            console.error('[CREATE_MULTISIG] Error occurred:', error);
            if (error instanceof Error) {
                console.error('[CREATE_MULTISIG] Error details:', error.message);
            }
            _callback({
                text: "Sorry, there was an error creating the multisig wallet. Please try again later.",
            });
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
