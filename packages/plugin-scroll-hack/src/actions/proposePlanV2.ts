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
  "asset": string,
  "allocationAmountUSD": number or null,
  "riskTolerance": "low" | "medium" | "high" or null
}

Recent conversation:
{{conversation}}
`;

// Function to retry generateText with exponential backoff
async function retryGenerateText(runtime, modelClass, context, maxRetries = 3) {
    let lastError = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`[PROPOSE_PLAN] Attempt ${attempt} to generate text`);
            const result = await generateText({
                runtime: runtime,
                modelClass: modelClass,
                context: context,
            });
            
            console.log(`[PROPOSE_PLAN] Successfully generated text on attempt ${attempt}`);
            return result;
        } catch (error) {
            lastError = error;
            console.error(`[PROPOSE_PLAN] Error in generateText attempt ${attempt}:`, error);
            
            // If this is the last attempt, don't wait
            if (attempt < maxRetries) {
                // Exponential backoff: wait longer between each retry
                const delayMs = 1000 * Math.pow(2, attempt - 1); // 1s, 2s, 4s
                console.log(`[PROPOSE_PLAN] Waiting ${delayMs}ms before next attempt`);
                await new Promise(resolve => setTimeout(resolve, delayMs));
            }
        }
    }
    
    // If we've exhausted all retries, throw the last error
    throw lastError || new Error('Failed after maximum retry attempts');
}

export const proposePlanV2Action: Action = {
    name: "PROPOSE_PLAN",
    similes: ["PROPOSE_PLAN", "INVESTMENT_PLAN", "GENERATE_PLAN"],
    validate: async (_runtime: IAgentRuntime, _message: Memory, _state: State) => {
       try {
        // Check if this is a CONTINUE action
        if (_message.content?.actions === "CONTINUE") {
            console.log('[PROPOSE_PLAN] Skipping CONTINUE action');
            return false;
        }

        return true;
       }catch(error){
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
              // Extract investment criteria from recent messages
              const recentMessages = _state.recentMessagesData || [];
              console.log("RECENT MESSAGES=====>",recentMessages);
              const conversationHistory = recentMessages.map(msg => 
                  `${msg.sender || 'User'}: ${msg.content?.text || ''}`).join('\n');
                
            console.log("CONVERSATION HISTORY=====>",conversationHistory);
              
              const extractionPrompt = extractInvestmentCriteriaTemplate.replace(
                  '{{conversation}}', conversationHistory);
              
              const extractionResponse = await generateText({
                  runtime: _runtime,
                  modelClass: ModelClass.SMALL,
                  context: extractionPrompt,
              });

              console.log('[PROPOSE_PLAN] Extraction response:', extractionResponse);

                // Extract JSON from the response, specifically looking for content between ```json and ```
            let jsonContent = extractionResponse;
            const jsonCodeBlockRegex = /```json\s*([\s\S]*?)\s*```/;
            const jsonMatch = extractionResponse.match(jsonCodeBlockRegex);

            if (jsonMatch && jsonMatch[1]) {
                // If we found a JSON code block, use its content
                jsonContent = jsonMatch[1].trim();
                console.log('[PROPOSE_PLAN] Extracted JSON from code block:', jsonContent);
            } else {
                // If no code block, try to find JSON object directly
                const jsonObjectRegex = /\{\s*"asset"[\s\S]*?\}/;
                const directMatch = extractionResponse.match(jsonObjectRegex);
                    if (directMatch) {
                        jsonContent = directMatch[0].trim();
                        console.log('[PROPOSE_PLAN] Extracted JSON directly:', jsonContent);
                    }
            }

            let criteria;
            try {
                criteria = JSON.parse(jsonContent);
            } catch (e) {
                console.error('[PROPOSE_PLAN] Failed to parse extraction response:', e);
                criteria = {
                    asset: null,
                    assetAddress: null, 
                    allocationAmount: null,
                    allocationAmountUSD: null,
                    riskTolerance: null
                };
            }

            console.log('[PROPOSE_PLAN] Extracted criteria:', criteria);

            for (const asset of assets){
                if (asset.asset === criteria.asset){
                    criteria.assetAddress = asset.address;
                    break;
                }
            }

            const allAssetAPR = await AaveProvider.get(_runtime, _message, _state);

            let assetAPR;
            try {
                const promptContext = `Here is the current Aave market data:\n\n${allAssetAPR} i need you to take based on the asset we have which is ${criteria.asset} and strictly return the APR for it in string format where i will be converting it to a number. Do not include any quotes or other characters, just the number.`;
                
                const promptPayload = await retryGenerateText(
                    _runtime, 
                    ModelClass.SMALL, 
                    promptContext,
                    3 // maximum 3 retries
                );
                
                // Clean the response by removing quotes and any non-numeric characters except decimal point
                let cleanedPayload = promptPayload.trim();
                
                // Remove quotes if present
                if ((cleanedPayload.startsWith('"') && cleanedPayload.endsWith('"')) || 
                    (cleanedPayload.startsWith("'") && cleanedPayload.endsWith("'"))) {
                    cleanedPayload = cleanedPayload.substring(1, cleanedPayload.length - 1);
                }
                
                // Remove any remaining non-numeric characters except decimal point and minus sign
                cleanedPayload = cleanedPayload.replace(/[^0-9.\-]/g, '');
                
                console.log('[PROPOSE_PLAN] Original payload:', promptPayload);
                console.log('[PROPOSE_PLAN] Cleaned payload:', cleanedPayload);
                
                // Try to parse the cleaned result as a number
                assetAPR = Number(cleanedPayload);
                
                // Validate the result
                if (isNaN(assetAPR)) {
                    console.error('[PROPOSE_PLAN] Failed to parse APR as number after cleaning:', cleanedPayload);
                    
                    // Try one more approach - extract any number-like pattern
                    const numberPattern = /\d+(\.\d+)?/;
                    const matches = promptPayload.match(numberPattern);
                    
                    if (matches && matches[0]) {
                        assetAPR = Number(matches[0]);
                        console.log('[PROPOSE_PLAN] Extracted number using regex:', assetAPR);
                    } else {
                        // Fallback to a default value
                        assetAPR = 0.36; // Default APR value
                        console.log('[PROPOSE_PLAN] Using default APR value');
                    }
                }
            } catch(error) {
                console.error('[PROPOSE_PLAN] All retries failed:', error);
                // Fallback to a default value
                assetAPR = 0.36; // Default APR value
            }

            console.log(`[PROPOSE_PLAN] Using APR: ${assetAPR}`);


            console.log("FINAL CRITERIA=====>",criteria);

            // If user hasn't decided and we haven't asked before and no plan exists
            if (!criteria.asset || !criteria.assetAddress){
              await _callback({
                text: "I'm sorry, I couldn't find any investment criteria in your conversation. Please provide more information about your investment preferences."
              });

              return false;
            }

            // user already decided
                 // Calculate projected returns
                const dailyRate = assetAPR / 365;
                const returns30Days = criteria.allocationAmountUSD * dailyRate * 30;
                const returns90Days = criteria.allocationAmountUSD * dailyRate * 90;
                const returns180Days = criteria.allocationAmountUSD * dailyRate * 180;

                // Create investment plan
                const investmentPlan = `Thank you for your interest in investing in ${criteria.asset} on Aave!

        Based on your criteria, here's my recommended investment plan:
        
        📊 INVESTMENT SUMMARY:
        - Asset: ${criteria.asset}
        - Investment Amount: $${criteria.allocationAmountUSD}
        - Current APY: ${(assetAPR * 100).toFixed(2)}%
        - Risk Level: ${criteria.riskTolerance}
        
        💰 PROJECTED RETURNS:
        - 30 days: $${returns30Days.toFixed(2)}
        - 90 days: $${returns90Days.toFixed(2)}
        - 180 days: $${returns180Days.toFixed(2)}
        
        Would you like me to prepare the transaction for this investment plan?`;

            // store the plan in memory
            const planMemory: Memory = {
                userId: _message.userId,
                agentId: _message.agentId,
                roomId: _message.roomId,
                content: {
                    text: "Investment plan",
                    action: "PROPOSE_PLAN",
                    source: _message.content?.source,
                    investmentPlan: investmentPlan,
                    investmentDetails: criteria
                } as Content,
            };

            try{
                await _runtime.messageManager.createMemory(planMemory);
            }catch(error){
                console.error('[PROPOSE_PLAN] Error in createMemory:', error);
            }

            console.log('[PROPOSE_PLAN] Investment plan stored in memory');

            // Send the investment plan to the user
            await _callback({
                text: investmentPlan,
                action: "PROPOSE_PLAN",
            });

            return true;
        }catch(error){
            console.error('[PROPOSE_PLAN] Error in handler:', error);
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