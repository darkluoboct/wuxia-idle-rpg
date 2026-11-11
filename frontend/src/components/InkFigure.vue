<script setup lang="ts">
/**
 * 水墨半身 / 全身人物（纯 SVG，零美术资源）
 * 10 种人物各有发式、衣冠与随身兵器；pose=sit 为盘膝打坐，stand 为抱拳而立。
 */
import { computed, useId } from 'vue'
import type { PortraitStyle } from '@/config/typesHelper'

type Hair = 'bun' | 'ribbons' | 'messy' | 'long' | 'cap' | 'beard' | 'bald' | 'wrap'
type Item = 'sword' | 'staff' | 'gourd' | 'flute' | 'snake' | 'claw' | 'taiji' | 'beads' | 'crutch' | 'palm'
interface Look {
  robe: string
  robe2: string
  trim: string
  hair: string
  hairKind: Hair
  item: Item
  band?: string
  broad?: boolean
  patches?: boolean
  blind?: boolean
}

const LOOKS: Record<PortraitStyle, Look> = {
  hero_sword: { robe: '#34495a', robe2: '#22323e', trim: '#d1b06c', hair: '#15181c', hairKind: 'bun', item: 'sword', band: '#c0453a' },
  guojing: { robe: '#5a4a38', robe2: '#3a2f23', trim: '#c4a062', hair: '#17150f', hairKind: 'bun', item: 'palm', broad: true },
  huangrong: { robe: '#37594d', robe2: '#243c34', trim: '#e0c78a', hair: '#14171a', hairKind: 'ribbons', item: 'staff', band: '#a6d8bc' },
  hongqigong: { robe: '#6a4c3a', robe2: '#44301f', trim: '#b08c52', hair: '#c4bdaf', hairKind: 'messy', item: 'gourd', patches: true, broad: true },
  huangyaoshi: { robe: '#2f5558', robe2: '#1e3a3c', trim: '#b5d0c8', hair: '#14171a', hairKind: 'cap', item: 'flute' },
  ouyangfeng: { robe: '#4a3a54', robe2: '#2f2438', trim: '#c27468', hair: '#dedad2', hairKind: 'messy', item: 'snake' },
  meichaofeng: { robe: '#3f3945', robe2: '#292530', trim: '#b595ad', hair: '#d6d1c8', hairKind: 'long', item: 'claw' },
  zhoubotong: { robe: '#46505f', robe2: '#2d3541', trim: '#d4b87c', hair: '#ece8e0', hairKind: 'beard', item: 'taiji' },
  monk: { robe: '#8a5a2b', robe2: '#5f3d1c', trim: '#e0b36a', hair: '#000', hairKind: 'bald', item: 'beads' },
  assassin: { robe: '#2c2f34', robe2: '#1a1c1f', trim: '#9298a2', hair: '#101113', hairKind: 'wrap', item: 'crutch', blind: true },
  munianci: { robe: '#8e3a35', robe2: '#5e2523', trim: '#e3c08a', hair: '#15171a', hairKind: 'ribbons', item: 'sword', band: '#f0c9a0' },
  ouyangke: { robe: '#d8d2c2', robe2: '#a89f8c', trim: '#7a5a8a', hair: '#15171a', hairKind: 'cap', item: 'flute' },
  wanyankang: { robe: '#6a2f3a', robe2: '#44202a', trim: '#e0b86a', hair: '#15171a', hairKind: 'cap', item: 'sword', band: '#e0b86a' },
  qiuqianren: { robe: '#4d4a46', robe2: '#322f2c', trim: '#a39a8c', hair: '#c9c4ba', hairKind: 'beard', item: 'palm', broad: true },
  daoist: { robe: '#3f6a74', robe2: '#28484f', trim: '#cfe0dc', hair: '#14171a', hairKind: 'bun', item: 'sword' },
  chenxuanfeng: { robe: '#2d2a33', robe2: '#1c1a21', trim: '#a8929b', hair: '#17151a', hairKind: 'messy', item: 'claw', broad: true },
  bandit: { robe: '#5a4636', robe2: '#3a2c21', trim: '#9a8062', hair: '#17140f', hairKind: 'wrap', item: 'sword', band: '#8a3a2f' },
  wangchongyang: { robe: '#2f4f5c', robe2: '#1d3540', trim: '#e3d8b0', hair: '#d9d6cf', hairKind: 'beard', item: 'sword', broad: true },
  yideng: { robe: '#b08a3c', robe2: '#7d5f24', trim: '#f1deaa', hair: '#000', hairKind: 'bald', item: 'beads' },
  zhebie: { robe: '#6b5a3a', robe2: '#463a24', trim: '#c9a35c', hair: '#15130f', hairKind: 'wrap', item: 'staff', band: '#a8402f' },
  yinggu: { robe: '#5b4a5f', robe2: '#3a2f3e', trim: '#cdb6c9', hair: '#cfc9c0', hairKind: 'long', item: 'staff' },
  yangtiexin: { robe: '#5a3d33', robe2: '#3a261f', trim: '#b9946a', hair: '#18130f', hairKind: 'bun', item: 'staff', broad: true },
  sunbuer: { robe: '#4a6d78', robe2: '#2e4851', trim: '#d6e4e0', hair: '#14171a', hairKind: 'ribbons', item: 'sword', band: '#cfe0dc' },
  luchengfeng: { robe: '#3f5a4a', robe2: '#28392f', trim: '#cbd8bd', hair: '#14171a', hairKind: 'cap', item: 'palm' },
  zhuziliu: { robe: '#5b5f78', robe2: '#3a3d50', trim: '#d8d4c4', hair: '#14171a', hairKind: 'cap', item: 'flute' },
}

