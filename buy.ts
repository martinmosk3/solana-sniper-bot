import {
  BigNumberish,
  Liquidity,
  LIQUIDITY_STATE_LAYOUT_V4,
  LiquidityPoolKeys,
  LiquidityStateV4,
  MARKET_STATE_LAYOUT_V3,
  MarketStateV3,
  Token,
  TokenAmount,
} from '@raydium-io/raydium-sdk';
import {
  AccountLayout,
  createAssociatedTokenAccountIdempotentInstruction,
  createCloseAccountInstruction,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import {
  Keypair,
  Connection,
  PublicKey,
  ComputeBudgetProgram,
  KeyedAccountInfo,
  TransactionMessage,
  VersionedTransaction,
  LAMPORTS_PER_SOL
} from '@solana/web3.js';
import { getTokenAccounts, RAYDIUM_LIQUIDITY_PROGRAM_ID_V4, OPENBOOK_PROGRAM_ID, createPoolKeys } from './liquidity';
import { checkTokenDetails, logger } from './utils';
import { 
  retrieveTokenValue, 
  TokenDetails, 
  isTokenFreezable, 
  isTokenMutable,
  PoolInfo,
  getLargestTokenHolders,
  checkMintable,
  sendDiscordNotification,
  checkTokenLinks,
  getParsedAccountInfo,
  calculateLPBurned
   } from './utils';
   import { getPoolID, getTokenPrice } from './utils/price';
 
import { getMinimalMarketV3, MinimalMarketLayoutV3 } from './market';
import bs58 from 'bs58';
import * as fs from 'fs';
import * as path from 'path';
import {
  AUTO_SELL,
  AUTO_SELL_DELAY,
  CHECK_IF_MINT_IS_RENOUNCED,
  COMMITMENT_LEVEL,
  LOG_LEVEL,
  MAX_SELL_RETRIES,
  NETWORK,
  PRIVATE_KEY,
  QUOTE_AMOUNT,
  QUOTE_MINT,
  RPC_ENDPOINT,
  RPC_WEBSOCKET_ENDPOINT,
  RPC_ENDPOINT_ALT,
  RPC_WEBSOCKET_ENDPOINT_ALT,
  SNIPE_LIST_REFRESH_INTERVAL,
  USE_SNIPE_LIST,
  MAX_BUY,
  DELAY_RETRY_GET_LIQUIDITY_INFO,
  MIN_LIQUIDITY_USD,
  MAX_LIQUIDITY_USD,
  CHECK_LIQUIDITY_AMOUNT,
  RETRY_GET_LIQUIDITY_INFO,
  CHECK_IF_IS_LOCKED,
  CHECK_WEB_SOCIALS_DEX,
  CHECK_SOCIALS_METAPLEX,
  DISCORD_WEBHOOK_URL,
  CHECK_MUTABLE,
  SOL,
  USDC,
  CHECK_FREEZABLE,
  TOP_HOLDER_PERCENTAGE,
  TAKE_PROFIT,
  STOP_LOSS,
  CHECK_TOP_HOLDER,
  TAKE_DINAMIC,
  TAKE_PROFIT_DINAMIC,
  STOP_LOSS_DINAMIC,
  SELL_DELAY,
  TARGET_GAIN,
  TARGET_GAIN_PERCENTAGE,
  RETRY_GET_ACCOUNT_INFO,
  LIQUIDITY_SUPPLY_PERCENTAGE
  } from './constants';

const solanaConnection = new Connection(RPC_ENDPOINT, {
  wsEndpoint: RPC_WEBSOCKET_ENDPOINT,
});
let altConn = new Connection(RPC_ENDPOINT_ALT, {
  wsEndpoint: RPC_WEBSOCKET_ENDPOINT_ALT,
});


export interface MinimalTokenAccountData {
  mint: PublicKey;
  address: PublicKey;
  poolKeys?: LiquidityPoolKeys;
  market?: MinimalMarketLayoutV3;
  buyValue?: number;
  cambioUsd: number;
  sellValue?: number;
}
const existingLiquidityPools: Set<string> = new Set<string>();
const existingOpenBookMarkets: Set<string> = new Set<string>();
const existingTokenAccounts: Map<string, MinimalTokenAccountData> = new Map<string, MinimalTokenAccountData>();

let wallet: Keypair;
let quoteToken: Token;
let quoteTokenAssociatedAddress: PublicKey;
let quoteAmount: TokenAmount;
let currentOrders = 0;
let solPrice: number = 0;



let snipeList: string[] = [];

async function init(): Promise<void> {
  logger.level = LOG_LEVEL;

  // get wallet
  wallet = Keypair.fromSecretKey(bs58.decode(PRIVATE_KEY));
  logger.info(`Wallet Address: ${wallet.publicKey}`);

  // get quote mint and amount
  switch (QUOTE_MINT) {
    case 'WSOL': {
      quoteToken = Token.WSOL;
      quoteAmount = new TokenAmount(Token.WSOL, QUOTE_AMOUNT, false);
      break;
    }
    case 'USDC': {
      quoteToken = new Token(
        TOKEN_PROGRAM_ID,
        new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'),
        6,
        'USDC',
        'USDC',
      );
      quoteAmount = new TokenAmount(quoteToken, QUOTE_AMOUNT, false);
      break;
    }
    default: {
      throw new Error(`Unsupported quote mint "${QUOTE_MINT}". Supported values are USDC and WSOL`);
    }
  }
  const fetchedSolPrice = await getCurrentSolPrice();

if (typeof fetchedSolPrice === 'number' && fetchedSolPrice > 0) {
  solPrice = fetchedSolPrice;
  logger.info('SOL price: ' + solPrice);
} else {
  logger.error("Could not get SOL price! Stopping execution.");
  return;
}

  logger.info(`Snipe list: ${USE_SNIPE_LIST}`);
  logger.info(`Check mint renounced: ${CHECK_IF_MINT_IS_RENOUNCED}`);
  logger.info(`Check if is locked: ${CHECK_IF_IS_LOCKED}`);
  logger.info(`Check liquidity amount: ${CHECK_LIQUIDITY_AMOUNT}`);
  logger.info(`Buy amount: ${quoteAmount.toFixed()} ${quoteToken.symbol}`);
  logger.info(`Auto sell: ${AUTO_SELL}`);
  logger.info(`Sell delay: ${SELL_DELAY}`);
  logger.info(`Auto Sell delay: ${AUTO_SELL_DELAY === 0 ? 'false' : AUTO_SELL_DELAY}`);
  logger.info(`Max buy: ${MAX_BUY}`);
  logger.info(`Check socials: ${CHECK_WEB_SOCIALS_DEX}`);
  logger.info(`Check top holders: ${CHECK_TOP_HOLDER}`);
  logger.info(`Check mutable: ${CHECK_MUTABLE}`);
  logger.info(`Check freezable: ${CHECK_FREEZABLE}`);
  logger.info(`Take profit: ${TAKE_PROFIT}`);
  logger.info(`Stop loss: ${STOP_LOSS}`);
  logger.info(`Take dinamic: ${TAKE_DINAMIC}`);
  logger.info(`Take profit dinamic: ${TAKE_PROFIT_DINAMIC}`);
  logger.info(`Stop loss dinamic: ${STOP_LOSS_DINAMIC}`);


  // check existing wallet for associated token account of quote mint
  const tokenAccounts = await getTokenAccounts(altConn, wallet.publicKey, COMMITMENT_LEVEL);

  for (const ta of tokenAccounts) {
    existingTokenAccounts.set(ta.accountInfo.mint.toString(), <MinimalTokenAccountData>{
      mint: ta.accountInfo.mint,
      address: ta.pubkey,
    });
  }

  const tokenAccount = tokenAccounts.find((acc) => acc.accountInfo.mint.toString() === quoteToken.mint.toString())!;

  if (!tokenAccount) {
    throw new Error(`No ${quoteToken.symbol} token account found in wallet: ${wallet.publicKey}`);
  }

  quoteTokenAssociatedAddress = tokenAccount.pubkey;

  // load tokens to snipe
  loadSnipeList();
}

async function getCurrentSolPrice(): Promise<Number> {
  try {
    let data = await fetch('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=solana');
    var body = await data.json();
    let price = Number(body[0].current_price);
    if (price <= 0) {
      return solPrice;
    }

    return price;
  } catch (e) {
    return solPrice;
  }
}

function saveTokenAccount(mint: PublicKey, accountData: MinimalMarketLayoutV3) {
  const ata = getAssociatedTokenAddressSync(mint, wallet.publicKey);
  const tokenAccount = <MinimalTokenAccountData>{
    address: ata,
    mint: mint,
    market: <MinimalMarketLayoutV3>{
      bids: accountData.bids,
      asks: accountData.asks,
      eventQueue: accountData.eventQueue,
    },
  };
  existingTokenAccounts.set(mint.toString(), tokenAccount);
  return tokenAccount;
}



async function getMinimalPoolInfo(poolState: LiquidityStateV4, retry: number): Promise<PoolInfo> {
  try {
    const poolInfo = new PoolInfo();
    poolInfo.baseMint = poolState.baseMint;
    poolInfo.qouteMint = poolState.quoteMint;
    poolInfo.qouteVault = poolState.quoteVault;
    poolInfo.baseVault = poolState.baseVault;

    const quoteTokenAmount = await solanaConnection.getTokenAccountBalance(poolState.quoteVault);

    if (quoteTokenAmount.value.uiAmount == null && retry > 0) {
      await new Promise((resolve) => setTimeout(resolve, DELAY_RETRY_GET_LIQUIDITY_INFO));
      return await getMinimalPoolInfo(poolState, retry - 1);
    }

    const pairPooled = quoteTokenAmount.value.uiAmount || 0;
    poolInfo.pairPooled = pairPooled;

    const currentQuoteMint = poolState.quoteMint.toBase58();

    if (pairPooled) {
      if (currentQuoteMint === SOL) {
        poolInfo.liquiditySol = pairPooled;
        poolInfo.liquidityUSDC = solPrice.valueOf() * pairPooled;
      } else if (currentQuoteMint === USDC) {
        poolInfo.liquidityUSDC = pairPooled;
        poolInfo.liquiditySol = pairPooled / solPrice.valueOf();
      }
    }

    return poolInfo;
  } catch (e) {
    if (retry > 0) {
      await new Promise((resolve) => setTimeout(resolve, DELAY_RETRY_GET_LIQUIDITY_INFO));
      return await getMinimalPoolInfo(poolState, retry - 1);
    } else {
      return new PoolInfo();
    }
  }
}


interface PoolTableInfo {
  "Oh la la New Liquidity": string;
  Liquidity: string;
  "Mint Renounced?": string;
  "Top Holders": string;
  "Mutable?": string; 
  "Is Burned?": string;
  "Is Freezable?": string;
  "Is Locked?": string;
  "Socials?": string;
  "Socials Metaplex?": string;
  "Locked Percentage": string;

}

export async function processRaydiumPool(id: PublicKey, poolState: LiquidityStateV4) {

  let shouldSkip = false;
  let accInfo: any = undefined;

  let poolTableInfo: PoolTableInfo = {
    "Oh la la New Liquidity": id.toString(),
    Liquidity: "disabled",
    "Mint Renounced?": "disabled",
    "Top Holders": "disabled",
    "Mutable?": "disabled",
    "Is Burned?": "disabled",
    "Is Freezable?": "disabled",
    "Is Locked?": "disabled",
    "Socials?": "disabled",
    "Socials Metaplex?": "disabled",
    "Locked Percentage": "disabled",
  };
  
 if (!shouldBuy(poolState.baseMint.toString())) {
    return;
  }
  


  if (CHECK_WEB_SOCIALS_DEX) {
    const tokenAddress = poolState.baseMint.toString();
    logger.info(`Check ${tokenAddress}`);
    const tokenDetails: TokenDetails = await checkTokenDetails(tokenAddress);

    const countSocials = [
        tokenDetails.websites,
        tokenDetails.telegram,
        tokenDetails.twitter
    ].filter(Boolean).length; 

    if (countSocials < 2) {
        poolTableInfo["Socials?"] = "No";
        shouldSkip = true;
    } else {
        poolTableInfo["Socials?"] = "Yes";
    }
}



 if (CHECK_LIQUIDITY_AMOUNT) {
  let poolInfo = await getMinimalPoolInfo(poolState, RETRY_GET_LIQUIDITY_INFO);
  poolTableInfo.Liquidity = '$' + Math.round(poolInfo.liquidityUSDC).toFixed(2) + ' USD'; 

  if (poolInfo.liquidityUSDC < MIN_LIQUIDITY_USD) {
      shouldSkip = true;
  }

  if (poolInfo.liquidityUSDC > MAX_LIQUIDITY_USD) {
      shouldSkip = true;
  }
}


if (CHECK_MUTABLE) { 
  const isMutable = await isTokenMutable(poolState.baseMint, solanaConnection);
  poolTableInfo["Mutable?"] = isMutable ? "Yes" : "No"; 

  if (isMutable === null) {
      shouldSkip = true; 
  } else if (isMutable) {
    
      shouldSkip = true; 
  } else {
  }
}
  

if (CHECK_FREEZABLE) {
    const isFreezable = await isTokenFreezable(poolState.baseMint, solanaConnection);
    poolTableInfo["Is Freezable?"] = isFreezable ? "Yes" : "No"; 

    if (isFreezable === null) {
        poolTableInfo["Is Freezable?"] = "Unknown";
        shouldSkip = true;
    } else if (isFreezable) {

      shouldSkip = true;
    } else {
    }
}


if (CHECK_IF_MINT_IS_RENOUNCED) {
  const mintOption = await checkMintable(poolState.baseMint);
  poolTableInfo["Mint Renounced?"] = mintOption ? "Yes" : "No";  

  if (!mintOption) { 

    shouldSkip = true;
  }
}

  if (CHECK_TOP_HOLDER) {
    const { holders, totalSupply } = await getLargestTokenHolders(poolState.baseMint, solanaConnection);
  
    if (totalSupply === 0 || holders.length === 0) {
        logger.error('No information could be obtained. Canceling operation.');
        poolTableInfo["Top Holders"] = "No information"; 
        shouldSkip = true; 
    }
    
    const MAX_PERCENTAGE_HOLDER = holders.reduce((acc, holder) => acc + (holder.amount / totalSupply * 100), 0);
    poolTableInfo["Top Holders"] = `${MAX_PERCENTAGE_HOLDER.toFixed(2)}%`;
  
    if (MAX_PERCENTAGE_HOLDER > TOP_HOLDER_PERCENTAGE) {
      shouldSkip = true; 
    }
  }

 


 
  if (CHECK_IF_IS_LOCKED) {
    if (accInfo == undefined) {
      accInfo = await getParsedAccountInfo(new PublicKey(poolState.lpMint), RETRY_GET_ACCOUNT_INFO);
      
    }
    let lpPercentBurned = await calculateLPBurned(poolState, accInfo);

    if (lpPercentBurned.valueOf() == -1) {
      logger.info('pool ' + id + ' getting locked liquid failed skipping');
     
      shouldSkip = true; 
        }
    if (lpPercentBurned.valueOf() < LIQUIDITY_SUPPLY_PERCENTAGE) {
      poolTableInfo["Is Locked?"] = "No";
      poolTableInfo["Is Burned?"] = "No";
      poolTableInfo["Locked Percentage"] = `${lpPercentBurned}%`;
      
      shouldSkip = true; 
    } else {
      poolTableInfo["Is Locked?"] = "Yes";
      poolTableInfo["Is Burned?"] = "Yes";
      poolTableInfo["Locked Percentage"] = `${lpPercentBurned}%`;
      

    }
  }



  
if (CHECK_SOCIALS_METAPLEX) {
  const tokenAddress = poolState.baseMint.toString();
  const hasRequiredLinks = await checkTokenLinks(tokenAddress);
  poolTableInfo["Socials Metaplex?"] = hasRequiredLinks ? "Yes" : "No";
  shouldSkip = true;
}


console.table([poolTableInfo]); 
if (!shouldSkip && currentOrders < MAX_BUY) {
  logger.info(`Current Orders: ${currentOrders}, Max Buy: ${MAX_BUY}`);

  try {
    await buy(id, poolState); 
    currentOrders++;  
    logger.info('Attempt to purchase was made.');
  } catch (error) {
    logger.error(`Failed to buy token mint: "${id}"`, error);
  }
} else {
  if (shouldSkip) {
    logger.info("Purchase skipped due to pre-check conditions.");
  }
  if (currentOrders >= MAX_BUY) {
    logger.error('SKIPPING: You reached your max buy orders');
  }
}

}



export async function processOpenBookMarket(updatedAccountInfo: KeyedAccountInfo) {
  let accountData: MarketStateV3 | undefined;
  try {
    accountData = MARKET_STATE_LAYOUT_V3.decode(updatedAccountInfo.accountInfo.data);

    // to be competitive, we collect market data before buying the token...
    if (existingTokenAccounts.has(accountData.baseMint.toString())) {
      return;
    }

    saveTokenAccount(accountData.baseMint, accountData);
  } catch (e) {
    logger.debug(e);
    logger.error({ mint: accountData?.baseMint }, `Failed to process market`);
  }
}

async function buy(accountId: PublicKey, accountData: LiquidityStateV4): Promise<void> {
  try {
    let tokenAccount = existingTokenAccounts.get(accountData.baseMint.toString());

    if (!tokenAccount) {
      // it's possible that we didn't have time to fetch open book data
      const market = await getMinimalMarketV3(solanaConnection, accountData.marketId, COMMITMENT_LEVEL);
      tokenAccount = saveTokenAccount(accountData.baseMint, market);
    }

    tokenAccount.poolKeys = createPoolKeys(accountId, accountData, tokenAccount.market!);
   
    const { innerTransaction } = Liquidity.makeSwapFixedInInstruction(
      {
        poolKeys: tokenAccount.poolKeys,
        userKeys: {
          tokenAccountIn: quoteTokenAssociatedAddress,
          tokenAccountOut: tokenAccount.address,
          owner: wallet.publicKey,
        },
        amountIn: quoteAmount.raw,
        minAmountOut: 0,
      },
      tokenAccount.poolKeys.version,
    );

    const latestBlockhash = await solanaConnection.getLatestBlockhash({
      commitment: COMMITMENT_LEVEL,
    });
    const messageV0 = new TransactionMessage({
      payerKey: wallet.publicKey,
      recentBlockhash: latestBlockhash.blockhash,
      instructions: [
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 421197 }),
        ComputeBudgetProgram.setComputeUnitLimit({ units: 101337 }),
        createAssociatedTokenAccountIdempotentInstruction(
          wallet.publicKey,
          tokenAccount.address,
          wallet.publicKey,
          accountData.baseMint,
        ),
        ...innerTransaction.instructions,
      ],
    }).compileToV0Message();
    const transaction = new VersionedTransaction(messageV0);
    transaction.sign([wallet, ...innerTransaction.signers]);
    const signature = await solanaConnection.sendRawTransaction(transaction.serialize(), {
      preflightCommitment: COMMITMENT_LEVEL,
    });
    logger.info({ mint: accountData.baseMint, signature }, 
      `Executing buy transaction... https://dexscreener.com/solana/${accountData.baseMint}`);
    const confirmation = await solanaConnection.confirmTransaction(
      {
        signature,
        lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
        blockhash: latestBlockhash.blockhash,
      },
      COMMITMENT_LEVEL,
    );
  
    if (!confirmation.value.err) {
      const solUsdPrice: number | undefined = Number(await getCurrentSolPrice());

      if (tokenAccount && solUsdPrice !== undefined) {
        const basePromise = solanaConnection.getTokenAccountBalance(accountData.baseVault, COMMITMENT_LEVEL);
        const quotePromise = solanaConnection.getTokenAccountBalance(accountData.quoteVault, COMMITMENT_LEVEL);
        await Promise.all([basePromise, quotePromise]);
  
        const baseValue = await basePromise;
        const quoteValue = await quotePromise;
  
        if (baseValue?.value?.uiAmount && quoteValue?.value?.uiAmount) {
          tokenAccount.buyValue = quoteValue?.value?.uiAmount / baseValue?.value?.uiAmount;
  
          const precioCompraTokenUSD: number = tokenAccount.buyValue * Number(solUsdPrice);
          tokenAccount.cambioUsd = precioCompraTokenUSD;
        } else {
          logger.warn('Cannot determine buyValue to calculate USD price');
        }
      } else {
        logger.warn('Unable to determine token price in USD');
      }
      const buyValueString = typeof tokenAccount.cambioUsd !== 'undefined' ? tokenAccount.cambioUsd.toFixed(11) : '';
      const quoteAmountString = typeof quoteAmount !== 'undefined' ? quoteAmount.toFixed() : '';
      sendDiscordNotification(
        DISCORD_WEBHOOK_URL,
        'Buy',
        accountData.baseMint.toString(),
        wallet.publicKey.toString(),
        quoteAmountString,
        "N/A",
        "N/A",
        "N/A",
        buyValueString,
        `https://dexscreener.com/solana/${accountData.baseMint}?maker=${wallet.publicKey}`
      );
        
  
      currentOrders++;
      logger.info(
        {
          signature,
          url: `https://solscan.io/tx/${signature}?cluster=${NETWORK}`,
          dex: `https://dexscreener.com/solana/${accountData.baseMint}?maker=${wallet.publicKey}`,
        },
        `Confirmed buy tx... Purchase price: ${tokenAccount.cambioUsd?.toFixed(11) ?? "undefined"} USD`,
      );
    } else {
      logger.debug(confirmation.value.err);
      logger.info({ mint: accountData.baseMint, signature }, `Error confirming buy tx`);
    }
  } catch (e) {
    logger.debug(e);
    logger.error({ mint: accountData.baseMint }, `Failed to buy token`);
  }
}




