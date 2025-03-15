import { 
    type Action, 
    type IAgentRuntime, 
    type Memory, 
    type ActionExample, 
    type HandlerCallback, 
    type State as BaseState,
} from "@elizaos/core";
import aaveEthAbi from "./constant/abi/aaveEthAbi.json";
import { encodeFunctionData, parseEther } from "viem";

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
            
            // Check if we have investment details in memories
            const memories = await _runtime.messageManager.getMemoriesByRoomIds({roomIds: [_message.roomId]});
            let hasInvestmentPlan = false;
            
            for (const memory of memories) {
                if (memory.content.action === "PROPOSE_PLAN" && memory.content.investmentDetails) {
                    hasInvestmentPlan = true;
                    break;
                }
            }
            
            return hasTransactionIntent && hasInvestmentPlan;
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
            
            // Mark this message as processed
            const processedMessageIds = _state.processedMessageIds || [];
            processedMessageIds.push(_message.id);
            await _runtime.composeState(_message, {
                processedMessageIds
            });
            
            // Get investment details from memories
            const memories = await _runtime.messageManager.getMemoriesByRoomIds({roomIds: [_message.roomId]});
            let investmentDetails = null;
            
            for (const memory of memories) {
                if (memory.content.action === "PROPOSE_PLAN" && 
                    memory.content.investmentDetails) {
                    investmentDetails = memory.content.investmentDetails;
                    console.log('[PROPOSE_TRANSACTION] Found investment details in memory:', 
                        JSON.stringify(memory.content.investmentDetails, (_, v) => 
                            typeof v === 'bigint' ? v.toString() : v));
                    break;
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
            
            const { chosenAsset, allocationAmount, assetAddress, apr, riskLevel } = investmentDetails;
            
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
            
            // Send only the transaction JSON to the user
            await _callback({
                text: JSON.stringify(tx, null, 2),
                action: "PROPOSE_TRANSACTION"
            });
            
            return true;
        } catch(error) {
            console.error('[PROPOSE_TRANSACTION] Error:', error);
            await _callback({
                text: JSON.stringify({
                    error: error instanceof Error ? error.message : String(error)
                })
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
                content: { text: "{\n  \"to\": \"0x57ce905CfD7f986A929A26b006f797d181dB706e\",\n  \"data\": \"0x474cf53d00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000\",\n  \"value\": \"30000000000000000\"\n}", action: "PROPOSE_TRANSACTION" },
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
  