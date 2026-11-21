// Ponto de entrada: liga os eventos da página às regras e ao estado.

import * as store from "./store.js";
import { STATUS, PRIORIDADES, validar, filtrar, ordenar, paginar, doMes, statusReal, situacaoSla, paraCsv, dataISO } from "./regras.js";
import * as ui from "./ui.js";

const $ = id => document.getElementById(id);
const ROTAS = ["dashboard", "atendimentos", "quadro", "equipes"];

const tela = {
  rota: "dashboard",
  mes: dataISO().slice(0, 7),
  ordem: { campo: "data", direcao: "desc" },
  pagina: 1,
  detalheId: null
};

// ---------- Renderização ----------

function render() {
  const estado = store.obterEstado();
  atualizarFiltros(estado);
  if (tela.rota === "dashboard") ui.renderDashboard(estado, tela.mes);
  if (tela.rota === "atendimentos") renderLista(estado);
  if (tela.rota === "quadro") ui.renderKanban(estado);
  if (tela.rota === "equipes") ui.renderEquipes(estado);
  if (tela.detalheId && $("modalDetalhe").open) {
    const a = store.buscarAtendimento(tela.detalheId);
    a ? ui.renderDetalhe(a, estado.equipes) : $("modalDetalhe").close();
  }
}

function renderLista(estado) {
  const filtros = {
    busca: $("fBusca").value,
    status: $("fStatus").value,
    prioridade: $("fPrioridade").value,
    equipeId: $("fEquipe").value
  };
  const lista = ordenar(filtrar(estado.atendimentos, filtros), tela.ordem.campo, tela.ordem.direcao);
  const pagina = paginar(lista, tela.pagina, 10);
  tela.pagina = pagina.pagina;
  ui.renderTabela(pagina.itens, estado.equipes, tela.ordem);
  ui.renderPaginacao(pagina, lista.length);
}

function atualizarFiltros(estado) {
  ui.preencherSelect($("fStatus"), Object.entries(STATUS), "Todos os status");
  ui.preencherSelect($("fPrioridade"), Object.entries(PRIORIDADES).map(([k, p]) => [k, p.nome]), "Todas as prioridades");
  ui.preencherSelect($("fEquipe"), estado.equipes.map(e => [e.id, e.nome]), "Todas as equipes");
}

// ---------- Navegação ----------

function irPara() {
  const rota = location.hash.replace("#/", "");
  tela.rota = ROTAS.includes(rota) ? rota : "dashboard";
  document.querySelectorAll("[data-view]").forEach(s => { s.hidden = s.dataset.view !== tela.rota; });
  document.querySelectorAll("[data-rota]").forEach(a => a.classList.toggle("ativo", a.dataset.rota === tela.rota));
  render();
}

// ---------- Formulário de atendimento ----------

function abrirFormulario(atendimento = null) {
  const form = $("formAtendimento");
  ui.preencherFormulario(form, atendimento, store.obterEstado());
  form.dataset.confirmado = "";
  form.querySelector("[type=submit]").textContent = "Salvar";
  $("modalForm").showModal();
  form.cliente.focus();
}

function salvarFormulario(evento) {
  evento.preventDefault();
  const form = evento.target;
  const dados = Object.fromEntries(new FormData(form));
  const existente = dados.id ? store.buscarAtendimento(dados.id) : null;
  const estado = store.obterEstado();

  const candidato = { ...existente, ...dados, status: existente?.status ?? (dados.data ? "agendado" : "pendente") };
  if (!existente) delete candidato.id;
  const { valido, erros, avisos } = validar(candidato, estado);

  if (!valido) {
    ui.mostrarMensagens(erros, avisos);
    return;
  }
  // Se houver avisos, pede um segundo clique para confirmar.
  if (avisos.length && form.dataset.confirmado !== "1") {
    ui.mostrarMensagens([], avisos);
    form.dataset.confirmado = "1";
    form.querySelector("[type=submit]").textContent = "Salvar mesmo assim";
    return;
  }

  if (existente) {
    store.atualizarAtendimento(existente.id, dados);
    ui.toast(`${existente.protocolo} atualizado.`, "ok");
  } else {
    const novo = store.criarAtendimento(dados);
    ui.toast(`${novo.protocolo} criado.`, "ok");
  }
  $("modalForm").close();
}

// ---------- Detalhe ----------

function abrirDetalhe(id) {
  const a = store.buscarAtendimento(id);
  if (!a) return;
  tela.detalheId = id;
  ui.renderDetalhe(a, store.obterEstado().equipes);
  $("modalDetalhe").showModal();
}

