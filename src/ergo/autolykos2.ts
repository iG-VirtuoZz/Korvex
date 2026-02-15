import blakejs from "blakejs";

// ========================================================
// Autolykos2 Validator for KORVEX Pool
// TypeScript port of mhssamadani/ErgoStratumServer
// Ref: https://docs.ergoplatform.com/mining/algo-technical/
// ========================================================

// Autolykos2 constants
const NBase = BigInt(Math.pow(2, 26));           // 67_108_864
const IncreaseStart = 600 * 1024;                // 614_400
const IncreasePeriodForN = 50 * 1024;            // 51_200
const NIncreasementHeightMax = 9_216_000;

// M = 8192-byte buffer (1024 uint64 big-endian integers from 0 to 1023)
const M = buildM();

function buildM(): Buffer {
  const buf = Buffer.alloc(1024 * 8);
  for (let i = 0; i < 1024; i++) {
    // uint64 big-endian: first 4 bytes are 0, next 4 bytes = i
    buf.writeUInt32BE(0, i * 8);
    buf.writeUInt32BE(i, i * 8 + 4);
  }
  return buf;
}

// Calculate N (table size) based on block height
export function calcN(height: number): bigint {
  height = Math.min(NIncreasementHeightMax, height);
  if (height < IncreaseStart) {
    return NBase;
  } else if (height >= NIncreasementHeightMax) {
    return BigInt(2147387550);
  } else {
    let res = NBase;
    const iterationsNumber = Math.floor((height - IncreaseStart) / IncreasePeriodForN) + 1;
    for (let i = 0; i < iterationsNumber; i++) {
      res = (res / BigInt(100)) * BigInt(105);
    }
    return res;
  }
}

// Blake2b256 wrapper (blakejs returns a Uint8Array)
function hash(data: Buffer): Buffer {
  return Buffer.from(blakejs.blake2b(data, undefined, 32));
}

// BigInt -> N-byte big-endian Buffer
function bigintToBuffer(value: bigint, size: number): Buffer {
  const hex = value.toString(16).padStart(size * 2, '0');
  return Buffer.from(hex, 'hex');
}

// Buffer -> BigInt big-endian (unsigned)
function bufferToBigint(buf: Buffer): bigint {
  return BigInt('0x' + buf.toString('hex'));
}

// genIndexes: generates 32 pseudo-random indices in [0, N)
function genIndexes(seed: Buffer, height: number): number[] {
  const hashed = hash(seed);
  // Double the hash to get 64 bytes
  const extended = Buffer.alloc(64);
  hashed.copy(extended, 0);
  hashed.copy(extended, 32);

  const n = Number(calcN(height));
  const indexes: number[] = [];
  for (let k = 0; k < 32; k++) {
    indexes.push(extended.readUInt32BE(k) % n);
  }
  return indexes;
}

// Full Autolykos2 share validation
// msg: header hash (32 bytes hex from the mining candidate)
// nonce: full nonce (8 bytes = extraNonce1 + extraNonce2)
// height: block height
// bTarget: share target (bNetwork * SHARE_DIFF_MULTIPLIER) as BigInt
// Returns: { valid: boolean, meetsNetworkTarget: boolean, hash: bigint }
export interface ShareValidationResult {
  valid: boolean;             // share meets the share target
  meetsNetworkTarget: boolean; // share meets the network target (= block candidate)
  fh: bigint;                 // final hash (for debug/log)
}

export function validateShare(
  msg: Buffer,
  nonce: Buffer,
  height: number,
  bShareTarget: bigint,
  bNetworkTarget: bigint
): ShareValidationResult {
  // Step 1: coinbaseBuffer = msg || nonce
  const coinbase = Buffer.concat([msg, nonce]);

  // Step 2: i = blake2b256(coinbase)[24..32] mod N
  const hCoinbase = hash(coinbase);
  const iValue = bufferToBigint(hCoinbase.subarray(24, 32)) % calcN(height);
  const iBuf = bigintToBuffer(iValue, 4);

  // Step 3: h (height) as 4 bytes big-endian
  const hBuf = bigintToBuffer(BigInt(height), 4);

  // Step 4: e = blake2b256(i || h || M)[1..32] (takeRight 31 bytes)
  const e = hash(Buffer.concat([iBuf, hBuf, M])).subarray(1, 32);

  // Step 5: J = genIndexes(e || coinbase)
  const J = genIndexes(Buffer.concat([e, coinbase]), height);

  // Step 6: f = sum of 32 elements
  let f = BigInt(0);
  for (const j of J) {
    const jBuf = bigintToBuffer(BigInt(j), 4);
    const rHash = hash(Buffer.concat([jBuf, hBuf, M]));
    const r = bufferToBigint(rHash.subarray(1, 32)); // takeRight(31)
    f += r;
  }

  // Step 7: fh = blake2b256(f)
  const fBuf = bigintToBuffer(f, 32);
  const fh = bufferToBigint(hash(fBuf));

  return {
    valid: fh < bShareTarget,
    meetsNetworkTarget: fh < bNetworkTarget,
    fh,
  };
}
