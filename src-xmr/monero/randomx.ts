// Validation RandomX pour les shares Monero
// Utilise le package npm cryptonight-hashing (addon natif C++)
// Mode light (256 MB RAM) suffisant pour valider ~50 shares/sec/core

let cryptonight: any = null;

// Charger le module natif de facon paresseuse
function getCryptonight(): any {
  if (!cryptonight) {
    try {
      cryptonight = require("cryptonight-hashing");
    } catch (err) {
      throw new Error("cryptonight-hashing non installe. Lancer: npm install cryptonight-hashing");
    }
  }
  return cryptonight;
}

export interface ValidateResult {
  valid: boolean; // Le hash est sous la target du share
  meetsNetworkTarget: boolean; // Le hash est sous la target du reseau (= bloc trouve !)
  hashHex: string; // Le hash calcule (pour debug)
}

// Valider un share Monero
// blob : le blockhashing_blob avec le nonce du mineur insere
// seedHash : hash du seed block (change tous les 2048 blocs)
// shareDiff : difficulte du share (apres vardiff)
// networkDiff : difficulte reseau
export function validateShare(
  blobBuffer: Buffer,
  seedHash: Buffer,
  shareDiff: number,
  networkDiff: number
): ValidateResult {
  const cn = getCryptonight();

  // Calculer le hash RandomX
  // randomx(input, seedHash, algo) -> Buffer de 32 bytes
  // algo = 0 -> RX_0 = Monero mainnet (RandomX_MoneroConfig)
  // Le mode light (256 MB RAM) est utilise par defaut pour la verification
  const hashBuffer: Buffer = cn.randomx(blobBuffer, seedHash, 0);
  const hashHex = hashBuffer.toString("hex");

  // Convertir le hash en BigInt (little-endian, comme Monero)
  // Le hash est compare a la target : hash < target = valide
  const hashBigInt = bufferToTarget(hashBuffer);

  // Target pour le share et pour le reseau
  const shareTarget = diffToTarget(shareDiff);
  const networkTarget = diffToTarget(networkDiff);

  return {
    valid: hashBigInt <= shareTarget,
    meetsNetworkTarget: hashBigInt <= networkTarget,
    hashHex,
  };
}

// Convertir un hash Buffer (32 bytes, little-endian) en BigInt
function bufferToTarget(buf: Buffer): bigint {
  let result = BigInt(0);
  for (let i = buf.length - 1; i >= 0; i--) {
    result = (result << BigInt(8)) | BigInt(buf[i]);
  }
  return result;
}

// Convertir une difficulte en target
// target = 2^256 / difficulty
// C'est la valeur maximale que le hash doit avoir pour etre valide
const MAX_TARGET = BigInt(2) ** BigInt(256);

function diffToTarget(diff: number): bigint {
  if (diff <= 0) return MAX_TARGET;
  return MAX_TARGET / BigInt(Math.floor(diff));
}

// Convertir une target hex compacte (4 bytes little-endian) en difficulte
// Inverse de diffToTargetHex : diff = 0xFFFFFFFF / target_uint32
export function targetToDiff(targetHex: string): number {
  if (!targetHex || targetHex === "0") return 0;

  const buf = Buffer.from(targetHex.padStart(8, "0"), "hex");
  const target32 = buf.readUInt32LE(0);

  if (target32 === 0) return Number.MAX_SAFE_INTEGER;
  return Math.floor(0xFFFFFFFF / target32);
}

// Convertir une difficulte en target hex compacte (4 bytes little-endian)
// Envoyee au mineur dans le champ "target" du job
// XMRig calcule la diff comme : 0xFFFFFFFF / target_uint32
// Donc on envoie : target_uint32 = 0xFFFFFFFF / diff
export function diffToTargetHex(diff: number): string {
  if (diff <= 0) diff = 1;
  const target32 = Math.floor(0xFFFFFFFF / diff);
  const buf = Buffer.alloc(4);
  buf.writeUInt32LE(target32, 0);
  return buf.toString("hex");
}

// Inserer un nonce dans un blob Monero
// Le nonce occupe les bytes 39-42 (4 bytes) dans le blockhashing_blob
export function insertNonce(blobHex: string, nonceHex: string): string {
  // Nonce position dans le blob : bytes 39-42 (index 78-86 en hex)
  return blobHex.substring(0, 78) + nonceHex + blobHex.substring(86);
}
