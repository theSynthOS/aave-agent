import {
    type IAgentRuntime,
    type Memory,
    type Provider,
    type State,
} from "@elizaos/core";
import { createPublicClient, http } from "viem";
import { scrollSepolia } from "viem/chains";
import { assets } from "../actions/constant/aave";
import OracleABI from "./abi/oracleAbi.json";


const PriceFeedsProvider: Provider = {
    get: async (runtime: IAgentRuntime, message: Memory, state?: State) => {
        try {
            const publicClient = createPublicClient({
                chain: scrollSepolia,
                transport: http(),
            });

            const result: any[] = [];

            for (const asset of assets) {
                const decimals = await publicClient.readContract({
                    address: asset.oracleAddress as `0x${string}`,
                    abi: OracleABI,
                    functionName: "decimals",
                }) as any;
                const data = await publicClient.readContract({
                    address: asset.oracleAddress as `0x${string}`,
                    abi: OracleABI,
                    functionName: "latestAnswer",
                }) as any;

                const price = Number(data) / 10 ** Number(decimals);
                result.push({
                    asset: asset.asset,
                    price: price,
                });
            }

            // Format the price data into a clear string
            let response = "Current asset prices from oracle feeds:\n\n";
            
            result.forEach(item => {
                response += `${item.asset}: $${item.price.toFixed(2)}\n`;
            });

            return response;
        } catch(error) {
            console.error(error);
            return "Sorry, I encountered an error while fetching price feed data.";
        }
    }
}

export { PriceFeedsProvider };