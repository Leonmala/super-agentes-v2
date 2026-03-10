import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_KEY!

if (!supabaseUrl || !supabaseKey) {
  throw new Error('SUPABASE_URL e SUPABASE_KEY são obrigatórios')
}

export const supabase = createClient(supabaseUrl, supabaseKey)

// Tipos
export interface Aluno {
  id: string
  nome: string
  serie: string
  idade: number | null
  perfil: string | null
  dificuldades: string | null
  interesses: string | null
  created_at: string
}

export interface Sessao {
  id: string
  aluno_id: string
  turno_atual: number
  agente_atual: string
  tema_atual: string | null
  plano_ativo: string | null
  historico_resumido: string | null
  status: 'ativa' | 'pausada' | 'encerrada'
  // Novas colunas para transição de personas
  instrucoes_pendentes: string | null
  agente_destino: string | null
  transicao_pendente: boolean
  created_at: string
  updated_at: string
}

export interface Turno {
  id: string
  sessao_id: string
  numero: number
  agente: string
  entrada: string
  resposta: string
  status: 'CONTINUIDADE' | 'TROCA_TEMA' | 'ENCAMINHADO_PSICO' | 'PAUSA'
  plano: string | null
  observacao: string | null
  created_at: string
}
