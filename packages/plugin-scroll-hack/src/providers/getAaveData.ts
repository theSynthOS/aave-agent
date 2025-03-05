import { type Provider, type AgentRuntime as IAgentRuntime, Memory, State } from "@elizaos/core";
import { createPublicClient, http } from 'viem'
import { scrollSepolia } from 'viem/chains'
import { AaveV3PoolAddress, assets } from "../actions/constant/aave";

const AaveV3PoolABI = [
    {
      "inputs": [
        {
          "internalType": "address",
          "name": "asset",
          "type": "address"
        }
      ],
      "name": "getReserveData",
      "outputs": [
        {
          "components": [
            {
              "components": [
                {
                  "internalType": "uint256",
                  "name": "data",
                  "type": "uint256"
                }
              ],
              "internalType": "struct DataTypes.ReserveConfigurationMap",
              "name": "configuration",
              "type": "tuple"
            },
            {
              "internalType": "uint128",
              "name": "liquidityIndex",
              "type": "uint128"
            },
            {
              "internalType": "uint128",
              "name": "currentLiquidityRate",
              "type": "uint128"
            },
            {
              "internalType": "uint128",
              "name": "variableBorrowIndex",
              "type": "uint128"
            },
            {
              "internalType": "uint128",
              "name": "currentVariableBorrowRate",
              "type": "uint128"
            },
            {
              "internalType": "uint128",
              "name": "currentStableBorrowRate",
              "type": "uint128"
            },
            {
              "internalType": "uint40",
              "name": "lastUpdateTimestamp",
              "type": "uint40"
            },
            {
              "internalType": "uint16",
              "name": "id",
              "type": "uint16"
            },
            {
              "internalType": "address",
              "name": "aTokenAddress",
              "type": "address"
            },
            {
              "internalType": "address",
              "name": "stableDebtTokenAddress",
              "type": "address"
            },
            {
              "internalType": "address",
              "name": "variableDebtTokenAddress",
              "type": "address"
            },
            {
              "internalType": "address",
              "name": "interestRateStrategyAddress",
              "type": "address"
            },
            {
              "internalType": "uint128",
              "name": "accruedToTreasury",
              "type": "uint128"
            },
            {
              "internalType": "uint128",
              "name": "unbacked",
              "type": "uint128"
            },
            {
              "internalType": "uint128",
              "name": "isolationModeTotalDebt",
              "type": "uint128"
            }
          ],
          "internalType": "struct DataTypes.ReserveData",
          "name": "",
          "type": "tuple"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    }
  ];

  const ProxyABI = [
    {"inputs":[{"internalType":"address","name":"admin","type":"address"}],"stateMutability":"nonpayable","type":"constructor"},
    {"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"implementation","type":"address"}],"name":"Upgraded","type":"event"},
    {"stateMutability":"payable","type":"fallback"},
    {"inputs":[],"name":"admin","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"nonpayable","type":"function"},
    {"inputs":[],"name":"implementation","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"nonpayable","type":"function"},
    {"inputs":[{"internalType":"address","name":"_logic","type":"address"},{"internalType":"bytes","name":"_data","type":"bytes"}],"name":"initialize","outputs":[],"stateMutability":"payable","type":"function"},
    {"inputs":[{"internalType":"address","name":"newImplementation","type":"address"}],"name":"upgradeTo","outputs":[],"stateMutability":"nonpayable","type":"function"},
    {"inputs":[{"internalType":"address","name":"newImplementation","type":"address"},{"internalType":"bytes","name":"data","type":"bytes"}],"name":"upgradeToAndCall","outputs":[],"stateMutability":"payable","type":"function"}
  ];

// Create the AaveProvider
const AaveProvider: Provider = {
  /**
   * The `get` method runs whenever Eliza invokes this Provider.
   * It should return the data your pipeline needs (e.g., an array of stats).
   */
  get: async (runtime: IAgentRuntime, message: Memory, state?: State) => {
    try {
      // Optionally, you could also read `assets` or other configs from `state` or `runtime`
      // e.g., const assets = state?.someConfig?.assets || [];
      
      // If you need to (re)create the publicClient here, do so:
      const publicClient = createPublicClient({
        chain: scrollSepolia,
        transport: http(),
      });

      const result: any[] = [];

      for (const asset of assets) {
        try {
          // Fetch reserve data from Aave
          const data = await publicClient.readContract({
            address: AaveV3PoolAddress as `0x${string}`, // e.g. AaveV3PoolAddress
            abi: AaveV3PoolABI,
            functionName: "getReserveData",
            args: [asset.address],
          }) as any;

          // Extract needed values
          const {
            configuration,
            liquidityIndex,
            currentLiquidityRate,
            variableBorrowIndex,
            currentVariableBorrowRate,
            currentStableBorrowRate,
          } = data;

          // Calculate APYs / APRs using your helpers
          const depositAPY = calculateAPYFromRay(currentLiquidityRate);
          const variableBorrowAPY = calculateAPYFromRay(currentVariableBorrowRate);
          const stableBorrowAPY = calculateAPYFromRay(currentStableBorrowRate);

          const depositAPR = calculateAPRFromRay(currentLiquidityRate);
          const variableBorrowAPR = calculateAPRFromRay(currentVariableBorrowRate);
          const stableBorrowAPR = calculateAPRFromRay(currentStableBorrowRate);

          // Extract configuration info
          const configInfo = extractReserveConfig(configuration.data);

          // Push a consolidated object into result
          result.push({
            asset: asset.asset,
            address: asset.address,
            depositAPY,
            variableBorrowAPY,
            stableBorrowAPY,
            depositAPR,
            variableBorrowAPR,
            stableBorrowAPR,
            config: configInfo,
            lastUpdateTimestamp: Number(data.lastUpdateTimestamp),
            id: Number(data.id),
            aTokenAddress: data.aTokenAddress,
            stableDebtTokenAddress: data.stableDebtTokenAddress,
            variableDebtTokenAddress: data.variableDebtTokenAddress,
            interestRateStrategyAddress: data.interestRateStrategyAddress,
          });
        } catch (innerError) {
          console.error(`Error processing ${asset.asset}:`, innerError);
          // Store the error info for that asset
          result.push({
            asset: asset.asset,
            address: asset.address,
            error: (innerError as Error).message,
          });
        }
      }

      // Format the data into a clear, informative string
      const successfulAssets = result.filter(item => !item.error);
      const failedAssets = result.filter(item => item.error);
      
      let response = "Here's the current Aave market data:\n\n";
      
      // Add successful assets information
      successfulAssets.forEach(asset => {
        response += `${asset.asset}:\n`;
        response += `- Deposit: ${asset.depositAPY}% APY (${asset.depositAPR}% APR)\n`;
        response += `- Variable Borrow: ${asset.variableBorrowAPY}% APY (${asset.variableBorrowAPR}% APR)\n`;
        response += `- Stable Borrow: ${asset.stableBorrowAPY}% APY (${asset.stableBorrowAPR}% APR)\n`;
        response += `- LTV: ${asset.config.ltv}%\n`;
        response += `- Liquidation Threshold: ${asset.config.liquidationThreshold}%\n\n`;
      });

      // Add failed assets information if any
      if (failedAssets.length > 0) {
        response += "\nFailed to fetch data for:\n";
        failedAssets.forEach(asset => {
          response += `${asset.asset}: ${asset.error}\n`;
        });
      }

      return response;
    } catch (error) {
      console.error("Error in AaveProvider.get:", error);
      return []; // or throw error
    }
  },
};

// Function to calculate APY from ray format
function calculateAPYFromRay(rayRate) {
    // Convert from ray (10^27) to decimal
    const rate = Number(rayRate) / 10 ** 27;
    
    // Aave compounds per second
    const secondsPerYear = 31536000;
    
    // APY formula: (1 + rate/secondsPerYear)^secondsPerYear - 1
    const apy = Math.pow((1 + (rate / secondsPerYear)), secondsPerYear) - 1;
    
    // Convert to percentage and round to 2 decimal places
    return parseFloat((apy * 100).toFixed(2));
  }
  
  // Function to calculate APR from ray format (simple interest)
  function calculateAPRFromRay(rayRate) {
    // Convert from ray (10^27) to decimal and to percentage
    const apr = Number(rayRate) / 10 ** 27 * 100;
    
    // Round to 2 decimal places
    return parseFloat(apr.toFixed(2));
  }
  
  // Function to extract LTV, liquidation threshold, and other parameters from configuration
  function extractReserveConfig(configData) {
    // Convert to BigInt if it's not already
    const data = BigInt(configData);
    
    // Extract parameters according to the bitmap structure:
    // bit 0-15: LTV
    const ltv = Number((data & 0xFFFFn) / 100n); // Divide by 100 as these are stored as percentages * 100
    
    // bit 16-31: Liquidation threshold
    const liquidationThreshold = Number(((data >> 16n) & 0xFFFFn) / 100n);
    
    // bit 32-47: Liquidation bonus
    const liquidationBonus = Number(((data >> 32n) & 0xFFFFn) / 100n);
    
    // bit 48-55: Decimals
    const decimals = Number((data >> 48n) & 0xFFn);
    
    // Various boolean flags
    const isActive = Boolean((data >> 56n) & 1n);
    const isFrozen = Boolean((data >> 57n) & 1n);
    const borrowingEnabled = Boolean((data >> 58n) & 1n);
    const stableBorrowingEnabled = Boolean((data >> 59n) & 1n);
    
    // bit 64-79: Reserve factor
    const reserveFactor = Number(((data >> 64n) & 0xFFFFn) / 100n);
    
    return {
      ltv,
      liquidationThreshold,
      liquidationBonus,
      decimals,
      isActive,
      isFrozen,
      borrowingEnabled,
      stableBorrowingEnabled,
      reserveFactor
    };
  }

  function calculateUtilizationRate(totalStableDebt, totalVariableDebt, totalLiquidity) {
    if (totalLiquidity === 0) return 0;
    
    const totalBorrows = totalStableDebt + totalVariableDebt;
    return (totalBorrows / totalLiquidity) * 100;
  }

export { AaveProvider };
