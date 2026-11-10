import fs from 'node:fs'
import path from 'node:path'

const filePath = path.resolve('frontend/src/views/JianghuView.vue')
let content = fs.readFileSync(filePath, 'utf8')

const target = `          <div class="space-y-2.5 p-3">
            <p class="hint min-h-[3.3rem]">{{ m.ambientDesc }}</p>
            <div class="flex items-center justify-between border-t border-line pt-2.5 text-xs tabular-nums">
              <div class="text-ink3">
                <div>基础收益 <b class="text-ink">{{ m.baseQiPerHour.toLocaleString() }}</b> 真气/小时</div>
                <div v-if="IS_MOCK_MODE">{{ m.onlineCount }} 人在线</div>
                <div v-else-if="store.roomConnected && store.roomMapId === m.id">{{ store.roomCount }} 人在线</div>
              </div>
              <button v-if="store.player.currentMapId !== m.id" class="btn btn-sm btn-gold" :disabled="store.onlineActionBusy" @click="store.moveMap(m.id)">前往</button>
              <span v-else class="chip chip-gold">你在这里</span>
            </div>
          </div>`

const replacement = `          <div class="space-y-2.5 p-3">
            <p class="hint min-h-[3.3rem]">{{ m.ambientDesc }}</p>
            <div class="flex flex-wrap items-center gap-1 border-t border-line/50 pt-2 text-[0.72rem]">
              <span class="text-ink3">本地产药：</span>
              <span
                v-for="h in getMapHerbs(m.id)"
                :key="h.id"
                class="chip !py-0 !text-[0.65rem]"
                :class="[TIER_META[h.tier].cls, (store.herbInventory[h.id] ?? 0) > 0 ? '' : 'opacity-60']"
              >
                {{ h.name }} ({{ store.herbInventory[h.id] ?? 0 }})
              </span>
            </div>
            <div class="flex items-center justify-between border-t border-line pt-2 text-xs tabular-nums">
              <div class="text-ink3">
                <div>基础收益 <b class="text-ink">{{ m.baseQiPerHour.toLocaleString() }}</b> 真气/小时</div>
                <div v-if="IS_MOCK_MODE">{{ m.onlineCount }} 人在线</div>
                <div v-else-if="store.roomConnected && store.roomMapId === m.id">{{ store.roomCount }} 人在线</div>
              </div>
              <button v-if="store.player.currentMapId !== m.id" class="btn btn-sm btn-gold" :disabled="store.onlineActionBusy" @click="store.moveMap(m.id)">前往</button>
              <div v-else class="flex items-center gap-1.5">
                <span class="chip chip-gold">你在这里</span>
                <button class="btn btn-sm btn-gold" @click="store.forageHerbs(m.id)">采药</button>
              </div>
            </div>
          </div>`

content = content.replace(/\r\n/g, '\n')
const targetNorm = target.replace(/\r\n/g, '\n')
const replNorm = replacement.replace(/\r\n/g, '\n')

if (content.includes(targetNorm)) {
  content = content.replace(targetNorm, replNorm)
  fs.writeFileSync(filePath, content, 'utf8')
  console.log('Patched JianghuView.vue')
} else {
  console.error('Target not found in JianghuView.vue')
}