async function cliqueDetalhe(evento) {
  const alvo = evento.target.closest("button");
  if (!alvo) return;
  const a = store.buscarAtendimento(tela.detalheId);

  if (alvo.hasAttribute("data-fechar")) $("modalDetalhe").close();
  if (alvo.dataset.mudar) mudarStatus(a.id, alvo.dataset.mudar);
  if (alvo.hasAttribute("data-editar")) {
    $("modalDetalhe").close();
    abrirFormulario(a);
  }
  if (alvo.hasAttribute("data-excluir")) {
    $("modalDetalhe").close();
    if (await ui.confirmar(`Excluir o atendimento ${a.protocolo}? Essa ação não pode ser desfeita.`)) {
      store.excluirAtendimento(a.id);
      ui.toast(`${a.protocolo} excluído.`);
    }
  }
}

function mudarStatus(id, status) {
  const resultado = store.mudarStatus(id, status);
  if (resultado.ok) ui.toast(`Status alterado para ${STATUS[status]}.`, "ok");
  else ui.toast(resultado.motivo, "erro");
}

// ---------- Kanban (arrastar e soltar) ----------

function configurarKanban() {
  const kanban = $("kanban");
  kanban.addEventListener("dragstart", e => {
    const cartao = e.target.closest(".cartao");
    if (!cartao) return;
    e.dataTransfer.setData("text/plain", cartao.dataset.id);
    cartao.classList.add("arrastando");
  });
  kanban.addEventListener("dragend", e => e.target.closest(".cartao")?.classList.remove("arrastando"));
  kanban.addEventListener("dragover", e => {
    const coluna = e.target.closest(".coluna");
    if (!coluna) return;
    e.preventDefault();
    kanban.querySelectorAll(".coluna").forEach(c => c.classList.toggle("alvo", c === coluna));
  });
  kanban.addEventListener("dragleave", e => {
    if (!kanban.contains(e.relatedTarget)) kanban.querySelectorAll(".coluna").forEach(c => c.classList.remove("alvo"));
  });
  kanban.addEventListener("drop", e => {
    e.preventDefault();
    kanban.querySelectorAll(".coluna").forEach(c => c.classList.remove("alvo"));
    const coluna = e.target.closest(".coluna");
    const id = e.dataTransfer.getData("text/plain");
    const a = store.buscarAtendimento(id);
    if (coluna && a && a.status !== coluna.dataset.status) mudarStatus(id, coluna.dataset.status);
  });
  kanban.addEventListener("click", e => {
    const cartao = e.target.closest(".cartao");
    if (cartao) abrirDetalhe(cartao.dataset.id);
  });
}

// ---------- Equipes ----------

function configurarEquipes() {
  const form = $("formEquipe");
  form.addEventListener("submit", e => {
    e.preventDefault();
    const dados = Object.fromEntries(new FormData(form));
    store.salvarEquipe(dados);
    ui.toast(dados.id ? "Equipe atualizada." : "Equipe cadastrada.", "ok");
    form.reset();
  });
  form.addEventListener("reset", () => {
    form.id.value = "";
    $("tituloFormEquipe").textContent = "Nova equipe";
  });
  $("listaEquipes").addEventListener("click", async e => {
    const editar = e.target.dataset.editarEquipe;
    const excluir = e.target.dataset.excluirEquipe;
    if (editar) {
      const eq = store.buscarEquipe(editar);
      form.id.value = eq.id;
      form.nome.value = eq.nome;
      form.capacidadeDia.value = eq.capacidadeDia;
      $("tituloFormEquipe").textContent = `Editar ${eq.nome}`;
      form.nome.focus();
    }
    if (excluir) {
      const eq = store.buscarEquipe(excluir);
      if (!(await ui.confirmar(`Excluir a ${eq.nome}?`))) return;
      const r = store.excluirEquipe(excluir);
      ui.toast(r.ok ? "Equipe excluída." : r.motivo, r.ok ? "info" : "erro");
    }
  });
}

// ---------- Menu "Mais" ----------

function baixar(nome, conteudo, tipo) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
  link.download = nome;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

async function acaoMenu(acao) {
  const estado = store.obterEstado();
  if (acao === "exemplo") {
    store.gerarExemplo();
    ui.toast("Dados de exemplo carregados.", "ok");
  }
  if (acao === "csv") {
    const equipes = Object.fromEntries(estado.equipes.map(e => [e.id, e.nome]));
    const linhas = [["Protocolo", "Cliente", "Serviço", "Prioridade", "Data", "Hora", "Equipe", "Status", "SLA", "Criado em", "Concluído em"]];
    doMes(estado.atendimentos, tela.mes).forEach(a => linhas.push([
      a.protocolo, a.cliente, a.servico, PRIORIDADES[a.prioridade].nome, ui.formatarData(a.data), a.hora,
      equipes[a.equipeId] || "", STATUS[statusReal(a)], situacaoSla(a),
      new Date(a.criadoEm).toLocaleString("pt-BR"), a.concluidoEm ? new Date(a.concluidoEm).toLocaleString("pt-BR") : ""
    ]));
    baixar(`atendimentos-${tela.mes}.csv`, paraCsv(linhas), "text/csv;charset=utf-8");
  }
  if (acao === "backup") baixar(`backup-painel-${dataISO()}.json`, store.exportarJson(), "application/json");
  if (acao === "importar") $("inputImportar").click();
  if (acao === "limpar" && await ui.confirmar("Apagar todos os atendimentos e equipes? Faça um backup antes, se precisar.")) {
    store.limparTudo();
    ui.toast("Dados apagados.");
  }
}

