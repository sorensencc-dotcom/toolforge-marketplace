import { getProvider } from '../../src/providers/index.js';

/**
 * @param {{packetId: string, specGoal: string, declaredScope: string[], testOutput: string, appliedDiff: string, historyLog: string[], model?: string}} packet
 * @param {{generate: (model: string, prompt: string) => Promise<string>}} [localProvider]
 * @returns {Promise<{consensus: boolean, blockerAnalysis: string, targetedFixRecipe: string}>}
 */
export async function runAdversarialCrossAudit(packet, localProvider = getProvider()) {
  const auditPrompt = `
You are an adversarial code referee operating under strict IJFW discipline.
The previous worker attempt failed the deterministic Iron Gate. You have an isolated, unpolluted context window.

### PACKET SPEC
ID: ${packet.packetId}
Goal: ${packet.specGoal}
Declared Scope: ${JSON.stringify(packet.declaredScope)}

### ATTEMPT DIFF
\`\`\`diff
${packet.appliedDiff}
\`\`\`

### FAILURE TRACE (IRON GATE)
\`\`\`
${packet.testOutput}
\`\`\`

### AGENT HISTORY LOG
${packet.historyLog.slice(-10).join('\n')}

### AUDIT RULES
1. Do not generate full code directly.
2. Formulate a root-cause breakdown of why the attempt failed the gate against the declared scope.
3. Emit a concise, step-by-step remediation recipe for the execution worker.
4. If the diff violates the declared scope or introduced cyclic regressions, set consensus to false.

Respond ONLY with valid JSON:
{
  "consensus": boolean,
  "blockerAnalysis": "string",
  "targetedFixRecipe": "string"
}`;

  const modelName = packet.model || process.env.AUDIT_MODEL || 'adversarial-auditor';
  const response = await localProvider.generate(modelName, auditPrompt);
  
  let parsed = null;
  if (typeof response === 'string') {
    const trimmed = response.trim();
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      const match = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
      if (match) {
        try {
          parsed = JSON.parse(match[1].trim());
        } catch {}
      }
    }
  }

  if (
    !parsed ||
    typeof parsed.consensus !== 'boolean' ||
    typeof parsed.blockerAnalysis !== 'string' ||
    typeof parsed.targetedFixRecipe !== 'string'
  ) {
    return {
      consensus: false,
      blockerAnalysis: 'Adversarial audit output was malformed or failed strict schema validation',
      targetedFixRecipe: 'Re-run audit with strict JSON schema enforcement',
    };
  }

  return {
    consensus: parsed.consensus,
    blockerAnalysis: parsed.blockerAnalysis,
    targetedFixRecipe: parsed.targetedFixRecipe,
  };
}
