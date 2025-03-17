import type { Plugin } from "@elizaos/core";
import { proposePlanV2Action, proposeTransactionV2Action } from "./actions/index.js";
// import { getUserWalletAction } from "./actions/index.js";
import { AaveProvider } from "./providers/getAaveData.js";
import { PriceFeedsProvider } from "./providers/price_feeds.js";
import { evmWalletProvider } from "./providers/wallet.js";
import { aaveReturnsEvaluator } from "./evaluators/index.js";

export * as actions from "./actions/index.js";
export * as evaluators from "./evaluators/index.js";
export * as providers from "./providers/index.js";

export const scrollHackPlugin: Plugin = {
    name: "scrollHack",
    description: "Agent that can help you to invest in Aave with the help of a multisig wallet",
    actions: [
        proposePlanV2Action,
        proposeTransactionV2Action,
    ],
    evaluators: [
        aaveReturnsEvaluator
    ],
    providers: [
        AaveProvider,
        PriceFeedsProvider,
        evmWalletProvider,
    ],
};
export default scrollHackPlugin;
