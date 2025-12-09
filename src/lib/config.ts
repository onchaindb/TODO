import { TodoServiceConfig } from "@/lib/services/TodoService";

export const CONFIG: TodoServiceConfig = {
    endpoint: process.env.NEXT_PUBLIC_ONCHAINDB_ENDPOINT as string,
    appId: process.env.NEXT_PUBLIC_ONCHAINDB_APP_ID as string,
    apiKey: process.env.NEXT_PUBLIC_ONCHAINDB_API_KEY,
    brokerAddress: process.env.NEXT_PUBLIC_BROKER_ADDRESS as string
};

// Celestia network configuration
const TESTNET_CONFIG = {
    chainId: 'mocha-4',
    chainName: 'Celestia Mocha Testnet',
    rpc: 'https://rpc-mocha.pops.one',
    rest: 'https://api-mocha.pops.one',
};

const MAINNET_CONFIG = {
    chainId: 'celestia',
    chainName: 'Celestia',
    rpc: 'https://rpc.celestia.pops.one',
    rest: 'https://api.celestia.pops.one',
};

function getNetworkConfig() {
    const network = process.env.NEXT_PUBLIC_NETWORK;
    if (network === 'celestia') {
        return MAINNET_CONFIG;
    }
    return TESTNET_CONFIG;
}

const networkConfig = getNetworkConfig();

export const CELESTIA_CONFIG = {
    ...networkConfig,
    denom: 'utia',
    decimals: 6,
    displayDenom: 'TIA',
};
