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
} from "@elizaos/core";

export const generatePlanAction: Action = {
    name: "GENERATE_PLAN",
    similes: ["GENERATE_PLAN", "CREATE_PLAN", "EXECUTION_PLAN"],
    validate: async (_runtime: IAgentRuntime, _message: Memory) => {
        const text = _message.content?.text?.toLowerCase() || "";
        const planKeywords = ["plan", "strategy", "approach", "steps", "how to"];
        
        // Check if message contains plan-related keywords
        return planKeywords.some(keyword => text.includes(keyword));
    },
    description:
        "Generate a plan for the user based on the user's criteria for investing in crypto assets",
    handler: async (
        _runtime: IAgentRuntime,
        _message: Memory,
        _state: State,
        _options: { [key: string]: unknown },
        _callback: HandlerCallback): Promise<boolean> => {

       try {
        // Extract user's criteria from the message
        const userCriteria = _message.content?.text || "";
        
        // Generate a plan based on user's criteria
        const planPrompt = `
You are a DeFi investment advisor helping a user create an investment plan.

User's request: ${userCriteria}

Create a detailed investment plan that includes:
1. Analysis of what the user is looking for
2. Recommended assets based on their criteria (focus on popular assets like ETH, WBTC, USDC, DAI)
3. Suggested allocation strategy
4. Expected returns and risks
5. Step-by-step implementation process

Make the plan professional but easy to understand.
`;
        
        const planResponse = await generateText({
            runtime: _runtime,
            context: planPrompt,
            modelClass: ModelClass.LARGE
        });
        
        // Send the plan to the user
        await _callback({
            text: planResponse,
            action: "GENERATE_PLAN"
        });
        
        // Store the plan in memory for future reference
        const planMemory: Memory = {
            userId: _message.userId,
            agentId: _message.agentId,
            roomId: _message.roomId,
            content: {
                text: "Investment plan",
                action: "GENERATE_PLAN",
                source: _message.content?.source,
                plan: planResponse
            } as Content,
        };

        await _runtime.messageManager.createMemory(planMemory);
        
        return true;
       } catch(error) {
        console.error('[GENERATE_PLAN] Error:', error);
        await _callback({
            text: `I encountered an error while generating your investment plan: ${error instanceof Error ? error.message : String(error)}`
        });
        return false;
       }
    },
    examples: [
        [
            {
                user: "{{user1}}",
                content: { text: "Can you help me create a plan for investing in DeFi?" },
            },
            {
                user: "{{user2}}",
                content: { text: "# DeFi Investment Plan\n\n## Analysis of Your Needs\nBased on your request, you're looking to enter the DeFi space with a strategic investment approach. DeFi offers various opportunities for generating yield through lending, liquidity provision, and staking.\n\n## Recommended Assets\n\n### 1. Stablecoins (40-50% allocation)\n- **USDC**: Highly regulated, secure stablecoin\n- **DAI**: Decentralized stablecoin, more resistant to regulatory risks\n\n### 2. Blue-chip Crypto (30-40% allocation)\n- **ETH**: The foundation of most DeFi protocols\n- **WBTC**: Bitcoin exposure in the DeFi ecosystem\n\n### 3. DeFi Protocol Tokens (10-20% allocation)\n- Consider small allocations to governance tokens of platforms you use\n\n## Implementation Strategy\n\n1. **Start with Aave**: Deposit stablecoins and ETH to earn yield\n2. **Dollar-cost average**: Invest gradually rather than all at once\n3. **Diversify across protocols**: Consider using 2-3 different platforms\n\n## Expected Returns and Risks\n\n### Returns\n- Stablecoins: 1-5% APY\n- ETH/WBTC lending: 0.5-2% APY\n- Higher returns possible with more complex strategies\n\n### Risks\n- Smart contract vulnerabilities\n- Market volatility (for non-stablecoins)\n- Regulatory changes\n- Impermanent loss in liquidity pools\n\n## Next Steps\n\n1. Set up a secure wallet (MetaMask recommended)\n2. Purchase your initial assets\n3. Connect to Aave and deposit funds\n4. Monitor your positions weekly\n5. Rebalance quarterly\n\nWould you like me to help you implement any specific part of this plan?", action: "GENERATE_PLAN" },
            }
        ]
    ],
} as Action;
