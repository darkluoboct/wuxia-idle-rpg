import fs from 'fs'

let content = fs.readFileSync('./shared/battle.ts', 'utf8')
content = content.replace(/\r\n/g, '\n')

// 1. Add calcBattleEnrageRound export
const insertAfter = `export function incomingDamage(attack: number, multiplier: number, defense: number, level: number) {
  return Math.max(70, Math.round(attack * multiplier * (1 - defense / (defense + 450 + level * 45))))
}`

const enrageFunc = `

/** 计算不同战斗位阶下的首领狂暴起始回合（依据首领血量与战斗模式动态确定） */
export function calcBattleEnrageRound(enemyHp: number, mode?: BattleReportDTO['mode']): number {
  if (mode === 'PVP_HUASHAN' || mode === 'PVP_AMBUSH') return 15
  if (enemyHp > 50000) return 22
  if (enemyHp > 10000) return 16
  return 12
}`

if (!content.includes('calcBattleEnrageRound')) {
  content = content.replace(insertAfter, insertAfter + enrageFunc)
}

// 2. Update simulateServerBattle round loop and enrage logic
const oldServerLoop = `  for (let round = 1; round <= 12; round++) {
    if (hpState.ALLY_MAIN <= 0 || (hpState.ENEMY_MAIN <= 0 && (hpState.ENEMY_LEFT ?? 0) <= 0 && (hpState.ENEMY_RIGHT ?? 0) <= 0)) {
      break
    }`

const newServerLoop = `  const enrageStartRound = calcBattleEnrageRound(enemyMain.hp, mode)
  const maxRounds = enrageStartRound + 4
  let isEnraged = false

  for (let round = 1; round <= maxRounds; round++) {
    if (hpState.ALLY_MAIN <= 0 || (hpState.ENEMY_MAIN <= 0 && (hpState.ENEMY_LEFT ?? 0) <= 0 && (hpState.ENEMY_RIGHT ?? 0) <= 0)) {
      break
    }

    // 首领进入狂暴播报（仅触发一次）
    if (round >= enrageStartRound && !isEnraged) {
      isEnraged = true
      events.push({
        round,
        type: 'BOSS_ENRAGE',
        actorSlot: 'ENEMY_MAIN',
        segments: [
          { type: 'tag', text: '首领狂暴', tone: 'red' },
          { type: 'text', text: \` \${enemyMain.name}久战不克，走火入魔陷入【狂暴】！周身杀气逆冲，招式威力暴涨且无法闪避！\` },
        ],
      })
    }`

content = content.replace(oldServerLoop, newServerLoop)

// 3. Update dodge & damage in simulateServerBattle
const oldDodge = `    // 轻功闪避判定
    const rollDodge = (round * 29 + player.stats.agi) % 100
    if (rollDodge < Math.min(42, pDerived.dodge)) {`

const newDodge = `    // 狂暴增伤系数（每回合递增 +35% 复合增伤）
    const enrageAtkMult = isEnraged ? Math.pow(1.35, round - enrageStartRound + 1) : 1.0
    const currentEnemyAtk = Math.round(enemyMain.atk * enrageAtkMult)
    const isWipeoutRound = round >= maxRounds

    // 轻功闪避判定（狂暴后杀气锁定，无法闪避）
    const rollDodge = (round * 29 + player.stats.agi) % 100
    if (!isEnraged && rollDodge < Math.min(42, pDerived.dodge)) {`

content = content.replace(oldDodge, newDodge)

// 4. Update rawEnemyDmg in simulateServerBattle
const oldRawDmg = `    const rawEnemyDmg = incomingDamage(enemyMain.atk, stanceMultEnemy, pDerived.def, player.level)`
const newRawDmg = `    let rawEnemyDmg = incomingDamage(currentEnemyAtk, stanceMultEnemy, pDerived.def, player.level)
    if (isWipeoutRound) {
      rawEnemyDmg = Math.max(99999, rawEnemyDmg * 15) // 狂暴终结回合灭顶绝杀
    }`

content = content.replace(oldRawDmg, newRawDmg)

// 5. Update winner check in simulateServerBattle
const oldWinner = `  const enemyDead = hpState.ENEMY_MAIN <= 0 && (hpState.ENEMY_LEFT ?? 0) <= 0 && (hpState.ENEMY_RIGHT ?? 0) <= 0
  const winner: 'ALLY' | 'ENEMY' = enemyDead || hpState.ALLY_MAIN > hpState.ENEMY_MAIN ? 'ALLY' : 'ENEMY'`

const newWinner = `  const enemyDead = hpState.ENEMY_MAIN <= 0 && (hpState.ENEMY_LEFT ?? 0) <= 0 && (hpState.ENEMY_RIGHT ?? 0) <= 0
  const winner: 'ALLY' | 'ENEMY' = enemyDead ? 'ALLY' : 'ENEMY'`

content = content.replace(oldWinner, newWinner)

// 6. Update simulateShaoshiRaid
const oldRaidLoop = `  for (let round = 1; round <= 12; round++) {`
const newRaidLoop = `  const raidEnrageStart = 22
  const raidMaxRounds = 26
  let raidEnraged = false

  for (let round = 1; round <= raidMaxRounds; round++) {
    if (round >= raidEnrageStart && !raidEnraged) {
      raidEnraged = true
      events.push({
        round,
        type: 'BOSS_ENRAGE',
        actorSlot: 'ENEMY_MAIN',
        segments: [
          { type: 'tag', text: '首领狂暴', tone: 'red' },
          { type: 'text', text: ' 三位神僧久战不下，金刚伏魔圈血煞翻涌进入【狂暴】！禅杖黑索无坚不摧！' },
        ],
      })
    }`

content = content.replace(oldRaidLoop, newRaidLoop)

const oldRaidDodge = `      const dodged = (round * 29 + index * 13 + target.player.stats.agi) % 100 < Math.min(42, target.stats.dodge)`
const newRaidDodge = `      const raidAtkMult = raidEnraged ? Math.pow(1.35, round - raidEnrageStart + 1) : 1.0
      const dodged = !raidEnraged && (round * 29 + index * 13 + target.player.stats.agi) % 100 < Math.min(42, target.stats.dodge)`

content = content.replace(oldRaidDodge, newRaidDodge)

const oldRaidDmg = `        const damage = incomingDamage(enemy.atk, multiplier, target.stats.def, target.player.level)`
const newRaidDmg = `        let damage = incomingDamage(Math.round(enemy.atk * raidAtkMult), multiplier, target.stats.def, target.player.level)
        if (round >= raidMaxRounds) damage = Math.max(99999, damage * 15)`

content = content.replace(oldRaidDmg, newRaidDmg)

fs.writeFileSync('./shared/battle.ts', content, 'utf8')
console.log('Successfully patched shared/battle.ts with Enrage mechanism!')
