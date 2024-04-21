import { Commitment } from "@solana/web3.js";
import { logger, retrieveEnvVariable } from "../utils";

export const NETWORK = 'mainnet-beta';
export const COMMITMENT_LEVEL: Commitment = retrieveEnvVariable('COMMITMENT_LEVEL', logger) as Commitment;
export const RPC_ENDPOINT = retrieveEnvVariable('RPC_ENDPOINT', logger);
export const RPC_WEBSOCKET_ENDPOINT = retrieveEnvVariable('RPC_WEBSOCKET_ENDPOINT', logger);
export const RPC_ENDPOINT_ALT = retrieveEnvVariable('RPC_ENDPOINT_ALT', logger);
export const RPC_WEBSOCKET_ENDPOINT_ALT = retrieveEnvVariable('RPC_WEBSOCKET_ENDPOINT_ALT', logger);
export const LOG_LEVEL = retrieveEnvVariable('LOG_LEVEL', logger);
export const CHECK_IF_MINT_IS_RENOUNCED = retrieveEnvVariable('CHECK_IF_MINT_IS_RENOUNCED', logger) === 'true';
export const USE_SNIPE_LIST = retrieveEnvVariable('USE_SNIPE_LIST', logger) === 'true';
export const SNIPE_LIST_REFRESH_INTERVAL = Number(retrieveEnvVariable('SNIPE_LIST_REFRESH_INTERVAL', logger));
export const AUTO_SELL = retrieveEnvVariable('AUTO_SELL', logger) === 'true';
export const MAX_SELL_RETRIES = Number(retrieveEnvVariable('MAX_SELL_RETRIES', logger));
export const AUTO_SELL_DELAY = Number(retrieveEnvVariable('AUTO_SELL_DELAY', logger));
export const PRIVATE_KEY = retrieveEnvVariable('PRIVATE_KEY', logger);
export const QUOTE_MINT = retrieveEnvVariable('QUOTE_MINT', logger);
export const QUOTE_AMOUNT = retrieveEnvVariable('QUOTE_AMOUNT', logger);
export const MAX_BUY = Number(retrieveEnvVariable('MAX_BUY', logger))
export const CHECK_MUTABLE = retrieveEnvVariable('CHECK_MUTABLE', logger) === 'true'; 
export const TOP_HOLDER_PERCENTAGE = Number(retrieveEnvVariable('TOP_HOLDER_PERCENTAGE', logger));
export const CHECK_FREEZABLE = retrieveEnvVariable('CHECK_FREEZABLE', logger) === 'true'; 
export const CHECK_TOP_HOLDER = retrieveEnvVariable('CHECK_TOP_HOLDER', logger) === 'true';
export const TAKE_PROFIT = Number(retrieveEnvVariable('TAKE_PROFIT', logger));
export const STOP_LOSS = Number(retrieveEnvVariable('STOP_LOSS', logger));
export const TAKE_DINAMIC = retrieveEnvVariable('TAKE_DINAMIC', logger) === 'true';
export const TAKE_PROFIT_DINAMIC = Number(retrieveEnvVariable('TAKE_PROFIT_DINAMIC', logger));
export const STOP_LOSS_DINAMIC = Number(retrieveEnvVariable('STOP_LOSS_DINAMIC', logger));
export const SELL_DELAY = retrieveEnvVariable('SELL_DELAY', logger) === 'true';
export const SOL = 'So11111111111111111111111111111111111111112';
export const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
export const DELAY_RETRY_GET_LIQUIDITY_INFO = Number(retrieveEnvVariable('DELAY_RETRY_GET_LIQUIDITY_INFO', logger));
export const MIN_LIQUIDITY_USD = Number(retrieveEnvVariable('MIN_LIQUIDITY_USD', logger));
export const CHECK_LIQUIDITY_AMOUNT = retrieveEnvVariable('CHECK_LIQUIDITY_AMOUNT', logger) === 'true';
export const RETRY_GET_LIQUIDITY_INFO = Number(retrieveEnvVariable('RETRY_GET_LIQUIDITY_INFO', logger));
export const CHECK_IF_IS_LOCKED = retrieveEnvVariable('CHECK_IF_IS_LOCKED', logger) === 'true';
export const CHECK_WEB_SOCIALS_DEX = retrieveEnvVariable('CHECK_WEB_SOCIALS_DEX', logger) === 'true';
export const CHECK_SOCIALS_METAPLEX = retrieveEnvVariable('CHECK_SOCIALS_METAPLEX', logger) === 'true';
export const TARGET_GAIN = retrieveEnvVariable('TARGET_GAIN', logger) === 'true';
export const TARGET_GAIN_PERCENTAGE = Number(retrieveEnvVariable('TARGET_GAIN_PERCENTAGE', logger))
export const RETRY_GET_ACCOUNT_INFO = Number(retrieveEnvVariable('RETRY_GET_ACCOUNT_INFO', logger));
export const LIQUIDITY_SUPPLY_PERCENTAGE = Number(retrieveEnvVariable('LIQUIDITY_SUPPLY_PERCENTAGE', logger));
export const DISCORD_WEBHOOK_URL = (retrieveEnvVariable('DISCORD_WEBHOOK_URL', logger));






