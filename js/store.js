// Estado da aplicação: guarda os dados, salva no navegador e avisa a interface quando algo muda.

import { STATUS, PRIORIDADES, podeMudar, dataISO } from "./regras.js";

const CHAVE = "painel-atendimentos-v2";
const CHAVE_V1 = "painel-atendimentos";
const VERSAO = 2;
const HORA_MS = 60 * 60 * 1000;

const ouvintes = new Set();
let estado = carregar();

// ---------- Persistência ----------

function estadoVazio() {
  return {
    versao: VERSAO,
    seqProtocolo: 0,
    atendimentos: [],
    equipes: [
      { id: "eq-norte", nome: "Equipe Norte", capacidadeDia: 4 },
      { id: "eq-sul", nome: "Equipe Sul", capacidadeDia: 3 },
      { id: "eq-centro", nome: "Equipe Centro", capacidadeDia: 5 }
    ]
  };
}

function lerStorage(chave) {
  try {
    return JSON.parse(localStorage.getItem(chave));
  } catch {
    return null;
  }
}

function carregar() {
  const salvo = lerStorage(CHAVE);
  if (salvo?.versao === VERSAO) return salvo;

  const antigo = lerStorage(CHAVE_V1);
  if (Array.isArray(antigo) && antigo.length) return migrarV1(antigo);

  return estadoVazio();
}

// Converte os dados da primeira versão do painel para o formato novo.
function migrarV1(lista) {
  const novo = estadoVazio();
  const equipesPorNome = new Map(novo.equipes.map(e => [e.nome, e.id]));

  lista.forEach(a => {
    let equipeId = "";
    if (a.equipe) {
      if (!equipesPorNome.has(a.equipe)) {
        const id = gerarId("eq");
        novo.equipes.push({ id, nome: a.equipe, capacidadeDia: 4 });
        equipesPorNome.set(a.equipe, id);
      }
      equipeId = equipesPorNome.get(a.equipe);
    }
    const criadoEm = new Date(`${a.data}T08:00:00`).toISOString();
    novo.atendimentos.push({
      id: a.id || gerarId("at"),
      protocolo: proximoProtocolo(novo),
      cliente: a.cliente,
      servico: a.servico,
      prioridade: "media",
      data: a.data,
      hora: a.hora || "",
      equipeId,
      status: a.status,
      observacoes: "",
      criadoEm,
      concluidoEm: a.status === "concluido" ? criadoEm : null,
      historico: [{ em: criadoEm, texto: "Importado da versão anterior do painel" }]
    });
  });
  return novo;
}

function salvar() {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(estado));
  } catch {
    // Armazenamento bloqueado: o painel segue funcionando durante a sessão.
  }
}

function notificar() {
  salvar();
  ouvintes.forEach(fn => fn(estado));
}

// ---------- Utilitários ----------

