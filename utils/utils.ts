import { Logger } from 'pino';
import dotenv from 'dotenv';
import axios from 'axios';
import { logger } from './logger';
import { PublicKey, Connection } from '@solana/web3.js';
import { MintLayout, RawMint } from '../types';
import { Metaplex } from "@metaplex-foundation/js";
import { clusterApiUrl } from "@solana/web3.js";




const connection = new Connection(clusterApiUrl("mainnet-beta"));
const metaplex = new Metaplex(connection);




dotenv.config();

export const retrieveEnvVariable = (variableName: string, logger: Logger) => {
  const variable = process.env[variableName] || '';
  if (!variable) {
    logger.error(`${variableName} is not set`);
    process.exit(1);
  }
  return variable;
};
const DELAY_RETRY_GETACCOUNT_INFO = 1000;
const RPC = process.env.RPC_TOP_HOLDER;
if (typeof RPC !== 'string') {
    throw new Error('RPC_TOP_HOLDER is not defined in your environment variables');
}

const altConn = new Connection(RPC);


export class PoolInfo {
  public baseMint: PublicKey = new PublicKey('DqVm2EsirBypP9CJBFDviCFRxCM4meeBvWHzp6a6Eo1i');
  public qouteMint: PublicKey = new PublicKey('DqVm2EsirBypP9CJBFDviCFRxCM4meeBvWHzp6a6Eo1i');
  public baseVault: PublicKey = new PublicKey('DqVm2EsirBypP9CJBFDviCFRxCM4meeBvWHzp6a6Eo1i');
  public qouteVault: PublicKey = new PublicKey('DqVm2EsirBypP9CJBFDviCFRxCM4meeBvWHzp6a6Eo1i');
  public priceUSDC: number = -1;
  public priceSol: number = -1;
  public liquidityUSDC: number = -1;
  public liquiditySol: number = -1;
  public totalLiquidity: number = -1;
  public fdv: number = -1;
  public tokenPooled: number = -1;
  public pairPooled: number = -1;
}

export interface TokenDetails {
  hasDetails: boolean;
  websites?: string[];
  telegram?: string;
  twitter?: string;
}


export async function sendDiscordNotification(
  url: string,
  buy_sell: string,
  tokenAddress: string,
  walletName: string,
  amountIn: string,
  amountOut: string,
  sellPercentage: string,
  profitLoss: string,
  buyValue: string,
  transactionLink: string
) {
  let message = `
\`\`\`

${buy_sell}

Token Address
${tokenAddress}

Wallet
${walletName}

Amount In (SOL)
${amountIn}

Amount Out (SOL)
${amountOut}

Sell Percentage
${sellPercentage}

Profit/Loss
${profitLoss}

Buy/sell value
${buyValue}

Dex
${transactionLink}
\`\`\`
`;

  const content = {
    content: message,
    username: "Trading Bot"
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(content)
    });
    if (!response.ok) {
      throw new Error('Failed to send Discord notification');
    }
    console.log('Notification sent successfully');
  } catch (error) {
    console.error('Error sending notification:', error);
  }
}



export const retrieveTokenValueByBirdeye = async (tokenAddress: string) => {
  const url = `https://public-api.birdeye.so/defi/price?include_liquidity=true&address=${tokenAddress}`;
  const apiKey = retrieveEnvVariable('BIRDEYE_API_KEY', logger);
  try {
    const response: string = (await axios.get(url, {
      headers: {
        'X-API-KEY': apiKey
      }
    })).data.data.value;
    if (response) return parseFloat(response)
    return undefined;
  } catch (e) {
    return undefined;  
  }
}

export const retrieveTokenValueByDex = async (tokenAddress: string) => {
  const url = `https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`;
  
  try {
    const response = await axios.get(url);
    
    if (response.data && response.data.pairs && response.data.pairs.length > 0) {
      const pair = response.data.pairs[0]; 
      const priceUsd = parseFloat(pair.priceUsd);

      if (!isNaN(priceUsd)) {
        return priceUsd;
      }
    }
    
    return undefined;
  } catch (error) {
    console.error('Error al obtener el precio del token:', error);
    return undefined;
  }
}



