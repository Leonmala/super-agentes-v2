// Contador de tempo e tokens por chamada LLM
// Permite medir cada etapa separadamente (PSICO vs Herói)

export interface MetricasChamada {
  persona: string
  tempo_ms: number
  tokens_input: number
  tokens_output: number
  tokens_total: number
  modelo: string
}

export interface MetricasRequest {
  aluno_id: string
  tempo_total_ms: number
  chamadas: MetricasChamada[]
  tokens_total_request: number
  houve_cascata: boolean
}

/**
 * Calcula o resumo das métricas de um request completo
 */
export function calcularMetricasRequest(
  alunoId: string,
  inicioRequest: number,
  chamadas: MetricasChamada[],
  houveCascata: boolean
): MetricasRequest {
  return {
    aluno_id: alunoId,
    tempo_total_ms: Date.now() - inicioRequest,
    chamadas,
    tokens_total_request: chamadas.reduce((acc, c) => acc + c.tokens_total, 0),
    houve_cascata: houveCascata
  }
}

/**
 * Formata métricas para log legível no console
 */
export function logMetricas(metricas: MetricasRequest): void {
  console.log(`\n📊 MÉTRICAS DO REQUEST [${metricas.aluno_id}]`)
  console.log(`   Tempo total: ${metricas.tempo_total_ms}ms`)
  console.log(`   Cascata: ${metricas.houve_cascata ? 'SIM (PSICO → Herói)' : 'NÃO (chamada direta)'}`)
  console.log(`   Tokens totais: ${metricas.tokens_total_request}`)

  for (const chamada of metricas.chamadas) {
    console.log(`\n   ── ${chamada.persona} (${chamada.modelo}) ──`)
    console.log(`      Tempo: ${chamada.tempo_ms}ms`)
    console.log(`      Tokens entrada: ${chamada.tokens_input}`)
    console.log(`      Tokens saída:   ${chamada.tokens_output}`)
    console.log(`      Tokens total:   ${chamada.tokens_total}`)
  }

  if (metricas.chamadas.length > 1) {
    const [psico, heroi] = metricas.chamadas
    const pct_psico = Math.round((psico.tempo_ms / metricas.tempo_total_ms) * 100)
    const pct_heroi = Math.round((heroi.tempo_ms / metricas.tempo_total_ms) * 100)
    console.log(`\n   Distribuição de tempo:`)
    console.log(`      ${psico.persona}: ${psico.tempo_ms}ms (${pct_psico}%)`)
    console.log(`      ${heroi.persona}: ${heroi.tempo_ms}ms (${pct_heroi}%)`)
  }
  console.log(``)
}
