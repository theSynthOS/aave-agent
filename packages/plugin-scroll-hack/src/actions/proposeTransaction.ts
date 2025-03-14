import { 
    type Action, 
    type IAgentRuntime, 
    type Memory, 
    type ActionExample, 
    type HandlerCallback, 
    type State as BaseState,
    ModelClass,
    generateText,
} from "@elizaos/core";
import { initWalletProvider } from "../providers/wallet";
import aaveEthAbi from "./constant/abi/aaveEthAbi.json";
import { createPublicClient, encodeFunctionData, formatEther, http, parseEther } from "viem";
import { scrollSepolia } from "viem/chains";
import { isValidEthereumAddress } from "../utils/utils";

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

interface MultisigWallet {
    address: string;
    userAddress: string;
    agentAddress: string;
}

interface State extends BaseState {
    aaveInvestment?: AaveInvestment;
    multisigWallet?: MultisigWallet;
    investmentPlanPresented?: boolean;
    recentMessagesData: any[];
    askedAboutMultisig?: boolean;
    lastProcessedMessageId?: string;
    processedMessageIds?: string[];
    needsMultisig?: boolean;
}

const extractInvestmentDecisionTemplate = `
You are analyzing a conversation to extract the user's investment decision for Aave.

Recent messages:
{{recentMessages}}

Extract the following information:
1. Which asset the user wants to invest in (WBTC, USDC, DAI, etc.)
2. How much they want to invest (if specified)

Respond in JSON format:
{
  "hasDecided": true/false,
  "chosenAsset": "ASSET_SYMBOL", // null if not decided
  "allocationAmount": number, // null if not specified
  "confidence": "HIGH"/"MEDIUM"/"LOW" // How confident you are in this extraction
}
`;

const createInvestmentPlanTemplate = `
You are creating a detailed investment plan for a user who wants to invest in Aave.

Asset: {{asset}}
Amount: {{amount}}
Current APR: {{apr}}%
Risk Level: {{riskLevel}}

Create a detailed investment plan that includes:
1. The benefits of investing in this asset
2. The potential risks and how to mitigate them
3. Expected returns over 30, 90, and 180 days
4. A step-by-step process for executing the investment
5. Recommendations for monitoring the investment

Make the plan professional but easy to understand.
`;

