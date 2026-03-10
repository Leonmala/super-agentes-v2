// Simulação do router para diagnóstico de bugs
const KEYWORDS_MATEMATICA = ['matemática','matematica','conta','contas','fração','fracao','fracoes','frações','número','numero','números','numeros','somar','soma','dividir','divisão','divisao','multiplicar','multiplicação','multiplicacao','vezes','subtração','subtracao','adição','adicao','calculo','cálculo','equação','equacao','porcentagem','geometria','tabuada']
const KEYWORDS_PORTUGUES = ['português','portugues','redação','redacao','texto','gramática','gramatica','sílaba','silaba','sílabas','silabas','vírgula','virgula','leitura','escrita','ortografia','pontuação','pontuacao','crase','concordância','concordancia','regencia','regência','interpretação','interpretacao','parágrafo','paragrafo','acentuação','acentuacao','verbo','substantivo','adjetivo','pronome']

function detectarTema(msg) {
  const m = msg.toLowerCase()
  if (KEYWORDS_MATEMATICA.some(k => m.includes(k))) return 'matematica'
  if (KEYWORDS_PORTUGUES.some(k => m.includes(k))) return 'portugues'
  return null
}

function personaPorTema(tema) {
  return tema === 'matematica' ? 'CALCULUS' : tema === 'portugues' ? 'VERBETA' : 'PSICOPEDAGOGICO'
}

function decidirPersona(mensagem, sessao, ultimosTurnos) {
  const temaDetectado = detectarTema(mensagem)
  if (!temaDetectado) {
    if (sessao.agente_atual !== 'PSICOPEDAGOGICO' && sessao.tema_atual) return sessao.agente_atual
    return 'PSICOPEDAGOGICO'
  }
  if (temaDetectado !== sessao.tema_atual) {
    const personaAlvo = personaPorTema(temaDetectado)
    const jaAtendido = ultimosTurnos.some(t => t.agente === personaAlvo)
    if (!jaAtendido) return 'PSICOPEDAGOGICO'
  }
  return personaPorTema(temaDetectado)
}

// ── Cenário 1: Banco limpo ─────────────────────────────────────────
console.log('\n=== CENARIO 1: Banco limpo (sessao nova) ===')
let sessao = { agente_atual: 'PSICOPEDAGOGICO', tema_atual: null }
let turnos = []

const msgs = [
  'preciso ajuda com frações',
  'não entendi direito, pode explicar de novo?',
  'agora quero aprender sobre crase',
  'ah entendi! e como escrevo um terço?',
  'não entendi a regra do vai e volta, pode simplificar?'
]

msgs.forEach((msg, i) => {
  const ultimos = turnos.slice(-3)
  const persona = decidirPersona(msg, sessao, ultimos)
  const tema = detectarTema(msg)

  let agenteFinal = persona
  // simula: se PSICO → cascata → heroi
  if (persona === 'PSICOPEDAGOGICO') {
    const heroiCascata = personaPorTema(tema)
    agenteFinal = heroiCascata !== 'PSICOPEDAGOGICO' ? heroiCascata : 'PSICOPEDAGOGICO'
  }

  const cascata = persona === 'PSICOPEDAGOGICO'
  const flag = cascata ? '[CASCATA]' : '[DIRETO ]'

  console.log(`T${i+1} ${flag} persona=${persona.padEnd(17)} agenteFinal=${agenteFinal.padEnd(17)} tema_detectado=${(tema||'null').padEnd(10)} sessao.tema=${sessao.tema_atual||'null'}`)

  turnos.push({ agente: agenteFinal, numero: i+1 })
  sessao = { agente_atual: agenteFinal, tema_atual: tema || sessao.tema_atual }
})

// ── Cenário 2: Banco com resíduo de sessão anterior (CALCULUS) ─────
console.log('\n=== CENARIO 2: Sessao reaproveitada (tema_atual=matematica, agente=CALCULUS) ===')
sessao = { agente_atual: 'CALCULUS', tema_atual: 'matematica' }
turnos = [{ agente: 'CALCULUS', numero: 1 }, { agente: 'CALCULUS', numero: 2 }]

msgs.forEach((msg, i) => {
  const ultimos = turnos.slice(-3)
  const persona = decidirPersona(msg, sessao, ultimos)
  const tema = detectarTema(msg)
  let agenteFinal = persona
  if (persona === 'PSICOPEDAGOGICO') {
    const heroiCascata = personaPorTema(tema)
    agenteFinal = heroiCascata !== 'PSICOPEDAGOGICO' ? heroiCascata : 'PSICOPEDAGOGICO'
  }
  const cascata = persona === 'PSICOPEDAGOGICO'
  const flag = cascata ? '[CASCATA]' : '[DIRETO ]'
  console.log(`T${i+1} ${flag} persona=${persona.padEnd(17)} agenteFinal=${agenteFinal.padEnd(17)} tema_detectado=${(tema||'null').padEnd(10)} sessao.tema=${sessao.tema_atual||'null'}`)
  turnos.push({ agente: agenteFinal, numero: i+1 })
  sessao = { agente_atual: agenteFinal, tema_atual: tema || sessao.tema_atual }
})
