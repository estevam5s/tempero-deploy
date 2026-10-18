// Estado global
let dispositivos = []
let dispositivoAtual = null
let projetoAtual = null
let construindo = false
let logAberto = false
let removerLogListener = null
let ipaAtual = null
let instalandoIpa = false

// Elementos
const $ = (s) => document.querySelector(s)
const $$ = (s) => document.querySelectorAll(s)

// Inicialização
document.addEventListener('DOMContentLoaded', async () => {
  configurarAbas()
  configurarBotoes()
  configurarLog()
  configurarIpa()

  // Listener de build logs
  removerLogListener = window.api.onBuildLog(onBuildLog)

  // Carregar dados — erros não impedem o app de funcionar
  try { await verificarXtool() } catch (e) { console.error('verificarXtool:', e) }
  try { await carregarProjetos() } catch (e) { console.error('carregarProjetos:', e) }
  try { await buscarDispositivos() } catch (e) { console.error('buscarDispositivos:', e) }
  try { await carregarAuth() } catch (e) { console.error('carregarAuth:', e) }
  try { await carregarSistema() } catch (e) { console.error('carregarSistema:', e) }
  try { await carregarIpas() } catch (e) { console.error('carregarIpas:', e) }

  // Polling de dispositivos a cada 5s
  setInterval(buscarDispositivos, 5000)
})

// --- Abas ---
function configurarAbas() {
  $$('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab
      $$('.tab-btn').forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
      $$('.tab-content').forEach(c => c.classList.remove('active'))
      $(`.tab-content[data-tab="${tab}"]`).classList.add('active')
    })
  })
}

// --- Botões ---
function configurarBotoes() {
  $('#btn-add-projeto').addEventListener('click', adicionarProjeto)
  $('#btn-add-primeiro').addEventListener('click', adicionarProjeto)
  $('#btn-refresh-devices').addEventListener('click', () => {
    $('#btn-refresh-devices svg').classList.add('spinning')
    buscarDispositivos().finally(() => {
      setTimeout(() => $('#btn-refresh-devices svg').classList.remove('spinning'), 500)
    })
  })
  $('#btn-scan-devices').addEventListener('click', () => buscarDispositivos())
  $('#btn-build').addEventListener('click', () => iniciarBuild('run'))
  $('#btn-build-only').addEventListener('click', () => iniciarBuild('build'))
  $('#btn-cancelar').addEventListener('click', cancelarBuild)
  $('#btn-abrir-pasta').addEventListener('click', () => {
    if (projetoAtual) window.api.abrirPasta(projetoAtual.pasta)
  })
  $('#btn-abrir-terminal').addEventListener('click', () => {
    if (projetoAtual) window.api.abrirTerminal(projetoAtual.pasta)
  })
}

// --- Log ---
function configurarLog() {
  $('#btn-toggle-log').addEventListener('click', toggleLog)
  $('#btn-clear-log').addEventListener('click', () => {
    $('#log-output').innerHTML = ''
  })
}

function toggleLog() {
  logAberto = !logAberto
  if (logAberto) {
    $('#log-panel').classList.remove('hidden')
    document.body.classList.add('log-open')
  } else {
    $('#log-panel').classList.add('hidden')
    document.body.classList.remove('log-open')
  }
}

function appendLog(tipo, texto) {
  const el = $('#log-output')
  const span = document.createElement('span')
  span.className = `log-${tipo}`
  span.textContent = texto
  el.appendChild(span)
  el.scrollTop = el.scrollHeight
}

