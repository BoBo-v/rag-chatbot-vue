import type { DemoScenarioDefinition, DemoScenarioId } from './types'
import { viteProxyScenario } from './scenarios/vite-proxy-404/scenario'
import { blankScreenScenario } from './scenarios/production-blank-screen/scenario'

const scenarioRegistry: Record<DemoScenarioId, DemoScenarioDefinition> = {
  'vite-proxy-404': viteProxyScenario,
  'production-blank-screen': blankScreenScenario,
}

export const allDemoScenarios: DemoScenarioDefinition[] = [
  viteProxyScenario,
  blankScreenScenario,
]

export function getDemoScenario(id: DemoScenarioId): DemoScenarioDefinition {
  const scenario = scenarioRegistry[id]
  if (!scenario) {
    return viteProxyScenario
  }
  return scenario
}
