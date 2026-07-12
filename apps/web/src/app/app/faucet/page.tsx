import type { Metadata } from "next";
import { FaucetExperience } from "./faucet-experience";

export const metadata: Metadata = {
  title: "Faucet | Fauzet",
  description: "Reclama recompensas ZYXE sujetas a validación y límites.",
};

export default function FaucetPage() {
  return <FaucetExperience />;
}
