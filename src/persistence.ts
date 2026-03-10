// Persistência no Supabase — pós-resposta
// Todas as tabelas usam prefixo t6_ para isolamento no Supabase compartilhado

import { supabase } from './supabase.js'
import type { Sessao, Turno } from './supabase.js'

export async function persistirTurno(
  sessaoId: string,
  numero: number,
  agente: string,
  entrada: string,
  resposta: string,
  status: Turno['status'],
  plano: string | null
): Promise<void> {
  const { error } = await supabase.from('t6_turnos').insert({
    sessao_id: sessaoId,
    numero,
    agente,
    entrada,
    resposta,
    status,
    plano
  })

  if (error) {
    console.error('Erro ao persistir turno:', error)
    throw new Error(`Falha ao persistir turno: ${error.message}`)
  }
}

export async function atualizarSessao(
  sessaoId: string,
  updates: {
    turno_atual?: number
    agente_atual?: string
    tema_atual?: string | null
    plano_ativo?: string | null
    status?: Sessao['status']
    // Novos campos para transição
    instrucoes_pendentes?: string | null
    agente_destino?: string | null
    transicao_pendente?: boolean
  }
): Promise<void> {
  const { error } = await supabase
    .from('t6_sessoes')
    .update({
      ...updates,
      updated_at: new Date().toISOString()
    })
    .eq('id', sessaoId)

  if (error) {
    console.error('Erro ao atualizar sessão:', error)
    throw new Error(`Falha ao atualizar sessão: ${error.message}`)
  }
}

export async function buscarOuCriarSessao(alunoId: string): Promise<Sessao> {
  // Buscar sessão ativa existente
  const { data: sessoes, error: erroBusca } = await supabase
    .from('t6_sessoes')
    .select('*')
    .eq('aluno_id', alunoId)
    .eq('status', 'ativa')
    .order('created_at', { ascending: false })
    .limit(1)

  if (erroBusca) {
    throw new Error(`Erro ao buscar sessão: ${erroBusca.message}`)
  }

  if (sessoes && sessoes.length > 0) {
    return sessoes[0] as Sessao
  }

  // Criar nova sessão
  const { data: novaSessao, error: erroCriacao } = await supabase
    .from('t6_sessoes')
    .insert({
      aluno_id: alunoId,
      turno_atual: 0,
      agente_atual: 'PSICOPEDAGOGICO',
      status: 'ativa',
      transicao_pendente: false
    })
    .select()
    .single()

  if (erroCriacao || !novaSessao) {
    throw new Error(`Erro ao criar sessão: ${erroCriacao?.message || 'unknown'}`)
  }

  return novaSessao as Sessao
}

export async function buscarAluno(alunoId: string) {
  const { data, error } = await supabase
    .from('t6_alunos')
    .select('*')
    .eq('id', alunoId)
    .single()

  if (error) {
    throw new Error(`Erro ao buscar aluno: ${error.message}`)
  }

  return data
}

export async function buscarUltimosTurnos(sessaoId: string, limite: number = 3): Promise<Turno[]> {
  const { data, error } = await supabase
    .from('t6_turnos')
    .select('*')
    .eq('sessao_id', sessaoId)
    .order('numero', { ascending: false })
    .limit(limite)

  if (error) {
    throw new Error(`Erro ao buscar turnos: ${error.message}`)
  }

  return (data || []) as Turno[]
}

// ============================================================
// FUNÇÕES DE TRANSIÇÃO DE PERSONAS
// ============================================================

/**
 * Salva instruções do PSICOPEDAGOGICO para o próximo herói
 * Usado quando PSICO decide ENCAMINHAR_PARA_HEROI
 */
export async function salvarTransicaoPendente(
  sessaoId: string,
  agenteDestino: string,
  instrucoes: string,
  plano?: string
): Promise<void> {
  const { error } = await supabase
    .from('t6_sessoes')
    .update({
      agente_destino: agenteDestino,
      instrucoes_pendentes: instrucoes,
      transicao_pendente: true,
      plano_ativo: plano || null,
      updated_at: new Date().toISOString()
    })
    .eq('id', sessaoId)

  if (error) {
    console.error('Erro ao salvar transição:', error)
    throw new Error(`Falha ao salvar transição: ${error.message}`)
  }

  console.log(`[Transição] Salva: ${agenteDestino} aguardando ativação`)
}

/**
 * Limpa dados de transição após o herói responder
 */
export async function limparTransicaoPendente(sessaoId: string): Promise<void> {
  const { error } = await supabase
    .from('t6_sessoes')
    .update({
      agente_destino: null,
      instrucoes_pendentes: null,
      transicao_pendente: false,
      updated_at: new Date().toISOString()
    })
    .eq('id', sessaoId)

  if (error) {
    console.error('Erro ao limpar transição:', error)
    throw new Error(`Falha ao limpar transição: ${error.message}`)
  }
}

/**
 * Verifica se há uma transição pendente e retorna o herói escolhido
 */
export function verificarTransicaoPendente(sessao: Sessao): {
  temTransicao: boolean
  agenteDestino: string | null
  instrucoes: string | null
} {
  if (sessao.transicao_pendente && sessao.agente_destino) {
    return {
      temTransicao: true,
      agenteDestino: sessao.agente_destino,
      instrucoes: sessao.instrucoes_pendentes
    }
  }

  return {
    temTransicao: false,
    agenteDestino: null,
    instrucoes: null
  }
}

/**
 * Busca histórico completo do aluno (todas as sessões)
 * Usado para verificar se já foi atendido por uma persona específica
 */
export async function verificarHistoricoAluno(
  alunoId: string,
  agente: string
): Promise<boolean> {
  // Busca por sessões do aluno para filtrar apenas seus turnos
  const { data: sessoes } = await supabase
    .from('t6_sessoes')
    .select('id')
    .eq('aluno_id', alunoId)

  if (!sessoes || sessoes.length === 0) return false

  const sessaoIds = sessoes.map(s => s.id)

  const { data, error } = await supabase
    .from('t6_turnos')
    .select('id')
    .eq('agente', agente)
    .in('sessao_id', sessaoIds)
    .limit(1)

  if (error) {
    console.error('Erro ao verificar histórico:', error)
    return false
  }

  return (data?.length ?? 0) > 0
}