function onBuildLog({ tipo, texto }) {
  appendLog(tipo, texto)

  // Atualizar barra de progresso
  const lower = texto.toLowerCase()
  if (instalandoIpa) {
    if (lower.includes('planning')) atualizarProgressoIpa(10, 'Planejando...')
    else if (lower.includes('compiling') || lower.includes('building')) atualizarProgressoIpa(40, 'Compilando...')
    else if (lower.includes('signing') || lower.includes('entitlements')) atualizarProgressoIpa(60, 'Assinando...')
    else if (lower.includes('installing') || lower.includes('transfer')) atualizarProgressoIpa(80, 'Instalando no iPhone...')
    else if (lower.includes('successfully') || lower.includes('installed') || lower.includes('complete')) atualizarProgressoIpa(100, 'Concluído!')
  }
  if (lower.includes('planning')) atualizarProgresso(10, 'Planejando...')
  else if (lower.includes('compiling') || lower.includes('building')) atualizarProgresso(40, 'Compilando...')
  else if (lower.includes('signing') || lower.includes('entitlements')) atualizarProgresso(65, 'Assinando...')
  else if (lower.includes('installing')) atualizarProgresso(80, 'Instalando no iPhone...')
  else if (lower.includes('successfully') || lower.includes('installed')) atualizarProgresso(100, 'Concluído!')
  else if (tipo === 'fim') {
    const code = texto.match(/código (\d+)/)
    if (code && code[1] === '0') {
      atualizarProgresso(100, 'Concluído com sucesso!')
      setStatus('✅ Build concluído')
    } else {
      atualizarProgresso(100, 'Falhou')
      $('#progress-fill').style.background = 'var(--red)'
      setStatus('❌ Build falhou')
    }
    construindo = false
    $('#projeto-info').classList.remove('building')
    $('#btn-cancelar').classList.add('hidden')

    if (instalandoIpa) {
      instalandoIpa = false
      if (code && code[1] === '0') {
        atualizarProgressoIpa(100, 'Instalado com sucesso!')
        setStatus('✅ IPA instalado')
      } else {
        atualizarProgressoIpa(100, 'Falhou')
        $('#ipa-progress-fill').style.background = 'var(--red)'
        setStatus('❌ Instalação do IPA falhou')
      }
      $('#ipa-selecionado').classList.remove('installing')
    }
  }

  // Abrir o log se não estiver aberto
  if (!logAberto) toggleLog()
}

function atualizarProgresso(pct, texto) {
  $('#progress-fill').style.width = `${pct}%`
  $('#progress-text').textContent = texto
}

// --- xtool ---
async function verificarXtool() {
  const existe = await window.api.xtoolExiste()
  if (!existe) {
    setStatus('⚠️ xtool não encontrado — clique para localizar')
    appendLog('erro', 'xtool não encontrado.\n')
    appendLog('info', 'Clique na barra de status para localizar o xtool.\n')
    $('#status-text').style.cursor = 'pointer'
    $('#status-text').addEventListener('click', async function handler() {
      const caminho = await window.api.configurarXtool()
      if (caminho) {
        setStatus('✅ xtool configurado — reinicie o app')
        appendLog('info', `xtool configurado: ${caminho}\nReinicie o app para aplicar.\n`)
        $('#status-text').style.cursor = ''
        $('#status-text').removeEventListener('click', handler)
      }
    })
  }
}

// --- Dispositivos ---
async function buscarDispositivos() {
  try {
    dispositivos = await window.api.dispositivos()
  } catch {
    dispositivos = []
  }
  atualizarUIDispositivos()
}

function atualizarUIDispositivos() {
  const dot = $('#device-dot')
  const nome = $('#device-name')

  if (dispositivos.length > 0) {
    dispositivoAtual = dispositivos[0]
    dot.className = 'dot online'
    nome.textContent = dispositivoAtual.nome

    // Painel do dispositivo
    $('#dev-nome').textContent = dispositivoAtual.nome
    $('#dev-tipo').textContent = dispositivoAtual.tipo === 'USB' ? '🔌 USB' : `📶 ${dispositivoAtual.tipo}`
    $('#dev-udid').textContent = dispositivoAtual.udid
    $('#dev-status').innerHTML = '<span class="status-badge online">Conectado</span>'

    // Phone frame
    const phone = document.querySelector('.phone-frame')
    phone.classList.add('connected')
    $('#phone-text').textContent = dispositivoAtual.nome
    $('#phone-icon').textContent = '✅'

    setStatus(`📱 ${dispositivoAtual.nome} conectado`)
  } else {
    dispositivoAtual = null
    dot.className = 'dot offline'
    nome.textContent = 'Nenhum dispositivo'

    $('#dev-nome').textContent = '—'
    $('#dev-tipo').textContent = '—'
    $('#dev-udid').textContent = '—'
    $('#dev-status').innerHTML = '<span class="status-badge offline">Desconectado</span>'

    const phone = document.querySelector('.phone-frame')
    phone.classList.remove('connected')
    $('#phone-text').textContent = 'Conecte um iPhone'
    $('#phone-icon').textContent = '📱'
  }
}

// --- Auth ---
async function carregarAuth() {
  try {
    const auth = await window.api.authStatus()
    if (auth.logado) {
      $('#auth-label').textContent = 'Autenticado'
      $('#auth-email').textContent = auth.email
      $('#auth-badge').className = 'status-badge auth-ok'
      $('#auth-badge').textContent = 'Ativo'
    } else {
      $('#auth-label').textContent = 'Não autenticado'
      $('#auth-email').textContent = 'Execute: xtool auth login'
      $('#auth-badge').className = 'status-badge auth-no'
      $('#auth-badge').textContent = 'Pendente'
    }
  } catch {
    $('#auth-label').textContent = 'Erro ao verificar'
  }
}