async function sell(accountId: PublicKey, mint: PublicKey, amount: BigNumberish, value: number, absoluteMaxReachedValue: number): Promise<boolean> {
  let retries = 0;
  let initialized = false;
  let currentTakeProfit = 0;
  let currentStopLoss = 0;
   
  do {
    try {
     
      const tokenAccount = existingTokenAccounts.get(mint.toString());
      if (!tokenAccount) {
        return true;
      }

      if (!tokenAccount.poolKeys) {
        logger.warn({ mint }, 'No pool keys found');
        return true;
      }

      if (amount === 0) {
        logger.info(
          {
            mint: tokenAccount.mint,
          },
          `Empty balance, can't sell`,
        );
        return true;
      }

      
      const purchasePrice = tokenAccount.cambioUsd;
      
      

      if (purchasePrice === undefined) {

        return true; 
      }
      const targetSalePrice = purchasePrice * TARGET_GAIN_PERCENTAGE;
      const profitLoss = ((value - purchasePrice) / purchasePrice) * 100;
      
      if (!initialized) {
        currentTakeProfit = purchasePrice * TAKE_PROFIT;
        currentStopLoss = purchasePrice * STOP_LOSS;
        initialized = true;  
        logger.info(`Initialized - Purchase Price: ${purchasePrice.toFixed(11)} | Take Profit: ${currentTakeProfit.toFixed(11)} | Stop Loss: ${currentStopLoss.toFixed(11)} | Target Sale Price: ${targetSalePrice.toFixed(11)}`);
        logger.info(`https://dexscreener.com/solana/${mint}?maker=${wallet.publicKey}`);
        logger.info('-----------------------------------------------------------------------------------------------------------------------------------------------------------');
        logger.info('');

    }

    if (SELL_DELAY && AUTO_SELL_DELAY > 0) {
      await new Promise(resolve => setTimeout(resolve, AUTO_SELL_DELAY));
      logger.info(`Delay of ${AUTO_SELL_DELAY}ms applied, proceeding to sell regardless of price.`);
    }
   
    
  
    
    if (absoluteMaxReachedValue >= currentTakeProfit) {
      if (TAKE_DINAMIC) {
          const newTakeProfit = absoluteMaxReachedValue * TAKE_PROFIT_DINAMIC;
          const newStopLoss = absoluteMaxReachedValue * STOP_LOSS_DINAMIC;
  
          if (newTakeProfit > currentTakeProfit) {
              currentTakeProfit = newTakeProfit;
          }
          if (newStopLoss > currentStopLoss) {
              currentStopLoss = newStopLoss;
          }
          logger.warn(`Max Price: ${absoluteMaxReachedValue.toFixed(11)} | Current Value: ${value.toFixed(11)}`);
          logger.info('-----------------------------------------------------------------------------------------------------------------------------------------------------------');
          logger.info(`Updated dynamically - Purchase Price: ${purchasePrice.toFixed(11)} | New Take Profit: ${currentTakeProfit.toFixed(11)} | New Stop Loss: ${currentStopLoss.toFixed(11)} | Target Sale Price: ${targetSalePrice.toFixed(11)}`);
      } else {
          logger.info("Reached Take Profit but dynamic updates are disabled.");
      }
  }
  
  if  ((SELL_DELAY || value <= currentStopLoss || value >= currentTakeProfit) || (TARGET_GAIN && value >= targetSalePrice)) {
      logger.info(`Trigger - Selling at: ${value.toFixed(11)}`);
  
  


      const { innerTransaction } = Liquidity.makeSwapFixedInInstruction(
        {
          poolKeys: tokenAccount.poolKeys!,
          userKeys: {
            tokenAccountOut: quoteTokenAssociatedAddress,
            tokenAccountIn: tokenAccount.address,
            owner: wallet.publicKey,
          },
          amountIn: amount,
          minAmountOut: 0,
        },
        tokenAccount.poolKeys!.version,
      );

      const latestBlockhash = await solanaConnection.getLatestBlockhash({
        commitment: COMMITMENT_LEVEL,
      });
      const messageV0 = new TransactionMessage({
        payerKey: wallet.publicKey,
        recentBlockhash: latestBlockhash.blockhash,
        instructions: [
          ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 421197 }),
          ComputeBudgetProgram.setComputeUnitLimit({ units: 101337 }),
          ...innerTransaction.instructions,
          createCloseAccountInstruction(tokenAccount.address, wallet.publicKey, wallet.publicKey),
        ],
      }).compileToV0Message();
      const transaction = new VersionedTransaction(messageV0);
      transaction.sign([wallet, ...innerTransaction.signers]);
      const signature = await solanaConnection.sendRawTransaction(transaction.serialize(), {
        preflightCommitment: COMMITMENT_LEVEL,
      });
      currentOrders--;
      logger.info({ mint, signature }, `Executing sell transaction... https://dexscreener.com/solana/${mint}?maker=${wallet.publicKey}`);
      const confirmation = await solanaConnection.confirmTransaction(
        {
          signature,
          lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
          blockhash: latestBlockhash.blockhash,
        },
        COMMITMENT_LEVEL,
      );
      if (confirmation.value.err) {
        logger.debug(confirmation.value.err);
        logger.info({ mint, signature }, `Error confirming sell tx`);
        
      
        continue;
      }
      const buyValueString = typeof tokenAccount.cambioUsd !== 'undefined' ? tokenAccount.cambioUsd.toFixed(11) : '';
      const quoteAmountString = typeof quoteAmount !== 'undefined' ? quoteAmount.toFixed() : '';
      sendDiscordNotification(
        DISCORD_WEBHOOK_URL, 
        'Sell',               
        tokenAccount.address.toString(),            
        wallet.publicKey.toString(),       
        quoteAmountString,     
        value.toFixed(11), 
        '100%',                            
        profitLoss.toFixed(6),           
        buyValueString, 
        `https://dexscreener.com/solana/${mint}?maker=${wallet.publicKey}` 
      );
      logger.info(
        {
          mint,
          signature,
          url: `https://solscan.io/tx/${signature}?cluster=${NETWORK}`,
          dex: `https://dexscreener.com/solana/${mint}?maker=${wallet.publicKey}`,
        },
        `Confirmed sell tx... Sold at: ${value.toFixed(11)} USD`,
      );
      return true;
      
    } else {
     
      return false;
    }
    } catch (e: any) {
      retries++;
      logger.debug(e);
      logger.error({ mint }, `Failed to sell token, retry: ${retries}/${MAX_SELL_RETRIES}`);
    }
  } while (retries < MAX_SELL_RETRIES);
  return true;
}

