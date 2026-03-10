// Montagem de contexto para o LLM

import type { Aluno, Sessao, Turno } from './supabase.js'

export function montarContexto(
  sessao: Sessao,
  aluno: Aluno,
  ultimosTurnos: Turno[]
): string {
  const partes: string[] = []

  // Dados do aluno
  partes.push(`ALUNO: ${aluno.nome}, ${aluno.idade || '?'} anos, ${aluno.serie}`)

  if (aluno.perfil) {
    partes.push(`PERFIL: ${aluno.perfil}`)
  }

  if (aluno.dificuldades) {
    partes.push(`DIFICULDADES CONHECIDAS: ${aluno.dificuldades}`)
  }

  if (aluno.interesses) {
    partes.push(`INTERESSES: ${aluno.interesses}`)
  }

  // Estado atual
  partes.push(`TURNO ATUAL: ${sessao.turno_atual + 1}`)
  partes.push(`AGENTE ANTERIOR: ${sessao.agente_atual}`)
  if (sessao.tema_atual) {
    partes.push(`TEMA ATUAL: ${sessao.tema_atual}`)
  }

  // Plano ativo (se existir) - importante para heróis receberem instruções
  if (sessao.plano_ativo) {
    partes.push(`PLANO ATIVO: ${sessao.plano_ativo}`)
    partes.push(`INSTRUÇÃO: Siga o plano acima fielmente.`)
  } else {
    partes.push(`PLANO ATIVO: Nenhum — qualificar primeiro`)
  }

  // Histórico resumido (se existir)
  if (sessao.historico_resumido) {
    partes.push(`RESUMO DA SESSÃO: ${sessao.historico_resumido}`)
  }

  // Últimos turnos
  if (ultimosTurnos.length > 0) {
    partes.push('')
    partes.push('HISTÓRICO RECENTE:')

    // Ordenar do mais antigo para o mais recente
    const ordenados = [...ultimosTurnos].sort((a, b) => a.numero - b.numero)

    for (const turno of ordenados) {
      const resumoResposta = turno.resposta.length > 250
        ? turno.resposta.substring(0, 250) + '...'
        : turno.resposta
      partes.push(`[${turno.numero}] ${turno.agente}: "${resumoResposta}"`)
    }
  }

  return partes.join('\n')
}
