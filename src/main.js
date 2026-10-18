const { app, BrowserWindow, ipcMain, dialog, shell, nativeTheme } = require('electron')
const path = require('path')
const { spawn, execFile } = require('child_process')
const fs = require('fs')
const os = require('os')

const XTOOL = encontrarXtool()
const PREFS_PATH = path.join(app.getPath('userData'), 'prefs.json')

function encontrarXtool() {
  const candidatos = [
    path.resolve(__dirname, '../../..', 'IoS/xtool/.build/debug/xtool'),
    path.join(os.homedir(), 'Documents/pedacinho do ceu/pdv/IoS/xtool/.build/debug/xtool'),
    '/usr/local/bin/xtool',
    path.join(os.homedir(), '.local/bin/xtool'),
  ]
  // Verificar caminho salvo nas preferências
  try {
    const prefs = JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'prefs.json'), 'utf8'))
    if (prefs.xtoolPath) candidatos.unshift(prefs.xtoolPath)
  } catch {}
  for (const c of candidatos) {
    if (fs.existsSync(c)) return c
  }
  return candidatos[1] // fallback para o caminho absoluto mesmo que não exista ainda
}

let mainWindow

function lerPrefs() {
  try { return JSON.parse(fs.readFileSync(PREFS_PATH, 'utf8')) } catch { return { projetos: [] } }
}
function salvarPrefs(p) {
  fs.writeFileSync(PREFS_PATH, JSON.stringify(p, null, 2))
}

function criarJanela() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 740,
    minWidth: 860,
    minHeight: 560,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0d1117',
    trafficLightPosition: { x: 16, y: 18 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  mainWindow.loadFile(path.join(__dirname, 'ui/index.html'))
  nativeTheme.themeSource = 'dark'

  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  }
}

app.whenReady().then(criarJanela)
app.on('window-all-closed', () => app.quit())

// --- IPC ---

ipcMain.handle('xtool-existe', () => fs.existsSync(XTOOL))

ipcMain.handle('xtool-dispositivos', async () => {
  return new Promise((resolve) => {
    execFile(XTOOL, ['devices', '--no-wait'], { timeout: 8000 }, (err, stdout, stderr) => {
      if (err) return resolve([])
      const linhas = stdout.trim().split('\n').filter(Boolean)
      const dispositivos = linhas.map(l => {
        const m = l.match(/^(.+?)\s*\[(.+?)\]:\s*(.+)$/)
        if (!m) return null
        return { nome: m[1].trim(), tipo: m[2].trim(), udid: m[3].trim() }
      }).filter(Boolean)
      resolve(dispositivos)
    })
  })
})

ipcMain.handle('xtool-auth-status', async () => {
  return new Promise((resolve) => {
    execFile(XTOOL, ['auth'], { timeout: 5000 }, (err, stdout, stderr) => {
      const saida = (stdout || '') + (stderr || '')
      if (saida.includes('Logged in') || saida.includes('logged in')) {
        const m = saida.match(/Apple ID:\s*(.+)/i)
        resolve({ logado: true, email: m ? m[1].trim() : '' })
      } else {
        resolve({ logado: false, email: '' })
      }
    })
  })
})

ipcMain.handle('selecionar-projeto', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Selecionar projeto Swift',
    message: 'Escolha a pasta com Package.swift e xtool.yml',
  })
  if (result.canceled || !result.filePaths.length) return null
  const pasta = result.filePaths[0]
  const temPkg = fs.existsSync(path.join(pasta, 'Package.swift'))
  if (!temPkg) return { erro: 'A pasta não contém Package.swift' }
  const temYml = fs.existsSync(path.join(pasta, 'xtool.yml'))
  let bundleId = ''
  let nome = path.basename(pasta)
  if (temYml) {
    try {
      const yml = fs.readFileSync(path.join(pasta, 'xtool.yml'), 'utf8')
      const m = yml.match(/bundleID:\s*(.+)/)
      if (m) bundleId = m[1].trim()
    } catch {}
  }
  try {
    const pkg = fs.readFileSync(path.join(pasta, 'Package.swift'), 'utf8')
    const m = pkg.match(/name:\s*"(.+?)"/)
    if (m) nome = m[1]
  } catch {}
  const projeto = { pasta, nome, bundleId, temYml }
  const prefs = lerPrefs()
  if (!prefs.projetos.find(p => p.pasta === pasta)) {
    prefs.projetos.unshift(projeto)
    if (prefs.projetos.length > 20) prefs.projetos.length = 20
    salvarPrefs(prefs)
  }
  return projeto
})