function configurarMenu() {
  const botao = $("btnMais");
  const menu = $("menuMais");
  const fechar = () => { menu.hidden = true; botao.setAttribute("aria-expanded", "false"); };
  botao.addEventListener("click", e => {
    e.stopPropagation();
    menu.hidden = !menu.hidden;
    botao.setAttribute("aria-expanded", String(!menu.hidden));
  });
  menu.addEventListener("click", e => {
    const acao = e.target.dataset.acao;
    if (acao) { fechar(); acaoMenu(acao); }
  });
  document.addEventListener("click", fechar);

  $("inputImportar").addEventListener("change", async e => {
    const arquivo = e.target.files[0];
    e.target.value = "";
    if (!arquivo) return;
    if (!(await ui.confirmar("Restaurar o backup vai substituir todos os dados atuais. Continuar?"))) return;
    try {
      store.importarJson(await arquivo.text());
      ui.toast("Backup restaurado.", "ok");
    } catch (erro) {
      ui.toast(erro.message || "Não foi possível ler o arquivo.", "erro");
    }
  });
}

// ---------- Tema ----------

function alternarTema() {
  const novo = document.documentElement.dataset.tema === "escuro" ? "claro" : "escuro";
  document.documentElement.dataset.tema = novo;
  try { localStorage.setItem("tema", novo); } catch {}
  atualizarBotaoTema();
  render();
}

function atualizarBotaoTema() {
  $("btnTema").textContent = document.documentElement.dataset.tema === "escuro" ? "☀️" : "🌙";
}

// ---------- Início ----------

function iniciar() {
  $("filtroMes").value = tela.mes;
  $("filtroMes").addEventListener("change", e => { tela.mes = e.target.value || tela.mes; render(); });

  $("btnNovo").addEventListener("click", () => abrirFormulario());
  $("btnTema").addEventListener("click", alternarTema);
  $("formAtendimento").addEventListener("submit", salvarFormulario);
  $("formAtendimento").addEventListener("input", e => {
    e.currentTarget.dataset.confirmado = "";
    e.currentTarget.querySelector("[type=submit]").textContent = "Salvar";
  });
  $("modalDetalhe").addEventListener("click", cliqueDetalhe);
  document.querySelectorAll("dialog").forEach(d => d.addEventListener("click", e => {
    if (e.target.closest("[data-fechar]")) d.close();
    if (e.target === d) d.close(); // clique fora da caixa
  }));

  ["fBusca", "fStatus", "fPrioridade", "fEquipe"].forEach(id =>
    $(id).addEventListener("input", () => { tela.pagina = 1; render(); })
  );
  document.querySelector("thead").addEventListener("click", e => {
    const campo = e.target.closest("th[data-campo]")?.dataset.campo;
    if (!campo) return;
    tela.ordem = { campo, direcao: tela.ordem.campo === campo && tela.ordem.direcao === "asc" ? "desc" : "asc" };
    render();
  });
  $("tabelaCorpo").addEventListener("click", e => {
    const linha = e.target.closest("tr[data-id]");
    if (linha) abrirDetalhe(linha.dataset.id);
  });
  $("tabelaCorpo").addEventListener("keydown", e => {
    if (e.key === "Enter" && e.target.dataset.id) abrirDetalhe(e.target.dataset.id);
  });
  $("paginacao").addEventListener("click", e => {
    const p = e.target.dataset.pagina;
    if (p) { tela.pagina = Number(p); render(); }
  });

  document.addEventListener("keydown", e => {
    const digitando = e.target.closest("input, textarea, select") || document.querySelector("dialog[open]");
    if (!digitando && e.key.toLowerCase() === "n" && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      abrirFormulario();
    }
  });

  atualizarBotaoTema();
  configurarKanban();
  configurarEquipes();
  configurarMenu();

  store.assinar(render);
  window.addEventListener("hashchange", irPara);
  window.addEventListener("resize", () => tela.rota === "dashboard" && render());
  setInterval(render, 60 * 1000); // mantém o SLA atualizado com o passar do tempo

  irPara();
}

iniciar();