export const retrieveTokenValue = async (tokenAddress: string) => {
  const birdEyePrice = await retrieveTokenValueByBirdeye(tokenAddress);
  const dexPrice = await retrieveTokenValueByDex(tokenAddress);

  const isBirdEyePriceNumeric = typeof birdEyePrice === 'number' && !isNaN(birdEyePrice);
  
  if (isBirdEyePriceNumeric) {
    return birdEyePrice;
  }
  
  const isDexPriceNumeric = typeof dexPrice === 'number' && !isNaN(dexPrice);
  if (isDexPriceNumeric) {
    return dexPrice;
  }

  return undefined;
}


export async function checkTokenDetails(tokenAddress: string): Promise<TokenDetails> {

  const maxIntentos = 100;
  const intervaloEspera = 1000;

  for (let intento = 1; intento <= maxIntentos; intento++) {
  
    
    try {
      const response = await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`);
      const tokenData = response.data?.pairs || [];

      if (tokenData.length === 0) {
        await esperar(intervaloEspera); 
        continue; 
      }

      const token = tokenData[0];
      const { websites, socials } = token.info || [];
      


      const hasWebsite = websites && websites.length > 0;
      const hasTelegram = socials && socials.some((social: { type: string }) => social.type === 'telegram');
      const hasTwitter = socials && socials.some((social: { type: string }) => social.type === 'twitter');
      

      if (hasWebsite) {
        logger.info('Website:');
        websites.forEach((website: { label: string, url: string }) => logger.info(website.url));
      }else {
        logger.warn('Website: Not available');
    }
      
      let telegramUrl: string | undefined;
      if (hasTelegram) {
        logger.info('Telegram:');
        telegramUrl = socials.find((social: { type: string }) => social.type === 'telegram')?.url;
        if (telegramUrl) logger.info(telegramUrl);
      }else {
        logger.warn('Telegram: Not available');
    }
      
      let twitterUrl: string | undefined;
      if (hasTwitter) {
        logger.info('Twitter:');
        twitterUrl = socials.find((social: { type: string }) => social.type === 'twitter')?.url;
        if (twitterUrl) logger.info(twitterUrl);
      }else {
        logger.warn('Twitter: Not available');
      }

      return { hasDetails: true, websites, telegram: telegramUrl, twitter: twitterUrl };
        } catch (error) {
   
      await esperar(intervaloEspera); 
    }
  }

  console.error(`Token verification process completed without success.`);
  return { hasDetails: false };
}



function esperar(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function isTokenFreezable(mintAddress: PublicKey, connection: Connection): Promise<boolean | null> {
  const mintAccountInfo = await connection.getAccountInfo(mintAddress);
  if (!mintAccountInfo) {
    logger.error('Could not find mint account with address:', mintAddress.toBase58());
    return null; 
  }

  const mintData: RawMint = MintLayout.decode(mintAccountInfo.data);
  return mintData.freezeAuthorityOption === 1;
}



export async function isTokenMutable(mintAddress: PublicKey, connection: Connection): Promise<boolean | null> {
  try {
      const nft = await metaplex.nfts().findByMint({ mintAddress });
      return nft.isMutable;
  } catch (error) {
      console.error('Error fetching NFT mutability:', error);
      return null; 
  }
}


export async function getLargestTokenHolders(mintAddress: PublicKey, connection: Connection) {
  try {
    await new Promise(resolve => setTimeout(resolve, 5000)); 
    
    const largestAccounts = await altConn.getTokenLargestAccounts(mintAddress);
    if (!largestAccounts.value || largestAccounts.value.length === 0) {
      logger.error('No accounts with significant balances were found.');
      return { holders: [], totalSupply: 0 };
    }

    const totalSupplyResponse = await altConn.getTokenSupply(mintAddress);
    const totalSupply = totalSupplyResponse.value.uiAmount;

    if (totalSupply === null) {
      logger.error('Could not get full token supply');
      return { holders: [], totalSupply: 0 };
    }

    const accountsInfo = await Promise.all(
      largestAccounts.value.map(account =>
        altConn.getParsedAccountInfo(account.address))
    );

    let holders = [];
    let raydiumPercentage = 0; 

    for (const info of accountsInfo) {
      if (info.value && 'parsed' in info.value.data) {
        const parsedData = info.value.data.parsed;
        const ownerAddress = new PublicKey(parsedData.info.owner);
        const displayOwner = ownerAddress.toString() === '5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1' ? 'Raydium' : ownerAddress.toString();

        if (displayOwner === 'Raydium') {
          raydiumPercentage = (parseFloat(parsedData.info.tokenAmount.uiAmount) / totalSupply * 100);
        } else {
          holders.push({
            owner: displayOwner,
            ownerAddress: ownerAddress.toString(), 
            amount: parseFloat(parsedData.info.tokenAmount.uiAmount),
            decimals: parsedData.info.tokenAmount.decimals,
            percentage: (parseFloat(parsedData.info.tokenAmount.uiAmount) / totalSupply * 100).toFixed(4)
          });
        }
      }
    }

    holders.sort((a, b) => b.amount - a.amount);

    return { holders: holders.slice(0, 10), totalSupply, raydiumPercentage };
  } catch (error) {
    logger.warn(`Error when obtaining data from top holders: ${error}`);
    return { holders: [], totalSupply: 0 };
  }
}



export async function checkMintable(vault: PublicKey): Promise<boolean | undefined> {
  try {
    let { data } = (await connection.getAccountInfo(vault)) || {};
    if (!data) {
      return;
    }
    const deserialize = MintLayout.decode(data);
    return deserialize.mintAuthorityOption === 0;
  } catch (e) {
    logger.debug(e);
    logger.error({ mint: vault.toBase58() }, `Failed to check if mint is renounced`);
    return undefined; 
  }
}




export async function checkTokenLinks(tokenAddress: string): Promise<boolean> {
  try {

    const publicKey = new PublicKey(tokenAddress);

   
    const nft = await metaplex.nfts().findByMint({ mintAddress: publicKey });

   
    return checklinks(nft.uri);
  } catch (error) {
    console.error('Error verifying token links:');
    return false; 
  }
}

export async function checklinks(uri: string): Promise<boolean> {
  try {
    const response = await fetch(uri);
    const data = await response.json();

    const extensions = data.extensions;
    if (!extensions) {
      return false;
    }

    const website = extensions.website || 'Not available';
    const telegram = extensions.telegram || 'Not available';
    const twitter = extensions.twitter || 'Not available';

    console.log('Website:', website);
    console.log('Telegram:', telegram);
    console.log('Twitter:', twitter);

    return extensions.hasOwnProperty('website') && 
           extensions.hasOwnProperty('telegram') && 
           extensions.hasOwnProperty('twitter');
  } catch (error) {
    console.error('Error getting data from URI:');
    return false; 
  }
}


export async function getParsedAccountInfo(vault: PublicKey, retry: number): Promise<RawMint | undefined> {
  try {
    let { data } = (await connection.getAccountInfo(vault)) || {};
    if (!data) {

      if (retry.valueOf() > 0) {
        await new Promise((resolve) => setTimeout(resolve, DELAY_RETRY_GETACCOUNT_INFO));
        return await getParsedAccountInfo(vault, --retry);
      } else {
        return;
      }
    }
    const deserialize = MintLayout.decode(data);
    return deserialize;
  } catch (e) {
    logger.debug(e);
    logger.error({ mint: vault }, `Failed to get account info`);
  }
}

export async function calculateLPBurned(poolState: any, accInfo: RawMint): Promise<Number> {

  let lpReserve: any = poolState.lpReserve;

  if (accInfo == undefined) {
    return -1;
  }

  lpReserve = lpReserve / Math.pow(10, accInfo.decimals);
  const actualSupply = accInfo.supply / BigInt(Math.pow(10, accInfo.decimals));

  lpReserve = BigInt(Math.round(lpReserve));
  
  const burnAmt = lpReserve - actualSupply;
  
  const burnPct = (burnAmt / BigInt(lpReserve)) * BigInt(100);
  
  return Number(burnPct);
}