// --- Sistema ---
async function carregarSistema() {
  try {
    const [xtool, swift, info] = await Promise.all([
      window.api.versaoXtool(),
      window.api.versaoSwift(),
      window.api.infoSistema(),
    ])
    $('#sys-xtool').textContent = xtool
    $('#sys-swift').textContent = swift
    $('#sys-plataforma').textContent = `${info.plataforma} ${info.versao}`
    $('#sys-arq').textContent = info.arq
  } catch {}
}

// --- Projetos ---
async function carregarProjetos() {
  const projetos = await window.api.projetosRecentes()
  renderizarListaProjetos(projetos)
}

function renderizarListaProjetos(projetos) {
  const lista = $('#projeto-list')
  if (!projetos.length) {
    lista.innerHTML = `
      <div style="padding: 20px; text-align: center; color: var(--text-muted); font-size: 12px;">
        Nenhum projeto adicionado
      </div>`
    return
  }

  lista.innerHTML = projetos.map(p => `
    <div class="projeto-item ${projetoAtual && projetoAtual.pasta === p.pasta ? 'active' : ''}" data-pasta="${escapeHtml(p.pasta)}">
      <div class="projeto-item-icon">📦</div>
      <div class="projeto-item-info">
        <div class="projeto-item-nome">${escapeHtml(p.nome)}</div>
        <div class="projeto-item-path">${escapeHtml(p.pasta.replace(/^\/Users\/[^/]+/, '~'))}</div>
      </div>
      <button class="btn-remove" data-pasta="${escapeHtml(p.pasta)}" title="Remover">✕</button>
    </div>
  `).join('')

  lista.querySelectorAll('.projeto-item').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target.classList.contains('btn-remove')) return
      selecionarProjeto(el.dataset.pasta)
    })
  })

  lista.querySelectorAll('.btn-remove').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation()
      await window.api.removerProjeto(btn.dataset.pasta)
      if (projetoAtual && projetoAtual.pasta === btn.dataset.pasta) {
        projetoAtual = null
        mostrarDetalhe(false)
      }
      await carregarProjetos()
    })
  })
}

async function adicionarProjeto() {
  const resultado = await window.api.selecionarProjeto()
  if (!resultado) return
  if (resultado.erro) {
    appendLog('erro', resultado.erro + '\n')
    setStatus(`⚠️ ${resultado.erro}`)
    return
  }
  await carregarProjetos()
  selecionarProjeto(resultado.pasta)
}

async function selecionarProjeto(pasta) {
  const info = await window.api.infoProjeto(pasta)
  if (!info) {
    setStatus('⚠️ Projeto não encontrado')
    return
  }
  projetoAtual = info
  mostrarDetalhe(true)

  // Atualizar sidebar
  $$('.projeto-item').forEach(el => {
    el.classList.toggle('active', el.dataset.pasta === pasta)
  })

  // Preencher dados
  $('#proj-nome').textContent = info.nome
  $('#proj-bundle').textContent = info.bundleId || 'Sem bundleID (adicione xtool.yml)'
  $('#stat-arquivos').textContent = info.total
  $('#stat-yml').textContent = info.temYml ? '✅ Configurado' : '⚠️ Ausente'
  $('#stat-yml').style.color = info.temYml ? 'var(--green-light)' : 'var(--orange)'
  $('#stat-pasta').textContent = info.pasta.replace(/^\/Users\/[^/]+/, '~')
  $('#badge-arquivos').textContent = info.total

  // Lista de arquivos
  const listaArq = $('#arquivo-list')
  if (info.arquivos.length) {
    listaArq.innerHTML = info.arquivos.map(a => `
      <div class="arquivo-item">${escapeHtml(a)}</div>
    `).join('')
  } else {
    listaArq.innerHTML = '<div class="arquivo-item" style="color: var(--text-muted)">Nenhum arquivo .swift encontrado</div>'
  }
}

function mostrarDetalhe(mostrar) {
  $('#empty-projetos').classList.toggle('hidden', mostrar)
  $('#projeto-info').classList.toggle('hidden', !mostrar)
  if (mostrar) $('#projeto-info').classList.add('fade-in')
}