function gerarId(prefixo) {
  return `${prefixo}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

function proximoProtocolo(alvo = estado) {
  alvo.seqProtocolo += 1;
  return `ATD-${String(alvo.seqProtocolo).padStart(4, "0")}`;
}

function registrar(a, texto, em = new Date().toISOString()) {
  a.historico.push({ em, texto });
}

function nomeEquipe(id) {
  return estado.equipes.find(e => e.id === id)?.nome || "sem equipe";
}

// ---------- Leitura ----------

export const obterEstado = () => estado;
export const assinar = fn => (ouvintes.add(fn), () => ouvintes.delete(fn));
export const buscarAtendimento = id => estado.atendimentos.find(a => a.id === id);
export const buscarEquipe = id => estado.equipes.find(e => e.id === id);

// ---------- Atendimentos ----------

export function criarAtendimento(dados) {
  const agora = new Date().toISOString();
  const a = {
    id: gerarId("at"),
    protocolo: proximoProtocolo(),
    cliente: dados.cliente.trim(),
    servico: dados.servico.trim(),
    prioridade: dados.prioridade,
    data: dados.data || "",
    hora: dados.hora || "",
    equipeId: dados.equipeId || "",
    status: dados.data ? "agendado" : "pendente",
    observacoes: dados.observacoes?.trim() || "",
    criadoEm: agora,
    concluidoEm: null,
    historico: []
  };
  registrar(a, `Atendimento criado com prioridade ${PRIORIDADES[a.prioridade].nome}`, agora);
  if (a.status === "agendado") registrar(a, `Agendado para ${a.data} (${nomeEquipe(a.equipeId)})`, agora);
  estado.atendimentos.push(a);
  notificar();
  return a;
}

export function atualizarAtendimento(id, dados) {
  const a = buscarAtendimento(id);
  if (!a) return;
  const mudancas = [];
  if (a.data !== dados.data || a.hora !== dados.hora) mudancas.push(`data alterada para ${dados.data || "—"} ${dados.hora || ""}`);
  if (a.equipeId !== dados.equipeId) mudancas.push(`equipe alterada para ${nomeEquipe(dados.equipeId)}`);
  if (a.prioridade !== dados.prioridade) mudancas.push(`prioridade alterada para ${PRIORIDADES[dados.prioridade].nome}`);

  Object.assign(a, {
    cliente: dados.cliente.trim(),
    servico: dados.servico.trim(),
    prioridade: dados.prioridade,
    data: dados.data || "",
    hora: dados.hora || "",
    equipeId: dados.equipeId || "",
    observacoes: dados.observacoes?.trim() || ""
  });
  if (a.status === "pendente" && a.data) {
    a.status = "agendado";
    mudancas.push("status alterado para Agendado");
  }
  registrar(a, mudancas.length ? `Editado: ${mudancas.join(", ")}` : "Dados editados");
  notificar();
}

export function mudarStatus(id, novoStatus) {
  const a = buscarAtendimento(id);
  if (!a) return { ok: false, motivo: "Atendimento não encontrado." };
  if (!podeMudar(a.status, novoStatus)) {
    return { ok: false, motivo: `Não é possível ir de "${STATUS[a.status]}" para "${STATUS[novoStatus]}".` };
  }
  if (novoStatus === "agendado" && !a.data) {
    return { ok: false, motivo: "Defina uma data antes de agendar." };
  }
  a.status = novoStatus;
  a.concluidoEm = novoStatus === "concluido" ? new Date().toISOString() : null;
  registrar(a, `Status alterado para ${STATUS[novoStatus]}`);
  notificar();
  return { ok: true };
}

export function excluirAtendimento(id) {
  estado.atendimentos = estado.atendimentos.filter(a => a.id !== id);
  notificar();
}

// ---------- Equipes ----------

export function salvarEquipe({ id, nome, capacidadeDia }) {
  const capacidade = Math.max(1, Number(capacidadeDia) || 1);
  if (id) {
    Object.assign(buscarEquipe(id), { nome: nome.trim(), capacidadeDia: capacidade });
  } else {
    estado.equipes.push({ id: gerarId("eq"), nome: nome.trim(), capacidadeDia: capacidade });
  }
  notificar();
}

export function excluirEquipe(id) {
  const emUso = estado.atendimentos.some(a => a.equipeId === id && ["agendado", "em-andamento"].includes(a.status));
  if (emUso) return { ok: false, motivo: "Essa equipe tem atendimentos em aberto. Reatribua antes de excluir." };
  estado.equipes = estado.equipes.filter(e => e.id !== id);
  estado.atendimentos.forEach(a => { if (a.equipeId === id) a.equipeId = ""; });
  notificar();
  return { ok: true };
}

// ---------- Importar, exportar e dados de exemplo ----------

export function exportarJson() {
  return JSON.stringify(estado, null, 2);
}

export function importarJson(texto) {
  const dados = JSON.parse(texto);
  if (dados?.versao !== VERSAO || !Array.isArray(dados.atendimentos) || !Array.isArray(dados.equipes)) {
    throw new Error("Arquivo inválido: não é um backup deste painel.");
  }
  estado = dados;
  notificar();
}

export function limparTudo() {
  estado = estadoVazio();
  notificar();
}

export function gerarExemplo(quantidade = 60) {
  const clientes = ["Transportadora Alfa", "Logística Beta", "Frota Gama", "Locadora Delta", "Seguradora Ômega"];
  const servicos = ["Vistoria", "Instalação", "Recuperação", "Manutenção", "Desinstalação"];
  const prioridades = ["urgente", "alta", "alta", "media", "media", "media", "baixa"];
  const agora = Date.now();
  const sortear = lista => lista[Math.floor(Math.random() * lista.length)];

  const hoje = dataISO();

  for (let i = 0; i < quantidade; i++) {
    const prioridade = sortear(prioridades);
    // Data do atendimento entre 35 dias atrás e 12 dias à frente, em horário comercial.
    const agendado = new Date(agora + (Math.random() * 47 - 35) * 24 * HORA_MS);
    agendado.setHours(8 + Math.floor(Math.random() * 10), 0, 0, 0);
    const data = dataISO(agendado);
    // A solicitação chega antes do atendimento; quanto mais urgente, menor a antecedência.
    const antecedencia = PRIORIDADES[prioridade].slaHoras * (0.2 + Math.random() * 1.2) * HORA_MS;
    const criado = new Date(Math.min(agendado.getTime() - antecedencia, agora - HORA_MS));

    let status;
    const r = Math.random();
    if (data < hoje) status = r < 0.8 ? "concluido" : r < 0.88 ? "cancelado" : "em-andamento";
    else if (data === hoje) status = r < 0.4 ? "em-andamento" : "agendado";
    else status = r < 0.2 ? "pendente" : "agendado";

    const equipe = status === "pendente" || (status === "agendado" && Math.random() < 0.15)
      ? ""
      : sortear(estado.equipes).id;

    const a = {
      id: gerarId("at"),
      protocolo: proximoProtocolo(),
      cliente: sortear(clientes),
      servico: sortear(servicos),
      prioridade,
      data: status === "pendente" ? "" : data,
      hora: status === "pendente" ? "" : `${String(agendado.getHours()).padStart(2, "0")}:00`,
      equipeId: equipe,
      status,
      observacoes: "",
      criadoEm: criado.toISOString(),
      concluidoEm: null,
      historico: []
    };
    registrar(a, `Atendimento criado com prioridade ${PRIORIDADES[prioridade].nome}`, a.criadoEm);
    if (status !== "pendente") registrar(a, `Agendado para ${data} (${nomeEquipe(equipe)})`, a.criadoEm);
    if (status === "concluido") {
      const fim = new Date(agendado.getTime() + (1 + Math.random() * 3) * HORA_MS);
      a.concluidoEm = new Date(Math.min(fim.getTime(), agora)).toISOString();
      registrar(a, "Status alterado para Concluído", a.concluidoEm);
    }
    if (status === "em-andamento") registrar(a, "Status alterado para Em andamento", agendado.toISOString());
    if (status === "cancelado") registrar(a, "Status alterado para Cancelado", agendado.toISOString());
    estado.atendimentos.push(a);
  }
  notificar();
}
