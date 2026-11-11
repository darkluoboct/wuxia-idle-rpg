<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { ArrowLeftRight, Check, ChevronDown, ChevronRight, ChevronsLeft, Flower2, Maximize2, Plus, Settings, ShieldCheck, Swords, Trash2, UserRound, X } from 'lucide-vue-next'
import { useGameStore } from '@/stores/gameStore'
import { IS_MOCK_MODE } from '@/network/apiClient'
import { SECTS } from '@/config/gameData'
import { PLAYER_AVATARS } from '@/config/uiMeta'
import type { PlayerAvatarId } from '@/network/protocol'
import scene from '@/assets/selection-scene.webp'

defineProps<{ canReturn: boolean }>()
const emit = defineEmits<{ enter: []; back: [] }>()
const store = useGameStore()
const roles = computed(() => IS_MOCK_MODE ? store.characterList : store.onlinePhase === 'ready' ? [store.player] : [])
const selectedId = ref(store.savedGame?.playerId ?? store.player.id)
const selected = computed(() => roles.value.find((role) => role.id === selectedId.value))
const canCreate = computed(() => IS_MOCK_MODE ? roles.value.length < 4 : store.onlinePhase === 'create')
const serverName = IS_MOCK_MODE ? '嘉兴烟雨 · 本地试玩' : '嘉兴烟雨 · 江湖在线'
const sectName = (id: string | null) => SECTS.find((sect) => sect.id === id)?.name ?? '逍遥散人'
const modal = ref<HTMLDialogElement>()
const modalKind = ref<'create' | 'delete' | 'server' | 'settings'>('create')
const nickname = ref('')
const avatarId = ref<PlayerAvatarId>('hero_sword')
const formError = ref('')
const movingScene = ref(true)
const submitting = ref(false)

watch(roles, (list) => {
  if (!list.some((role) => role.id === selectedId.value)) selectedId.value = list[0]?.id ?? ''
}, { immediate: true })

async function openModal(kind: typeof modalKind.value) {
  modalKind.value = kind
  formError.value = ''
  store.authError = ''
  nickname.value = ''
  avatarId.value = selected.value?.avatarId ?? 'hero_sword'
  modal.value?.showModal()
  await nextTick()
  modal.value?.querySelector<HTMLInputElement>('#character-name')?.focus()
}

async function createCharacter() {
  if (submitting.value || store.authBusy || !canCreate.value) return
  const name = nickname.value.trim().normalize('NFKC')
  if (!/^[\p{L}\p{N}·_\-]{2,16}$/u.test(name)) {
    formError.value = '侠客名须为 2–16 位汉字、字母或数字，可用 · _ -'
    return
  }
  submitting.value = true
  try {
    if (IS_MOCK_MODE) selectedId.value = store.createLocalCharacter(name, avatarId.value) ?? selectedId.value
    else {
      await store.createOnlinePlayer(name, avatarId.value)
      if (store.authError) return
      selectedId.value = store.player.id
    }
    modal.value?.close()
  } catch (error) {
    formError.value = error instanceof Error ? error.message : '创建失败，请再试一次'
  } finally {
    submitting.value = false
  }
}

function deleteCharacter() {
  if (!selected.value || !IS_MOCK_MODE) return
  store.deleteLocalCharacter(selected.value.id)
  modal.value?.close()
}

function enterJianghu() {
  if (!selected.value) return
  if (IS_MOCK_MODE) store.selectLocalCharacter(selected.value.id)
  emit('enter')
}

async function toggleFullscreen() {
  try {
    const gameDocument = window.frameElement?.id === 'game-frame' ? window.parent.document : document
    if (gameDocument.fullscreenElement) await gameDocument.exitFullscreen()
    else await gameDocument.documentElement.requestFullscreen()
  } catch {
    formError.value = '当前窗口不支持全屏显示'
  }
}
</script>