// --- Build ---
async function iniciarBuild(acao) {
  if (construindo || !projetoAtual) return

  if (acao === 'run' && !dispositivoAtual) {
    setStatus('⚠️ Conecte um iPhone para instalar')
    appendLog('erro', 'Nenhum dispositivo conectado. Conecte o iPhone via USB.\n')
    if (!logAberto) toggleLog()
    return
  }

  construindo = true
  $('#projeto-info').classList.add('building')
  $('#btn-cancelar').classList.remove('hidden')
  $('#build-progress').classList.remove('hidden')
  atualizarProgresso(5, 'Iniciando...')
  $('#progress-fill').style.background = ''

  appendLog('info', `\n━━━ ${acao === 'run' ? 'Compilar e instalar' : 'Compilar'} ━━━\n`)
  appendLog('info', `Projeto: ${projetoAtual.nome}\n`)
  if (dispositivoAtual) appendLog('info', `Dispositivo: ${dispositivoAtual.nome}\n`)
  appendLog('info', `Hora: ${new Date().toLocaleTimeString('pt-BR')}\n\n`)

  setStatus(`🔨 ${acao === 'run' ? 'Compilando e instalando' : 'Compilando'}...`)

  const code = await window.api.buildRun({
    pasta: projetoAtual.pasta,
    udid: dispositivoAtual?.udid,
    acao,
  })
}

async function cancelarBuild() {
  await window.api.buildCancelar()
  construindo = false
  $('#projeto-info').classList.remove('building')
  $('#btn-cancelar').classList.add('hidden')
  atualizarProgresso(0, 'Cancelado')
  setStatus('⏹ Build cancelado')
  appendLog('info', '\n⏹ Build cancelado pelo usuário\n')
}

// --- Helpers ---
function setStatus(texto) {
  $('#status-text').textContent = texto
}

function escapeHtml(str) {
  const div = document.createElement('div')
  div.textContent = str
  return div.innerHTML
}

