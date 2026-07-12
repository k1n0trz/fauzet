import type { Metadata } from "next";
import { RewardsHeader } from "../../rewards-header";
import { MemoryDropsGame } from "./memory-drops-game";

export const metadata: Metadata = {
  title: "Memory Drops | Fauzet",
  description: "Sesión Memory Drops validada por el servidor.",
};

export default function MemoryDropsPage() {
  return (
    <main className="appShell">
      <RewardsHeader current="games" />
      <MemoryDropsGame />
    </main>
  );
}