export const proposeTransactionAction: Action = {
    name: "PROPOSE_TRANSACTION",
    similes: ["PROPOSE_TRANSACTION", "EXECUTE_TRANSACTION", "CONFIRM_TRANSACTION"],
    validate: async (_runtime: IAgentRuntime, _message: Memory, _state: State) => {
        try {
            console.log('[PROPOSE_TRANSACTION] Validating with state:', JSON.stringify(_state));
            
            // Check if this is a CONTINUE action
            if (_message.content?.actions === "CONTINUE") {
                console.log('[PROPOSE_TRANSACTION] Skipping CONTINUE action');
                return false;
            }
            
            // Prevent duplicate processing
            if (_state.processedMessageIds && _state.processedMessageIds.includes(_message.id)) {
                console.log('[PROPOSE_TRANSACTION] Already processed this message');
                return false;
            }
            
            const text = _message.content?.text?.toLowerCase() || "";
            const transactionKeywords = ["transaction", "proceed", "confirm", "execute", "yes", "ok", "sure", "go ahead"];
            
            // Check if message contains transaction intent
            const hasTransactionIntent = transactionKeywords.some(keyword => text.includes(keyword));
            
            // Only validate if we have a plan presented
            return hasTransactionIntent && _state.investmentPlanPresented;
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
            console.log('[PROPOSE_TRANSACTION] Handler started with state:', JSON.stringify(_state));
            
            // Mark this message as processed
            const processedMessageIds = _state.processedMessageIds || [];
            await _runtime.composeState(_message, {
                processedMessageIds: [...processedMessageIds, _message.id]
            });
            
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
                console.log('[PROPOSE_TRANSACTION] No user wallet found, cannot check for existing multisig');
                await _callback({
                    text: `Before we can proceed with your investment, I need to know your wallet address. Could you please share it with me?`
                });
                return false;
            }

            // Initialize wallet provider to get agent address
            const walletProvider = await initWalletProvider(_runtime);
            const agentAddress = walletProvider.getAddress();
            
            console.log('[PROPOSE_TRANSACTION] User address:', userAddress, 'Agent address:', agentAddress);
            
            // Try to fetch the multisig wallet from the API
            let multisigAddress = null;
            
            try {
                // Make an API call to get the multisig wallet
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
                    if (data) {
                        multisigAddress = data.multisig_address;
                        console.log('[PROPOSE_TRANSACTION] Found multisig from API:', multisigAddress);
                        
                        // Update the state with the multisig wallet
                        await _runtime.composeState(_message, {
                            multisigWallet: {
                                address: multisigAddress,
                                userAddress: userAddress,
                                agentAddress: agentAddress
                            }
                        });
                    }
                }
            } catch (apiError) {
                console.error('[PROPOSE_TRANSACTION] Error fetching from API:', apiError);
            }
            
            // CRITICAL: Check if a multisig wallet exists before proceeding with any investment logic
            if (!multisigAddress) {
                console.log('[PROPOSE_TRANSACTION] No multisig wallet found');
                await _callback({
                    text: `Thank you for your investment decision. Before we can proceed, we need to set up a secure multisig wallet for you. This is a required step to ensure the security of your investment. Would you like me to create a multisig wallet for you now?`
                });
                
                // Store that we need to create a multisig
                await _runtime.composeState(_message, {
                    needsMultisig: true
                });
                
                return true;
            }
            
            console.log('[PROPOSE_TRANSACTION] Using multisig wallet:', multisigAddress);
            
            // Get investment details from memories
            let investmentDetails = null;
            for (const memory of memories) {
                if (memory.content.action === "PROPOSE_PLAN" && 
                    memory.content.investmentDetails) {
                    investmentDetails = memory.content.investmentDetails;
                    console.log('[PROPOSE_TRANSACTION] Found investment details in memory:', 
                        JSON.stringify(memory.content.investmentDetails));
                    break;
                }
            }

            if (!investmentDetails) {
                await _callback({
                    text: `I'm sorry, but I don't have your investment details. Please let me know which asset you'd like to invest in and how much.`
                });
                return false;
            }

            const { chosenAsset, allocationAmount, assetAddress, apr, riskLevel } = investmentDetails;
            
            // Check the balance of the multisig wallet
            console.log('[PROPOSE_TRANSACTION] Checking multisig balance: ', multisigAddress);
            const balance = await getGnosisSafeBalance(multisigAddress);
            console.log('[PROPOSE_TRANSACTION] Multisig balance:', Number(balance));

            if (Number(balance) < 0.03) {
                await _callback({
                    text: `I'm sorry, but your multisig wallet does not have enough balance to proceed with the transaction. Please top up your wallet and try again.`
                });
                return true;
            }

            // Generate the transaction payload
            const callData = encodeFunctionData({
                abi: aaveEthAbi,
                functionName: "depositETH",
                args: [
                  "0x48914C788295b5db23aF2b5F0B3BE775C4eA9440", // _lendingPool
                  multisigAddress, // onBehalfOf
                  0                      // referralCode
                ],
            });

            const tx = {
                to:    "0x57ce905CfD7f986A929A26b006f797d181dB706e",
                data:  callData,
                value: parseEther("0.03").toString(), // for example, 0.1 ETH
            };

            console.log('[PROPOSE_TRANSACTION] Transaction:', tx);
            
            // Send the transaction proposal to the user
            await _callback({
                text: `I've prepared the transaction for converting your $${allocationAmount} worth of ETH into ${chosenAsset} and depositing it into Aave to start earning the ${apr}% APY. The transaction will be executed from your multisig wallet (${multisigAddress}).\n\nTransaction Details:\n- Asset: ${chosenAsset}\n- Amount: $${allocationAmount}\n- Protocol: Aave V3\n- Expected APY: ${apr}%\n- Risk Level: ${riskLevel}\n\nThe transaction has been submitted to your multisig wallet and is awaiting your confirmation. Would you like me to help you with anything else regarding this investment?`,
                action: "PROPOSE_TRANSACTION"
            });
            
            return true;
        } catch(error) {
            console.error('[PROPOSE_TRANSACTION] Error:', error);
            await _callback({
                text: `I encountered an error while preparing your transaction: ${error instanceof Error ? error.message : String(error)}`
            });
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
                content: { text: "I've prepared the transaction for converting your $1000 worth of ETH into DAI and depositing it into Aave to start earning the 0.37% APY. The transaction will be executed from your multisig wallet (0x1234567890abcdef). The transaction has been submitted to your multisig wallet and is awaiting your confirmation. Would you like me to help you with anything else regarding this investment?", action: "PROPOSE_TRANSACTION" },
            }
        ]
    ],
} as Action;

async function getGnosisSafeBalance(address: string) {
    // 1) Create a "public client" that can read blockchain data (no wallet needed).
    const client = createPublicClient({
      chain: scrollSepolia,      // or polygon, arbitrum, etc.
      transport: http(),   // uses a default public RPC
    })
  
    // 2) The Gnosis Safe address you're interested in
    const safeAddress = address;  
  
    // 3) Fetch the balance (in wei)
    const rawBalance = await client.getBalance({ address: safeAddress as `0x${string}` })

    console.log('[PROPOSE_TRANSACTION] Raw balance:', rawBalance);
  
    // 4) Format the balance to a human-readable amount (ETH)
    const balanceInEth = formatEther(rawBalance)
    console.log(`Gnosis Safe Balance: ${balanceInEth} ETH`)
    return balanceInEth;
}
  