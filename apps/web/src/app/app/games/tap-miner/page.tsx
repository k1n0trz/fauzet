import type { Metadata } from "next";
import { RewardsHeader } from "../../rewards-header";
import { TapMinerGame } from "./tap-miner-game";

export const metadata: Metadata = {
  title: "Tap Miner | Fauzet",
  description: "Sesión Tap Miner validada por el servidor.",
};

export default function TapMinerPage() {
  return (
    <main className="appShell">
      <RewardsHeader current="games" />
      <TapMinerGame />
    </main>
  );
}