ipcMain.handle('projetos-recentes', () => {
  const prefs = lerPrefs()
  return (prefs.projetos || []).filter(p => fs.existsSync(path.join(p.pasta, 'Package.swift')))
})

ipcMain.handle('remover-projeto', (_, pasta) => {
  const prefs = lerPrefs()
  prefs.projetos = (prefs.projetos || []).filter(p => p.pasta !== pasta)
  salvarPrefs(prefs)
  return true
})

ipcMain.handle('info-projeto', (_, pasta) => {
  const temPkg = fs.existsSync(path.join(pasta, 'Package.swift'))
  if (!temPkg) return null
  const temYml = fs.existsSync(path.join(pasta, 'xtool.yml'))
  let bundleId = ''
  let nome = path.basename(pasta)
  let swift = []
  if (temYml) {
    try {
      const yml = fs.readFileSync(path.join(pasta, 'xtool.yml'), 'utf8')
      const m = yml.match(/bundleID:\s*(.+)/)
      if (m) bundleId = m[1].trim()
    } catch {}
  }
  try {
    const pkg = fs.readFileSync(path.join(pasta, 'Package.swift'), 'utf8')
    const m = pkg.match(/name:\s*"(.+?)"/)
    if (m) nome = m[1]
  } catch {}
  function contarSwift(dir, nivel = 0) {
    if (nivel > 5) return
    try {
      for (const f of fs.readdirSync(dir)) {
        if (f.startsWith('.') || f === 'node_modules' || f === '.build') continue
        const fp = path.join(dir, f)
        const st = fs.statSync(fp)
        if (st.isDirectory()) contarSwift(fp, nivel + 1)
        else if (f.endsWith('.swift')) swift.push(fp.replace(pasta + '/', ''))
      }
    } catch {}
  }
  contarSwift(pasta)
  return { pasta, nome, bundleId, temYml, arquivos: swift, total: swift.length }
})

let buildProcess = null

ipcMain.handle('build-run', (event, { pasta, udid, acao }) => {
  if (buildProcess) {
    try { buildProcess.kill() } catch {}
    buildProcess = null
  }

  const args = []
  if (acao === 'build') {
    args.push('dev', 'build')
  } else if (acao === 'build-sign') {
    args.push('dev', 'build', '--sign')
  } else if (acao === 'run') {
    args.push('dev', 'run')
    if (udid) args.push('--udid', udid)
  } else if (acao === 'install') {
    args.push('dev', 'run')
    if (udid) args.push('--udid', udid)
  }

  return new Promise((resolve) => {
    buildProcess = spawn(XTOOL, args, {
      cwd: pasta,
      env: { ...process.env, TERM: 'dumb' },
    })

    const enviar = (tipo, texto) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('build-log', { tipo, texto })
      }
    }

    buildProcess.stdout.on('data', d => {
      const t = d.toString()
      enviar('stdout', t)
    })
    buildProcess.stderr.on('data', d => {
      const t = d.toString()
      enviar('stderr', t)
    })
    buildProcess.on('close', code => {
      enviar('fim', `Processo finalizado com código ${code}`)
      buildProcess = null
      resolve(code)
    })
    buildProcess.on('error', err => {
      enviar('erro', err.message)
      buildProcess = null
      resolve(1)
    })
  })
})

ipcMain.handle('build-cancelar', () => {
  if (buildProcess) {
    try { buildProcess.kill('SIGTERM') } catch {}
    buildProcess = null
    return true
  }
  return false
})

ipcMain.handle('selecionar-ipa', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'treatPackageAsDirectory'],
    title: 'Selecionar arquivo IPA',
    message: 'Escolha um arquivo .ipa para instalar no iPhone',
    filters: [
      { name: 'iOS App (*.ipa)', extensions: ['ipa'] },
      { name: 'Todos os arquivos', extensions: ['*'] },
    ],
  })
  if (result.canceled || !result.filePaths.length) return null
  const caminho = result.filePaths[0]
  if (!caminho.toLowerCase().endsWith('.ipa')) {
    return { erro: 'O arquivo selecionado não é um .ipa' }
  }
  return registrarIpa(caminho)
})

ipcMain.handle('configurar-xtool', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    title: 'Localizar o xtool',
    message: 'Selecione o executável do xtool',
    defaultPath: '/usr/local/bin',
  })
  if (result.canceled || !result.filePaths.length) return null
  const caminho = result.filePaths[0]
  const prefs = lerPrefs()
  prefs.xtoolPath = caminho
  salvarPrefs(prefs)
  return caminho
})

