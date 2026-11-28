<template>
  <section class="hero">
    <div class="hero__marks" aria-hidden="true">
      <span>N 22.5431</span>
      <span>E 114.0579</span>
      <span>SZX / OPS</span>
      <span>PLT 08</span>
    </div>
    <div class="container hero__content">
      <div class="hero__text">
        <div class="hero__eyebrow"><span>01</span> {{ t("hero.eyebrow") }}</div>
        <h1 :data-edit-key="'hero.title'">{{ t("hero.title") }}</h1>
        <p :data-edit-key="'hero.subtitle'">{{ t("hero.subtitle") }}</p>
        <div class="hero__buttons">
          <button type="button" class="pd-btn pd-btn--solid" @click="$router.push(lp('/contact'))">
            <span :data-edit-key="'hero.cta'">{{ t("hero.cta") }}</span>
          </button>
          <button type="button" class="pd-btn hero__ghost" @click="$router.push(lp('/products'))">
            <span :data-edit-key="'hero.ctaSecondary'">{{ t("hero.ctaSecondary") }}</span>
          </button>
        </div>
      </div>

      <div class="hero__stage">
        <div class="hero__plate">
          <span class="hero__corner hero__corner--nw" aria-hidden="true"></span>
          <span class="hero__corner hero__corner--ne" aria-hidden="true"></span>
          <span class="hero__corner hero__corner--sw" aria-hidden="true"></span>
          <span class="hero__corner hero__corner--se" aria-hidden="true"></span>
          <img src="/d15r_hero.jpeg" alt="Partdro D15R Cleaning Drone" class="hero__product-img" />
          <p class="hero__callsign">D15R / AIRFRAME</p>
        </div>
        <ol class="hero__hud">
          <li><em>01</em><span :data-edit-key="'hero.precision'">{{ t("hero.precision") }}</span></li>
          <li><em>02</em><span :data-edit-key="'hero.delivery'">{{ t("hero.delivery") }}</span></li>
          <li><em>03</em><span :data-edit-key="'hero.support'">{{ t("hero.support") }}</span></li>
        </ol>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { useLocalePath } from "../../composables/useLocalePath";

const { t } = useI18n();
const lp = useLocalePath();
</script>

<style scoped>
.hero {
  position: relative;
  display: flex;
  align-items: stretch;
  min-height: 100svh;
  overflow: hidden;
  color: #f4f1ea;
  background:
    linear-gradient(rgba(255, 255, 255, .045) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, .045) 1px, transparent 1px),
    radial-gradient(circle at 78% 42%, rgba(255, 90, 31, .18), transparent 26%),
    #07080a;
  background-size: 72px 72px, 72px 72px, auto, auto;
}
.hero__marks {
  position: absolute;
  z-index: 2;
  top: calc(var(--pd-header-height) + 14px);
  left: 0;
  right: 0;
  display: flex;
  justify-content: space-between;
  width: min(var(--pd-container), calc(100% - 48px));
  margin-inline: auto;
  color: var(--pd-accent);
  font-family: var(--pd-font-mono);
  font-size: 10px;
  letter-spacing: .16em;
}
.hero__content {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: minmax(0, 1.05fr) minmax(280px, .95fr);
  align-items: end;
  gap: 36px;
  width: 100%;
  padding: calc(var(--pd-header-height) + 72px) 0 48px;
}
.hero__eyebrow {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 18px;
  color: var(--pd-primary);
  font-family: var(--pd-font-mono);
  font-size: 11px;
  font-weight: 500;
  letter-spacing: .18em;
}
.hero__eyebrow span {
  color: var(--pd-accent);
}
.hero__text h1 {
  max-width: 9ch;
  margin: 0 0 20px;
  color: #f4f1ea;
  font-size: clamp(4.2rem, 8vw, 7.6rem);
  font-weight: 700;
  line-height: .84;
  letter-spacing: -.035em;
  text-transform: uppercase;
}
.hero__text p {
  max-width: 36rem;
  margin: 0 0 28px;
  color: rgba(244, 241, 234, .78);
  font-size: 18px;
  line-height: 1.6;
}
.hero__buttons { display: flex; flex-wrap: wrap; gap: 10px; }
.hero__ghost { border-color: rgba(244, 241, 234, .45); color: #f4f1ea; }
.hero__ghost:hover { border-color: var(--pd-accent); color: var(--pd-accent); }
.hero__stage { display: grid; gap: 12px; }
.hero__plate {
  position: relative;
  display: grid;
  place-items: center;
  min-height: 420px;
  padding: 28px 20px 48px;
  background:
    radial-gradient(circle at 50% 58%, rgba(92, 225, 255, .08), transparent 46%),
    linear-gradient(180deg, rgba(255,255,255,.03), transparent 30%);
  border: 1px solid rgba(244, 241, 234, .14);
}
.hero__corner {
  position: absolute;
  width: 16px;
  height: 16px;
  border: 1px solid var(--pd-primary);
}
.hero__corner--nw { top: -1px; left: -1px; border-right: 0; border-bottom: 0; }
.hero__corner--ne { top: -1px; right: -1px; border-left: 0; border-bottom: 0; }
.hero__corner--sw { bottom: -1px; left: -1px; border-right: 0; border-top: 0; }
.hero__corner--se { right: -1px; bottom: -1px; border-left: 0; border-top: 0; }
.hero__product-img {
  width: min(100%, 520px);
  height: auto;
  max-height: 460px;
  object-fit: contain;
  filter: drop-shadow(0 30px 40px rgba(0, 0, 0, .55));
  animation: hover 7s ease-in-out infinite;
}
.hero__callsign {
  position: absolute;
  right: 14px;
  bottom: 12px;
  margin: 0;
  color: rgba(244, 241, 234, .55);
  font-family: var(--pd-font-mono);
  font-size: 10px;
  letter-spacing: .18em;
}
.hero__hud {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  margin: 0;
  padding: 0;
  list-style: none;
  border: 1px solid rgba(244, 241, 234, .14);
}
.hero__hud li {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-height: 72px;
  padding: 12px 14px;
  border-right: 1px solid rgba(244, 241, 234, .14);
}
.hero__hud li:last-child { border-right: 0; }
.hero__hud em {
  color: var(--pd-accent);
  font-family: var(--pd-font-mono);
  font-size: 11px;
  font-style: normal;
  letter-spacing: .14em;
}
.hero__hud span {
  color: #f4f1ea;
  font-family: var(--pd-font-mono);
  font-size: 11px;
  font-weight: 500;
  letter-spacing: .06em;
  line-height: 1.35;
}
@keyframes hover { 50% { transform: translateY(-10px); } }

@media (max-width: 980px) {
  .hero__content { grid-template-columns: 1fr; padding-top: calc(var(--pd-header-height) + 56px); }
  .hero__text h1 { max-width: 12ch; font-size: clamp(3.2rem, 14vw, 5.4rem); }
  .hero__plate { min-height: 280px; }
  .hero__product-img { max-height: 320px; }
}
@media (max-width: 640px) {
  .hero { min-height: 0; }
  .hero__marks { display: none; }
  .hero__content { gap: 22px; padding: 96px 0 28px; }
  .hero__text p { font-size: 16px; }
  .hero__buttons { display: grid; }
  .hero__plate { min-height: 220px; padding-bottom: 36px; }
  .hero__product-img { max-height: 220px; animation: none; }
  .hero__hud { grid-template-columns: 1fr; }
  .hero__hud li { border-right: 0; border-bottom: 1px solid rgba(244, 241, 234, .14); }
  .hero__hud li:last-child { border-bottom: 0; }
}
</style>
