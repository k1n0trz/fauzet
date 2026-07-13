export type FiatCatalogSeedProduct = Readonly<{
  productVersionId: string;
  sku: string;
  version: 1;
  kind: "MINER" | "BOOST" | "CONSUMABLE" | "BUNDLE";
  name: string;
  description: string;
  priceMinorUnits: string;
  durationSeconds: number | null;
  effect: {
    type: string;
    label: string;
    parameters: Record<string, string | number | boolean | null>;
  };
  sandboxReady: boolean;
}>;

const id = (sequence: number) =>
  `10000000-0000-4000-8000-${sequence.toString().padStart(12, "0")}`;

export const FIAT_CATALOG_PRODUCTS: readonly FiatCatalogSeedProduct[] = [
  {
    productVersionId: id(1),
    sku: "BOOST_ENERGY_DROP",
    version: 1,
    kind: "CONSUMABLE",
    name: "Energy Drop",
    description: "Entrega 100 unidades de energía al activarse.",
    priceMinorUnits: "3900",
    durationSeconds: null,
    effect: {
      type: "MINING_ENERGY_CREDIT",
      label: "+100 unidades de energía",
      parameters: { energyUnits: 100, activation: "USER_INITIATED" },
    },
    sandboxReady: false,
  },
  {
    productVersionId: id(2),
    sku: "BOOST_REPAIR_KIT",
    version: 1,
    kind: "CONSUMABLE",
    name: "Repair Kit",
    description: "Entrega 25 puntos de durabilidad al activarse.",
    priceMinorUnits: "4900",
    durationSeconds: null,
    effect: {
      type: "MINER_REPAIR_CREDIT",
      label: "+25 puntos de durabilidad",
      parameters: { durabilityPoints: 25, activation: "USER_INITIATED" },
    },
    sandboxReady: false,
  },
  {
    productVersionId: id(3),
    sku: "BOOST_QUICK_CLAIM",
    version: 1,
    kind: "BOOST",
    name: "Quick Claim",
    description: "Reduce 20% el cooldown del faucet durante 24 horas.",
    priceMinorUnits: "5900",
    durationSeconds: 86_400,
    effect: {
      type: "FAUCET_COOLDOWN_BOOST",
      label: "-20% cooldown del faucet",
      parameters: {
        cooldownReductionBps: 2000,
        activation: "USER_INITIATED",
      },
    },
    sandboxReady: false,
  },
  {
    productVersionId: id(4),
    sku: "BOOST_GAME_PULSE",
    version: 1,
    kind: "BOOST",
    name: "Game Pulse",
    description:
      "Aumenta 15% las recompensas válidas de juegos durante 24 horas.",
    priceMinorUnits: "6900",
    durationSeconds: 86_400,
    effect: {
      type: "GAME_REWARD_BOOST",
      label: "+15% recompensas válidas de juegos",
      parameters: { rewardBonusBps: 1500, activation: "USER_INITIATED" },
    },
    sandboxReady: false,
  },
  {
    productVersionId: id(5),
    sku: "BOOST_HASH_SPARK",
    version: 1,
    kind: "BOOST",
    name: "Hash Spark",
    description: "Aumenta 20% el hashpower durante 24 horas.",
    priceMinorUnits: "7900",
    durationSeconds: 86_400,
    effect: {
      type: "MINING_HASH_BOOST",
      label: "+20% hashpower",
      parameters: { hashBonusBps: 2000, activation: "USER_INITIATED" },
    },
    sandboxReady: false,
  },
  {
    productVersionId: id(6),
    sku: "BOOST_HASH_SURGE",
    version: 1,
    kind: "BOOST",
    name: "Hash Surge",
    description: "Aumenta 50% el hashpower durante 24 horas.",
    priceMinorUnits: "14900",
    durationSeconds: 86_400,
    effect: {
      type: "MINING_HASH_BOOST",
      label: "+50% hashpower",
      parameters: { hashBonusBps: 5000, activation: "USER_INITIATED" },
    },
    sandboxReady: false,
  },
  {
    productVersionId: id(7),
    sku: "BOOST_MINING_WEEK",
    version: 1,
    kind: "BOOST",
    name: "Mining Week",
    description: "Aumenta 25% el hashpower durante siete días.",
    priceMinorUnits: "29900",
    durationSeconds: 604_800,
    effect: {
      type: "MINING_HASH_BOOST",
      label: "+25% hashpower",
      parameters: { hashBonusBps: 2500, activation: "USER_INITIATED" },
    },
    sandboxReady: false,
  },
  {
    productVersionId: id(8),
    sku: "BOOST_FULL_ACCELERATOR",
    version: 1,
    kind: "BUNDLE",
    name: "Full Accelerator",
    description:
      "Combina hashpower, cooldown y energía diaria durante siete días.",
    priceMinorUnits: "39900",
    durationSeconds: 604_800,
    effect: {
      type: "MULTI_EFFECT_BUNDLE",
      label: "+20% hashpower, -15% cooldown y +100 energía diaria",
      parameters: {
        hashBonusBps: 2000,
        cooldownReductionBps: 1500,
        dailyEnergyUnits: 100,
        activation: "USER_INITIATED",
      },
    },
    sandboxReady: false,
  },
  {
    productVersionId: id(9),
    sku: "MINER_DRIPPER_MINI",
    version: 1,
    kind: "MINER",
    name: "Dripper Mini",
    description: "Minero virtual temporal anunciado con 0,25 MH/s.",
    priceMinorUnits: "19900",
    durationSeconds: 2_592_000,
    effect: {
      type: "VIRTUAL_MINER",
      label: "0,25 MH/s",
      parameters: {
        advertisedHashRateMilliMh: 250,
        runtimeMappingRequired: true,
        activation: "USER_INITIATED",
      },
    },
    sandboxReady: true,
  },
  {
    productVersionId: id(10),
    sku: "MINER_FLOW_ONE",
    version: 1,
    kind: "MINER",
    name: "Flow One",
    description: "Minero virtual temporal anunciado con 0,75 MH/s.",
    priceMinorUnits: "49900",
    durationSeconds: 2_592_000,
    effect: {
      type: "VIRTUAL_MINER",
      label: "0,75 MH/s",
      parameters: {
        advertisedHashRateMilliMh: 750,
        runtimeMappingRequired: true,
        activation: "USER_INITIATED",
      },
    },
    sandboxReady: true,
  },
  {
    productVersionId: id(11),
    sku: "MINER_AQUA_RIG",
    version: 1,
    kind: "MINER",
    name: "Aqua Rig",
    description: "Minero virtual temporal anunciado con 2 MH/s.",
    priceMinorUnits: "119900",
    durationSeconds: 5_184_000,
    effect: {
      type: "VIRTUAL_MINER",
      label: "2 MH/s",
      parameters: {
        advertisedHashRateMilliMh: 2000,
        runtimeMappingRequired: true,
        activation: "USER_INITIATED",
      },
    },
    sandboxReady: true,
  },
  {
    productVersionId: id(12),
    sku: "MINER_ZYXE_CORE",
    version: 1,
    kind: "MINER",
    name: "Zyxe Core",
    description: "Minero virtual temporal anunciado con 5 MH/s.",
    priceMinorUnits: "249900",
    durationSeconds: 7_776_000,
    effect: {
      type: "VIRTUAL_MINER",
      label: "5 MH/s",
      parameters: {
        advertisedHashRateMilliMh: 5000,
        runtimeMappingRequired: true,
        activation: "USER_INITIATED",
      },
    },
    sandboxReady: false,
  },
  {
    productVersionId: id(13),
    sku: "MINER_NEON_FORGE",
    version: 1,
    kind: "MINER",
    name: "Neon Forge",
    description: "Minero virtual temporal anunciado con 12 MH/s.",
    priceMinorUnits: "549900",
    durationSeconds: 15_552_000,
    effect: {
      type: "VIRTUAL_MINER",
      label: "12 MH/s",
      parameters: {
        advertisedHashRateMilliMh: 12000,
        runtimeMappingRequired: true,
        activation: "USER_INITIATED",
      },
    },
    sandboxReady: false,
  },
];

export const FIAT_REFUND_POLICY_VERSION = "fiat-beta-2026-07-13";
export const FIAT_ACTIVATION_CONSENT_VERSION = "fiat-activation-2026-07-13";
export const FIAT_CHECKOUT_TERMS_VERSION = "fiat-checkout-sandbox-2026-07-13";