function loadSnipeList() {
  if (!USE_SNIPE_LIST) {
    return;
  }

  const count = snipeList.length;
  const data = fs.readFileSync(path.join(__dirname, 'snipe-list.txt'), 'utf-8');
  snipeList = data
    .split('\n')
    .map((a) => a.trim())
    .filter((a) => a);

  if (snipeList.length != count) {
    logger.info(`Loaded snipe list: ${snipeList.length}`);
  }
}

function shouldBuy(key: string): boolean {
  return USE_SNIPE_LIST ? snipeList.includes(key) : true;
}


async function getVaultBalance(vaultPublicKey: PublicKey): Promise<number> {
  try {
    const accountInfo = await solanaConnection.getAccountInfo(vaultPublicKey);
    if (accountInfo === null) {
    //  console.log(`Vault account not found: ${vaultPublicKey.toBase58()}.`);
      return 0;
    }
    const balance = accountInfo.lamports; 
   // console.log(`Vault account balance (${vaultPublicKey.toBase58()}): ${balance} lamports, equivalent to ${balance / LAMPORTS_PER_SOL} SOL.`);
    return balance / LAMPORTS_PER_SOL; // Convertir lamports a SOL
  } catch (error) {
 //   console.error(`Error getting vault account balance (${vaultPublicKey.toBase58()}):`, error);
    return 0;
  }
}


