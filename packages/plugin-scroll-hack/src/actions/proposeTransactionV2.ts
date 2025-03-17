import { 
    type Action, 
    type IAgentRuntime, 
    type Memory, 
    type ActionExample, 
    type HandlerCallback, 
    type State as BaseState,
    generateText,
    ModelClass,
} from "@elizaos/core";
import aaveEthAbi from "./constant/abi/aaveEthAbi.json";
import { encodeFunctionData, parseEther } from "viem";
import { initWalletProvider } from "../providers/wallet";
import registerTaskAbi from "./constant/abi/registerTaskAbi.json";
import nonEthAssetAbi from "./constant/abi/nonEthAssetAbi.json";
import { v4 as uuidv4 } from 'uuid';
import { ethers } from "ethers";
import { assets } from "./constant/aave";

const nonETHAaveAbi = [
    {
      "inputs": [
        {
          "internalType": "address",
          "name": "asset",
          "type": "address"
        },
        {
          "internalType": "uint256",
          "name": "amount",
          "type": "uint256"
        },
        {
          "internalType": "address",
          "name": "onBehalfOf",
          "type": "address"
        },
        {
          "internalType": "uint16",
          "name": "referralCode",
          "type": "uint16"
        }
      ],
      "name": "supply",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    }
  ]

// Define interfaces for our state
interface AaveInvestment {
    chosenAsset: string;
    allocationAmount: number;
    assetAddress?: string;
    apr?: number;
    riskLevel?: string;
    decisionTimestamp?: number;
    planTimestamp?: number;
}

interface State extends BaseState {
    aaveInvestment?: AaveInvestment;
    investmentPlanPresented?: boolean;
    recentMessagesData: any[];
    lastProcessedMessageId?: string;
    processedMessageIds?: string[];
}

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

// Function to generate a UUID and encode it as bytes32
function generateTaskId(): string {
    // Generate a random UUID
    const randomUuid = uuidv4();
    
    console.log(`[PROPOSE_TRANSACTION] Generated task ID: ${randomUuid}`);
    
    return randomUuid;
}

