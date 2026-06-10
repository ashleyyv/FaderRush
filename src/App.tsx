import { useState } from 'react'
import level1Json from './engine/level1.json'
import level2Json from './engine/level2.json'
import level3Json from './engine/level3.json'
import type { LevelConfig } from './engine/types'
import { Menu } from './components/Menu'
import { Level1 } from './components/Level1'

const LEVEL_CONFIGS: Record<string, LevelConfig> = {
  level_1: level1Json as unknown as LevelConfig,
  level_2: level2Json as unknown as LevelConfig,
  level_3: level3Json as unknown as LevelConfig,
}

function App() {
  const [activeLevel, setActiveLevel] = useState<string | null>(null)

  if (activeLevel !== null) {
    return (
      <Level1
        levelConfig={LEVEL_CONFIGS[activeLevel]}
        onBack={() => setActiveLevel(null)}
      />
    )
  }

  return <Menu onSelect={setActiveLevel} />
}

export default App
