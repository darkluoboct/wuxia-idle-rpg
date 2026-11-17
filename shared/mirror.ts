import { companionView, COMPANIONS, ITEMS, type CompanionView } from './gameData.ts'
import { createStarterCharacter } from './player.ts'
import type { CompanionState, LoadoutPresetDTO, PlayerDTO } from './protocol.ts'

type CollectionBonus = { hpPct?: number; atkPct?: number; idleQiPct?: number }

/** 镜像的出处：当下的角色、配装、武学、羁绊加成与侠客状态 */
export interface MirrorSource {
  player: PlayerDTO
  loadout: LoadoutPresetDTO
  learnedSkills: Readonly<Record<string, number>>
  bonus: CollectionBonus
  companionAffinity: Readonly<Record<string, CompanionState | undefined>>
  companionOf: (id: string) => CompanionView | undefined
}

/**
 * 防守镜像（华山论剑、门派演武、藏经阁值守、襄阳值守共用）：冻结当下的境界、属性、配装与同行侠客，
 * 不带丹药与背包，之后由 mirrorFighter 还原成出战者。
 */
export function defenseMirror({ player, loadout, learnedSkills, bonus, companionAffinity, companionOf }: MirrorSource) {
  const companionIds = [loadout.leftCompanionId, loadout.rightCompanionId].flatMap((id) => id && companionOf(id) ? [id] : [])
  const companionStates = Object.fromEntries(companionIds.map((id) => [id, companionAffinity[id]]))
  const { id, nickname, avatarId, level, realmTier, stats, currentSectId, sectRank, gaibangBranch,
    graduatedSectIds, betrayedSectIds, bonusHpPct, bonusMp, storySnakeChoice, equipmentAffixes, equipmentForge, trial, chapterOneChampion, openedAcupointIds, qiDeviationUntil } = player
  const frozenPlayer = {
    ...createStarterCharacter({ id, nickname, avatarId }, 0).player,
    level, realmTier, stats, currentSectId, sectRank, gaibangBranch, graduatedSectIds, betrayedSectIds, bonusHpPct, bonusMp, storySnakeChoice, equipmentAffixes, chapterOneChampion,
    openedAcupointIds, qiDeviationUntil,
    equipmentForge: equipmentForge && { iron: 0, stones: 0, items: equipmentForge.items },
    trial: { ...trial, recentDrops: [] },
  }
  const identity = { id, nickname, avatarId, sectId: currentSectId, stance: loadout.stance,
    weaponName: loadout.weaponId ? ITEMS[loadout.weaponId]?.name : undefined, companions: companionIds.map((id) => COMPANIONS[id].name) }
  return { fighter: { player: frozenPlayer, loadout, learnedSkills, bonus }, companionStates, identity }
}

export type DefenseMirror = ReturnType<typeof defenseMirror>

export function mirrorFighter({ fighter, companionStates }: DefenseMirror) {
  return {
    ...fighter,
    companionOf: (id: string) => {
      const state = companionStates[id]
      return state?.recruited && COMPANIONS[id] ? companionView(COMPANIONS[id], state) : undefined
    },
  }
}
