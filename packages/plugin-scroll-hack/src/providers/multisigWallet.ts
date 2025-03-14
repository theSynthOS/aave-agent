import {
    type IAgentRuntime,
    type Memory,
    type Provider,
    type State,
} from "@elizaos/core";
import { initWalletProvider } from "./wallet";

// Add utility function to validate Ethereum addresses
const isValidEthereumAddress = (address: string): boolean => {
    // Check if it's a string and matches Ethereum address format (0x followed by 40 hex characters)
    const addressRegex = /^0x[a-fA-F0-9]{40}$/;
    return typeof address === 'string' && addressRegex.test(address);
};

const MultisigWalletProvider: Provider = {
    get: async (runtime: IAgentRuntime, message: Memory, state?: State) => {
        try {
            // First check existing memories for a wallet
            const memories = await runtime.messageManager.getMemoriesByRoomIds({roomIds: [message.roomId]});
            console.log('[MULTISIG_PROVIDER] Retrieved memories:', memories.length);

            let userAddress = "";
            // Check for existing wallet in memories
            for (const memory of memories) {
                if (memory.content.actions === "GET_USER_WALLET" && 
                    memory.content.wallet && 
                    isValidEthereumAddress(memory.content.wallet as string)) {
                    userAddress = memory.content.wallet as string;
                    console.log('[MULTISIG_PROVIDER] Found existing valid user wallet address:', userAddress);
                    break;
                }
            }

            if (!userAddress) {
                console.log('[MULTISIG_PROVIDER] No valid wallet address found in memory');
                return `multisig wallet not found`
            }

            const agentAddress = (await initWalletProvider(runtime)).account.address;

            // Fetch multisig wallet information from the API
            const response = await fetch(`http://localhost:3001/api/wallet/get/multisig`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({
                    agentAddress,
                    userAddress
                })
            });

            console.log('[MULTISIG_PROVIDER] API response:', response);

            if (!response.ok) {
                const errorText = await response.text();
                console.error('[MULTISIG_PROVIDER] API error:', errorText);
                return `multisig wallet not found`
            }

            const data = await response.json();
            
            if (data.error) {
                console.error('[MULTISIG_PROVIDER] API returned error:', data.error);
                return `multisig wallet not found`
            }

            return `Multisig wallet address: ${data.data.safeAddress}`;
            
        } catch(error) {
            return `multisig wallet not found`
        }
    }
}

export { MultisigWalletProvider };