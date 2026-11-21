# 📊 Painel de Atendimentos

![Testes](https://github.com/Isaac-Andrade07/painel-atendimentos/actions/workflows/testes.yml/badge.svg)

Aplicação web para gestão de atendimentos de campo: agendamento, acompanhamento de **SLA**, distribuição entre **equipes** e indicadores de desempenho do mês.

🔗 **Acesse online:** https://isaac-andrade07.github.io/painel-atendimentos/

> Para ver o painel com dados, abra o menu **Mais → Carregar dados de exemplo**.

## 💡 O problema

Controlar atendimentos com anotações soltas faz com que agendamentos sejam esquecidos, equipes fiquem sobrecarregadas e prazos estourem sem ninguém perceber. O painel centraliza tudo e mostra, logo na primeira tela, o que precisa de atenção.

## ✨ Funcionalidades

**Dashboard**
- Indicadores do mês com comparação ao mês anterior: recebidos, em aberto, taxa de conclusão, % concluído dentro do SLA e tempo médio de conclusão
- Gráfico de atendimentos por dia e gráfico de rosca por status (desenhados em Canvas, sem bibliotecas)
- Pontos de atenção automáticos: SLA estourado ou em risco, atendimentos vencidos, atendimentos do dia sem equipe e equipes acima da capacidade
- Ranking de clientes e ocupação das equipes no dia

**Atendimentos**
- Cadastro e edição em janela modal, com validação e avisos (ex.: equipe já lotada naquele dia)
- Protocolo sequencial (ATD-0001, ATD-0002…)
- Prioridades com SLA próprio: Urgente (4h), Alta (24h), Média (48h) e Baixa (72h)
- Fluxo de status com transições controladas: Falta agendar → Agendado → Em andamento → Concluído (ou Cancelado)
- Histórico completo de cada atendimento (linha do tempo de alterações)
- Busca, filtros combinados, ordenação por coluna e paginação

**Quadro Kanban**
- Cartões arrastáveis entre colunas, respeitando as regras de transição
- Cartões ordenados por prioridade, com a situação do SLA

**Equipes**
- Cadastro de equipes com capacidade diária
- Ocupação do dia e atendimentos em aberto por equipe

**Outros**
- Tema claro e escuro
- Exportação do mês em CSV (abre direto no Excel)
- Backup e restauração em JSON
- Migração automática dos dados da versão 1
- Atalho de teclado: `N` abre um novo atendimento

## 🛠️ Tecnologias

- **HTML5** (`<dialog>`, Drag and Drop API, acessibilidade com `aria-*`)
- **CSS3** (variáveis para tema, Grid, Flexbox, `color-mix`, layout responsivo)
- **JavaScript (ES Modules)**, sem frameworks: Canvas API, localStorage, hash routing
- **Node.js test runner** para testes automatizados
- **GitHub Actions** para rodar os testes a cada envio
- **GitHub Pages** para hospedagem

## 🧱 Arquitetura

O código separa regras de negócio, estado e interface, o que facilita testar e evoluir:

```
index.html            → estrutura das telas e modais
css/style.css         → visual, tema claro/escuro e responsividade
js/regras.js          → regras puras: SLA, status, indicadores, validação, filtros (testáveis)
js/store.js           → estado, persistência, histórico, importação/exportação
js/graficos.js        → gráficos em Canvas
js/ui.js              → funções que montam o HTML de cada tela
js/app.js             → ponto de entrada: rotas e eventos
tests/regras.test.js  → testes automatizados das regras
```

## ▶️ Como rodar localmente

Por usar ES Modules, o projeto precisa ser aberto por um servidor local (abrir o `index.html` direto não funciona):

```bash
# opção 1: extensão Live Server do VS Code
# opção 2: Python
python -m http.server 8000
# depois acesse http://localhost:8000
```

## 🧪 Testes

```bash
npm test
```

São 12 testes cobrindo SLA, transições de status, indicadores, capacidade das equipes, validação, filtros, ordenação, paginação e CSV.

## 👤 Autor

**Isaac Raphael Oliveira Andrade**
Estudante de Análise e Desenvolvimento de Sistemas
