"use client";

import Script from "next/script";
import { useEffect, useState } from "react";
import styles from "./production-analytics.module.css";

type AnalyticsConsent = "loading" | "unset" | "accepted" | "rejected";

const CONSENT_KEY = "fz_analytics_consent";

export function ProductionAnalytics() {
  const [consent, setConsent] = useState<AnalyticsConsent>("loading");

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      try {
        const stored = window.localStorage.getItem(CONSENT_KEY);
        setConsent(
          stored === "accepted" || stored === "rejected" ? stored : "unset",
        );
      } catch {
        setConsent("unset");
      }
    }, 0);
    return () => window.clearTimeout(timeout);
  }, []);

  function decide(next: "accepted" | "rejected") {
    try {
      window.localStorage.setItem(CONSENT_KEY, next);
    } catch {
      // Consent remains effective for this page even when storage is blocked.
    }
    setConsent(next);
  }

  function reopenPreferences() {
    try {
      window.localStorage.removeItem(CONSENT_KEY);
    } catch {
      // Reload still removes any active third-party script from this document.
    }
    window.location.reload();
  }

  if (consent === "loading") return null;

  return (
    <>
      {consent === "accepted" ? <AnalyticsScripts /> : null}
      {consent === "unset" ? (
        <aside
          className={styles.banner}
          aria-label="Preferencias de analítica"
          role="dialog"
          aria-modal="false"
        >
          <strong>Analítica opcional / Optional analytics</strong>
          <p>
            Usamos Google Analytics, Tag Manager y Microsoft Clarity sólo si
            aceptas. No son necesarios para usar Fauzet.{" "}
            <a href="/privacy">Ver privacidad / Read privacy</a>
          </p>
          <div className={styles.actions}>
            <button type="button" onClick={() => decide("rejected")}>
              Rechazar / Decline
            </button>
            <button
              className={styles.accept}
              type="button"
              onClick={() => decide("accepted")}
            >
              Aceptar / Accept
            </button>
          </div>
        </aside>
      ) : (
        <button
          className={styles.preferences}
          type="button"
          onClick={reopenPreferences}
        >
          Analítica / Analytics
        </button>
      )}
    </>
  );
}

function AnalyticsScripts() {
  return (
    <>
      <Script
        src="https://www.googletagmanager.com/gtag/js?id=G-W8GWS1R97E"
        strategy="afterInteractive"
      />
      <Script id="fauzet-google-analytics" strategy="afterInteractive">
        {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', 'G-W8GWS1R97E');`}
      </Script>
      <Script id="fauzet-google-tag-manager" strategy="afterInteractive">
        {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','GTM-TVLTFNJG');`}
      </Script>
      <Script id="fauzet-microsoft-clarity" strategy="afterInteractive">
        {`(function(c,l,a,r,i,t,y){
c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
t=l.createElement(r);t.async=1;t.src='https://www.clarity.ms/tag/'+i;
y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
})(window, document, 'clarity', 'script', 'xly1yjpewc');`}
      </Script>
    </>
  );
}
