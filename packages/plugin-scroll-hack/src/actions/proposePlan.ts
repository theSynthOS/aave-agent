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
import { AaveProvider } from "../providers/getAaveData";

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
    assetInfoRequested?: boolean;
    recentMessagesData: any[];
    lastProcessedMessageId?: string;
    processedMessageIds?: string[];
}

const extractInvestmentCriteriaTemplate = `
You are analyzing a conversation to extract the user's investment criteria for Aave.
Extract the following information:
1. Has the user decided on an asset to invest in? (true/false)
2. If decided, which asset? (USDC, DAI, ETH, WBTC, etc.)
3. How much does the user want to allocate? (in USD)
4. What is the user's risk tolerance? (low, medium, high)

Format your response as a JSON object with the following structure:
{
  "hasDecided": boolean,
  "chosenAsset": string or null,
  "allocationAmount": number or null,
  "riskTolerance": "low" | "medium" | "high" or null
}

Recent conversation:
{{conversation}}
`;

export const proposePlanAction: Action = {
    name: "PROPOSE_PLAN",
    similes: ["PROPOSE_PLAN", "INVESTMENT_PLAN", "GENERATE_PLAN"],
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
            
            // Check if message contains investment plan intent
            const planKeywords = ["plan", "invest", "strategy", "recommend", "suggestion", "advice", "portfolio"];
            const hasInvestmentIntent = planKeywords.some(keyword => text.includes(keyword));
            
            // Check if user is responding to our asset question
            const assetKeywords = ["usdc", "dai", "eth", "wbtc", "bitcoin", "ethereum", "stablecoin"];
            const isAssetResponse = _state.assetInfoRequested && 
                (assetKeywords.some(keyword => text.includes(keyword)) || 
                 text.includes("yes") || 
                 text.includes("sounds good") ||
                 text.includes("like the plan"));
            
            return hasInvestmentIntent || isAssetResponse;
        } catch (error) {
            console.error('[PROPOSE_PLAN] Error in validate:', error);
            return false;
        }
    },
    description: "Propose an investment plan based on user criteria",
    handler: async (
        _runtime: IAgentRuntime,
        _message: Memory,
        _state: State,
        _options: { [key: string]: unknown },
        _callback: HandlerCallback): Promise<boolean> => {
        try {
            console.log('[PROPOSE_PLAN] Handler started');
            
            // Mark this message as processed
            const processedMessageIds = _state.processedMessageIds || [];
            processedMessageIds.push(_message.id);
            await _runtime.composeState(_message, {
                processedMessageIds
            });
            
            // Check if we already have a plan in memories
            const memories = await _runtime.messageManager.getMemoriesByRoomIds({roomIds: [_message.roomId]});
            let existingPlan = false;
            
            for (const memory of memories) {
                if (memory.content.action === "PROPOSE_PLAN" && 
                    memory.content.investmentDetails) {
                    existingPlan = true;
                    break;
                }
            }
            
            // Extract investment criteria from recent messages
            const recentMessages = _state.recentMessagesData || [];
            const conversationHistory = recentMessages.map(msg => 
                `${msg.sender || 'User'}: ${msg.text || ''}`).join('\n');
            
            const extractionPrompt = extractInvestmentCriteriaTemplate.replace(
                '{{conversation}}', conversationHistory);
            
            const extractionResponse = await generateText({
                runtime: _runtime,
                modelClass: ModelClass.LARGE,
                context: extractionPrompt,
            });
            
            console.log('[PROPOSE_PLAN] Extraction response:', extractionResponse);
            
            let criteria;
            try {
                criteria = JSON.parse(extractionResponse);
            } catch (e) {
                console.error('[PROPOSE_PLAN] Failed to parse extraction response:', e);
                criteria = {
                    hasDecided: false,
                    chosenAsset: null,
                    allocationAmount: null,
                    riskTolerance: null
                };
            }
            
            // If user hasn't decided and we haven't asked before and no plan exists
            if ((!criteria.hasDecided || !criteria.chosenAsset) && 
                !_state.assetInfoRequested && 
                !existingPlan) {
                
                await _callback({
                    text: `I'd be happy to help you with an investment plan for Aave. Could you please tell me which asset you're interested in (WBTC, USDC, DAI, etc.) and how much you're planning to invest?`
                });
                
                // Mark that we've asked for asset info
                await _runtime.composeState(_message, {
                    assetInfoRequested: true
                });
                
                return true;
            }
            
            // If user still hasn't decided but we've already asked, try to make a recommendation
            if ((!criteria.hasDecided || !criteria.chosenAsset) && 
                _state.assetInfoRequested) {
                
                // Try to determine what to recommend based on any clues in their messages
                let recommendedAsset = "";
                
                if (criteria.riskTolerance === "low" || 
                    recentMessages.some(msg => 
                        (msg.text || "").toLowerCase().includes("safe") || 
                        (msg.text || "").toLowerCase().includes("low risk") ||
                        (msg.text || "").toLowerCase().includes("not risky"))) {
                    recommendedAsset = "USDC";
                } else if (criteria.riskTolerance === "high" || 
                          recentMessages.some(msg => 
                              (msg.text || "").toLowerCase().includes("high return"))) {
                    recommendedAsset = "WBTC";
                } else {
                    // Default recommendation
                    recommendedAsset = "USDC";
                }
                
                // Update criteria with our recommendation
                criteria.chosenAsset = recommendedAsset;
                criteria.hasDecided = true;
            }
            
            // Set default allocation amount if not specified
            if (!criteria.allocationAmount) {
                criteria.allocationAmount = 1000; // Default to $1000
            }
            
            // Get market data from Aave provider
            const marketDataResponse = await AaveProvider.get(_runtime, _message, _state);
            
            // Parse the market data response
            // The response is a string, so we need to extract the relevant information
            const marketDataString = marketDataResponse as string;
            
            // Find the asset in the market data string
            const assetSymbol = criteria.chosenAsset.toUpperCase();
            const assetRegex = new RegExp(`${assetSymbol}:\\n- Deposit: ([\\d.]+)% APY \\(([\\d.]+)% APR\\)\\n- Variable Borrow: [\\d.]+% APY \\([\\d.]+% APR\\)\\n- Stable Borrow: [\\d.]+% APY \\([\\d.]+% APR\\)\\n- LTV: ([\\d.]+)%\\n- Liquidation Threshold: ([\\d.]+)%`, 'i');
            
            const assetMatch = marketDataString.match(assetRegex);
            
            let apr = 0;
            let ltv = 0;
            let liquidationThreshold = 0;
            
            if (assetMatch) {
                // Extract values from the regex match
                const [_, depositAPY, depositAPR, ltvValue, liquidationThresholdValue] = assetMatch;
                apr = parseFloat(depositAPR) / 100; // Convert from percentage to decimal
                ltv = parseFloat(ltvValue) / 100;
                liquidationThreshold = parseFloat(liquidationThresholdValue) / 100;
            } else {
                console.log('[PROPOSE_PLAN] Asset not found in market data, using fallback values');
                
                // Use fallback values
                const fallbackValues = {
                    'USDC': { apr: 0.0036, ltv: 0.8, liquidationThreshold: 0.85 },
                    'DAI': { apr: 0.0037, ltv: 0.75, liquidationThreshold: 0.8 },
                    'ETH': { apr: 0.0052, ltv: 0.8, liquidationThreshold: 0.825 },
                    'WBTC': { apr: 0.0017, ltv: 0.7, liquidationThreshold: 0.75 },
                    'USDT': { apr: 0.0035, ltv: 0.75, liquidationThreshold: 0.8 },
                    'WETH': { apr: 0.0052, ltv: 0.8, liquidationThreshold: 0.825 }
                };
                
                const fallback = fallbackValues[assetSymbol] || { apr: 0.003, ltv: 0.75, liquidationThreshold: 0.8 };
                apr = fallback.apr;
                ltv = fallback.ltv;
                liquidationThreshold = fallback.liquidationThreshold;
            }
            
            // Find the asset in our local assets list
            const assetDetails = assets.find(a => 
                a.asset.toUpperCase() === assetSymbol);
            
            if (!assetDetails) {
                console.error('[PROPOSE_PLAN] Asset not found in local assets list:', assetSymbol);
                await _callback({
                    text: `I'm sorry, but I couldn't find details for ${criteria.chosenAsset}. Would you like to choose a different asset?`
                });
                return false;
            }
            
            // Calculate projected returns
            const dailyRate = apr / 365;
            const returns30Days = criteria.allocationAmount * dailyRate * 30;
            const returns90Days = criteria.allocationAmount * dailyRate * 90;
            const returns180Days = criteria.allocationAmount * dailyRate * 180;
            
            // Determine risk level
            let riskLevel = "Low";
            if (["ETH", "WBTC", "WETH"].includes(assetSymbol)) {
                riskLevel = "Medium to High";
            } else if (["USDC", "USDT", "DAI"].includes(assetSymbol)) {
                riskLevel = "Low";
            }
            
            // Asset descriptions
            const assetDescriptions = {
                'USDC': "USDC is a regulated stablecoin backed by US Dollar reserves, providing security and stability.",
                'DAI': "DAI is a decentralized stablecoin that maintains its value through a system of smart contracts and collateralization.",
                'ETH': "ETH is the native cryptocurrency of the Ethereum blockchain and the foundation of many DeFi applications.",
                'WBTC': "WBTC (Wrapped Bitcoin) allows you to use Bitcoin in Ethereum-based DeFi applications while maintaining exposure to BTC price movements.",
                'USDT': "USDT (Tether) is a stablecoin pegged to the US Dollar, offering stability for your investment.",
                'WETH': "WETH is a wrapped version of ETH that conforms to the ERC-20 standard, making it compatible with all Ethereum dApps."
            };
            
            // Risk descriptions
            const riskDescriptions = {
                'USDC': "This is a relatively low-risk investment as stablecoins maintain their peg to the US Dollar. However, smart contract risks still exist.",
                'DAI': "While DAI is designed to maintain its peg to the US Dollar, it relies on over-collateralization which introduces some systemic risk.",
                'ETH': "ETH price can be volatile, which affects your principal investment. Consider your risk tolerance before proceeding.",
                'WBTC': "Bitcoin price volatility directly affects WBTC value. This is a higher risk option with potential for greater returns or losses.",
                'USDT': "While USDT is a stablecoin, it has faced questions about its reserves. It carries slightly more risk than other stablecoins.",
                'WETH': "As a wrapped version of ETH, WETH carries the same price volatility risks as ETH, plus smart contract risks."
            };
            
            // Create investment plan
            const investmentPlan = `Thank you for your interest in investing in ${assetDetails.asset} on Aave!

Based on your criteria, here's my recommended investment plan:

📊 INVESTMENT SUMMARY:
- Asset: ${assetDetails.asset}
- Investment Amount: $${criteria.allocationAmount}
- Current APY: ${(apr * 100).toFixed(2)}%
- Risk Level: ${riskLevel}

💰 PROJECTED RETURNS:
- 30 days: $${returns30Days.toFixed(2)}
- 90 days: $${returns90Days.toFixed(2)}
- 180 days: $${returns180Days.toFixed(2)}

🔍 WHY ${assetDetails.asset}?
${assetDescriptions[assetSymbol] || `${assetDetails.asset} is a popular asset on Aave with competitive returns.`}

⚠️ RISK CONSIDERATIONS:
${riskDescriptions[assetSymbol] || `This investment carries some level of risk. Please consider your risk tolerance before proceeding.`}

Would you like me to prepare the transaction for this investment plan?`;
            
            // Store investment details in state
            const investmentDetails = {
                chosenAsset: assetDetails.asset,
                allocationAmount: criteria.allocationAmount,
                assetAddress: assetDetails.address,
                apr: apr,
                riskLevel: riskLevel,
                decisionTimestamp: Date.now(),
                planTimestamp: Date.now()
            };
            
            await _runtime.composeState(_message, {
                aaveInvestment: investmentDetails,
                investmentPlanPresented: true
            });
            
            // Send the investment plan to the user
            await _callback({
                text: investmentPlan,
                action: "PROPOSE_PLAN",
                investmentDetails: investmentDetails
            });
            
            // After presenting the plan, reset the assetInfoRequested flag if the user wants to change plans
            if (_message.content?.text?.toLowerCase().includes("change") || 
                _message.content?.text?.toLowerCase().includes("different asset")) {
                await _runtime.composeState(_message, {
                    assetInfoRequested: false,
                    investmentPlanPresented: false
                });
            }
            
            return true;
        } catch(error) {
            console.error('[PROPOSE_PLAN] Error:', error);
            await _callback({
                text: `I encountered an error while analyzing your investment criteria: ${error instanceof Error ? error.message : String(error)}`
            });
            return false;
        }
    },
    examples: [
        [
            {
                user: "{{user1}}",
                content: { text: "I'm interested in investing in crypto on Aave" },
            },
            {
                user: "{{user2}}",
                content: { text: "Thank you for your interest in investing in USDC on Aave!\n\nBased on your criteria, here's my recommended investment plan:\n\n📊 INVESTMENT SUMMARY:\n- Asset: USDC\n- Investment Amount: $1000\n- Current APY: 0.36%\n- Risk Level: Low\n\n💰 PROJECTED RETURNS:\n- 30 days: $0.30\n- 90 days: $0.90\n- 180 days: $1.80\n\n🔍 WHY USDC?\nUSDC is a regulated stablecoin backed by US Dollar reserves, providing security and stability.\n\n⚠️ RISK CONSIDERATIONS:\nThis is a relatively low-risk investment as stablecoins maintain their peg to the US Dollar. However, smart contract risks still exist.\n\nWould you like me to prepare the transaction for this investment plan?", action: "PROPOSE_PLAN" },
            }
        ]
    ],
} as Action; 