<template>
  <main class="character-select" :class="{ 'scene-still': !movingScene }" aria-label="角色选择">
    <img class="selection-landscape" :src="scene" alt="桃花掩映的嘉兴山水，水车与亭台临水而立" fetchpriority="high" />
    <div class="selection-shade" aria-hidden="true" />

    <header class="selection-header">
      <div class="selection-brand">
        <h1 class="font-brush">金庸群侠</h1>
        <span class="selection-seal">问道</span>
        <span class="brand-subtitle">问道武林</span>
      </div>
      <div class="selection-account">
        <span class="account-label"><UserRound aria-hidden="true" />{{ IS_MOCK_MODE ? '本地试玩' : '江湖账号' }}</span>
        <button v-if="!IS_MOCK_MODE" class="header-text-button" :disabled="store.authBusy" @click="store.logout()"><ArrowLeftRight aria-hidden="true" />切换账号</button>
        <span class="header-divider" aria-hidden="true" />
        <button class="header-server" @click="openModal('server')"><i class="server-dot" /> <span>{{ serverName }}</span><ChevronDown aria-hidden="true" /></button>
        <span class="header-divider" aria-hidden="true" />
        <button class="selection-icon" aria-label="界面设置" @click="openModal('settings')"><Settings /></button>
      </div>
    </header>

    <section class="character-ledger" aria-labelledby="selection-title">
      <div class="ledger-heading">
        <span class="heading-ornament" aria-hidden="true">◆</span>
        <h2 id="selection-title" class="font-brush">角色选择</h2>
        <span class="heading-ornament" aria-hidden="true">◆</span>
      </div>
      <div class="ledger-server"><span><i class="server-dot" />嘉兴烟雨</span><button @click="openModal('server')">切换服务器<ArrowLeftRight aria-hidden="true" /></button></div>

      <div class="character-slots" role="group" aria-label="侠客名册">
        <template v-for="slot in 4" :key="slot">
          <button v-if="roles[slot - 1]" class="character-slot" :class="{ 'is-selected': selectedId === roles[slot - 1]!.id }" :aria-pressed="selectedId === roles[slot - 1]!.id" @click="selectedId = roles[slot - 1]!.id">
            <span class="character-avatar" aria-hidden="true"><img :src="PLAYER_AVATARS[roles[slot - 1]!.avatarId].image" alt="" /></span>
            <span class="slot-info"><strong class="font-brush">{{ roles[slot - 1]!.nickname }}</strong><span class="slot-level">Lv.{{ roles[slot - 1]!.level }}</span><span class="slot-sect"><Swords aria-hidden="true" />{{ sectName(roles[slot - 1]!.currentSectId) }}</span></span>
            <span v-if="selectedId === roles[slot - 1]!.id" class="selected-ribbon">当前角色</span>
            <span class="slot-index" aria-hidden="true">{{ String(slot).padStart(2, '0') }}</span>
          </button>
          <button v-else class="character-slot empty-slot" :disabled="!canCreate" :aria-label="canCreate ? `创建第 ${slot} 位角色` : '角色位暂未开放'" @click="openModal('create')">
            <span class="empty-avatar" aria-hidden="true"><Plus /></span><span><strong>{{ canCreate ? '虚位以待' : '尚未开放' }}</strong><small>{{ canCreate ? '再书一段江湖' : '当前区服仅开放一个角色位' }}</small></span><span class="slot-index" aria-hidden="true">{{ String(slot).padStart(2, '0') }}</span>
          </button>
        </template>
      </div>

      <button class="create-character" :disabled="!canCreate || store.authBusy" @click="openModal('create')"><span class="create-plus"><Plus aria-hidden="true" /></span><span class="font-brush">创建角色</span></button>
      <div class="ledger-footer"><span>{{ roles.length }} / {{ IS_MOCK_MODE ? 4 : 1 }} 位侠客</span><button :disabled="!IS_MOCK_MODE || !selected" :title="IS_MOCK_MODE ? '删除所选试玩角色' : '联机角色暂不支持删除'" @click="openModal('delete')"><Trash2 aria-hidden="true" />删除角色</button></div>
      <p class="ledger-note"><ShieldCheck aria-hidden="true" />{{ IS_MOCK_MODE ? '本地试玩' : '江湖存档 · 随账号保存' }}</p>
    </section>

    <div v-if="selected" class="character-stage" aria-hidden="true">
      <div class="hero-ground" />
      <Transition name="hero-reveal" mode="out-in"><img :key="selected.id" class="selection-figure" :src="PLAYER_AVATARS[selected.avatarId].image" alt="" fetchpriority="high" /></Transition>
    </div>
    <div v-if="selected" class="sect-banner" aria-hidden="true"><Flower2 /><span>{{ sectName(selected.currentSectId) }}</span><i>剑心自在</i></div>
    <Transition name="name-reveal" mode="out-in"><section v-if="selected" :key="selected.id" class="selected-identity" aria-label="当前侠客"><span class="identity-kicker">{{ sectName(selected.currentSectId) }}<i />剑行江湖</span><h2 class="font-brush" :class="{ 'identity-long': selected.nickname.length > 5 }">{{ selected.nickname }}</h2><span class="identity-level">等级 {{ selected.level }}<span>·</span>初入射雕</span></section></Transition>

    <div class="selection-petals" aria-hidden="true"><i v-for="n in 9" :key="n" :style="{ '--petal': n }" /></div>
    <footer class="selection-actions">
      <button class="return-button" :disabled="store.authBusy" :title="IS_MOCK_MODE && canReturn ? '返回江湖' : '返回登录'" @click="IS_MOCK_MODE ? emit('back') : store.logout()"><ChevronsLeft aria-hidden="true" />返回</button>
      <button class="enter-jianghu font-brush" :disabled="!selected || store.authBusy" @click="enterJianghu"><span class="enter-ornament" aria-hidden="true">❖</span><span>进入江湖</span><ChevronRight aria-hidden="true" /></button>
    </footer>
    <span class="scene-caption" aria-hidden="true">第一卷 <i /> 射雕英雄传</span>

    <dialog ref="modal" class="selection-dialog" aria-labelledby="selection-dialog-title" @click="($event.target === modal) && modal?.close()" @cancel="store.authBusy && $event.preventDefault()">
      <div class="dialog-content">
        <button class="dialog-close selection-icon" aria-label="关闭弹窗" :disabled="store.authBusy" @click="modal?.close()"><X /></button>
        <h2 id="selection-dialog-title" class="font-brush">{{ { create: '初入江湖', delete: '删除角色', server: '江湖区服', settings: '界面设置' }[modalKind] }}</h2>
        <form v-if="modalKind === 'create'" @submit.prevent="createCharacter">
          <p class="dialog-description">无门无派，亦可问道武林。</p>
          <fieldset class="character-gender" :disabled="submitting || store.authBusy">
            <legend>性别</legend>
            <div class="gender-options">
              <label v-for="id in (['hero_sword_male', 'hero_sword'] as const)" :key="id" class="gender-option" :class="{ 'is-selected': avatarId === id }">
                <input v-model="avatarId" type="radio" name="character-gender" :value="id" required />
                <img :src="PLAYER_AVATARS[id].image" alt="" />
                <span>{{ PLAYER_AVATARS[id].label }}</span>
              </label>
            </div>
          </fieldset>
          <label class="name-label" for="character-name">侠客名</label>
          <input id="character-name" v-model="nickname" class="character-name-input" required minlength="2" maxlength="16" autocomplete="off" placeholder="留下你的江湖名号" :disabled="submitting || store.authBusy" :aria-invalid="!!(formError || store.authError)" aria-describedby="character-form-message" />
          <p id="character-form-message" class="form-message" :class="{ 'form-error': formError || store.authError }" :role="formError || store.authError ? 'alert' : undefined">{{ formError || store.authError || '2–16 位汉字、字母或数字，可用 · _ -' }}</p>
          <button class="dialog-primary" type="submit" :disabled="submitting || store.authBusy">{{ submitting || store.authBusy ? '正在落笔…' : '创建侠客' }}<ChevronRight aria-hidden="true" /></button>
        </form>
        <div v-else-if="modalKind === 'delete'">
          <p class="dialog-description">确定删除「{{ selected?.nickname }}」？该试玩角色的修行进度将一并清除。</p>
          <div class="dialog-buttons"><button @click="modal?.close()">留在江湖</button><button class="dialog-danger" @click="deleteCharacter">确认删除</button></div>
        </div>
        <div v-else-if="modalKind === 'server'">
          <p class="dialog-description">当前开放区服</p>
          <button class="available-server" @click="modal?.close()"><i class="server-dot" /><span>{{ serverName }}<small>{{ IS_MOCK_MODE ? '独立试玩，随时启程' : '账号存档，同游江湖' }}</small></span><Check aria-hidden="true" /></button>
        </div>
        <div v-else class="selection-settings"><label><span>飘花与场景动态</span><input v-model="movingScene" type="checkbox" /></label><button @click="toggleFullscreen"><Maximize2 aria-hidden="true" />切换全屏</button><p v-if="formError" class="form-error" role="status">{{ formError }}</p></div>
      </div>
    </dialog>
  </main>
