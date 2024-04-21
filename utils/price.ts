import { Commitment, Connection, PublicKey } from "@solana/web3.js";
import { NATIVE_MINT } from "@solana/spl-token";
import { Liquidity } from "@raydium-io/raydium-sdk";
import { OpenOrders } from "@project-serum/serum";
import { LIQUIDITY_STATE_LAYOUT_V4 } from "@raydium-io/raydium-sdk";
import {
  RPC_ENDPOINT_ALT,
  } from '../constants';

const RAYDIUM_LIQUIDITY_POOL_V4_ADDRESS = "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8";
const WSOL_ADDRESS = "So11111111111111111111111111111111111111112";




export async function getPoolID(baseString: string): Promise<string | null> {
  let base = new PublicKey(baseString);
  const quote = new PublicKey(WSOL_ADDRESS);
  const commitment: Commitment = "processed";

  try {
    const connection = new Connection(RPC_ENDPOINT_ALT);

    const baseAccounts = await connection.getProgramAccounts(new PublicKey(RAYDIUM_LIQUIDITY_POOL_V4_ADDRESS), {
      commitment,
      filters: [
        { dataSize: LIQUIDITY_STATE_LAYOUT_V4.span },
        {
          memcmp: {
            offset: LIQUIDITY_STATE_LAYOUT_V4.offsetOf("baseMint"),
            bytes: base.toBase58(),
          },
        },
        {
          memcmp: {
            offset: LIQUIDITY_STATE_LAYOUT_V4.offsetOf("quoteMint"),
            bytes: quote.toBase58(),
          },
        },
      ],
    });

    if (baseAccounts.length > 0) {
      const { pubkey } = baseAccounts[0];
      return pubkey.toString();
    }

    const quoteAccounts = await connection.getProgramAccounts(new PublicKey(RAYDIUM_LIQUIDITY_POOL_V4_ADDRESS), {
      commitment,
      filters: [
        { dataSize: LIQUIDITY_STATE_LAYOUT_V4.span },
        {
          memcmp: {
            offset: LIQUIDITY_STATE_LAYOUT_V4.offsetOf("baseMint"),
            bytes: quote.toBase58(),
          },
        },
        {
          memcmp: {
            offset: LIQUIDITY_STATE_LAYOUT_V4.offsetOf("quoteMint"),
            bytes: base.toBase58(),
          },
        },
      ],
    });

    if (quoteAccounts.length > 0) {
      const { pubkey } = quoteAccounts[0];
      return pubkey.toString();
    }

    return null;
  } catch (error) {
    console.error("Error fetching Market accounts:", error);
    return null;
  }
}


export async function getTokenPrice(poolId: string): Promise<number> {
  try {
    
    const version: 4 | 5 = 4;

    const connection = new Connection(RPC_ENDPOINT_ALT);

    const account = await connection.getAccountInfo(new PublicKey(poolId));
    const { state: LiquidityStateLayout } = Liquidity.getLayouts(version);

    if (!account || !account.data) {
      console.error("Account data is missing or incomplete.");
      return 0;
    }
    const poolState = LiquidityStateLayout.decode(account.data);

    const baseDecimal = 10 ** poolState.baseDecimal.toNumber();
    const quoteDecimal = 10 ** poolState.quoteDecimal.toNumber();

    const baseTokenAmount = await connection.getTokenAccountBalance(poolState.baseVault);
    const quoteTokenAmount = await connection.getTokenAccountBalance(poolState.quoteVault);

    const basePnl = poolState.baseNeedTakePnl.toNumber() / baseDecimal;
    const quotePnl = poolState.quoteNeedTakePnl.toNumber() / quoteDecimal;

    const OPENBOOK_PROGRAM_ID = poolState.marketProgramId;

    const openOrders = await OpenOrders.load(connection, poolState.openOrders, OPENBOOK_PROGRAM_ID);

    const openOrdersBaseTokenTotal = openOrders.baseTokenTotal.toNumber() / baseDecimal;
    const openOrdersQuoteTokenTotal = openOrders.quoteTokenTotal.toNumber() / quoteDecimal;

    const base = (baseTokenAmount.value?.uiAmount || 0) + openOrdersBaseTokenTotal - basePnl;
    const quote = (quoteTokenAmount.value?.uiAmount || 0) + openOrdersQuoteTokenTotal - quotePnl;

    let priceInSol = "";

    if (poolState.baseMint.equals(NATIVE_MINT)) {
      priceInSol = (base / quote).toString();
    } else if (poolState.quoteMint.equals(NATIVE_MINT)) {
      priceInSol = (quote / base).toString();
    }

    return parseFloat(priceInSol);
  } catch (e) {
    console.error(e);
    return 0;
  }
}
