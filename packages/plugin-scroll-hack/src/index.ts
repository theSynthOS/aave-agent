import type { Plugin } from "@elizaos/core";
import { getAaveDataAction } from "./actions/getAaveData.js";
import { AaveProvider } from "./providers/getAaveData.js";
import { PriceFeedsProvider } from "./providers/price_feeds.js";

export * as actions from "./actions/index.js";
export * as evaluators from "./evaluators/index.js";
export * as providers from "./providers/index.js";

export const scrollHackPlugin: Plugin = {
    name: "scrollHack",
    description: "Agent bootstrap with basic actions and evaluators",
    actions: [
       
    ],
    evaluators: [],
    providers: [
        AaveProvider,
        PriceFeedsProvider
    ],
};
export default scrollHackPlugin;
