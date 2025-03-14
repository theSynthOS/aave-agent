import {
    type IAgentRuntime,
    type Memory,
    type State,
    type Evaluator,
    ModelClass,
    composeContext,
    generateText,
    parseJsonArrayFromText,
} from "@elizaos/core";

const aaveReturnsTemplate = `TASK: Analyze Aave Investment Opportunities and Track User Decisions
Review the available assets on Aave, determine the best investment opportunities considering returns and risks, and identify any investment decisions the user has made.

# INSTRUCTIONS
- Analyze each asset's current APR/APY
- Consider the asset's price stability and market risk
- Factor in the asset's liquidity and volatility
- Provide recommendations based on risk tolerance
- Calculate potential returns accounting for risk-adjusted metrics
- Identify if the user has expressed a preference or made a decision about which asset to invest in

# START OF ACTUAL TASK INFORMATION

{{assets}}
{{marketConditions}}
{{riskPreferences}}
{{recentMessages}}

TASK: Analyze the available investment opportunities, provide recommendations, and identify the user's investment decisions. Respond with a JSON array of investment options and user decisions.

Response format should be:
\`\`\`json
{
  "recommendations": [
    {
      "asset": "string",
      "apy": number,
      "riskScore": number, // 1-10, where 10 is highest risk
      "recommendation": {
        "allocation": number, // Recommended allocation percentage
        "reasoning": "string",
        "riskAdjustedReturn": number
      },
      "marketAnalysis": {
        "priceStability": "HIGH" | "MEDIUM" | "LOW",
        "liquidityScore": number, // 1-10
        "volatilityRisk": "HIGH" | "MEDIUM" | "LOW"
      }
    }
  ],
  "userDecision": {
    "hasDecided": boolean,
    "chosenAsset": "string", // null if not decided
    "allocationAmount": number, // null if not specified
    "confidence": "HIGH" | "MEDIUM" | "LOW", // How confident we are in this interpretation
    "extractedFrom": "string" // The message that contained the decision
  }
}
\`\`\``;

async function handler(
    runtime: IAgentRuntime,
    message: Memory,
    state: State | undefined
): Promise<any> {
    state = (await runtime.composeState(message)) as State;
    
    // Get recent messages to analyze for user decisions
    const recentMessages = await runtime.messageManager.getMemories({
        roomId: message.roomId,
    });
    
    // Create an enhanced state that includes recentMessages
    const enhancedState = {
        ...state,
        recentMessages: JSON.stringify(recentMessages.map(m => ({
            role: m.userId === runtime.character.id ? "assistant" : "user",
            content: m.content?.text
        })))
    };
    
    const context = composeContext({
        state: enhancedState,
        template: runtime.character.templates?.goalsTemplate || aaveReturnsTemplate
    });

    const response = await generateText({
        runtime,
        context,
        modelClass: ModelClass.LARGE,
    });

    const analysis = JSON.parse(response.match(/```json\n([\s\S]*?)\n```/)?.[1] || "{}");
    
    // Store the user's decision in the state if one was detected
    if (analysis.userDecision?.hasDecided) {
        await runtime.composeState(message, {
            aaveInvestment: {
                chosenAsset: analysis.userDecision.chosenAsset,
                allocationAmount: analysis.userDecision.allocationAmount,
                decisionTimestamp: Date.now()
            }
        });
    }
    
    return analysis;
}

export const aaveReturnsEvaluator: Evaluator = {
    name: "ANALYZE_AAVE_RETURNS",
    similes: [
        "FIND_BEST_AAVE_RETURNS",
        "ANALYZE_AAVE_INVESTMENTS",
        "EVALUATE_AAVE_OPPORTUNITIES",
        "ASSESS_AAVE_RISKS",
    ],
    validate: async (
        runtime: IAgentRuntime,
        message: Memory
    ): Promise<boolean> => {
        // Check if the message contains keywords related to Aave investment analysis
        const content = message.content?.text?.toLowerCase() || "";
        const keywords = ["aave", "return", "apy", "apr", "invest", "yield"];
        return keywords.some(keyword => content.includes(keyword));
    },
    description: "Analyze Aave investment opportunities considering returns, risks, and market conditions to provide optimal investment recommendations.",
    handler,
    examples: [
        {
            context: `Market conditions:
- USDC APY: 3.5%
- ETH APY: 4.2%
- WBTC APY: 2.8%
- AAVE APY: 8.5%

Risk preferences: Moderate risk tolerance`,
            messages: [
                {
                    user: "user1",
                    content: {
                        text: "What's the best asset to deposit on Aave right now?",
                    },
                },
            ],
            outcome: `[
        {
          "asset": "ETH",
          "apy": 4.2,
          "riskScore": 6,
          "recommendation": {
            "allocation": 40,
            "reasoning": "Good balance of returns and stability",
            "riskAdjustedReturn": 3.8
          },
          "marketAnalysis": {
            "priceStability": "MEDIUM",
            "liquidityScore": 9,
            "volatilityRisk": "MEDIUM"
          }
        }
      ]`,
        },
    ],
}; 