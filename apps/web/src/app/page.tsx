import type { Metadata } from "next";
import { LandingExperience } from "./landing-experience";
import { ProductionAnalytics } from "./production-analytics";

export const metadata: Metadata = {
  title: "Fauzet — Earn Zyxes. Play, claim and grow.",
  description:
    "Claim validated rewards, play games and build virtual mining power in Fauzet.",
};

export default function Home() {
  const analyticsEnabled =
    process.env.VERCEL_ENV === "production" ||
    (!process.env.VERCEL && process.env.NODE_ENV === "production");

  return (
    <>
      {analyticsEnabled ? <ProductionAnalytics /> : null}
      <LandingExperience />
    </>
  );
}
