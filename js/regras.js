// Regras de negócio puras (sem acesso ao DOM).
// Por não dependerem da página, podem ser testadas com `npm test`.

export const STATUS = {
  "pendente": "Falta agendar",
  "sem-equipe": "Sem equipe",
  "agendado": "Agendado",
  "em-andamento": "Em andamento",
  "concluido": "Concluído",
  "cancelado": "Cancelado"
};

export const PRIORIDADES = {
  "urgente": { nome: "Urgente", slaHoras: 4, peso: 4 },
  "alta": { nome: "Alta", slaHoras: 24, peso: 3 },
  "media": { nome: "Média", slaHoras: 48, peso: 2 },
  "baixa": { nome: "Baixa", slaHoras: 72, peso: 1 }
};

// Para quais status cada status pode ir.
export const TRANSICOES = {
  "pendente": ["agendado", "cancelado"],
  "agendado": ["em-andamento", "pendente", "cancelado"],
  "em-andamento": ["concluido", "agendado"],
  "concluido": [],
  "cancelado": ["pendente"]
};

const HORA_MS = 60 * 60 * 1000;

// ---------- Datas ----------

export function dataISO(data = new Date()) {
  const d = new Date(data);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

export function mesAnterior(mes) {
  const [ano, m] = mes.split("-").map(Number);
  const d = new Date(ano, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function diasNoMes(mes) {
  const [ano, m] = mes.split("-").map(Number);
  return new Date(ano, m, 0).getDate();
}

// ---------- Status e prazos ----------

export function statusReal(a) {
  if (a.status === "agendado" && !a.equipeId) return "sem-equipe";
  return a.status;
}

export function podeMudar(de, para) {
  return (TRANSICOES[de] || []).includes(para);
}

export function prazoSla(a) {
  const horas = PRIORIDADES[a.prioridade]?.slaHoras ?? 48;
  return new Date(new Date(a.criadoEm).getTime() + horas * HORA_MS);
}

export function situacaoSla(a, agora = new Date()) {
  if (a.status === "cancelado") return "n/a";
  const prazo = prazoSla(a);
  if (a.status === "concluido") {
    return new Date(a.concluidoEm) <= prazo ? "cumprido" : "violado";
  }
  const restante = prazo - agora;
  if (restante < 0) return "estourado";
  if (restante < 0.25 * (PRIORIDADES[a.prioridade]?.slaHoras ?? 48) * HORA_MS) return "em-risco";
  return "no-prazo";
}

export function estaAtrasado(a, hoje = dataISO()) {
  return ["agendado", "em-andamento"].includes(a.status) && !!a.data && a.data < hoje;
}

// ---------- Indicadores ----------

export function doMes(atendimentos, mes) {
  return atendimentos.filter(a => (a.data || a.criadoEm.slice(0, 10)).startsWith(mes));
}

export function calcularKpis(lista, agora = new Date()) {
  const porStatus = Object.fromEntries(Object.keys(STATUS).map(s => [s, 0]));
  lista.forEach(a => porStatus[statusReal(a)]++);

  const validos = lista.filter(a => a.status !== "cancelado");
  const concluidos = lista.filter(a => a.status === "concluido");
  const noSla = concluidos.filter(a => situacaoSla(a, agora) === "cumprido").length;
  const horasConclusao = concluidos.map(a => (new Date(a.concluidoEm) - new Date(a.criadoEm)) / HORA_MS);

  return {
    total: lista.length,
    porStatus,
    abertos: validos.length - concluidos.length,
    taxaConclusao: validos.length ? concluidos.length / validos.length : 0,
    percentualSla: concluidos.length ? noSla / concluidos.length : 0,
    tempoMedioHoras: horasConclusao.length
      ? horasConclusao.reduce((s, h) => s + h, 0) / horasConclusao.length
      : 0,
    slaEstourados: lista.filter(a => situacaoSla(a, agora) === "estourado").length
  };
}

export function variacao(atual, anterior) {
  if (!anterior) return atual ? 1 : 0;
  return (atual - anterior) / anterior;
}

export function contagemPorDia(lista, mes) {
  const dias = Array(diasNoMes(mes)).fill(0);
  lista.forEach(a => {
    if (a.data?.startsWith(mes)) dias[Number(a.data.slice(8, 10)) - 1]++;
  });
  return dias;
}

export function ranking(lista, campo, limite = 5) {
  const mapa = new Map();
  lista.forEach(a => mapa.set(a[campo], (mapa.get(a[campo]) || 0) + 1));
  return [...mapa.entries()]
    .map(([nome, total]) => ({ nome, total }))
    .sort((x, y) => y.total - x.total || String(x.nome).localeCompare(String(y.nome)))
    .slice(0, limite);
}

// ---------- Equipes ----------

export function ocupacao(atendimentos, equipe, data) {
  const usados = atendimentos.filter(a =>
    a.equipeId === equipe.id && a.data === data && ["agendado", "em-andamento"].includes(a.status)
  ).length;
  return { usados, capacidade: equipe.capacidadeDia, livre: equipe.capacidadeDia - usados };
}

// ---------- Validação ----------

export function validar(a, { atendimentos = [], equipes = [], hoje = dataISO() } = {}) {
  const erros = [];
  const avisos = [];

  if (!a.cliente?.trim()) erros.push("Informe o cliente.");
  if (!a.servico?.trim()) erros.push("Informe o serviço.");
  if (!PRIORIDADES[a.prioridade]) erros.push("Prioridade inválida.");
  if (a.status !== "pendente" && !a.data) erros.push("Atendimentos agendados precisam de data.");
  if (a.data && a.data < hoje && ["pendente", "agendado"].includes(a.status) && !a.id) {
    avisos.push("A data escolhida já passou.");
  }

  const equipe = equipes.find(e => e.id === a.equipeId);
  if (equipe && a.data) {
    const outros = atendimentos.filter(x => x.id !== a.id);
    const { livre } = ocupacao(outros, equipe, a.data);
    if (livre <= 0) avisos.push(`${equipe.nome} já está com a capacidade cheia nesse dia.`);
  }

  return { valido: erros.length === 0, erros, avisos };
}

// ---------- Ordenação e filtros ----------

export function filtrar(lista, { busca = "", status = "", prioridade = "", equipeId = "" } = {}) {
  const termo = busca.trim().toLowerCase();
  return lista.filter(a =>
    (!status || statusReal(a) === status) &&
    (!prioridade || a.prioridade === prioridade) &&
    (!equipeId || a.equipeId === equipeId) &&
    (!termo || `${a.protocolo} ${a.cliente} ${a.servico}`.toLowerCase().includes(termo))
  );
}

export function ordenar(lista, campo, direcao = "asc") {
  const fator = direcao === "asc" ? 1 : -1;
  const valor = a => {
    if (campo === "prioridade") return PRIORIDADES[a.prioridade]?.peso ?? 0;
    if (campo === "data") return `${a.data || "9999"}${a.hora || ""}`;
    if (campo === "status") return STATUS[statusReal(a)];
    return String(a[campo] ?? "").toLowerCase();
  };
  return [...lista].sort((x, y) => (valor(x) > valor(y) ? 1 : valor(x) < valor(y) ? -1 : 0) * fator);
}

export function paginar(lista, pagina, porPagina = 10) {
  const totalPaginas = Math.max(1, Math.ceil(lista.length / porPagina));
  const atual = Math.min(Math.max(1, pagina), totalPaginas);
  return {
    itens: lista.slice((atual - 1) * porPagina, atual * porPagina),
    pagina: atual,
    totalPaginas
  };
}

// ---------- CSV ----------

export function paraCsv(linhas) {
  const celula = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return "\ufeff" + linhas.map(l => l.map(celula).join(";")).join("\n");
}