ipcMain.handle('adicionar-ipa-caminho', (_, caminho) => {
  if (!caminho || !fs.existsSync(caminho)) return { erro: 'Arquivo não encontrado' }
  if (!caminho.toLowerCase().endsWith('.ipa')) return { erro: 'O arquivo não é um .ipa' }
  return registrarIpa(caminho)
})

function registrarIpa(caminho) {
  try {
    const stat = fs.statSync(caminho)
    const nome = path.basename(caminho, '.ipa')
    const prefs = lerPrefs()
    const ipa = { caminho, nome, tamanho: stat.size, data: stat.mtime.toISOString() }
    if (!prefs.ipas) prefs.ipas = []
    if (!prefs.ipas.find(i => i.caminho === caminho)) {
      prefs.ipas.unshift(ipa)
      if (prefs.ipas.length > 30) prefs.ipas.length = 30
      salvarPrefs(prefs)
    }
    return ipa
  } catch (e) {
    return { erro: `Erro ao ler o arquivo: ${e.message}` }
  }
}

ipcMain.handle('ipas-recentes', () => {
  const prefs = lerPrefs()
  return (prefs.ipas || []).filter(i => fs.existsSync(i.caminho))
})

ipcMain.handle('remover-ipa', (_, caminho) => {
  const prefs = lerPrefs()
  prefs.ipas = (prefs.ipas || []).filter(i => i.caminho !== caminho)
  salvarPrefs(prefs)
  return true
})

ipcMain.handle('info-ipa', (_, caminho) => {
  try {
    const stat = fs.statSync(caminho)
    return {
      caminho,
      nome: path.basename(caminho, '.ipa'),
      tamanho: stat.size,
      data: stat.mtime.toISOString(),
      existe: true,
    }
  } catch {
    return { caminho, existe: false }
  }
})

ipcMain.handle('instalar-ipa', (event, { caminho, udid }) => {
  if (buildProcess) {
    try { buildProcess.kill() } catch {}
    buildProcess = null
  }

  const args = ['install', caminho]
  if (udid) args.push('--udid', udid)

  return new Promise((resolve) => {
    buildProcess = spawn(XTOOL, args, {
      env: { ...process.env, TERM: 'dumb' },
    })

    const enviar = (tipo, texto) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('build-log', { tipo, texto })
      }
    }

    buildProcess.stdout.on('data', d => enviar('stdout', d.toString()))
    buildProcess.stderr.on('data', d => enviar('stderr', d.toString()))
    buildProcess.on('close', code => {
      enviar('fim', `Processo finalizado com código ${code}`)
      buildProcess = null
      resolve(code)
    })
    buildProcess.on('error', err => {
      enviar('erro', err.message)
      buildProcess = null
      resolve(1)
    })
  })
})

ipcMain.handle('gerar-ipa', (event, { pasta, udid }) => {
  if (buildProcess) {
    try { buildProcess.kill() } catch {}
    buildProcess = null
  }

  const args = ['dev', 'build', '--sign', '--ipa']

  return new Promise((resolve) => {
    buildProcess = spawn(XTOOL, args, {
      cwd: pasta,
      env: { ...process.env, TERM: 'dumb' },
    })

    const enviar = (tipo, texto) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('build-log', { tipo, texto })
      }
    }

    buildProcess.stdout.on('data', d => enviar('stdout', d.toString()))
    buildProcess.stderr.on('data', d => enviar('stderr', d.toString()))
    buildProcess.on('close', code => {
      enviar('fim', `Processo finalizado com código ${code}`)
      buildProcess = null
      resolve(code)
    })
    buildProcess.on('error', err => {
      enviar('erro', err.message)
      buildProcess = null
      resolve(1)
    })
  })
})

ipcMain.handle('abrir-pasta', (_, pasta) => {
  shell.openPath(pasta)
})

ipcMain.handle('abrir-terminal', (_, pasta) => {
  spawn('open', ['-a', 'Terminal', pasta], { detached: true })
})

ipcMain.handle('versao-xtool', async () => {
  return new Promise((resolve) => {
    execFile(XTOOL, ['--version'], { timeout: 5000 }, (err, stdout) => {
      resolve(err ? 'desconhecida' : stdout.trim())
    })
  })
})

ipcMain.handle('versao-swift', async () => {
  return new Promise((resolve) => {
    execFile('swift', ['--version'], { timeout: 5000 }, (err, stdout) => {
      if (err) return resolve('não encontrado')
      const m = stdout.match(/Swift version ([\d.]+)/)
      resolve(m ? m[1] : stdout.trim().split('\n')[0])
    })
  })
})

ipcMain.handle('info-sistema', async () => {
  return {
    plataforma: os.platform(),
    arq: os.arch(),
    versao: os.release(),
    maquina: os.hostname(),
  }
})
