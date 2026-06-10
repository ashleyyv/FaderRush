import { useMemo } from 'react'
import styles from './Menu.module.css'

type Skill      = 'Phrasing' | 'Volume' | 'EQ'
type Difficulty = 'Beginner' | 'Intermediate'

interface LevelMeta {
  id: string
  number: number
  name: string
  skill: Skill
  difficulty: Difficulty
  unlockRequiredId?: string
  unlockThreshold: number
}

const LEVELS: LevelMeta[] = [
  {
    id: 'level_1', number: 1, name: 'The Drop',
    skill: 'Phrasing', difficulty: 'Beginner',
    unlockThreshold: 0,
  },
  {
    id: 'level_2', number: 2, name: 'The Blend',
    skill: 'Volume', difficulty: 'Intermediate',
    unlockRequiredId: 'level_1', unlockThreshold: 70,
  },
  {
    id: 'level_3', number: 3, name: 'The Swap',
    skill: 'EQ', difficulty: 'Intermediate',
    unlockRequiredId: 'level_2', unlockThreshold: 70,
  },
]

const SKILL_CLASS: Record<Skill, string> = {
  Phrasing: styles.skillPhrasing,
  Volume:   styles.skillVolume,
  EQ:       styles.skillEq,
}

interface MenuProps {
  onSelect: (levelId: string) => void
}

export function Menu({ onSelect }: MenuProps) {
  const scores = useMemo<Record<string, number>>(() => {
    const map: Record<string, number> = {}
    for (const level of LEVELS) {
      map[level.id] = parseFloat(localStorage.getItem(`faderrush_best_${level.id}`) ?? '0')
    }
    return map
  }, [])

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>FaderRush</h1>
        <p className={styles.subtitle}>Numark FLX4</p>
      </header>

      <div className={styles.cardGrid}>
        {LEVELS.map(level => {
          const best     = scores[level.id] ?? 0
          const unlocked = level.unlockRequiredId
            ? (scores[level.unlockRequiredId] ?? 0) >= level.unlockThreshold
            : true
          const prevLevel = LEVELS.find(l => l.id === level.unlockRequiredId)

          return (
            <button
              key={level.id}
              className={`${styles.card} ${unlocked ? styles.cardUnlocked : styles.cardLocked}`}
              onClick={() => { if (unlocked) onSelect(level.id) }}
              disabled={!unlocked}
            >
              <div className={styles.cardNum}>0{level.number}</div>
              <div className={styles.cardName}>{level.name}</div>

              <div className={styles.cardMeta}>
                <span className={`${styles.skillBadge} ${SKILL_CLASS[level.skill]}`}>
                  {level.skill}
                </span>
                <span className={styles.diffBadge}>{level.difficulty}</span>
              </div>

              <div className={styles.cardScore}>
                {unlocked ? (
                  best > 0 ? (
                    <>
                      <span className={styles.scoreLabel}>Best</span>
                      <span className={`${styles.scoreVal} ${best >= 70 ? styles.scoreGreen : styles.scoreAmber}`}>
                        {Math.round(best)}
                      </span>
                    </>
                  ) : (
                    <span className={styles.scoreNew}>New</span>
                  )
                ) : (
                  <span className={styles.lockMsg}>
                    Score {level.unlockThreshold}+ on {prevLevel?.name}
                  </span>
                )}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
