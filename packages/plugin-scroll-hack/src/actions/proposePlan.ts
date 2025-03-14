import { 
    type Action, 
    type IAgentRuntime, 
    type Memory, 
    type ActionExample, 
    type HandlerCallback, 
    type State as BaseState,
    ModelClass,
    generateText,
    Content,
} from "@elizaos/core";
import { assets } from "./constant/aave";
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

export const proposePlanAction: Action = {
    name: "PROPOSE_PLAN",
    similes: ["PROPOSE_PLAN", "CREATE_INVESTMENT_PLAN", "SUGGEST_INVESTMENT"],
    validate: async (_runtime: IAgentRuntime, _message: Memory, _state: State) => {
        try {
            console.log('[PROPOSE_PLAN] Validating with state:', JSON.stringify(_state));
            
            // Check if this is a CONTINUE action
            if (_message.content?.actions === "CONTINUE") {
                console.log('[PROPOSE_PLAN] Skipping CONTINUE action');
                return false;
            }
            
            // Prevent duplicate processing
            if (_state.processedMessageIds && _state.processedMessageIds.includes(_message.id)) {
                console.log('[PROPOSE_PLAN] Already processed this message');
                return false;
            }
            
            const text = _message.content?.text?.toLowerCase() || "";
            const investmentKeywords = ["invest", "investment", "plan", "aave", "money"];
            
            // Check if message contains investment intent
            const hasInvestmentIntent = investmentKeywords.some(keyword => text.includes(keyword));
            
            return hasInvestmentIntent && !_state.investmentPlanPresented;
        } catch (error) {
            console.error('[PROPOSE_PLAN] Error in validate:', error);
            return false;
        }
    },
    description: "Extract the user's investment decision from the conversation and create a detailed investment plan",
    handler: async (
        _runtime: IAgentRuntime,
        _message: Memory,
        _state: State,
        _options: { [key: string]: unknown },
        _callback: HandlerCallback): Promise<boolean> => {
        try {
            console.log('[PROPOSE_PLAN] Handler started with state:', JSON.stringify(_state));
            
            // Mark this message as processed
            const processedMessageIds = _state.processedMessageIds || [];
            await _runtime.composeState(_message, {
                processedMessageIds: [...processedMessageIds, _message.id]
            });
            
            // Extract investment decision from message or state
            const text = _message.content?.text?.toLowerCase() || "";
            let chosenAsset = "DAI"; // Default to DAI
            let allocationAmount = 1000; // Default to $1000
            
            // Check if we already have an investment decision in state
            if (_state.aaveInvestment?.chosenAsset) {
                chosenAsset = _state.aaveInvestment.chosenAsset;
                allocationAmount = _state.aaveInvestment.allocationAmount || 1000;
            } else {
                // Try to extract from message
                if (text.includes("dai")) chosenAsset = "DAI";
                if (text.includes("usdc")) chosenAsset = "USDC";
                if (text.includes("wbtc")) chosenAsset = "WBTC";
                
                // Try to extract amount
                const amountMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:eth|dai|usdc|\$|dollars)/i);
                if (amountMatch) {
                    allocationAmount = parseFloat(amountMatch[1]);
                }
            }
            
            // Find the asset details
            const assetDetails = assets.find(a => a.asset === chosenAsset);
            if (!assetDetails) {
                await _callback({
                    text: `I'm sorry, but ${chosenAsset} is not currently supported. We support: ${assets.map(a => a.asset).join(', ')}. Would you like to choose one of these instead?`
                });
                return true;
            }
            
            // Get APR and risk level for the asset
            const aprRates = {
                "WBTC": 0.17,
                "USDC": 0.36,
                "DAI": 0.37
            };
            
            const riskLevels = {
                "WBTC": "High",
                "USDC": "Low",
                "DAI": "Low"
            };
            
            // Generate investment plan
            await _callback({
                text: `Thank you for expressing your interest in investing $${allocationAmount} in ${chosenAsset}! Based on current market data, ${chosenAsset} offers a deposit APY of ${aprRates[chosenAsset]}%, providing minimal risk and steady returns. I will now propose the transaction for converting your ETH into ${chosenAsset} and depositing it into Aave. Please review the proposed transaction carefully once it's ready.`,
                action: "PROPOSE_PLAN"
            });
            
            // Store the investment decision and plan in state
            await _runtime.composeState(_message, {
                investmentPlanPresented: true,
                aaveInvestment: {
                    chosenAsset,
                    allocationAmount,
                    assetAddress: assetDetails.address,
                    apr: aprRates[chosenAsset],
                    riskLevel: riskLevels[chosenAsset],
                    planTimestamp: Date.now()
                }
            });
            
            // Then create a memory to store the investment details
            const investmentMemory: Memory = {
                userId: _message.agentId,
                agentId: _message.agentId,
                roomId: _message.roomId,
                content: {
                    text: `Investment plan for ${chosenAsset}`,
                    action: "PROPOSE_PLAN",
                    source: _message.content?.source,
                    investmentDetails: {
                        chosenAsset,
                        allocationAmount,
                        assetAddress: assetDetails.address,
                        apr: aprRates[chosenAsset],
                        riskLevel: riskLevels[chosenAsset],
                        planTimestamp: Date.now()
                    }
                } as Content,
            };

            await _runtime.messageManager.createMemory(investmentMemory);
            
            return true;
        } catch(error) {
            console.error('[PROPOSE_PLAN] Error:', error);
            await _callback({
                text: `I encountered an error while analyzing your investment decision: ${error instanceof Error ? error.message : String(error)}`
            });
            return false;
        }
    },
    examples: [
        [
            {
                user: "{{user1}}",
                content: { text: "I think I want to invest in USDC on Aave" },
            },
            {
                user: "{{user2}}",
                content: { text: "Thank you for expressing your interest in investing in USDC! Based on current market data, USDC offers a deposit APY of 0.36%, providing minimal risk and steady returns. I will now propose the transaction for converting your ETH into USDC and depositing it into Aave. Please review the proposed transaction carefully once it's ready.", action: "PROPOSE_PLAN" },
            }
        ]
    ],
} as Action; 