</template>

<style scoped>
.character-select {
  --selection-gold: #d7b374;
  --selection-pale: #f4dfb1;
  --selection-line: #aa85524f;
  position: relative; isolation: isolate; height: 100dvh; min-height: 34rem; overflow: hidden;
  color: #eee6d8; background: #1b2829; font-family: var(--font-body);
}
.selection-landscape { position: absolute; z-index: -3; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: center; animation: landscape-arrive 1.4s ease-out both; }
.selection-shade { position: absolute; z-index: -2; inset: 0; pointer-events: none; background: linear-gradient(0deg, #111b2399, transparent 23%), linear-gradient(90deg, #11161e50, transparent 40%); }
.selection-header { position: relative; z-index: 6; display: flex; justify-content: space-between; align-items: center; height: 3.8rem; padding: 0 1.5rem 0 2rem; border-bottom: 1px solid #c6a66a80; background: url('../assets/cloud-etch.svg') left -3rem center / 24rem no-repeat, linear-gradient(100deg, #171b20ed, #161c24f5); box-shadow: 0 3px 16px #10101340; }
.selection-brand { display: flex; align-items: center; gap: .65rem; white-space: nowrap; }
.selection-brand h1 { margin: 0; font-size: 2.65rem; line-height: 1; letter-spacing: .04em; color: #fcf3da; text-shadow: 0 2px 3px #000; }
.selection-seal { writing-mode: vertical-rl; padding: .25rem .12rem; border-radius: 45%; background: #9a2c2d; font-size: .75rem; line-height: 1; box-shadow: inset 0 0 0 1px #d57e6850; }
.brand-subtitle { padding-left: .75rem; border-left: 1px solid #bb9e6955; font-size: .85rem; letter-spacing: .23em; color: #d0bc95; }
.selection-account { display: flex; align-items: center; gap: 1.1rem; font-size: .85rem; }
.account-label, .header-text-button, .header-server { display: flex; align-items: center; gap: .5rem; }
.selection-account svg { width: 1rem; height: 1rem; color: var(--selection-gold); }
.header-text-button { color: var(--selection-pale); }
.header-divider { width: 1px; height: 1.1rem; background: var(--selection-line); }
.header-server { gap: .6rem; }
.server-dot { display: inline-block; flex: none; width: .45rem; height: .45rem; border-radius: 50%; background: #66c591; box-shadow: 0 0 7px #61d99940; }
.selection-icon { display: grid; place-items: center; padding: .4rem; color: var(--selection-gold); }
.selection-icon svg { width: 1.2rem; height: 1.2rem; }
.character-ledger { position: absolute; z-index: 4; top: 5.5rem; bottom: 3.4rem; left: 1.5rem; display: flex; flex-direction: column; width: clamp(20rem, 23.4vw, 26rem); padding: 1.05rem 1.15rem .9rem; background: url('../assets/cloud-etch.svg') left -3rem bottom -1rem / 20rem no-repeat, linear-gradient(125deg, #1b2024f5, #181d21ee 68%, #29292bec); box-shadow: 0 12px 40px #08131a55, inset 0 0 35px #030a1350; animation: ledger-arrive .65s .1s both; }
.character-ledger::before, .character-ledger::after { content: ''; position: absolute; inset: 0; pointer-events: none; border: 1px solid transparent; border-image: url('../assets/frame-etch.svg') 31 / 1.95rem stretch; }
.character-ledger::before { inset: .35rem; border: 1px solid #b99a5833; border-image: none; }
.ledger-heading { display: flex; align-items: center; justify-content: center; gap: 1.3rem; padding-bottom: .8rem; border-bottom: 1px solid var(--selection-line); }
.ledger-heading h2 { margin: 0; color: var(--selection-pale); font-size: 1.9rem; line-height: 1.4; letter-spacing: .16em; }
.heading-ornament { color: #a48752; font-size: .65rem; position: relative; }
.heading-ornament::before { content: ''; position: absolute; width: 2.4rem; height: 1px; background: linear-gradient(90deg, transparent, #a48752); right: 1rem; top: 50%; }
.heading-ornament:last-child::before { left: 1rem; right: auto; transform: rotate(180deg); }
.ledger-server { display: flex; justify-content: space-between; align-items: center; gap: .5rem; margin: .85rem 0 1rem; font-size: .78rem; color: #d8cbb2; }
.ledger-server > span { display: flex; align-items: center; gap: .45rem; }
.ledger-server button { display: flex; align-items: center; gap: .4rem; padding: .2rem .5rem; border: 1px solid #8c754c; border-radius: 2px; color: var(--selection-pale); background: linear-gradient(#34342f, #24272a); font-size: .7rem; }
.ledger-server button svg { width: .8rem; height: .8rem; }
.character-slots { flex: 1; min-height: 0; display: grid; grid-template-rows: repeat(4, minmax(0, 1fr)); gap: .7rem; }
.character-slot { position: relative; display: flex; align-items: center; gap: 1rem; min-height: 0; width: 100%; padding: .7rem .85rem; text-align: left; background: linear-gradient(110deg, #373a3c80, #25282d80); border: 1px solid #8d754d80; border-radius: 3px 12px 3px 12px; transition: background .2s, border-color .2s, box-shadow .2s; }
.character-slot::after { content: ''; position: absolute; inset: 3px; border: 1px solid #bda46a18; border-radius: inherit; pointer-events: none; }
.character-slot:not(:disabled):hover { background: linear-gradient(110deg, #62503c80, #32313090); border-color: #ceaa6c; }
.character-slot.is-selected { background: linear-gradient(110deg, #745a3485, #44433b60); border-color: #efc57c; box-shadow: inset 0 0 12px #edac4240, 0 0 3px 1px #edc06c, 0 0 13px #e7a64355; }
.character-avatar { flex: none; position: relative; width: clamp(3.5rem, 5.6vw, 5.6rem); aspect-ratio: 1; overflow: hidden; border: 1px solid #cba362; border-radius: 50%; background: radial-gradient(circle at 50% 35%, #927871, #283641 70%); box-shadow: 0 3px 9px #0008; }
.character-avatar img { position: absolute; width: 245%; max-width: none; top: -7%; left: -99%; }
.slot-info { display: flex; flex: 1; min-width: 0; flex-direction: column; gap: .12rem; position: relative; z-index: 1; }
.slot-info strong { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-size: clamp(1.2rem, 1.65vw, 1.6rem); line-height: 1.3; color: #f1ece0; letter-spacing: .06em; }
.slot-level { color: #e0cba3; font-size: .9rem; line-height: 1.4; }
.slot-sect { display: flex; align-items: center; gap: .4rem; font-size: .84rem; color: #dfd2b9; }
.slot-sect svg { width: 1.05rem; height: 1.05rem; color: #eac482; stroke-width: 1.4; }
.selected-ribbon { position: absolute; top: .45rem; right: -.15rem; z-index: 2; padding: .08rem .5rem .1rem .8rem; background: linear-gradient(90deg, #99713d, #e1ba6e); color: #302413; font-size: .67rem; font-weight: 700; clip-path: polygon(9% 0, 100% 0, 100% 100%, 9% 100%, 0 50%); }
.slot-index { position: absolute; right: .7rem; bottom: .3rem; font-family: Georgia, serif; font-size: 1.35rem; line-height: 1; color: #c4ae7920; }
.empty-slot { border-style: solid; border-color: #8d754d40; background: #1b21274d; color: #af9d7e; }
.empty-avatar { display: grid; place-items: center; flex: none; width: clamp(3.5rem, 5.6vw, 5.6rem); aspect-ratio: 1; border: 1px solid #9a84523d; border-radius: 50%; background: radial-gradient(#a88d4d10, transparent); }
.empty-avatar svg { width: 1.4rem; height: 1.4rem; stroke-width: 1; color: #a68b5e; }
.empty-slot strong { font-size: 1.05rem; font-weight: 400; letter-spacing: .12em; }
.empty-slot small { display: block; margin-top: .3rem; font-size: .7rem; color: #928a7c; }
.empty-slot:disabled { opacity: .5; }
.create-character { display: flex; align-items: center; justify-content: center; gap: .9rem; flex: none; min-height: 3.8rem; margin-top: 1.1rem; border: 1px solid #b4955e; border-radius: 4px 12px; background: linear-gradient(110deg, #3839307d, #31322d50); color: var(--selection-pale); transition: background .2s, box-shadow .2s; }
.create-character .font-brush { font-size: 1.65rem; }
.create-plus { display: grid; place-items: center; width: 1.85rem; height: 1.85rem; border: 1px solid #b99b61; border-radius: 50%; }
.create-plus svg { width: 1.5rem; height: 1.5rem; stroke-width: 1.4; }
.create-character:not(:disabled):hover { background: #8f70483d; box-shadow: inset 0 0 18px #c7a56420; }
.create-character:disabled { opacity: .4; }
.ledger-footer { display: flex; justify-content: space-between; align-items: center; gap: .7rem; margin: .9rem .1rem .6rem; font-size: .72rem; color: #a69c87; }
.ledger-footer button { display: flex; align-items: center; justify-content: center; gap: .4rem; padding: .15rem .6rem; color: #d5c39c; border: 1px solid #a0855260; border-radius: 2px; }
.ledger-footer button svg { width: .85rem; height: .85rem; }
.ledger-footer button:disabled { opacity: .35; }
.ledger-note { display: flex; justify-content: center; align-items: center; gap: .35rem; padding-top: .5rem; border-top: 1px solid #a0855229; color: #9b978b; font-size: .63rem; }
.ledger-note svg { width: .8rem; height: .8rem; }
.character-stage { position: absolute; z-index: 1; top: 10%; bottom: 13%; left: 29%; width: 36%; pointer-events: none; animation: character-arrive 1s .15s both; }
.selection-figure { position: absolute; width: 100%; height: 100%; object-fit: contain; object-position: center bottom; filter: drop-shadow(6px 12px 10px #1a273839); transform-origin: 55% 95%; animation: silk-breathe 8s 1.5s ease-in-out infinite; }
.hero-ground { position: absolute; bottom: -1%; left: 29%; width: 52%; height: 5%; border-radius: 50%; background: #17212470; filter: blur(10px); }
.sect-banner { position: absolute; z-index: 2; top: 15%; left: max(27.5%, 23rem); width: 3.7rem; min-height: 13rem; display: flex; flex-direction: column; align-items: center; padding: 1rem .4rem 1.6rem; color: #352d2e; background: linear-gradient(90deg, #dac8ad, #fff0d4 35%, #e9d7b9 70%, #cab996); border: 4px double #8e574d; border-top: 5px solid #614735; box-shadow: 4px 6px 15px #25303d45; clip-path: polygon(0 0, 100% 0, 100% 100%, 50% 94%, 0 100%); }
.sect-banner > svg { width: 1.5rem; height: 1.5rem; color: #a16880; margin-bottom: .5rem; }
.sect-banner > span { writing-mode: vertical-rl; font-family: var(--font-brush); font-size: 1.8rem; letter-spacing: .15em; }
.sect-banner > i { margin-top: .6rem; writing-mode: vertical-rl; font-style: normal; letter-spacing: .2em; font-size: .6rem; color: #8c6e62; }
.selected-identity { position: absolute; top: 52%; left: 71%; z-index: 2; padding: .4rem 0; color: #fff3dc; text-shadow: 0 2px 6px #18292b; }
.identity-kicker { display: flex; align-items: center; gap: .6rem; letter-spacing: .16em; font-size: .85rem; }
.identity-kicker i { width: 1rem; height: 1px; background: #f5deb3; }
.selected-identity h2 { max-width: 24vw; overflow-wrap: anywhere; font-size: clamp(3rem, 4.6vw, 5rem); margin: .25rem 0; line-height: 1.4; letter-spacing: .1em; }
.selected-identity h2.identity-long { font-size: clamp(1.8rem, 3vw, 3rem); }
.identity-level { display: flex; align-items: center; gap: .9rem; color: #f4e6c9; font-size: .85rem; letter-spacing: .12em; }
.selection-actions { position: absolute; z-index: 5; left: 29%; right: 4%; bottom: 4.5%; display: flex; align-items: center; justify-content: center; gap: 1.7rem; }
.return-button { display: flex; align-items: center; justify-content: center; gap: .5rem; min-width: 9rem; height: 3rem; color: var(--selection-pale); font-size: 1.3rem; background: linear-gradient(100deg, #25292ee8, #34332de8, #24282de8); border: 1px solid #d2b072; box-shadow: inset 0 0 0 3px #292a2c, inset 0 0 0 4px #a2885655, 0 3px 8px #0005; clip-path: polygon(10% 0, 90% 0, 100% 50%, 90% 100%, 10% 100%, 0 50%); }
.return-button:disabled { opacity: .5; }
.enter-jianghu { display: flex; align-items: center; justify-content: center; gap: 1rem; position: relative; min-width: 20rem; height: 4.3rem; padding: 0 2rem; border: 1px solid #f2cd83; border-radius: 3rem .4rem 3rem .4rem; color: #fff0c6; background: url('../assets/cloud-etch.svg') right bottom / 12rem auto no-repeat, linear-gradient(110deg, #76502c, #b58038 45%, #6f4927); box-shadow: inset 0 0 0 3px #63471f, inset 0 0 0 4px #efc66a, inset 0 0 16px #ffce6880, 0 0 22px #e5aa4450, 0 5px 10px #17202a80; font-size: 2.55rem; line-height: 1; text-shadow: 0 2px 3px #543713; transition: filter .2s, transform .2s, box-shadow .2s; }
.enter-jianghu::after { content: ''; position: absolute; bottom: 0; left: 23%; right: 23%; height: 2px; background: #fff0bb; box-shadow: 0 0 15px 4px #f3c35c80; }
.enter-jianghu > svg { width: 1.6rem; height: 1.6rem; stroke-width: 1.7; }
.enter-ornament { font-size: 1.4rem; color: #f6d18a; }
.enter-jianghu:not(:disabled):hover { filter: brightness(1.17); transform: translateY(-2px); box-shadow: inset 0 0 0 3px #63471f, inset 0 0 0 4px #efc66a, inset 0 0 16px #ffce6880, 0 0 28px #e5aa4480, 0 7px 13px #17202a80; }
.enter-jianghu:disabled { opacity: .45; filter: grayscale(.5); }
.scene-caption { position: absolute; z-index: 2; right: 1.7rem; bottom: 1rem; display: flex; align-items: center; gap: .6rem; color: #e2d6bd; font-size: .7rem; letter-spacing: .14em; text-shadow: 0 1px 3px #000; }
.scene-caption i { width: 1.6rem; height: 1px; background: #d4b88480; }
.selection-petals { position: absolute; inset: 0; overflow: hidden; pointer-events: none; z-index: 3; }
.selection-petals i { --drift: calc(80px + var(--petal) * 17px); position: absolute; top: -3%; left: calc(var(--petal) * 11%); width: calc(5px + var(--petal) * .7px); height: 6px; border-radius: 90% 10% 80% 20%; background: #f6c6dc; box-shadow: 0 0 5px #ffe3f244; opacity: 0; animation: petal-fall calc(11s + var(--petal) * 1.3s) calc(var(--petal) * -2.7s) linear infinite; }
.selection-dialog { width: min(26rem, calc(100vw - 2rem)); max-height: calc(100dvh - 2rem); overflow: auto; padding: 0; margin: auto; border: 1px solid #b99a61; border-radius: 4px 16px; color: #eae0cc; background: url('../assets/cloud-etch.svg') right bottom / 17rem no-repeat, #1f242a; box-shadow: inset 0 0 0 4px #1f242a, inset 0 0 0 5px #b99a6140, 0 20px 80px #0009; }
.selection-dialog::backdrop { background: #0c162594; backdrop-filter: blur(5px); }
.dialog-content { position: relative; padding: 2rem; }
.dialog-close { position: absolute; right: .7rem; top: .7rem; }
.dialog-content h2 { margin: 0 0 1rem; color: var(--selection-pale); font-size: 2rem; }
.dialog-description { font-size: .9rem; color: #baaf9e; line-height: 1.8; margin-bottom: 1.4rem; }
.name-label { display: block; margin-bottom: .5rem; color: #d6c8ab; font-size: .85rem; }
.character-gender { min-width: 0; margin-bottom: 1.2rem; border: 0; padding: 0; }
.character-gender legend { margin-bottom: .5rem; color: #d6c8ab; font-size: .85rem; }
.gender-options { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .8rem; }
.gender-option { position: relative; display: flex; flex-direction: column; align-items: center; gap: .35rem; padding: .65rem .5rem .45rem; border: 1px solid #a58a584d; border-radius: 3px 10px; background: #10182160; color: #c7baa2; cursor: pointer; transition: border-color .2s, background .2s; }
.gender-option.is-selected { border-color: #e2bc77; background: #a5894826; color: #f4dfb1; box-shadow: inset 0 0 14px #e2bc7718; }
.gender-option:focus-within { outline: 2px solid var(--selection-gold); outline-offset: 3px; }
.gender-option input { position: absolute; top: .6rem; left: .6rem; width: 1rem; height: 1rem; accent-color: #c4a162; }
.gender-option img { width: 100%; height: 8rem; object-fit: contain; }
.gender-option span { font-size: .9rem; letter-spacing: .15em; }
.character-gender:disabled .gender-option { cursor: not-allowed; opacity: .6; }
.character-name-input { width: 100%; border: 1px solid #a58a5866; background: #10182180; border-radius: 2px; padding: .7rem .9rem; outline-offset: 3px; }
.character-name-input::placeholder { color: #837c70; }
.form-message { margin: .5rem 0 1.3rem; color: #aaa08e; font-size: .72rem; min-height: 1.5rem; }
.form-error { color: #ec9b8b; }
.dialog-primary, .dialog-buttons button { display: flex; align-items: center; justify-content: center; gap: .5rem; width: 100%; padding: .65rem; border: 1px solid #bda16b; border-radius: 3px; color: #f5e5bc; background: linear-gradient(110deg, #6b512c, #8a6834, #5e4b2c); }
.dialog-primary svg { width: 1rem; height: 1rem; }
.dialog-primary:disabled { opacity: .5; }
.dialog-buttons { display: flex; gap: .8rem; }
.dialog-buttons button:first-child { background: transparent; }
.dialog-buttons .dialog-danger { border-color: #b87765; background: #753e35; }
.available-server { display: flex; align-items: center; gap: .8rem; width: 100%; padding: 1rem; border: 1px solid #b49a6066; background: #a5894820; text-align: left; }
.available-server > span { flex: 1; color: #e6d3ac; }
.available-server small { display: block; font-size: .72rem; color: #a79e8f; margin-top: .3rem; }
.available-server svg { width: 1.15rem; height: 1.15rem; color: #c8ae70; }
.selection-settings { display: grid; gap: 1rem; }
.selection-settings label, .selection-settings button { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: .6rem 0; font-size: .9rem; }
.selection-settings input { width: 1.1rem; height: 1.1rem; accent-color: #c4a162; }
.selection-settings button { justify-content: flex-start; border-top: 1px solid var(--selection-line); color: #e5cea1; }
.selection-settings svg { width: 1rem; height: 1rem; }
.hero-reveal-enter-active, .hero-reveal-leave-active, .name-reveal-enter-active, .name-reveal-leave-active { transition: opacity .2s ease, translate .3s ease; }
.hero-reveal-enter-from, .hero-reveal-leave-to { opacity: 0; translate: 12px 0; }
.name-reveal-enter-from, .name-reveal-leave-to { opacity: 0; translate: 0 8px; }
@keyframes ledger-arrive { from { opacity: 0; translate: -15px 0; } to { opacity: 1; translate: 0; } }
@keyframes character-arrive { from { opacity: 0; translate: 0 15px; } to { opacity: 1; translate: 0; } }
@keyframes landscape-arrive { from { opacity: .5; scale: 1.025; } to { opacity: 1; scale: 1; } }
@keyframes silk-breathe { 0%, 100% { transform: rotate(-.25deg) translateY(0); } 50% { transform: rotate(.25deg) translateY(-4px); } }
@keyframes petal-fall { 0% { opacity: 0; transform: translate3d(0, 0, 0) rotate(0); } 10% { opacity: .8; } 90% { opacity: .65; } 100% { opacity: 0; transform: translate3d(var(--drift), 105vh, 0) rotate(400deg); } }
.scene-still .selection-petals { display: none; }
.scene-still .selection-figure, .scene-still .selection-landscape, .scene-still .character-stage, .scene-still .character-ledger { animation: none; }
@media (min-width: 1900px) { .character-ledger { top: 6rem; bottom: 4rem; left: 2rem; } .character-stage { left: 28%; width: 38%; } }
@media (max-height: 800px) and (min-width: 761px) { .character-ledger { top: 4.5rem; bottom: 1.3rem; padding-block: .8rem; } .ledger-heading { padding-bottom: .4rem; } .ledger-heading h2 { font-size: 1.65rem; } .ledger-server { margin-block: .65rem; } .character-slots { gap: .5rem; } .character-slot { padding-block: .35rem; } .character-avatar, .empty-avatar { width: 3.65rem; } .slot-info strong { font-size: 1.2rem; } .slot-sect { font-size: .74rem; } .slot-level { font-size: .8rem; } .create-character { min-height: 3rem; margin-top: .7rem; } .create-character .font-brush { font-size: 1.4rem; } .ledger-footer { margin-block: .5rem; } .ledger-note { padding-top: .3rem; } .enter-jianghu { min-width: 17rem; height: 3.7rem; font-size: 2.1rem; } .selection-actions { bottom: 4%; } }
@media (max-width: 1100px) { .brand-subtitle, .account-label { display: none; } .selection-account { gap: .75rem; } .character-ledger { left: 1rem; width: 19.5rem; } .character-stage { left: 30%; width: 46%; } .sect-banner { left: 21.5rem; top: 12%; width: 3rem; min-height: 11rem; } .sect-banner > span { font-size: 1.4rem; } .selected-identity { left: 77%; top: 42%; } .selected-identity h2 { writing-mode: vertical-rl; font-size: 3.3rem; } .identity-kicker { font-size: .75rem; } .identity-kicker i, .identity-kicker i + span { display: none; } .identity-level { font-size: .7rem; gap: .4rem; } .selection-actions { left: 33%; gap: 1rem; } .return-button { min-width: 7rem; } .enter-jianghu { min-width: 15rem; padding-inline: 1.3rem; font-size: 2rem; } .enter-ornament { display: none; } }
@media (max-width: 760px) {
  .character-select { min-height: 0; }
  .selection-header { height: 3.6rem; padding-inline: 1rem; }
  .selection-brand h1 { font-size: 2rem; }
  .selection-brand { gap: .4rem; }
  .selection-seal { font-size: .65rem; }
  .selection-account { gap: .3rem; }
  .selection-account .header-divider, .header-server, .header-text-button svg { display: none; }
  .header-text-button { font-size: .7rem; margin-right: .3rem; }
  .selection-landscape { object-position: 58% center; }
  .selection-shade { background: linear-gradient(0deg, #101821e0 5%, #10182120 65%); }
  .character-stage { left: 10%; top: 6%; bottom: 34%; width: 76%; }
  .sect-banner { left: 1rem; top: 5.3rem; width: 2.8rem; min-height: 10rem; padding-top: .65rem; }
  .sect-banner > span { font-size: 1.35rem; }
  .selected-identity { left: auto; right: 1.2rem; top: 17%; }
  .selected-identity h2 { max-height: 15rem; max-width: none; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-size: 2.8rem; margin-block: .6rem; }
  .identity-kicker { writing-mode: vertical-rl; font-size: .7rem; line-height: 1.7; max-height: 5rem; }
  .identity-kicker i { display: none; }
  .identity-level { flex-direction: column; align-items: flex-start; font-size: .7rem; gap: .2rem; }
  .identity-level > span { display: none; }
  .character-ledger { top: auto; bottom: 6.5rem; left: .8rem; width: calc(100% - 1.6rem); height: 15.5rem; padding: .75rem .85rem .6rem; background-color: #1b2024f2; }
  .ledger-heading { padding: 0 0 .45rem; gap: .9rem; }
  .ledger-heading h2 { font-size: 1.35rem; letter-spacing: .13em; }
  .ledger-server { position: absolute; top: .85rem; right: 1rem; margin: 0; font-size: .6rem; }
  .ledger-server > span { display: none; }
  .ledger-server button { padding: .05rem .2rem; font-size: .6rem; }
  .ledger-heading { justify-content: flex-start; padding-left: .2rem; }
  .heading-ornament { display: none; }
  .character-slots { grid-template: repeat(2, minmax(0, 1fr)) / repeat(2, minmax(0, 1fr)); gap: .45rem; margin-top: .6rem; }
  .character-slot { gap: .5rem; padding: .4rem; border-radius: 2px 8px; }
  .character-avatar, .empty-avatar { width: 2.7rem; }
  .slot-info { gap: 0; }
  .slot-info strong { font-size: 1.05rem; }
  .slot-level { font-size: .65rem; }
  .slot-sect { font-size: .62rem; gap: .2rem; }
  .slot-sect svg { width: .75rem; height: .75rem; }
  .selected-ribbon { font-size: .5rem; top: -.2rem; right: .2rem; padding: .02rem .3rem .02rem .5rem; }
  .slot-index { font-size: 1rem; right: .4rem; }
  .empty-slot strong { font-size: .85rem; letter-spacing: .05em; }
  .empty-slot small { font-size: .56rem; line-height: 1.4; margin-top: .15rem; }
  .empty-avatar svg { width: 1.2rem; height: 1.2rem; }
  .create-character { min-height: 2.2rem; margin-top: .6rem; gap: .5rem; }
  .create-character .font-brush { font-size: 1.2rem; }
  .create-plus { width: 1.3rem; height: 1.3rem; }
  .create-plus svg { width: 1rem; height: 1rem; }
  .ledger-footer { margin: .35rem 0 0; font-size: .6rem; }
  .ledger-footer button { border: 0; padding: .1rem .2rem; }
  .ledger-note { display: none; }
  .selection-actions { left: .8rem; right: .8rem; bottom: 1.8rem; gap: .8rem; }
  .return-button { min-width: 4.8rem; height: 2.6rem; gap: .1rem; font-size: 1rem; }
  .return-button svg { width: 1.2rem; height: 1.2rem; }
  .enter-jianghu { min-width: 0; width: 15rem; height: 3.55rem; padding-inline: 1.3rem; font-size: 1.85rem; gap: .6rem; }
  .scene-caption { right: 1rem; bottom: .35rem; font-size: .55rem; }
}
@media (max-width: 760px) and (max-height: 700px) { .character-ledger { bottom: 5.5rem; height: 14rem; } .selection-actions { bottom: 1.3rem; } .character-stage { top: 8%; bottom: 38%; } .sect-banner { min-height: 8.5rem; top: 4.5rem; } .sect-banner > i { display: none; } }
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; } .selection-petals { display: none; } }
</style>
