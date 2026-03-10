-- Schema Super Agentes - Teste 6
-- Prefixo t6_ em todas as tabelas para isolamento no Supabase compartilhado
-- Execute este arquivo no SQL Editor do Supabase

-- ============================================================
-- MIGRAÇÃO: Adicionar colunas para transição de personas
-- ============================================================

-- Adicionar coluna para instruções do PSICOPEDAGOGICO para o herói
ALTER TABLE t6_sessoes
ADD COLUMN IF NOT EXISTS instrucoes_pendentes TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS agente_destino TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS transicao_pendente BOOLEAN DEFAULT FALSE;

-- ============================================================
-- TABELAS (criação inicial - mantido para novos setups)
-- ============================================================

CREATE TABLE IF NOT EXISTS t6_alunos (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  serie TEXT NOT NULL,
  idade INTEGER,
  perfil TEXT,           -- texto livre: "visual, prático, gosta de futebol"
  dificuldades TEXT,     -- texto livre: "frações, pontuação"
  interesses TEXT,       -- texto livre: "futebol, videogames, dinossauros"
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Sessões — equivalente ao estado.json dos testes anteriores
CREATE TABLE IF NOT EXISTS t6_sessoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aluno_id TEXT NOT NULL REFERENCES t6_alunos(id),
  turno_atual INTEGER DEFAULT 0,
  agente_atual TEXT DEFAULT 'PSICOPEDAGOGICO',
  tema_atual TEXT,
  plano_ativo TEXT,          -- texto livre, UPSERT quando PSICO qualifica
  historico_resumido TEXT,
  status TEXT DEFAULT 'ativa',  -- ativa | pausada | encerrada
  -- NOVAS COLUNAS para transição de personas
  instrucoes_pendentes TEXT DEFAULT NULL,  -- instruções do PSICO para o herói
  agente_destino TEXT DEFAULT NULL,        -- herói escolhido pelo PSICO
  transicao_pendente BOOLEAN DEFAULT FALSE, -- flag de transição em andamento
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Turnos — equivalente ao HISTORICO_TESTE.md dos testes anteriores
CREATE TABLE IF NOT EXISTS t6_turnos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sessao_id UUID NOT NULL REFERENCES t6_sessoes(id),
  numero INTEGER NOT NULL,
  agente TEXT NOT NULL,
  entrada TEXT NOT NULL,
  resposta TEXT NOT NULL,
  status TEXT NOT NULL,      -- CONTINUIDADE | TROCA_TEMA | ENCAMINHADO_PSICO | PAUSA
  plano TEXT,                -- preenchido quando agente = PSICOPEDAGOGICO
  observacao TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- ÍNDICES
-- ============================================================

CREATE INDEX IF NOT EXISTS t6_idx_sessoes_aluno  ON t6_sessoes(aluno_id);
CREATE INDEX IF NOT EXISTS t6_idx_sessoes_status ON t6_sessoes(status);
CREATE INDEX IF NOT EXISTS t6_idx_turnos_sessao  ON t6_turnos(sessao_id);
CREATE INDEX IF NOT EXISTS t6_idx_turnos_numero  ON t6_turnos(sessao_id, numero);

-- ============================================================
-- TRIGGER updated_at
-- ============================================================

-- Função genérica — cria apenas se não existir com esse nome
CREATE OR REPLACE FUNCTION t6_update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS t6_update_sessoes_updated_at ON t6_sessoes;
CREATE TRIGGER t6_update_sessoes_updated_at
  BEFORE UPDATE ON t6_sessoes
  FOR EACH ROW
  EXECUTE FUNCTION t6_update_updated_at_column();

-- ============================================================
-- DADOS DE TESTE
-- ============================================================

INSERT INTO t6_alunos (id, nome, serie, idade, perfil, dificuldades, interesses)
VALUES (
  'TESTE001',
  'João',
  '3º ano',
  9,
  'Visual e prático. Prefere exemplos concretos. Atenção curta. Responde bem a desafios gamificados.',
  'Frações (matemática), pontuação (português)',
  'Futebol, videogames, dinossauros'
)
ON CONFLICT (id) DO UPDATE SET
  nome         = EXCLUDED.nome,
  serie        = EXCLUDED.serie,
  idade        = EXCLUDED.idade,
  perfil       = EXCLUDED.perfil,
  dificuldades = EXCLUDED.dificuldades,
  interesses   = EXCLUDED.interesses;

-- ============================================================
-- CONSULTAS ÚTEIS PARA ACOMPANHAR O TESTE
-- ============================================================

-- Ver sessão do aluno de teste:
-- SELECT * FROM t6_sessoes WHERE aluno_id = 'TESTE001';

-- Ver turnos em ordem cronológica:
-- SELECT numero, agente, status, entrada, LEFT(resposta, 80) FROM t6_turnos
-- WHERE sessao_id = '<uuid>'
-- ORDER BY numero;

-- Contagem de turnos por agente:
-- SELECT agente, COUNT(*) FROM t6_turnos
-- WHERE sessao_id = '<uuid>'
-- GROUP BY agente;

-- ============================================================
-- LIMPEZA (rodar para resetar o teste do zero)
-- ============================================================

-- TRUNCATE t6_turnos, t6_sessoes RESTART IDENTITY CASCADE;