interface VaultAddresses {
  [key: string]: string;
}
const vaultAddresses: VaultAddresses = {};
const knownPools = new Set()

const runListener = async () => {
  await init();
  const runTimestamp = Math.floor(new Date().getTime() / 1000);
  const raydiumSubscriptionId = solanaConnection.onProgramAccountChange(
    RAYDIUM_LIQUIDITY_PROGRAM_ID_V4,
    async (updatedAccountInfo) => {
      const key = updatedAccountInfo.accountId.toString();
      const poolState = LIQUIDITY_STATE_LAYOUT_V4.decode(updatedAccountInfo.accountInfo.data);
      const poolOpenTime = parseInt(poolState.poolOpenTime.toString());

      if (poolOpenTime > runTimestamp && !knownPools.has(key)) {
        knownPools.add(key);
        processRaydiumPool(updatedAccountInfo.accountId, poolState);

        vaultAddresses[poolState.baseMint.toString()] = poolState.quoteVault.toBase58();

       const quoteVaultAddress = new PublicKey(vaultAddresses[poolState.baseMint.toString()]);

  
        
      }
    },
    COMMITMENT_LEVEL,
    [
      { dataSize: LIQUIDITY_STATE_LAYOUT_V4.span },
      {
        memcmp: {
          offset: LIQUIDITY_STATE_LAYOUT_V4.offsetOf('quoteMint'),
          bytes: quoteToken.mint.toBase58(),
        },
      },
      {
        memcmp: {
          offset: LIQUIDITY_STATE_LAYOUT_V4.offsetOf('marketProgramId'),
          bytes: OPENBOOK_PROGRAM_ID.toBase58(),
        },
      },
      {
        memcmp: {
          offset: LIQUIDITY_STATE_LAYOUT_V4.offsetOf('status'),
          bytes: bs58.encode([6, 0, 0, 0, 0, 0, 0, 0]),
        },
      },
    ],
  );

  const openBookSubscriptionId = solanaConnection.onProgramAccountChange(
    OPENBOOK_PROGRAM_ID,
    async (updatedAccountInfo) => {
      const key = updatedAccountInfo.accountId.toString();
      const existing = existingOpenBookMarkets.has(key);
      if (!existing) {
        existingOpenBookMarkets.add(key);
        const _ = processOpenBookMarket(updatedAccountInfo);
      }
    },
    COMMITMENT_LEVEL,
    [
      { dataSize: MARKET_STATE_LAYOUT_V3.span },
      {
        memcmp: {
          offset: MARKET_STATE_LAYOUT_V3.offsetOf('quoteMint'),
          bytes: quoteToken.mint.toBase58(),
        },
      },
    ],
  );

  if (AUTO_SELL) {
    const walletSubscriptionId = solanaConnection.onProgramAccountChange(
      TOKEN_PROGRAM_ID,
      async (updatedAccountInfo) => {
        const accountData = AccountLayout.decode(updatedAccountInfo.accountInfo!.data);
        if (updatedAccountInfo.accountId.equals(quoteTokenAssociatedAddress)) {
          return;
        }

        let absoluteMaxReachedValue = -Infinity;
        let completed = false;
        const MIN_VAULT_BALANCE_TO_ACT = 1;  

        while (!completed) {
          await new Promise(resolve => setTimeout(resolve, 3000));  

          const mintKey = accountData.mint.toBase58();
          const vaultAddressKey = vaultAddresses[mintKey];
          if (!vaultAddressKey) {
            logger.error(`No vault address found for mint: ${mintKey}`);
            continue;
          }

          const vaultAddress = new PublicKey(vaultAddressKey);
          const vaultBalance = await getVaultBalance(vaultAddress);
          logger.info(`Balance in vault for mint ${mintKey}: ${vaultBalance} SOL`);

          if (vaultBalance < MIN_VAULT_BALANCE_TO_ACT) {
            logger.error(`ALERT: Pool liquidity for mint ${mintKey} has fallen below critical level of ${MIN_VAULT_BALANCE_TO_ACT} SOL. Starting immediate sale.`);
            const saleResult = await sell(updatedAccountInfo.accountId, accountData.mint, accountData.amount, 0, -Infinity);
            completed = saleResult;
            continue;
          }

          const currValue = await retrieveTokenValue(mintKey);
          logger.info(`Max Price: ${absoluteMaxReachedValue} Current value: ${currValue}`);

          if (currValue && vaultBalance > 0) {
            absoluteMaxReachedValue = Math.max(absoluteMaxReachedValue, currValue);
            const saleResult = await sell(updatedAccountInfo.accountId, accountData.mint, accountData.amount, currValue, absoluteMaxReachedValue);
            completed = saleResult; 
          }
        }
      },
      COMMITMENT_LEVEL,
      [
        {
          dataSize: 165,
        },
        {
          memcmp: {
            offset: 32,
            bytes: wallet.publicKey.toBase58(),
          },
        },
      ],
    );

    logger.info(`Listening for wallet changes: ${walletSubscriptionId}`);
}


  logger.info(`Listening for raydium changes: ${raydiumSubscriptionId}`);
  logger.info(`Listening for open book changes: ${openBookSubscriptionId}`);

  logger.info('------------------- 🚀 ---------------------');
  logger.info('Bot is running! Press CTRL + C to stop it.');
  logger.info('------------------- 🚀 ---------------------');

  if (USE_SNIPE_LIST) {
    setInterval(loadSnipeList, SNIPE_LIST_REFRESH_INTERVAL);
  }
};

runListener();
