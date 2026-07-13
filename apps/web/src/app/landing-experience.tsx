"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import {
  landingCopy,
  landingData,
  type LandingLanguage,
} from "./landing-content";
import styles from "./landing.module.css";

type LandingTheme = "dark" | "light";

const asset = (name: string) => `/fauzet/${name}`;

export function LandingExperience() {
  const [language, setLanguage] = useState<LandingLanguage>("en");
  const [theme, setTheme] = useState<LandingTheme>("light");
  const [seconds, setSeconds] = useState(8 * 60 + 42);
  const copy = landingCopy[language];
  const data = useMemo(() => landingData(language), [language]);

  useEffect(() => {
    const restorePreferences = window.setTimeout(() => {
      try {
        const savedTheme = window.localStorage.getItem("fz_theme");
        const savedLanguage = window.localStorage.getItem("fz_language");
        const normalizedTheme = savedTheme?.toLowerCase();
        if (normalizedTheme === "dark" || normalizedTheme === "light") {
          setTheme(normalizedTheme);
        }
        if (savedLanguage === "es" || savedLanguage === "en") {
          setLanguage(savedLanguage);
        }
      } catch {
        // Storage is optional; the landing remains fully usable without it.
      }
    }, 0);
    return () => window.clearTimeout(restorePreferences);
  }, []);

  useEffect(() => {
    document.documentElement.lang = language;
    try {
      window.localStorage.setItem("fz_language", language);
    } catch {
      // Ignore blocked storage.
    }
  }, [language]);

  useEffect(() => {
    try {
      window.localStorage.setItem("fz_theme", theme);
    } catch {
      // Ignore blocked storage.
    }
  }, [theme]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setSeconds((current) => (current > 0 ? current - 1 : 60 * 60));
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const countdown = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

  function toggleLanguage() {
    setLanguage((current) => (current === "en" ? "es" : "en"));
  }

  function toggleTheme() {
    setTheme((current) => (current === "light" ? "dark" : "light"));
  }

  return (
    <main className={styles.landing} data-landing-theme={theme}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <a className={styles.logoLink} href="#top" aria-label="Fauzet">
            <Image
              className={styles.logo}
              src={asset(
                theme === "dark" ? "logo-white.png" : "logo-color.png",
              )}
              alt="Fauzet"
              width={222}
              height={92}
              priority
            />
          </a>
          <nav className={styles.nav} aria-label="Main">
            <a href="#how">{copy.navHow}</a>
            <a href="#games">{copy.navGames}</a>
            <a href="#mining">{copy.navMining}</a>
            <a href="#zyxe">ZYXE</a>
            <a href="#rewards">{copy.navRewards}</a>
            <a href="#faq">FAQ</a>
          </nav>
          <div className={styles.headerActions}>
            <button
              type="button"
              className={styles.iconButton}
              onClick={toggleLanguage}
              aria-label="Language"
            >
              {language === "es" ? "ES · EN" : "EN · ES"}
            </button>
            <button
              type="button"
              className={styles.themeButton}
              onClick={toggleTheme}
              aria-label="Light / Dark"
              title="Light / Dark"
            >
              {theme === "dark" ? "☀️" : "🌙"}
            </button>
            <a className={styles.loginButton} href="/app">
              {copy.login}
            </a>
            <a className={styles.primarySmall} href="/app">
              {copy.getStarted}
            </a>
          </div>
        </div>
      </header>

      <section id="top" className={styles.hero}>
        <div className={styles.heroCopy}>
          <div className={styles.tagline}>
            <span />
            DRIP SATS. EVERY DAY.
          </div>
          <h1>
            {copy.heroA} <em>{copy.heroB}</em>
          </h1>
          <p className={styles.heroLead}>{copy.heroSub}</p>
          <div className={styles.heroActions}>
            <a className={styles.primaryLarge} href="/app">
              {copy.ctaStart}
            </a>
            <a className={styles.ghostButton} href="#how">
              {copy.ctaExplore}
            </a>
          </div>
          <p className={styles.disclaimer}>{copy.heroDisclaimer}</p>
        </div>

        <div className={styles.productPreview} aria-label={copy.preview}>
          <span className={styles.previewLabel}>{copy.preview}</span>
          <div className={styles.previewTopRow}>
            <article className={`${styles.previewCard} ${styles.walletCard}`}>
              <span className={styles.cardLabel}>{copy.pvWallet}</span>
              <div className={styles.walletBalance}>
                <Image
                  src={asset("coin-zyxe.png")}
                  alt=""
                  width={32}
                  height={32}
                />
                12,458.80 <strong>ZYXE</strong>
              </div>
              <small>≈ $215.34 USD · demo</small>
            </article>
            <article className={`${styles.previewCard} ${styles.faucetCard}`}>
              <div className={styles.faucetHeading}>
                <span className={styles.cardLabel}>Faucet</span>
                <Image
                  src={asset("ic-faucet.png")}
                  alt=""
                  width={42}
                  height={42}
                />
              </div>
              <strong className={styles.ready}>{copy.pvReady}</strong>
              <small>
                {copy.pvNextClaim} {countdown}
              </small>
              <div className={styles.claimPreview}>{copy.pvClaim}</div>
            </article>
          </div>

          <div className={styles.previewMetrics}>
            <article className={styles.previewCard}>
              <span className={styles.cardLabel}>{copy.pvMiningPower}</span>
              <div className={styles.metricValue}>
                1.25 <small>MH/s</small> <b>+12.5%</b>
              </div>
              <svg viewBox="0 0 90 30" aria-hidden="true">
                <polyline points="0,24 14,20 28,22 42,14 56,16 70,8 90,4" />
              </svg>
            </article>
            <article className={styles.previewCard}>
              <span className={styles.cardLabel}>{copy.pvActiveMiners}</span>
              <div className={styles.metricValue}>12</div>
              <div className={styles.barChart} aria-hidden="true">
                {[12, 18, 10, 22, 15, 24, 14, 20, 26, 17, 21].map(
                  (height, index) => (
                    <i key={`${height}-${index}`} style={{ height }} />
                  ),
                )}
              </div>
            </article>
            <article className={styles.previewCard}>
              <span className={styles.cardLabel}>{copy.pvEfficiency}</span>
              <div className={styles.metricValue}>
                86 <small>%</small> <b>+6%</b>
              </div>
              <div className={styles.progress}>
                <i style={{ width: "86%" }} />
              </div>
            </article>
          </div>
          <article className={`${styles.previewCard} ${styles.poolCard}`}>
            <div className={styles.poolHeading}>
              <span className={styles.cardLabel}>{copy.pvPoolShare}</span>
              <a href="/app">{copy.pvViewDetails} ›</a>
            </div>
            <div className={styles.poolBody}>
              <strong>
                0.0732 <small>ZYXE</small>
              </strong>
              <div className={styles.progress}>
                <i style={{ width: "52%" }} />
              </div>
            </div>
          </article>
        </div>
      </section>

      <section id="how" className={styles.band}>
        <div className={styles.sectionInner}>
          <SectionHeading title={copy.howTitle} subtitle={copy.howSub} />
          <div className={styles.howGrid}>
            {data.howSteps.map(([number, title, description]) => (
              <article className={styles.howCard} key={number}>
                <span className={styles.cardNumber}>{number}</span>
                <h3>{title}</h3>
                <p>{description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="rewards" className={styles.sectionInner}>
        <SectionHeading title={copy.earnTitle} subtitle={copy.earnSub} />
        <div className={styles.earnGrid}>
          {data.earnMethods.map(([image, title, description]) => (
            <article className={styles.earnCard} key={title}>
              <Image src={asset(image!)} alt="" width={56} height={56} />
              <div>
                <h3>{title}</h3>
                <p>{description}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section id="zyxe" className={styles.band}>
        <div className={`${styles.sectionInner} ${styles.twoColumn}`}>
          <div>
            <Eyebrow tone="amber">ZYXE — {copy.zxTag}</Eyebrow>
            <h2>{copy.zxTitle}</h2>
            <p className={styles.sectionCopy}>{copy.zxDesc}</p>
            <p className={styles.amberNotice}>{copy.zxLegal}</p>
          </div>
          <div className={styles.useGrid}>
            {data.zyxeUses.map((item) => (
              <div className={styles.useChip} key={item}>
                <span>◆</span> {item}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section
        id="mining"
        className={`${styles.sectionInner} ${styles.twoColumn}`}
      >
        <div>
          <Eyebrow tone="green">{copy.mnTag}</Eyebrow>
          <h2>{copy.mnTitle}</h2>
          <p className={styles.sectionCopy}>{copy.mnDesc}</p>
          <div className={styles.formulaBox}>
            <strong>{copy.mnFormula}</strong>
            <span>{copy.mnFormulaText}</span>
          </div>
        </div>
        <article className={styles.miningRoom}>
          <div className={styles.roomHeading}>
            <strong>{copy.mnRoom}</strong>
            <span>
              <i /> {copy.mnActive}
            </span>
          </div>
          <Image
            className={styles.miningMachine}
            src={asset("mining-machine.png")}
            alt="Virtual miner"
            width={484}
            height={418}
          />
          <div className={styles.minerGrid}>
            {data.miners.map(([icon, name, hash]) => (
              <div key={name}>
                <span>{icon}</span>
                <strong>{name}</strong>
                <small>{hash}</small>
              </div>
            ))}
          </div>
          <div className={styles.roomStats}>
            <Stat label={copy.mnPool} value="250,000 ZYXE" />
            <Stat label={copy.mnShare} value="0.074%" accent />
            <Stat label={copy.mnEff} value="92%" />
            <Stat label={copy.mnEst} value="~184 ZYXE" accent />
          </div>
        </article>
      </section>

      <section id="games" className={styles.band}>
        <div className={styles.sectionInner}>
          <SectionHeading title={copy.gmTitle} subtitle={copy.gmSub} />
          <div className={styles.gamesGrid}>
            {data.games.map(
              (
                [image, name, difficulty, description, energy, reward],
                index,
              ) => (
                <article className={styles.gameCard} key={name}>
                  <div
                    className={`${styles.gameImage} ${styles[`gameTone${index + 1}`]}`}
                  >
                    <Image
                      src={asset(image!)}
                      alt=""
                      width={116}
                      height={116}
                    />
                  </div>
                  <div className={styles.gameBody}>
                    <div className={styles.gameHeading}>
                      <strong>{name}</strong>
                      <span>{difficulty}</span>
                    </div>
                    <p>{description}</p>
                    <div className={styles.gameMeta}>
                      <span>⚡ {energy}</span>
                      <strong>{reward}</strong>
                    </div>
                    {index < 2 ? (
                      <a href="/app" className={styles.playButton}>
                        {copy.gmPlay}
                      </a>
                    ) : (
                      <span
                        className={[styles.playButton, styles.comingSoon].join(
                          " ",
                        )}
                      >
                        {copy.gmSoon}
                      </span>
                    )}
                  </div>
                </article>
              ),
            )}
          </div>
        </div>
      </section>

      <section className={`${styles.sectionInner} ${styles.twoColumn}`}>
        <div>
          <Eyebrow tone="amber">MINING CREW</Eyebrow>
          <h2>{copy.rfTitle}</h2>
          <p className={styles.sectionCopy}>{copy.rfDesc}</p>
          <p className={styles.amberNotice}>{copy.rfLegal}</p>
        </div>
        <div className={styles.referralList}>
          {data.referrals.map(([image, percentage, label, note], index) => (
            <article className={styles.referralRow} key={label}>
              <span
                className={styles.referralIcon}
                style={{ opacity: 1 - index * 0.1 }}
              >
                <Image src={asset(image!)} alt="" width={34} height={34} />
              </span>
              <div>
                <strong>{label}</strong>
                <small>{note}</small>
              </div>
              <b>{percentage}</b>
            </article>
          ))}
          <small className={styles.configNote}>{copy.rfConfigNote}</small>
        </div>
      </section>

      <section className={styles.band}>
        <div className={styles.sectionInner}>
          <div className={styles.centerHeading}>
            <Eyebrow tone="amber">ZYXE VAULT · PLANNED</Eyebrow>
            <h2>{copy.vtTitle}</h2>
            <p>{copy.vtDesc}</p>
          </div>
          <div className={styles.vaultGrid}>
            {data.vaults.map(([name, note, multiplier]) => (
              <article className={styles.vaultCard} key={name}>
                <strong>{name}</strong>
                <span>{note}</span>
                <b>{multiplier}</b>
                <small>{copy.vtMultNote}</small>
              </article>
            ))}
          </div>
          <p className={styles.centerNotice}>{copy.vtLegal}</p>
        </div>
      </section>

      <section className={`${styles.sectionInner} ${styles.twoColumn}`}>
        <div>
          <Eyebrow>{copy.cvTag}</Eyebrow>
          <h2>{copy.cvTitle}</h2>
          <p className={styles.sectionCopy}>{copy.cvDesc}</p>
          <div className={styles.checkList}>
            {data.conversionPoints.map((point) => (
              <p key={point}>
                <span>✓</span> {point}
              </p>
            ))}
          </div>
          <p className={styles.statusNotice}>{copy.cvStatusNotice}</p>
        </div>
        <article className={styles.assetCard}>
          <strong className={styles.assetTitle}>{copy.cvCardTitle}</strong>
          {data.assets.map(([image, name, status]) => (
            <div className={styles.assetRow} key={name}>
              <Image src={asset(image)} alt="" width={34} height={34} />
              <strong>{name}</strong>
              <span>{status}</span>
            </div>
          ))}
        </article>
      </section>

      <section className={styles.band}>
        <div className={styles.sectionInner}>
          <div className={styles.centerHeading}>
            <h2>{copy.tsTitle}</h2>
            <p>{copy.tsSub}</p>
          </div>
          <div className={styles.trustGrid}>
            {data.trust.map(([image, title, description]) => (
              <article className={styles.trustCard} key={title}>
                <Image src={asset(image!)} alt="" width={52} height={52} />
                <strong>{title}</strong>
                <p>{description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="faq" className={styles.faqSection}>
        <h2>FAQ</h2>
        <div className={styles.faqList}>
          {data.faqs.map(([question, answer]) => (
            <details className={styles.faq} key={question}>
              <summary>
                {question} <span>+</span>
              </summary>
              <p>{answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section className={styles.finalSection}>
        <div>
          <Image
            src={asset(theme === "dark" ? "logo-white.png" : "logo-color.png")}
            alt="Fauzet"
            width={222}
            height={92}
          />
          <h2>{copy.finalTitle}</h2>
          <p>{copy.finalSub}</p>
          <a className={styles.primaryLarge} href="/app">
            {copy.ctaStart}
          </a>
        </div>
      </section>

      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <div className={styles.footerTop}>
            <div className={styles.footerAbout}>
              <Image
                src={asset(
                  theme === "dark" ? "logo-white.png" : "logo-color.png",
                )}
                alt="Fauzet"
                width={222}
                height={92}
              />
              <p>{copy.ftAbout}</p>
            </div>
            <FooterColumn
              title={copy.ftLegal}
              links={[
                [copy.ftTerms, "/terms"],
                [copy.ftPrivacy, "/privacy"],
                [copy.ftRisk, "/terms#risk"],
                [copy.ftRewardPolicy, "/terms#rewards"],
                [copy.ftWithdrawPolicy, "/terms#withdrawals"],
              ]}
            />
            <FooterColumn
              title={copy.ftPlatform}
              links={[
                [copy.navHow, "#how"],
                [copy.navGames, "#games"],
                [copy.navMining, "#mining"],
                [copy.login, "/app"],
              ]}
            />
            <FooterColumn
              title={copy.ftSupport}
              links={[
                [copy.ftContact, "#faq"],
                [copy.ftStatus, "#faq"],
                ["FAQ", "#faq"],
              ]}
            />
          </div>
          <div className={styles.footerBottom}>
            <span>© 2026 Fauzet. {copy.ftRights}</span>
            <button type="button" onClick={toggleLanguage}>
              {language === "es" ? "ES · EN" : "EN · ES"}
            </button>
          </div>
          <p className={styles.footerDisclaimer}>{copy.ftDisclaimer}</p>
        </div>
      </footer>
    </main>
  );
}

function SectionHeading({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <div className={styles.sectionHeading}>
      <h2>{title}</h2>
      <p>{subtitle}</p>
    </div>
  );
}

function Eyebrow({
  children,
  tone = "cyan",
}: {
  children: React.ReactNode;
  tone?: "amber" | "cyan" | "green";
}) {
  return (
    <div className={`${styles.eyebrow} ${styles[`eyebrow${tone}`]}`}>
      {children}
    </div>
  );
}

function Stat({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className={styles.stat}>
      <span>{label}</span>
      <strong className={accent ? styles.accent : undefined}>{value}</strong>
    </div>
  );
}

function FooterColumn({
  title,
  links,
}: {
  title: string;
  links: readonly (readonly [string, string])[];
}) {
  return (
    <div className={styles.footerColumn}>
      <strong>{title}</strong>
      {links.map(([label, href]) => (
        <a href={href} key={`${label}-${href}`}>
          {label}
        </a>
      ))}
    </div>
  );
}
