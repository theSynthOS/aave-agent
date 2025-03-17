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
import { v4 as uuidv4 } from 'uuid';
import { ethers } from "ethers";
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
            
            for (const memory of memories) {
                if (memory.content.action === "PROPOSE_PLAN"){
                    if (memory.content.investmentDetails) {
                        investmentDetails = memory.content.investmentDetails;
                        break;
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
            
            for (const memory of memories) {
                console.log('[PROPOSE_TRANSACTION] Found memory:', memory);
                if (memory.content.action === "PROPOSE_PLAN"){
                    console.log('[PROPOSE_TRANSACTION] Found investment details in memory:', memory);
                    if (memory.content.investmentDetails) {
                        investmentDetails = memory.content.investmentDetails;
                        console.log('[PROPOSE_TRANSACTION] Found investment details in memory:', 
                        JSON.stringify(memory.content.investmentDetails, (_, v) => 
                            typeof v === 'bigint' ? v.toString() : v));
                        break;
                    }
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
            
            // Generate transaction data
            // For simplicity, we're using a mock transaction for now
            const txValue = parseEther('0.03'); // Example value in ETH
            
            // Generate calldata for the transaction
            const callData = encodeFunctionData({
                abi: aaveEthAbi,
                functionName: 'depositETH',
                args: ["0x48914C788295b5db23aF2b5F0B3BE775C4eA9440", "0x34553Be327C085AfD43bbc3Fc1681FfC3CC9287A", 0] // TODO: replace with user's address
            });
            
            const tx = {
                to: "0x57ce905CfD7f986A929A26b006f797d181dB706e", // Aave contract
                data: callData,
                value: txValue.toString(), // Convert BigInt to string
            };

           const walletProvider = await initWalletProvider(_runtime);
           const agentAddress = walletProvider.account.address;
           const chainId = "scrollSepolia"; // Make sure this matches the expected chain

           // Log detailed wallet information before attempting transaction
           console.log(`[PROPOSE_TRANSACTION] Preparing transaction on chain: ${chainId}`);

           // Generate task ID
           const taskId = generateTaskId();
           console.log(`[PROPOSE_TRANSACTION] Using task ID: ${taskId}`);

           // Make sure the target address is the correct contract address
           const targetAddress = "0x57ce905CfD7f986A929A26b006f797d181dB706e"; // Aave contract
           console.log(`[PROPOSE_TRANSACTION] Target address: ${targetAddress}`);

           // Log the calldata
           console.log(`[PROPOSE_TRANSACTION] Call data: ${tx.data}`);
           console.log(`[PROPOSE_TRANSACTION] Call data length: ${tx.data.length} bytes`);

           // Log transaction details
           console.log(`[PROPOSE_TRANSACTION] Transaction details:`);
           console.log(`  - Contract address: 0x8eab19f680afCFD21f0d42353E06C85F3359024C`);
           console.log(`  - Function: registerTask`);
           console.log(`  - Task ID: ${taskId}`);
           console.log(`  - Target address: ${targetAddress}`);
           console.log(`  - Call data length: ${tx.data.length} bytes`);

           try {
              // Create contract instance
    // Get private key from runtime settings
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

    //here give a gap of time like 10 seconds
    await new Promise(resolve => setTimeout(resolve, 10000));

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

    const responseBody = await response.json();

    console.log(`[PROPOSE_TRANSACTION] Response: ${JSON.stringify(responseBody)}`);

    if (!response.ok) {
        console.error(`[PROPOSE_TRANSACTION] Failed to execute task: ${response.statusText}`);
        await _callback({
            text: `propose transaction failed, please try again`,
            action: "PROPOSE_TRANSACTION"
        });
        return false;
    }
            
            // Send only the transaction JSON to the user - IMPORTANT: No additional text
            await _callback({
                text: ` transaction with txUUID: ${taskId} has been verified by the plugins to be safe and what you intend to do, you can go ahead and execute it now by clicking on execute`,
                action: "PROPOSE_TRANSACTION"
            });
            
            return true;
        } catch(error) {
            console.error('[PROPOSE_TRANSACTION] Error:', error);
            
            // Log detailed error information
            if (error.details) console.error(`- Details: ${error.details}`);
            if (error.shortMessage) console.error(`- Short message: ${error.shortMessage}`);
            if (error.metaMessages) console.error(`- Meta messages: ${error.metaMessages.join('\n  ')}`);
            
            // Check if it's a chain mismatch
            if (error.message.includes('chain ID') || error.message.includes('network')) {
                console.error(`[PROPOSE_TRANSACTION] Possible chain mismatch. Make sure you're connected to Scroll Sepolia.`);
            }
            
            await _callback({
                text: JSON.stringify({
                    error: error.shortMessage || error.message || String(error),
                    details: error.details || null,
                    transactionInfo: {
                        chain: chainId,
                        address: agentAddress,
                        contractAddress: '0x8eab19f680afCFD21f0d42353E06C85F3359024C'
                    }
                }, null, 2)
            });
            return false;
        }
    }catch(error){
        console.error('[PROPOSE_TRANSACTION] Error:', error);
        return false;
    }
    },
    examples: [
        [
            {
                user: "{{user1}}",
                content: { text: "Yes, please proceed with the transaction" },
            },
            {
                user: "{{user2}}",
                content: { text: "{\n  \"to\": \"0x57ce905CfD7f986A929A26b006f797d181dB706e\",\n  \"data\": \"0x474cf53d000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000\",\n  \"value\": \"30000000000000000\"\n}", action: "PROPOSE_TRANSACTION" },
            }
        ],
        [
            {
                user: "{{user1}}",
                content: { text: "I want to execute my USDC investment now" },
            },
            {
                user: "{{user2}}",
                content: { text: "{\n  \"to\": \"0x57ce905CfD7f986A929A26b006f797d181dB706e\",\n  \"data\": \"0x474cf53d00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000\",\n  \"value\": \"30000000000000000\"\n}", action: "PROPOSE_TRANSACTION" },
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
  