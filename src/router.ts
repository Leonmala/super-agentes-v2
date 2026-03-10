// Roteamento de personas — tradução do GESTOR.md para código
// V2_FAST: Adicionado Router Inteligente com classificador LLM

import type { Sessao, Turno } from './supabase.js'
import { GoogleGenerativeAI } from '@google/generative-ai'

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY!
const genAI = new GoogleGenerativeAI(GOOGLE_API_KEY || '')

// Palavras-chave intencionalmente conservadoras:
// removido 'mais' e 'menos' — são palavras genéricas demais e causam falsos positivos
// ex: "me ajudou demais" → detectaria matemática incorretamente
const KEYWORDS_MATEMATICA = [
  'matemática', 'matematica', 'conta', 'contas',
  'fração', 'fracao', 'fracoes', 'frações',
  'número', 'numero', 'números', 'numeros',
  'somar', 'soma', 'dividir', 'divisão', 'divisao',
  'multiplicar', 'multiplicação', 'multiplicacao',
  'vezes', 'subtração', 'subtracao', 'adição', 'adicao',
  'calculo', 'cálculo', 'equação', 'equacao',
  'porcentagem', 'porcentagem', 'geometria', 'tabuada',
  // NOVO: Detectores de frações e operações
  '/2', '/3', '/4', '/5', '/6', '/8', '/10',
  '1/2', '1/3', '1/4', '1/5', '1/6', '1/8',
  '2/3', '3/4', '2/5', '3/5', '4/5',
  'metade', 'terço', 'terco', 'quarto',
  '+', '-', '=', 'x ', ' vezes ', ' mais ', ' menos ',
  'soma', 'subtrai', 'divide', 'multiplica'
]

const KEYWORDS_PORTUGUES = [
  'português', 'portugues', 'redação', 'redacao',
  'texto', 'gramática', 'gramatica',
  'sílaba', 'silaba', 'sílabas', 'silabas',
  'vírgula', 'virgula', 'leitura', 'escrita',
  'ortografia', 'pontuação', 'pontuacao',
  'crase', 'concordância', 'concordancia',
  'regencia', 'regência',
  'interpretação', 'interpretacao',
  'parágrafo', 'paragrafo',
  'acentuação', 'acentuacao',
  'verbo', 'substantivo', 'adjetivo', 'pronome'
]

// Palavras que indicam continuidade (não precisa de PSICO)
const KEYWORDS_CONTINUIDADE = [
  'não entendi', 'nao entendi',
  'pode explicar de novo', 'explica de novo',
  'não ficou claro', 'nao ficou claro',
  'de outro jeito', 'outra forma',
  'não compreendi', 'nao compreendi',
  'repita', 'de novo'
]

export function detectarTema(mensagem: string): string | null {
  const msg = mensagem.toLowerCase()

  if (KEYWORDS_MATEMATICA.some(k => msg.includes(k))) return 'matematica'
  if (KEYWORDS_PORTUGUES.some(k => msg.includes(k))) return 'portugues'

  return null
}

export function detectarContinuidade(mensagem: string): boolean {
  const msg = mensagem.toLowerCase()
  return KEYWORDS_CONTINUIDADE.some(k => msg.includes(k))
}

// NOVO: Classificador inteligente usando LLM (v2_fast)
// Usa Gemini Flash com temperature 0 para decisão rápida (< 1s)
export async function classificarTemaInteligente(mensagem: string): Promise<{
  categoria: 'matematica' | 'portugues' | 'continuidade' | 'ambiguo';
  confianca: number;
}> {
  // Se não tem API key, retorna ambiguo
  if (!GOOGLE_API_KEY) {
    return { categoria: 'ambiguo', confianca: 0 };
  }

  const prompt = `Analise a mensagem do aluno e classifique em UMA categoria:

CATEGORIAS:
- "matematica" - números, contas, frações, geometria, operações matemáticas
- "portugues" - gramática, crase, pontuação, redação, ortografia
- "continuidade" - pedido para repetir, explicar de novo, não entendeu explicação anterior
- "ambiguo" - não dá para saber o tema ou é conversa casual

Responda APENAS com o formato: CATEGORIA|CONFIANCA
Exemplo: matematica|95

Mensagem: "${mensagem}"
Categoria:`;

  try {
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: {
        temperature: 0,
        maxOutputTokens: 20,
      }
    });

    const result = await model.generateContent(prompt);
    const resposta = result.response.text().trim();

    // Parse resposta: categoria|confianca
    const [categoriaStr, confiancaStr] = resposta.split('|');
    const categoria = categoriaStr?.toLowerCase().trim() as 'matematica' | 'portugues' | 'continuidade' | 'ambiguo';
    const confianca = parseInt(confiancaStr) || 50;

    // Validar categoria
    if (['matematica', 'portugues', 'continuidade', 'ambiguo'].includes(categoria)) {
      return { categoria, confianca };
    }

    return { categoria: 'ambiguo', confianca: 0 };
  } catch (error) {
    console.error('[Router Inteligente] Erro ao classificar:', error);
    return { categoria: 'ambiguo', confianca: 0 };
  }
}

export function personaPorTema(tema: string): string {
  const mapa: Record<string, string> = {
    'matematica': 'CALCULUS',
    'portugues': 'VERBETA'
  }
  return mapa[tema] || 'PSICOPEDAGOGICO'
}

export function decidirPersona(
  mensagem: string,
  sessao: Sessao,
  ultimosTurnos: Turno[]
): string {
  const temaDetectado = detectarTema(mensagem)

  // Sem tema claro → verificar se já está numa conversa ativa com um herói
  if (!temaDetectado) {
    // Se já está com um herói ativo, manter o herói (continuidade)
    if (sessao.agente_atual !== 'PSICOPEDAGOGICO' && sessao.tema_atual) {
      return sessao.agente_atual
    }
    // Sem contexto → PSICOPEDAGOGICO qualifica
    return 'PSICOPEDAGOGICO'
  }

  // Troca de matéria → verificar histórico recente
  if (temaDetectado !== sessao.tema_atual) {
    const personaAlvo = personaPorTema(temaDetectado)
    const jaAtendido = ultimosTurnos.some(t => t.agente === personaAlvo)

    // Primeira vez nessa matéria → PSICOPEDAGOGICO qualifica
    if (!jaAtendido) return 'PSICOPEDAGOGICO'
  }

  // Matéria clara e já atendida (ou continuidade) → persona direta
  return personaPorTema(temaDetectado)
}

export function determinarStatus(
  mensagem: string,
  persona: string,
  sessao: Sessao
): Turno['status'] {
  const msg = mensagem.toLowerCase()
  const temaDetectado = detectarTema(mensagem)

  // Detectar pausa/intenção de sair
  const KEYWORDS_PAUSA = [
    'sair', 'tenho que ir', 'minha mãe', 'minha mae',
    'até mais', 'ate mais', 'tchau', 'até logo', 'ate logo',
    'depois', 'preciso ir', 'vou sair'
  ]
  if (KEYWORDS_PAUSA.some(k => msg.includes(k))) {
    return 'PAUSA'
  }

  // Troca de tema detectada
  if (temaDetectado && temaDetectado !== sessao.tema_atual) {
    return 'TROCA_TEMA'
  }

  // Continuidade normal
  return 'CONTINUIDADE'
}
