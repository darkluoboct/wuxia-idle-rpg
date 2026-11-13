import { LIANG_SNAKE_GUARD } from './combatMeta.ts'
import type { SixStats, StorySnakeChoice } from './protocol.ts'
import type { StoryNodeConfig } from './storyData.ts'

const MIN_AGILITY = 20
const POISON_RESISTANCE = 20
const SNAKE_POISON_RESISTANCE = 50

const choices: Record<StorySnakeChoice, {
  key: StorySnakeChoice
  label: string
  requirementText: string
  reward: {
    tag: string
    tone: 'gold' | 'jade'
    text: string
    stats: Partial<Pick<SixStats, 'con' | 'karma'>>
    bonusHpPct?: number
    qiExp?: number
    silver?: number
  }
}> = {
  A: {
    key: 'A',
    label: '与郭靖分饮药蛇宝血',
    requirementText: `需身法 ≥ ${MIN_AGILITY}（永久气血上限 +15%，毒抗 +${POISON_RESISTANCE}%，白驼蛇毒抗性 +${SNAKE_POISON_RESISTANCE}%，根骨 +2，真气 +3,500）`,
    reward: {
      tag: '药蛇宝血', tone: 'gold', bonusHpPct: 15, stats: { con: 2 }, qiExp: 3500,
      text: `你抢在郭靖之前捏住蛇身，与他分饮宝血。气血上限永久提高，毒抗增加 ${POISON_RESISTANCE}%，对白驼蛇毒的抗性为 ${SNAKE_POISON_RESISTANCE}%。`,
    },
  },
  B: {
    key: 'B',
    label: '将宝蛇放归山林',
    requirementText: '侠义 +30，纹银 +2,500',
    reward: {
      tag: '仁心侠义', tone: 'jade', stats: { karma: 30 }, silver: 2500,
      text: '你拎起竹篓，将宝蛇放入后院草丛，又顺手取走药房桌上的银两。蛇影一闪而没，仿佛在向你致谢。',
    },
  },
}

export const STORY_SNAKE_ADVENTURE = {
  id: 'shedu_baoxue',
  chapterCode: '2-2',
  title: '药蛇宝血',
  location: '中都赵王府后院',
  description: '你潜入参仙老怪梁子翁的药房，竹篓中一条通体赤红的大腹宝蛇忽然昂首扑来。梁子翁已用名贵灵药喂养了它二十年。',
  poisonResistance: POISON_RESISTANCE,
  snakePoisonResistance: SNAKE_POISON_RESISTANCE,
  choices,
}

export function canChooseStorySnake(choice: StorySnakeChoice, agility: number) {
  return choice === 'B' || agility >= MIN_AGILITY
}

type StoryOpponent = Pick<StoryNodeConfig, 'code' | 'bossName' | 'bossTitle' | 'bossPortrait' | 'bossHp' | 'bossAtk' | 'bossStance' | 'bossCombat' | 'guards'>

export function storyEncounter(chapter: StoryOpponent, snakeChoice?: StorySnakeChoice, isBoss?: boolean) {
  const manor = chapter.code === STORY_SNAKE_ADVENTURE.chapterCode
  const combat = manor && snakeChoice === 'A'
    ? { ...chapter.bossCombat, openingReaction: LIANG_SNAKE_GUARD.combat.leaderOnDeath }
    : chapter.bossCombat
  const enemyGuards: StoryOpponent['guards'] = manor && !snakeChoice
    ? [...(chapter.guards ?? []), {
        ...LIANG_SNAKE_GUARD,
        hp: Math.round(chapter.bossHp * 0.12), atk: Math.round(chapter.bossAtk * 0.25),
        combat: { ...LIANG_SNAKE_GUARD.combat, frontAfterGuard: true },
      }]
    : chapter.guards
  return {
    enemyMain: {
      name: chapter.bossName, title: chapter.bossTitle, portrait: chapter.bossPortrait,
      hp: chapter.bossHp, atk: chapter.bossAtk, mp: chapter.bossHp * 0.45,
      stance: chapter.bossStance, combat, isBoss,
    },
    enemyGuards,
  }
}