const props = withDefaults(
  defineProps<{
    styleType: PortraitStyle
    pose?: 'stand' | 'sit'
  }>(),
  { pose: 'stand' }
)

const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
const look = computed(() => LOOKS[props.styleType] ?? LOOKS.hero_sword)
const skin = '#dcc6a8'
const skinShade = '#bfa588'

/** 站姿躯干（宽 / 窄体型） */
const standRobe = computed(() => {
  const w = look.value.broad ? 35 : 31
  return `M${60 - w},148 C${60 - w + 2},112 36,74 60,68 C84,74 ${60 + w - 2},112 ${60 + w},148 Z`
})
const beltX = computed(() => (look.value.broad ? 28 : 32))
</script>

<template>
  <svg viewBox="0 0 120 150" class="h-full w-auto overflow-visible" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
    <defs>
      <linearGradient :id="`robe-${uid}`" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" :stop-color="look.robe" />
        <stop offset="1" :stop-color="look.robe2" />
      </linearGradient>
    </defs>

    <!-- 地面投影 -->
    <ellipse cx="60" cy="146" :rx="pose === 'sit' ? 40 : 30" ry="4" fill="#000" opacity="0.38" />

    <!-- ========== 身后之物（兵刃 / 光环） ========== -->
    <g v-if="look.item === 'sword'">
      <line x1="86" y1="36" x2="34" y2="132" stroke="#2a2d33" stroke-width="4.4" stroke-linecap="round" />
      <line x1="86" y1="36" x2="34" y2="132" stroke="#c4ccd3" stroke-width="2" stroke-linecap="round" />
      <rect x="82" y="28" width="9" height="3.2" rx="1" :fill="look.trim" transform="rotate(28 86 30)" />
      <path d="M88,24 q6,4 3,14" fill="none" stroke="#c0453a" stroke-width="1.6" stroke-linecap="round" />
    </g>
    <g v-else-if="look.item === 'staff'">
      <line x1="95" y1="22" x2="92" y2="146" stroke="#2d4a2a" stroke-width="4.2" stroke-linecap="round" />
      <line x1="95" y1="22" x2="92" y2="146" stroke="#8cc27a" stroke-width="2.2" stroke-linecap="round" />
      <path d="M92.8,70 h4 M92.4,100 h4" stroke="#2d4a2a" stroke-width="1.2" />
    </g>
    <g v-else-if="look.item === 'snake'">
      <line x1="96" y1="20" x2="93" y2="146" stroke="#2a2230" stroke-width="4" stroke-linecap="round" />
      <line x1="96" y1="20" x2="93" y2="146" stroke="#9a8aa6" stroke-width="1.8" stroke-linecap="round" />
      <path
        d="M96,24 C108,34 82,48 96,60 C108,72 84,84 94,96"
        fill="none" stroke="#7fbf7a" stroke-width="3.2" stroke-linecap="round"
      />
      <circle cx="96" cy="21" r="3.6" fill="#7fbf7a" />
      <circle cx="97.2" cy="20.2" r="0.8" fill="#c0453a" />
    </g>
    <g v-else-if="look.item === 'crutch'">
      <line x1="24" y1="40" x2="26" y2="146" stroke="#14151a" stroke-width="5" stroke-linecap="round" />
      <line x1="24" y1="40" x2="26" y2="146" stroke="#7d838c" stroke-width="2" stroke-linecap="round" />
      <path d="M16,40 h16" stroke="#7d838c" stroke-width="3" stroke-linecap="round" />
    </g>
    <g v-else-if="look.item === 'taiji'">
      <circle cx="60" cy="86" r="42" fill="none" :stroke="look.trim" stroke-width="1" stroke-dasharray="3 5" opacity="0.5" />
    </g>

    <!-- ========== 躯干 ========== -->
    <template v-if="pose === 'stand'">
      <path :d="standRobe" :fill="`url(#robe-${uid})`" stroke="rgba(0,0,0,.45)" stroke-width="0.8" />
      <path d="M49,72 L60,102 L71,72 L70,148 L50,148 Z" :fill="look.robe2" opacity="0.5" />
      <!-- 腰带 -->
      <rect :x="60 - beltX" y="108" :width="beltX * 2" height="6" :fill="look.robe2" />
      <line :x1="60 - beltX" y1="108.5" :x2="60 + beltX" y2="108.5" :stroke="look.trim" stroke-width="1" opacity="0.8" />
      <circle cx="60" cy="111" r="3" :fill="look.trim" />
      <path d="M60,114 q-2,8 -1,14 M60,114 q3,7 2,13" fill="none" :stroke="look.trim" stroke-width="1.2" stroke-linecap="round" />
      <!-- 左右衣袖（抱拳于胸前） -->
      <path d="M38,76 C25,94 28,114 46,122 L55,113 C46,106 44,92 49,79 Z" :fill="look.robe" stroke="rgba(0,0,0,.45)" stroke-width="0.8" />
      <path d="M82,76 C95,94 92,114 74,122 L65,113 C74,106 76,92 71,79 Z" :fill="look.robe" stroke="rgba(0,0,0,.45)" stroke-width="0.8" />
      <path d="M31,106 q6,12 17,15 M89,106 q-6,12 -17,15" fill="none" :stroke="look.trim" stroke-width="1.4" stroke-linecap="round" opacity="0.85" />
      <circle cx="54" cy="118" r="3.6" :fill="skin" />
      <circle cx="66" cy="118" r="3.6" :fill="skin" />
    </template>
    <template v-else>
      <!-- 盘膝：双腿 + 直腰 -->
      <path d="M14,146 C16,127 36,117 60,117 C84,117 104,127 106,146 Z" :fill="`url(#robe-${uid})`" stroke="rgba(0,0,0,.45)" stroke-width="0.8" />
      <path d="M28,140 C44,128 76,128 92,140" fill="none" :stroke="look.robe2" stroke-width="1.6" opacity="0.8" />
      <path d="M40,124 C38,96 46,73 60,68 C74,73 82,96 80,124 Z" :fill="look.robe" stroke="rgba(0,0,0,.45)" stroke-width="0.8" />
      <path d="M49,72 L60,100 L71,72 L70,124 L50,124 Z" :fill="look.robe2" opacity="0.5" />
      <rect x="40" y="108" width="40" height="5" :fill="look.robe2" />
      <line x1="40" y1="108.5" x2="80" y2="108.5" :stroke="look.trim" stroke-width="1" opacity="0.8" />
      <circle cx="60" cy="110.5" r="2.8" :fill="look.trim" />
      <path d="M39,78 C26,96 28,118 46,127 L57,120 C48,112 46,96 50,81 Z" :fill="look.robe" stroke="rgba(0,0,0,.45)" stroke-width="0.8" />
      <path d="M81,78 C94,96 92,118 74,127 L63,120 C72,112 74,96 70,81 Z" :fill="look.robe" stroke="rgba(0,0,0,.45)" stroke-width="0.8" />
      <circle cx="56" cy="123" r="3.6" :fill="skin" />
      <circle cx="64" cy="123" r="3.6" :fill="skin" />
    </template>

    <!-- 领口镶边 -->
    <path d="M45,69 L60,99 L75,69" fill="none" :stroke="look.trim" stroke-width="2.4" stroke-linejoin="round" />
    <!-- 衣上补丁（丐帮） -->
    <g v-if="look.patches" opacity="0.9">
      <rect x="40" y="128" width="7" height="6" fill="#8a6a4c" />
      <rect x="71" y="120" width="8" height="6" fill="#7a5c40" />
      <rect x="52" y="138" width="6" height="5" fill="#8a6a4c" />
    </g>

    <!-- ========== 身前之物 ========== -->
    <g v-if="look.item === 'gourd'">
      <path d="M34,98 C36,112 40,110 38,120" fill="none" stroke="#a8453a" stroke-width="1.2" />
      <ellipse cx="38" cy="124" rx="6.4" ry="7.4" fill="#b8742f" stroke="rgba(0,0,0,.4)" stroke-width="0.8" />
      <ellipse cx="38" cy="114" rx="3.8" ry="4" fill="#c7843a" stroke="rgba(0,0,0,.4)" stroke-width="0.8" />
    </g>
    <g v-else-if="look.item === 'flute'">
      <line x1="30" y1="126" x2="92" y2="102" stroke="#1c3a30" stroke-width="3.8" stroke-linecap="round" />
      <line x1="30" y1="126" x2="92" y2="102" stroke="#7fcfae" stroke-width="2" stroke-linecap="round" />
      <path d="M32,126 q-3,8 0,14" fill="none" stroke="#c0453a" stroke-width="1.4" stroke-linecap="round" />
    </g>
    <g v-else-if="look.item === 'claw'">
      <path d="M48,120 l-7,6 M52,122 l-4,8 M57,123 l0,9 M63,123 l0,9 M68,122 l4,8 M72,120 l7,6" stroke="#d8d4dc" stroke-width="1.6" stroke-linecap="round" />
    </g>
    <g v-else-if="look.item === 'palm'">
      <circle cx="60" cy="118" r="13" :fill="look.trim" opacity="0.16" />
      <circle cx="60" cy="118" r="13" fill="none" :stroke="look.trim" stroke-width="1" opacity="0.6" />
    </g>
    <g v-else-if="look.item === 'beads'">
      <path d="M45,70 Q60,112 75,70" fill="none" :stroke="look.trim" stroke-width="3" stroke-linecap="round" stroke-dasharray="0.01 4.4" />
    </g>

    <!-- ========== 头部 ========== -->
    <rect x="55" y="56" width="10" height="15" :fill="skinShade" />
    <!-- 长发披肩（在头后） -->
    <g v-if="look.hairKind === 'long'">
      <path d="M45,40 C37,62 40,88 50,98 L57,70 Z" :fill="look.hair" />
      <path d="M75,40 C83,62 80,88 70,98 L63,70 Z" :fill="look.hair" />
    </g>
    <circle cx="48.6" cy="48" r="2.6" :fill="skin" />
    <circle cx="71.4" cy="48" r="2.6" :fill="skin" />
    <ellipse cx="60" cy="46" rx="11.4" ry="13.2" :fill="skin" stroke="rgba(0,0,0,.35)" stroke-width="0.7" />
    <!-- 五官：眼（柯镇恶双目已盲，以斜线示意）、眉、口 -->
    <path v-if="!look.blind" d="M54,47.6 q1.9,1.3 3.8,0 M62.2,47.6 q1.9,1.3 3.8,0" fill="none" stroke="#2a2420" stroke-width="1.1" stroke-linecap="round" />
    <path v-else d="M53.6,46.4 l4.4,2.6 M66.4,46.4 l-4.4,2.6" fill="none" stroke="#2a2420" stroke-width="1.2" stroke-linecap="round" />
    <path d="M53,43.6 q2.6,-1.4 5,0 M62,43.6 q2.6,-1.4 5,0" fill="none" :stroke="look.hairKind === 'bald' ? '#3a2e24' : look.hair" stroke-width="1.1" stroke-linecap="round" />
    <path d="M58.2,54.4 q1.8,1 3.6,0" fill="none" stroke="#7a4a3a" stroke-width="1" stroke-linecap="round" />
    <path d="M60,49 v3.6" stroke="#b09478" stroke-width="0.8" stroke-linecap="round" />

    <!-- 发式 -->
    <g v-if="look.hairKind === 'bun'">
      <path d="M48.4,45 C47,30 73,30 71.6,45 C69,37.5 51,37.5 48.4,45 Z" :fill="look.hair" />
      <circle cx="60" cy="27.5" r="5.6" :fill="look.hair" />
      <line x1="55" y1="27.5" x2="65" y2="27.5" :stroke="look.trim" stroke-width="1.2" />
    </g>
    <g v-else-if="look.hairKind === 'ribbons'">
      <path d="M48.4,45 C47,30 73,30 71.6,45 C69,37.5 51,37.5 48.4,45 Z" :fill="look.hair" />
      <ellipse cx="46" cy="41" rx="4" ry="6.2" :fill="look.hair" />
      <ellipse cx="74" cy="41" rx="4" ry="6.2" :fill="look.hair" />
      <path d="M44,45 q-2,10 0,16 M76,45 q2,10 0,16" fill="none" :stroke="look.band" stroke-width="1.8" stroke-linecap="round" />
      <circle cx="46" cy="36.6" r="1.8" :fill="look.band" />
      <circle cx="74" cy="36.6" r="1.8" :fill="look.band" />
    </g>
    <g v-else-if="look.hairKind === 'messy'">
      <path d="M47,47 C43,33 49,26 55,28 L57,23 L61,28 L65,23 L67,29 C74,30 77,38 73,47 C70,38 50,38 47,47 Z" :fill="look.hair" stroke="rgba(0,0,0,.25)" stroke-width="0.6" />
      <path d="M48,44 q-4,6 -3,14 M72,44 q4,6 3,14" fill="none" :stroke="look.hair" stroke-width="2" stroke-linecap="round" />
    </g>
    <g v-else-if="look.hairKind === 'long'">
      <path d="M47.6,46 C46,30 74,30 72.4,46 C69,38 51,38 47.6,46 Z" :fill="look.hair" />
      <path d="M60,32 C56,36 52,40 50,46 M60,32 C64,36 68,40 70,46" fill="none" stroke="rgba(0,0,0,.25)" stroke-width="0.8" />
    </g>
    <g v-else-if="look.hairKind === 'cap'">
      <path d="M48.4,44 C47,32 73,32 71.6,44 C69,38 51,38 48.4,44 Z" :fill="look.hair" />
      <rect x="51" y="21" width="18" height="12" rx="2.4" :fill="look.hair" stroke="rgba(0,0,0,.3)" stroke-width="0.6" />
      <line x1="51" y1="27" x2="69" y2="27" :stroke="look.trim" stroke-width="1.4" />
      <path d="M70,32 q8,6 5,18" fill="none" :stroke="look.hair" stroke-width="2.2" stroke-linecap="round" />
    </g>
    <g v-else-if="look.hairKind === 'beard'">
      <path d="M47,47 C43,33 49,27 55,29 L58,24 L62,29 L66,26 L68,30 C74,31 77,39 73,47 C70,38 50,38 47,47 Z" :fill="look.hair" stroke="rgba(0,0,0,.18)" stroke-width="0.6" />
      <path d="M49.6,53 C51,68 69,68 70.4,53 C66,60 54,60 49.6,53 Z" :fill="look.hair" stroke="rgba(0,0,0,.18)" stroke-width="0.6" />
    </g>
    <g v-else-if="look.hairKind === 'bald'">
      <circle cx="56.4" cy="36" r="0.95" fill="#8a5a40" />
      <circle cx="60" cy="34.2" r="0.95" fill="#8a5a40" />
      <circle cx="63.6" cy="36" r="0.95" fill="#8a5a40" />
    </g>
    <g v-else-if="look.hairKind === 'wrap'">
      <path d="M47.4,46 C46,31 74,31 72.6,46 Z" :fill="look.hair" />
      <path d="M48,42 L72,38" :stroke="look.trim" stroke-width="1.6" />
      <path d="M72,38 q7,3 6,13" fill="none" :stroke="look.hair" stroke-width="2.4" stroke-linecap="round" />
    </g>
    <!-- 额带（主角 / 黄蓉） -->
    <g v-if="look.band && look.hairKind === 'bun'">
      <path d="M48.8,40.4 Q60,36.4 71.2,40.4" fill="none" :stroke="look.band" stroke-width="2.2" />
      <path d="M71,40.4 q8,3 6,15 M71,40.4 q6,6 3,17" fill="none" :stroke="look.band" stroke-width="1.6" stroke-linecap="round" />
    </g>
  </svg>
</template>
