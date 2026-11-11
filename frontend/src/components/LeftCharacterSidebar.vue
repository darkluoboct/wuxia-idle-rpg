<script setup lang="ts">
import { computed } from 'vue'
import { Backpack, ChevronRight, Sparkles, Swords, UsersRound } from 'lucide-vue-next'
import { useGameStore } from '@/stores/gameStore'
import { PLAYER_AVATARS } from '@/config/uiMeta'

const store = useGameStore()
const p = computed(() => store.player)
const qiPct = computed(() => Math.min(100, Math.round(p.value.qiExp / Math.max(1, p.value.nextLevelQi) * 100)))

const PORTRAITS: Record<string, string> = { guojing: 'guojing', huangrong: 'huangrong', huangyaoshi: 'taoist' }
const party = computed(() => {
  const members = [{ id: p.value.id, name: p.value.nickname, detail: `Lv.${p.value.level}`, role: '主角', art: 'player' }]
  const l = store.currentLoadout
  for (const [id, role] of [[l.leftCompanionId, '追击'], [l.rightCompanionId, '挡招']] as const) {
    const companion = id ? store.companionOf(id) : undefined
    if (companion) members.push({ id: companion.id, name: companion.name, detail: companion.title, role, art: PORTRAITS[companion.id] })
  }
  return members.map((m) => {
    const unit = store.activeBattle?.units.find((u) => u.id === m.id)
    const hp = unit ? Math.round(100 * (store.liveUnitStates[unit.slot]?.hp ?? unit.hp) / unit.maxHp) : undefined
    return { ...m, hp }
  })
})

function openArsenal(tab: typeof store.arsenalTab) {
  store.arsenalTab = tab
  store.selectTab('ARSENAL')
}
</script>

<template>
  <div class="character-sheet">
    <header class="character-profile">
      <div class="hero-portrait">
        <i class="art art-player" :style="{ backgroundImage: `url(${PLAYER_AVATARS[p.avatarId].image})` }" aria-hidden="true" />
        <span class="hero-seal font-brush">侠</span>
      </div>
      <div class="hero-details">
        <h2 class="font-brush">{{ p.nickname }}</h2>
        <p class="hero-level"><b>Lv.{{ p.level }}</b><span>{{ store.currentRealm.name }}</span></p>
        <div class="hero-progress" :title="`真气 ${p.qiExp.toLocaleString()} / ${p.nextLevelQi.toLocaleString()}`">
          <div class="wuxia-meter qi-meter" role="progressbar" aria-label="角色升级进度" :aria-valuenow="qiPct"><i :style="{ width: `${qiPct}%` }" /></div>
          <span>{{ qiPct }}%</span>
        </div>
        <div class="hero-power"><Swords aria-hidden="true" /><span class="font-brush">战力</span><b>{{ store.derivedStats.combatPower.toLocaleString() }}</b></div>
      </div>
    </header>

    <section>
      <h2><button class="rail-heading" @click="openArsenal('SQUAD')">
        <span>当前队伍</span><small>({{ party.length }}/3)</small><ChevronRight class="rail-chevron" aria-hidden="true" />
      </button></h2>
      <ul class="party-list">
        <li v-for="member in party" :key="member.id" class="party-row">
          <span class="party-avatar" aria-hidden="true">
            <i v-if="member.art" class="art" :class="`art-${member.art}`" :style="member.id === p.id ? { backgroundImage: `url(${PLAYER_AVATARS[p.avatarId].image})` } : undefined" />
            <span v-else class="font-brush">{{ member.name.slice(0, 1) }}</span>
          </span>
          <div class="party-details">
            <div><b>{{ member.name }}</b><span>{{ member.detail }}</span></div>
            <div class="wuxia-meter party-meter" :title="member.hp === undefined ? '备战就绪' : `气血 ${member.hp}%`">
              <i :style="{ width: `${member.hp ?? 100}%` }" />
            </div>
          </div>
          <span class="party-role">{{ member.role }}</span>
        </li>
      </ul>
      <p v-if="store.activeTrioSynergy" class="party-synergy"><Sparkles :size="13" aria-hidden="true" />{{ store.activeTrioSynergy.name }}</p>
    </section>

    <footer>
      <div class="character-shortcuts">
        <button @click="openArsenal('EQUIP')"><Backpack aria-hidden="true" /><span>装备</span></button>
        <button @click="openArsenal('SKILLS')"><Swords aria-hidden="true" /><span>武学</span></button>
        <button @click="openArsenal('SQUAD')"><UsersRound aria-hidden="true" /><span>伙伴</span></button>
      </div>
      <div class="preset-strip" role="radiogroup" aria-label="出战方案">
        <button
          v-for="idx in ([1, 2, 3] as const)" :key="idx" role="radio"
          :aria-checked="p.activePresetIdx === idx" :title="store.presets[idx].name" :disabled="store.onlineActionBusy" @click="store.switchLoadout(idx)"
        >{{ store.presets[idx].name.split('·')[1] }}</button>
      </div>
    </footer>
  </div>
</template>
