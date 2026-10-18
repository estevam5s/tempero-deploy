const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  xtoolExiste: () => ipcRenderer.invoke('xtool-existe'),
  dispositivos: () => ipcRenderer.invoke('xtool-dispositivos'),
  authStatus: () => ipcRenderer.invoke('xtool-auth-status'),
  selecionarProjeto: () => ipcRenderer.invoke('selecionar-projeto'),
  projetosRecentes: () => ipcRenderer.invoke('projetos-recentes'),
  removerProjeto: (pasta) => ipcRenderer.invoke('remover-projeto', pasta),
  infoProjeto: (pasta) => ipcRenderer.invoke('info-projeto', pasta),
  buildRun: (opts) => ipcRenderer.invoke('build-run', opts),
  buildCancelar: () => ipcRenderer.invoke('build-cancelar'),
  selecionarIpa: () => ipcRenderer.invoke('selecionar-ipa'),
  adicionarIpaCaminho: (caminho) => ipcRenderer.invoke('adicionar-ipa-caminho', caminho),
  ipasRecentes: () => ipcRenderer.invoke('ipas-recentes'),
  removerIpa: (caminho) => ipcRenderer.invoke('remover-ipa', caminho),
  infoIpa: (caminho) => ipcRenderer.invoke('info-ipa', caminho),
  instalarIpa: (opts) => ipcRenderer.invoke('instalar-ipa', opts),
  gerarIpa: (opts) => ipcRenderer.invoke('gerar-ipa', opts),
  abrirPasta: (pasta) => ipcRenderer.invoke('abrir-pasta', pasta),
  abrirTerminal: (pasta) => ipcRenderer.invoke('abrir-terminal', pasta),
  versaoXtool: () => ipcRenderer.invoke('versao-xtool'),
  versaoSwift: () => ipcRenderer.invoke('versao-swift'),
  infoSistema: () => ipcRenderer.invoke('info-sistema'),
  configurarXtool: () => ipcRenderer.invoke('configurar-xtool'),
  onBuildLog: (cb) => {
    const handler = (_, dados) => cb(dados)
    ipcRenderer.on('build-log', handler)
    return () => ipcRenderer.removeListener('build-log', handler)
  },
})
