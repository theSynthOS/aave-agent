import type { Plugin } from "@elizaos/core";
import { createMultisigAction } from "./actions/index.js";
// import { getUserWalletAction } from "./actions/index.js";
import { AaveProvider } from "./providers/getAaveData.js";
import { PriceFeedsProvider } from "./providers/price_feeds.js";
import { evmWalletProvider } from "./providers/wallet.js";
import { MultisigWalletProvider } from "./providers/multisigWallet.js";

export * as actions from "./actions/index.js";
export * as evaluators from "./evaluators/index.js";
export * as providers from "./providers/index.js";

export const scrollHackPlugin: Plugin = {
    name: "scrollHack",
    description: "Agent bootstrap with basic actions and evaluators",
    actions: [
       createMultisigAction,
    //    getUserWalletAction
    ],
    evaluators: [],
    providers: [
        AaveProvider,
        PriceFeedsProvider,
        evmWalletProvider,
        MultisigWalletProvider
    ],
};
export default scrollHackPlugin;