function formatarTamanho(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatarData(iso) {
  try {
    return new Date(iso).toLocaleDateString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  } catch { return '—' }
}

// --- IPA ---
function configurarIpa() {
  $('#btn-add-ipa').addEventListener('click', selecionarIpa)
  $('#btn-gerar-ipa').addEventListener('click', gerarIpaDoProjeto)
  $('#btn-instalar-ipa').addEventListener('click', instalarIpa)
  $('#btn-ipa-pasta').addEventListener('click', () => {
    if (ipaAtual) {
      const dir = ipaAtual.caminho.replace(/\/[^/]+$/, '')
      window.api.abrirPasta(dir)
    }
  })

  // Drag and drop
  const zona = $('#ipa-drop-zone')
  zona.addEventListener('click', selecionarIpa)

  zona.addEventListener('dragover', (e) => {
    e.preventDefault()
    e.stopPropagation()
    zona.classList.add('dragover')
  })

  zona.addEventListener('dragleave', (e) => {
    e.preventDefault()
    zona.classList.remove('dragover')
  })

  zona.addEventListener('drop', async (e) => {
    e.preventDefault()
    e.stopPropagation()
    zona.classList.remove('dragover')
    const files = Array.from(e.dataTransfer.files)
    const arquivo = files.find(f => f.name.endsWith('.ipa'))
    if (!arquivo) {
      setStatus('⚠️ Arraste um arquivo .ipa')
      return
    }
    if (arquivo.path) {
      const ipa = await window.api.adicionarIpaCaminho(arquivo.path)
      if (ipa && !ipa.erro) {
        mostrarIpa(ipa)
        await carregarIpas()
      } else {
        setStatus(`⚠️ ${ipa?.erro || 'Erro ao adicionar IPA'}`)
      }
    } else {
      setStatus('⚠️ Arraste o arquivo diretamente do Finder')
    }
  })
}

async function selecionarIpa() {
  const ipa = await window.api.selecionarIpa()
  if (!ipa) return
  if (ipa.erro) {
    setStatus(`⚠️ ${ipa.erro}`)
    appendLog('erro', ipa.erro + '\n')
    return
  }
  mostrarIpa(ipa)
  await carregarIpas()
}

function mostrarIpa(ipa) {
  ipaAtual = ipa
  $('#ipa-drop-zone').classList.add('hidden')
  $('#ipa-selecionado').classList.remove('hidden')
  $('#ipa-nome').textContent = ipa.nome + '.ipa'
  $('#ipa-meta').textContent = `${formatarTamanho(ipa.tamanho)} · ${formatarData(ipa.data)}`
  $('#ipa-caminho').textContent = ipa.caminho
  $('#ipa-progress').classList.add('hidden')
  $('#ipa-selecionado').classList.add('fade-in')
}

async function instalarIpa() {
  if (instalandoIpa || !ipaAtual) return

  if (!dispositivoAtual) {
    setStatus('⚠️ Conecte um iPhone para instalar')
    appendLog('erro', 'Nenhum dispositivo conectado. Conecte o iPhone via USB.\n')
    if (!logAberto) toggleLog()
    return
  }

  instalandoIpa = true
  construindo = true
  $('#ipa-selecionado').classList.add('installing')
  $('#ipa-progress').classList.remove('hidden')
  atualizarProgressoIpa(5, 'Iniciando instalação...')
  $('#ipa-progress-fill').style.background = ''

  appendLog('info', `\n━━━ Instalar IPA ━━━\n`)
  appendLog('info', `Arquivo: ${ipaAtual.nome}.ipa\n`)
  appendLog('info', `Dispositivo: ${dispositivoAtual.nome}\n`)
  appendLog('info', `Hora: ${new Date().toLocaleTimeString('pt-BR')}\n\n`)

  setStatus('📦 Instalando IPA...')

  if (!logAberto) toggleLog()

  const code = await window.api.instalarIpa({
    caminho: ipaAtual.caminho,
    udid: dispositivoAtual.udid,
  })
}

async function gerarIpaDoProjeto() {
  if (construindo) return
  if (!projetoAtual) {
    setStatus('⚠️ Selecione um projeto na aba Projetos primeiro')
    return
  }

  construindo = true
  instalandoIpa = true
  $('#ipa-progress').classList.remove('hidden')
  $('#ipa-selecionado').classList.remove('hidden')
  $('#ipa-drop-zone').classList.add('hidden')

  $('#ipa-nome').textContent = projetoAtual.nome + '.ipa'
  $('#ipa-meta').textContent = 'Gerando...'
  $('#ipa-caminho').textContent = projetoAtual.pasta

  atualizarProgressoIpa(5, 'Compilando para gerar IPA...')
  $('#ipa-progress-fill').style.background = ''

  appendLog('info', `\n━━━ Gerar IPA ━━━\n`)
  appendLog('info', `Projeto: ${projetoAtual.nome}\n`)
  appendLog('info', `Hora: ${new Date().toLocaleTimeString('pt-BR')}\n\n`)

  setStatus('🔨 Gerando IPA...')
  if (!logAberto) toggleLog()

  const code = await window.api.gerarIpa({
    pasta: projetoAtual.pasta,
  })
}

function atualizarProgressoIpa(pct, texto) {
  $('#ipa-progress-fill').style.width = `${pct}%`
  $('#ipa-progress-text').textContent = texto
}

async function carregarIpas() {
  const ipas = await window.api.ipasRecentes()
  renderizarListaIpas(ipas)
}

function renderizarListaIpas(ipas) {
  const lista = $('#ipa-list')
  const badge = $('#badge-ipas')
  badge.textContent = ipas.length

  if (!ipas.length) {
    lista.innerHTML = '<div class="empty-ipa-list">Nenhum IPA adicionado ainda</div>'
    return
  }

  lista.innerHTML = ipas.map(ipa => `
    <div class="ipa-list-item ${ipaAtual && ipaAtual.caminho === ipa.caminho ? 'active' : ''}" data-caminho="${escapeHtml(ipa.caminho)}">
      <div class="ipa-list-icon">.ipa</div>
      <div class="ipa-list-info">
        <div class="ipa-list-nome">${escapeHtml(ipa.nome)}.ipa</div>
        <div class="ipa-list-meta">${formatarTamanho(ipa.tamanho)} · ${formatarData(ipa.data)}</div>
      </div>
      <button class="btn-remove" data-caminho="${escapeHtml(ipa.caminho)}" title="Remover">✕</button>
    </div>
  `).join('')

  lista.querySelectorAll('.ipa-list-item').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target.classList.contains('btn-remove')) return
      const caminho = el.dataset.caminho
      const ipa = ipas.find(i => i.caminho === caminho)
      if (ipa) mostrarIpa(ipa)
    })
  })

  lista.querySelectorAll('.btn-remove').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation()
      await window.api.removerIpa(btn.dataset.caminho)
      if (ipaAtual && ipaAtual.caminho === btn.dataset.caminho) {
        ipaAtual = null
        $('#ipa-selecionado').classList.add('hidden')
        $('#ipa-drop-zone').classList.remove('hidden')
      }
      await carregarIpas()
    })
  })
}
