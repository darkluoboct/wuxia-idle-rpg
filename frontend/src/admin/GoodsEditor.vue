<script setup lang="ts">
import { ref } from 'vue'
import { MAIL_LIMITS } from '../../../shared/admin.ts'
import { ACUPOINT_PILLS, ITEMS, SKILLS } from '../../../shared/gameData.ts'
import type { GoodsForm } from './api'

/** 邮件附件与商店商品共用的编辑器：元宝（可关）、纹银、真气、装备、武学残页、丹药 */
const props = defineProps<{ allowIngot?: boolean }>()
const goods = defineModel<GoodsForm>({ required: true })
const error = ref('')

const itemOptions = Object.values(ITEMS).map(({ id, name }) => ({ id, name }))
const skillOptions = Object.values(SKILLS).map(({ id, name }) => ({ id, name }))
const pillOptions = Object.values(ACUPOINT_PILLS).map(({ id, name }) => ({ id, name }))
const itemPick = ref('')
const skillPick = ref('')
const skillCount = ref(1)
const pillPick = ref(pillOptions[0]?.id ?? '')
const pillCount = ref(1)

const pickId = (input: string, options: { id: string; name: string }[]) =>
  options.find(({ id, name }) => id === input.trim() || name === input.trim())?.id
const update = (patch: Partial<GoodsForm>) => { goods.value = { ...goods.value, ...patch } }

function addItem() {
  const id = pickId(itemPick.value, itemOptions)
  if (!id) return void (error.value = `没有这件装备：${itemPick.value}`)
  if (!goods.value.items.includes(id)) update({ items: [...goods.value.items, id] })
  itemPick.value = ''
  error.value = ''
}
function addFragment() {
  const id = pickId(skillPick.value, skillOptions)
  if (!id) return void (error.value = `没有这门武学：${skillPick.value}`)
  update({ fragments: { ...goods.value.fragments, [id]: skillCount.value } })
  skillPick.value = ''
  error.value = ''
}
function without(record: Record<string, number>, id: string) {
  const { [id]: _removed, ...rest } = record
  return rest
}
</script>

<template>
  <div class="space-y-2">
    <div class="flex flex-wrap gap-3 text-sm">
      <label v-if="props.allowIngot" class="flex items-center gap-1.5">元宝
        <input :value="goods.ingot" class="input w-28" type="number" min="0" :max="MAIL_LIMITS.ingot" @input="update({ ingot: Number(($event.target as HTMLInputElement).value) })">
      </label>
      <label class="flex items-center gap-1.5">纹银
        <input :value="goods.silver" class="input w-32" type="number" min="0" :max="MAIL_LIMITS.silver" @input="update({ silver: Number(($event.target as HTMLInputElement).value) })">
      </label>
      <label class="flex items-center gap-1.5">真气
        <input :value="goods.qiExp" class="input w-36" type="number" min="0" :max="MAIL_LIMITS.qiExp" @input="update({ qiExp: Number(($event.target as HTMLInputElement).value) })">
      </label>
    </div>
    <div class="flex flex-wrap items-center gap-2 text-sm">
      <input v-model="itemPick" class="input w-64" list="admin-items" placeholder="装备名或 ID" aria-label="装备">
      <button type="button" class="btn btn-sm" @click="addItem">加装备</button>
      <span v-for="id in goods.items" :key="id" class="tag">【{{ ITEMS[id]?.name }}】<button type="button" class="ml-1 muted" :aria-label="`去掉${ITEMS[id]?.name}`" @click="update({ items: goods.items.filter((entry) => entry !== id) })">×</button></span>
    </div>
    <div class="flex flex-wrap items-center gap-2 text-sm">
      <input v-model="skillPick" class="input w-64" list="admin-skills" placeholder="武学名或 ID" aria-label="残页武学">
      <input v-model.number="skillCount" class="input w-20" type="number" min="1" :max="MAIL_LIMITS.fragments" aria-label="残页张数">
      <button type="button" class="btn btn-sm" @click="addFragment">加残页</button>
      <span v-for="(count, id) in goods.fragments" :key="id" class="tag">《{{ SKILLS[id]?.name }}》×{{ count }}<button type="button" class="ml-1 muted" :aria-label="`去掉${SKILLS[id]?.name}残页`" @click="update({ fragments: without(goods.fragments, String(id)) })">×</button></span>
    </div>
    <div class="flex flex-wrap items-center gap-2 text-sm">
      <select v-model="pillPick" class="input w-64" aria-label="丹药">
        <option v-for="pill in pillOptions" :key="pill.id" :value="pill.id">{{ pill.name }}</option>
      </select>
      <input v-model.number="pillCount" class="input w-20" type="number" min="1" :max="MAIL_LIMITS.pills" aria-label="丹药枚数">
      <button type="button" class="btn btn-sm" @click="update({ pills: { ...goods.pills, [pillPick]: pillCount } })">加丹药</button>
      <span v-for="(count, id) in goods.pills" :key="id" class="tag">{{ ACUPOINT_PILLS[id]?.name }} ×{{ count }}<button type="button" class="ml-1 muted" :aria-label="`去掉${ACUPOINT_PILLS[id]?.name}`" @click="update({ pills: without(goods.pills, String(id)) })">×</button></span>
    </div>
    <datalist id="admin-items"><option v-for="item in itemOptions" :key="item.id" :value="item.name">{{ item.id }}</option></datalist>
    <datalist id="admin-skills"><option v-for="skill in skillOptions" :key="skill.id" :value="skill.name">{{ skill.id }}</option></datalist>
    <p v-if="error" class="danger text-sm" role="alert">{{ error }}</p>
  </div>
</template>
