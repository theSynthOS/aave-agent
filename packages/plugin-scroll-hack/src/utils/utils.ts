// Add utility function to validate Ethereum addresses
export const isValidEthereumAddress = (address: string): boolean => {
    // Check if it's a string and matches Ethereum address format (0x followed by 40 hex characters)
    const addressRegex = /^0x[a-fA-F0-9]{40}$/;
    return typeof address === 'string' && addressRegex.test(address);
};