export const proposeTransactionV2Action: Action = {
    name: "PROPOSE_TRANSACTION",
    similes: ["PROPOSE_TRANSACTION", "EXECUTE_TRANSACTION", "CONFIRM_TRANSACTION"],
    validate: async (_runtime: IAgentRuntime, _message: Memory, _state: State) => {
        try {       
            if (_message.content?.actions === "CONTINUE" || _message.content?.actions === "PROPOSE_PLAN"){
                console.log('[PROPOSE_TRANSACTION] Skipping CONTINUE action');
                return false;
            }
            
            // Get investment details from memories
            const memories = await _runtime.messageManager.getMemories({roomId: _message.roomId});
            let investmentDetails = null;
            
            console.log('[PROPOSE_TRANSACTION] Checking memories for investment details');
            
            for (const memory of memories) {
                if (memory.content.action === "PROPOSE_PLAN"){
                    if (memory.content.investmentDetails) {
                        investmentDetails = memory.content.investmentDetails;
                        console.log('[PROPOSE_TRANSACTION] Found investment details:', 
                            JSON.stringify(investmentDetails));
                    }
                }
            }
            
            if (!investmentDetails) {
                console.error('[PROPOSE_TRANSACTION] No investment details found in memories');
                return false;
            }
            
            return true;
        } catch (error) {
            console.error('[PROPOSE_TRANSACTION] Error in validate:', error);
            return false;
        }
    },
    description: "Propose a transaction for the user's investment decision",
    handler: async (
        _runtime: IAgentRuntime,
        _message: Memory,
        _state: State,
        _options: { [key: string]: unknown },
        _callback: HandlerCallback): Promise<boolean> => {
        try {
            console.log('[PROPOSE_TRANSACTION] Handler started');
            
            // Get investment details from memories
            const memories = await _runtime.messageManager.getMemories({roomId: _message.roomId});
            let investmentDetails = null;
            let userAddress = null;
            
            for (const memory of memories) {
                if (memory.content.action === "PROPOSE_PLAN"){
                    if (memory.content.investmentDetails) {
                        investmentDetails = memory.content.investmentDetails;
                        console.log('[PROPOSE_TRANSACTION] Found investment details in memory:', 
                        JSON.stringify(memory.content.investmentDetails, (_, v) => 
                            typeof v === 'bigint' ? v.toString() : v));
                    }
                }
                
                // Check if user wallet has been provided in previous messages
                if (memory.content.action === "GET_USER_WALLET" && memory.content.userAddress) {
                    userAddress = memory.content.userAddress;
                    console.log('[PROPOSE_TRANSACTION] Found user wallet address in memory:', userAddress);
                }
            }
            
            if (!investmentDetails) {
                console.error('[PROPOSE_TRANSACTION] No investment details found in memories');
                await _callback({
                    text: JSON.stringify({
                        error: "No investment details found"
                    })
                });
                return false;
            }
            
            // If no wallet address found in memory, try to extract it from conversation
            if (!userAddress) {
                console.log('[PROPOSE_TRANSACTION] No wallet address found in memory, checking conversation');
                
                // Extract wallet address from recent messages
                const recentMessages = _state.recentMessagesData || [];
                console.log("[PROPOSE_TRANSACTION] Processing recent messages for wallet:", recentMessages.length);
                
                const conversationHistory = recentMessages.map(msg => 
                    `${msg.sender || 'User'}: ${msg.content?.text || ''}`).join('\n');
                
                console.log("[PROPOSE_TRANSACTION] Extracting wallet address from conversation");
                const extractionPrompt = extractWalletAddressTemplate.replace(
                    '{{conversation}}', conversationHistory);
                
                const extractionResponse = await generateText({
                    runtime: _runtime,
                    modelClass: ModelClass.SMALL,
                    context: extractionPrompt,
                });
                
                console.log('[PROPOSE_TRANSACTION] Wallet extraction result:', extractionResponse);
                
                // Check if a valid wallet address was found
                const walletAddressRegex = /^0x[a-fA-F0-9]{40}$/;
                
                // Clean up the response - trim whitespace and extract just the address
                const cleanedResponse = extractionResponse.trim();
                console.log('[PROPOSE_TRANSACTION] Cleaned wallet response:', cleanedResponse);
                
                // Check if the cleaned response is a valid Ethereum address
                if (walletAddressRegex.test(cleanedResponse)) {
                    userAddress = cleanedResponse;
                    console.log(`[PROPOSE_TRANSACTION] Found valid wallet address: ${userAddress}`);
                    
                    // Store the wallet address in memory for future use
                    const userAddressMemory = {
                        userId: _message.userId,
                        agentId: _message.agentId,
                        roomId: _message.roomId,
                        content: {
                            text: "User wallet address",
                            action: "GET_USER_WALLET",
                            userAddress: userAddress
                        },
                    };
                    
                    try {
                        await _runtime.messageManager.createMemory(userAddressMemory);
                        console.log('[PROPOSE_TRANSACTION] Stored wallet address in memory');
                    } catch(error) {
                        console.error('[PROPOSE_TRANSACTION] Error storing wallet address in memory:', error);
                    }
                }
            }
            
            // If we still don't have a wallet address, ask the user
            if (!userAddress) {
                console.log('[PROPOSE_TRANSACTION] No wallet address found, asking user');
                
                await _callback({
                    text: "To proceed with your investment, I'll need your Ethereum wallet address. Please provide your wallet address starting with '0x'.",
                    action: "PROPOSE_TRANSACTION"
                });
                
                return true;
            }
            
            console.log('[PROPOSE_TRANSACTION] Using wallet address:', userAddress);
            
            // Generate transaction data based on the chosen asset
            let tx = null;
            for (const asset of assets) {
                if (asset.asset === investmentDetails.asset) {
                    const callData = encodeFunctionData({
                        abi: nonETHAaveAbi,
                        functionName: 'supply',
                        args: [asset.address, 100, userAddress, 0]
                    });
                    tx = {
                        to: asset.aaveAddress,
                        data: callData,
                        value: "0",
                    };
                }
            }
            
            console.log('[PROPOSE_TRANSACTION] Transaction:', JSON.stringify(tx));
            
            // Rest of your transaction code...
            const privateKey = _runtime.getSetting("EVM_PRIVATE_KEY") as string;
            if (!privateKey) {
                throw new Error("Private key not found in settings");
            }
            
            // Create provider and wallet
            const provider = new ethers.JsonRpcProvider("https://sepolia-rpc.scroll.io");
            const wallet = new ethers.Wallet(privateKey, provider);
            console.log(`[PROPOSE_TRANSACTION] Using wallet address: ${wallet.address}`);
            
            // Get network information
            const network = await provider.getNetwork();
            console.log(`[PROPOSE_TRANSACTION] Connected to network: ${network.name} (chainId: ${network.chainId})`);
            
            // Get wallet balance
            const balance = await provider.getBalance(wallet.address);
            console.log(`[PROPOSE_TRANSACTION] Wallet balance: ${ethers.formatEther(balance)} ETH`);
            
            // Generate task ID
            const taskId = generateTaskId();
            
            // Create contract instance
            const contractAddress = '0x5e38f31693CcAcFCA4D8b70882d8b696cDc24273';
            const contract = new ethers.Contract(contractAddress, registerTaskAbi, wallet);
            
            // Log transaction details
            console.log(`[PROPOSE_TRANSACTION] Transaction details:`);
            console.log(`  - Contract address: ${contractAddress}`);
            console.log(`  - Function: registerTask`);
            console.log(`  - Task ID: ${taskId}`);
            console.log(`  - Target address: 0x57ce905CfD7f986A929A26b006f797d181dB706e`);
            console.log(`  - Call data: ${tx.data}`);
            console.log(`  - Call data length: ${tx.data.length} bytes`);
            
            // Send transaction
            console.log(`[PROPOSE_TRANSACTION] Sending transaction...`);
            const transaction = await contract.registerTask(
                taskId,
                "0x57ce905CfD7f986A929A26b006f797d181dB706e",
                tx.data,
            );
            
            console.log(`[PROPOSE_TRANSACTION] Transaction sent with hash: ${transaction.hash}`);
            
            // Wait for transaction to be mined
            console.log(`[PROPOSE_TRANSACTION] Waiting for transaction confirmation...`);
            
            // Wait a bit before checking task execution
            await new Promise(resolve => setTimeout(resolve, 10000));
            
            // Function to retry the task execution with exponential backoff
            async function retryTaskExecution(taskId: string, maxRetries = 5, initialDelayMs = 1000) {
                let lastResponse = null;
                let lastError = null;
                
                for (let attempt = 1; attempt <= maxRetries; attempt++) {
                    try {
                        console.log(`[PROPOSE_TRANSACTION] Attempt ${attempt} to execute task ${taskId}`);
                        
                        const taskExecutionUrl = `https://31a6-2001-d08-f0-8b29-908b-5e15-5bdb-5cdb.ngrok-free.app/task/execute?taskId=${taskId}`;
                        
                        const response = await fetch(taskExecutionUrl, {
                            method: "POST",
                            headers: {
                                "Content-Type": "application/json",
                            },
                            body: JSON.stringify({
                                txUUID: taskId,
                                agentId: 0
                            }),
                        });
                        
                        lastResponse = response;
                        
                        // If successful, return the response
                        if (response.ok) {
                            const responseBody = await response.json();
                            console.log(`[PROPOSE_TRANSACTION] Task execution successful on attempt ${attempt}: ${JSON.stringify(responseBody)}`);
                            return { success: true, response, body: responseBody };
                        }
                        
                        // If we get here, the response was not ok
                        const errorBody = await response.text().catch(() => "Could not parse response body");
                        console.error(`[PROPOSE_TRANSACTION] Failed to execute task on attempt ${attempt}: ${response.status} ${response.statusText}`);
                        console.error(`[PROPOSE_TRANSACTION] Error response: ${errorBody}`);
                        
                        // If this is the last attempt, don't wait
                        if (attempt < maxRetries) {
                            // Exponential backoff: wait longer between each retry
                            const delayMs = initialDelayMs * Math.pow(2, attempt - 1); // 1s, 2s, 4s, 8s, 16s
                            console.log(`[PROPOSE_TRANSACTION] Waiting ${delayMs}ms before next attempt`);
                            await new Promise(resolve => setTimeout(resolve, delayMs));
                        }
                    } catch (error) {
                        lastError = error;
                        console.error(`[PROPOSE_TRANSACTION] Network error on attempt ${attempt}:`, error);
                        
                        // If this is the last attempt, don't wait
                        if (attempt < maxRetries) {
                            // Exponential backoff: wait longer between each retry
                            const delayMs = initialDelayMs * Math.pow(2, attempt - 1);
                            console.log(`[PROPOSE_TRANSACTION] Waiting ${delayMs}ms before next attempt`);
                            await new Promise(resolve => setTimeout(resolve, delayMs));
                        }
                    }
                }
                
                // If we've exhausted all retries, return the last response or error
                console.error(`[PROPOSE_TRANSACTION] All ${maxRetries} attempts to execute task failed`);
                return { 
                    success: false, 
                    response: lastResponse, 
                    error: lastError,
                    message: lastResponse ? `HTTP ${lastResponse.status}: ${lastResponse.statusText}` : lastError?.message || "Unknown error"
                };
            }
            
            // Execute the task with retries
            console.log(`[PROPOSE_TRANSACTION] Executing task ${taskId}...`);
            const executionResult = await retryTaskExecution(taskId, 5, 1000);
            
            if (!executionResult.success) {
                console.error(`[PROPOSE_TRANSACTION] Failed to execute task after multiple attempts: ${executionResult.message}`);
                await _callback({
                    text: `Transaction registered but task execution failed. Please try again or contact support.`,
                    action: "PROPOSE_TRANSACTION"
                });
                return false;
            }
            
            // Task execution was successful
            console.log(`[PROPOSE_TRANSACTION] Task execution successful`);
            await _callback({
                text: `Transaction with txUUID: ${taskId} has been verified by the plugins to be safe and what you intend to do, you can go ahead and execute it now by clicking on execute`,
                action: "PROPOSE_TRANSACTION"
            });
            
            return true;
        } catch(error) {
            console.error('[PROPOSE_TRANSACTION] Error:', error);
            
            // Log detailed error information
            if (error.details) console.error(`- Details: ${error.details}`);
            if (error.shortMessage) console.error(`- Short message: ${error.shortMessage}`);
            if (error.metaMessages) console.error(`- Meta messages: ${error.metaMessages.join('\n  ')}`);
            
            await _callback({
                text: JSON.stringify({
                    error: error.shortMessage || error.message || String(error),
                    details: error.details || null
                }, null, 2)
            });
            return false;
        }
    },
    examples: [
        [
            {
                user: "{{user1}}",
                content: { text: "I want to execute my USDC investment now" },
            },
            {
                user: "{{user2}}",
                content: { text: "{\n  \"to\": \"0x57ce905CfD7f986A929A26b006f797d181dB706e\",\n  \"data\": \"0x474cf53d000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000\",\n  \"value\": \"30000000000000000\"\n}", action: "PROPOSE_TRANSACTION" },
            }
        ],
        [
            {
                user: "{{user1}}",
                content: { text: "Let's go ahead with the ETH investment" },
            },
            {
                user: "{{user2}}",
                content: { text: "{\n  \"to\": \"0x57ce905CfD7f986A929A26b006f797d181dB706e\",\n  \"data\": \"0x474cf53d00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000\",\n  \"value\": \"60000000000000000\"\n}", action: "PROPOSE_TRANSACTION" },
            }
        ],
        [
            {
                user: "{{user1}}",
                content: { text: "I'd like to proceed with the WBTC investment" },
            },
            {
                user: "{{user2}}",
                content: { text: "{\n  \"to\": \"0x57ce905CfD7f986A929A26b006f797d181dB706e\",\n  \"data\": \"0x474cf53d00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000\",\n  \"value\": \"150000000000000000\"\n}", action: "PROPOSE_TRANSACTION" },
            }
        ],
        [
            {
                user: "{{user1}}",
                content: { text: "Confirm the transaction please" },
            },
            {
                user: "{{user2}}",
                content: { text: "{\n  \"to\": \"0x57ce905CfD7f986A929A26b006f797d181dB706e\",\n  \"data\": \"0x474cf53d0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000\",\n  \"value\": \"30000000000000000\"\n}", action: "PROPOSE_TRANSACTION" },
            }
        ]
    ],
} as Action;
  