// =====================================================================
// Configuração compartilhada — Sistema de Gestão de Cozinha Rosewood A&B
// =====================================================================
// Este arquivo é incluído por todas as telas do sistema.
// Centraliza URL e chave anônima do Supabase para evitar duplicação.
//
// Uso nas telas HTML:
//   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
//   <script src="config.js"></script>
//   ...
//   const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
// =====================================================================

const SUPABASE_URL = 'https://nyijprhukndlyijqljbm.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im55aWpwcmh1a25kbHlpanFsamJtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY2MjUwMDgsImV4cCI6MjA5MjIwMTAwOH0.Vzljd9xesi1ZJ-l7du00v-elUSDQObRCUz2jPyqL5p8';

// Versão exibida no canto inferior das telas (ajuda a diagnosticar cache)
const SISTEMA_VERSAO = 'v2.0-fase1';

// Mapeamento de perfil → tela inicial após login
const REDIRECT_POR_PERFIL = {
  master_sistema:  'master_sistema.html',
  gerente_compras: 'gerente_compras.html',
  executivo:       'executivo.html',
  pdv:             'pdv.html',           // tela unificada PDV (compra + requisição)
  estoque:         'estoque.html',
  comprador:       'comprador.html',     // fase pós-piloto
  recebimento:     'recebimento.html',   // fase pós-piloto
};

// Rótulo de cada perfil na interface. Fonte única — evita divergência entre telas.
const LABEL_PERFIL = {
  master_sistema:  'Master de Sistema',
  gerente_compras: 'Gerente de Compras',
  executivo:       'Chef',
  pdv:             'PDV',
  estoque:         'Estoque',
  comprador:       'Comprador',
  recebimento:     'Recebimento',
};

// =====================================================================
// BUSCA DE ITENS
// =====================================================================
// A equipe procura pelo nome da planilha, que raramente é igual ao nome
// cadastrado. A busca antiga era substring exata e falhava em dois casos
// muito comuns:
//
//   acento     "CAMARÃO" não achava "CAMARAO ROSA FRESCO..."
//   ordem      "CUBOS DE FILÉ MIGNON" não achava "FILE MIGNON EM CUBOS"
//
// Agora normaliza (tira acento e pontuação), quebra em palavras e exige
// que todas apareçam, em qualquer ordem. Se não achar nada assim, tenta
// de novo ignorando embalagem e gramatura (PCT, KG, 500g) — que a
// planilha traz mas o cadastro nem sempre tem.

function normalizarBusca(s) {
  return String(s || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

// Tokens de embalagem/gramatura: refinam a busca, mas não devem zerar o resultado
const _TOKENS_EMBALAGEM = /^(pct|pc|pcs|po|und|unid|un|cx|bd|bl|rl|kg|kgs|g|gr|grs|ml|lt|l|peca|pecas|balde|lata|caixa|tablete|barra|bloco|rolo)$/;
function _ehTokenEmbalagem(t) {
  return _TOKENS_EMBALAGEM.test(t) || /^\d+[a-z]*$/.test(t);
}

// true se `texto` atende ao termo digitado
function itemCasaBusca(texto, termo) {
  const alvo = normalizarBusca(texto);
  if (!alvo) return false;

  const palavras = normalizarBusca(termo).split(' ').filter(t => t.length >= 3);
  if (!palavras.length) return alvo.includes(normalizarBusca(termo));

  if (palavras.every(t => alvo.includes(t))) return true;

  const significativas = palavras.filter(t => !_ehTokenEmbalagem(t));
  return significativas.length > 0 && significativas.every(t => alvo.includes(t));
}

// Busca no nome e no fornecedor — o que as telas usam
function itemAtendeBusca(item, termo) {
  if (!termo) return true;
  return itemCasaBusca(item.nome, termo)
      || itemCasaBusca(item.fornecedor_principal || '', termo);
}

// =====================================================================
// BUSCA POR ITEM DENTRO DO HISTÓRICO
// =====================================================================
// "Quando foi que a gente pediu morango?" é uma pergunta sobre o ITEM,
// mas a lista é de PEDIDOS. Então a busca precisa olhar dentro dos
// filhos (requisicao_itens / solicitacao_compra_itens) e a linha
// precisa mostrar O QUE casou — senão o resultado não explica por que
// aquele pedido apareceu. Reaproveita itemCasaBusca: acha sem acento e
// com as palavras fora de ordem, que é como a equipe digita.

// O histórico filtra por created_at, não por data_competencia. Parecem a
// mesma coisa e não são: pela regra das 10h, uma compra feita hoje à tarde
// tem competência amanhã. Filtrando por competência, o pedido que a pessoa
// acabou de fazer não aparecia num histórico "até hoje".
//
// created_at é timestamptz (UTC) e a data escolhida na tela é local, então
// os limites do dia precisam ser convertidos — senão o filtro come três
// horas de cada ponta.
function inicioDoDiaISO(d) { return new Date(d + 'T00:00:00').toISOString(); }
function fimDoDiaISO(d)    { return new Date(d + 'T23:59:59.999').toISOString(); }

// Itens do registro que atendem ao termo (vazio = termo em branco)
function itensQueCasam(registro, termo, campoItens) {
  if (!termo) return [];
  return (registro[campoItens] || []).filter(i => itemCasaBusca(i.item_nome, termo));
}

// true se o registro tem pelo menos um item que casa
function registroCasaItem(registro, termo, campoItens) {
  if (!termo) return true;
  return itensQueCasam(registro, termo, campoItens).length > 0;
}

// Linha "o que casou" exibida abaixo do registro no resultado da busca.
// Mostra a quantidade entregue quando ela existe — é a informação que
// falta quando alguém procura o histórico de um item específico.
function resumoItensCasados(itens) {
  if (!itens || !itens.length) return '';
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  return `<div class="itens-casados">${itens.map(i => {
    const un = i.item_unidade ? ' ' + esc(i.item_unidade) : '';
    const ent = i.quantidade_entregue != null && +i.quantidade_entregue !== +i.quantidade_solicitada
      ? ` <span class="text-error">→ ${+i.quantidade_entregue}${un}</span>` : '';
    return `<span class="ic-chip"><b>${esc(i.item_nome)}</b> ${
      +i.quantidade_solicitada}${un}${ent}</span>`;
  }).join('')}</div>`;
}

// =====================================================================
// PEDIDO POR PACOTE × CONSUMO POR PESO
// =====================================================================
// Boa parte das proteínas é pedida em pacote de peso variável: o
// cozinheiro pede "2 pacotes de filé mignon", a Comissaria pesa e o peso
// real nunca bate. Enquanto existia um campo só para as duas coisas, isso
// era registrado como divergência — 58% das divergências do piloto eram
// só isso, e nenhuma era falta de nada.
//
// Regra: a unidade do pedido é propriedade do ITEM, não escolha de quem
// pede. Se fosse escolha, "2" às vezes seria pacote e às vezes quilo, e
// nenhum relatório posterior conseguiria somar os dois.
//
//   quantidade_solicitada   pacotes      ← o que o PDV pediu
//   pacotes_entregues       pacotes      ← divergência é medida AQUI
//   quantidade_entregue     peso real    ← relatório e inventário usam ISTO
//
// Enquanto a migration 28 não roda, pede_por vem indefinido e tudo se
// comporta como antes — as telas continuam funcionando sem a coluna.

function ehPacote(x) {
  return x?.pede_por === 'pacote' || x?.pedido_por === 'pacote';
}
function rotuloPacote(x) { return x?.rotulo_pacote || 'PCT'; }

// Unidade em que o peso é medido. Metade dos itens de pacote tem
// unidade = 'PCT' no catálogo — mostrar "≈ 3,06 PCT" não quer dizer nada.
// A balança pesa em quilo, então quando a unidade cadastrada é a própria
// embalagem, o peso vai em kg.
const _UNIDADES_DE_PESO = new Set(['kg', 'g', 'gr', 'l', 'lt', 'ml']);
function unidadePeso(x) {
  const u = String(x?.unidade ?? x?.item_unidade ?? '').trim().toLowerCase();
  return _UNIDADES_DE_PESO.has(u) ? u : 'kg';
}

// "≈ 4,4 kg". Devolve vazio quando ninguém informou nem pesou ainda —
// é melhor não mostrar estimativa nenhuma do que mostrar uma inventada.
function estimativaPeso(qtd, pesoMedio, unidade) {
  const p = parseFloat(pesoMedio), q = parseFloat(qtd);
  if (!p || !(q > 0)) return '';
  const total = q * p;
  return `≈ ${total.toLocaleString('pt-BR', { maximumFractionDigits: total < 10 ? 2 : 1 })} ${unidade || 'kg'}`;
}

// Congela no item do pedido como ele era na hora: se o catálogo mudar de
// regime depois, o pedido antigo continua sendo lido do jeito que foi feito.
//
// Devolve pedido_por SEMPRE, inclusive 'peso'. Não é redundância: o
// PostgREST monta um INSERT em lote com a UNIÃO das chaves de todas as
// linhas e preenche com NULL o que faltar numa delas — não com o DEFAULT.
// Omitir a chave nos itens comuns fazia um pedido misto (um item de pacote
// + um item normal) violar o NOT NULL da coluna e falhar inteiro.
function snapshotPacote(item) {
  return ehPacote(item)
    ? { pedido_por: 'pacote', peso_medio_pacote: item.peso_medio_pacote ?? null }
    : { pedido_por: 'peso',   peso_medio_pacote: null };
}

// =====================================================================
// IDEMPOTÊNCIA DE ENVIO
// =====================================================================
// Cada "carrinho" carrega um UUID. Ele vai no INSERT e o banco tem índice
// UNIQUE sobre a coluna client_token — se o mesmo envio chegar duas vezes
// (clique repetido, retry de rede, duas abas abertas), o Postgres recusa a
// segunda gravação com o erro 23505 em vez de criar um pedido duplicado.

function novoClientToken() {
  if (window.crypto?.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

// Guarda tokens por chave ('compra', 'req', 'manual'...). O token só troca
// depois que o envio conclui — assim o retry reaproveita o mesmo e é barrado.
const _tokensCarrinho = {};
function tokenCarrinho(chave = 'default') {
  if (!_tokensCarrinho[chave]) _tokensCarrinho[chave] = novoClientToken();
  return _tokensCarrinho[chave];
}
function resetTokenCarrinho(chave = 'default') {
  _tokensCarrinho[chave] = null;
}

// true quando o erro do Supabase é violação de índice único
function ehEnvioDuplicado(err) {
  return err && (err.code === '23505' || /duplicate key/i.test(err.message || ''));
}

// true quando a coluna client_token ainda não existe (migration 17 não rodou).
// PGRST204 = coluna não encontrada no schema cache do PostgREST; 42703 = undefined_column.
function faltaColunaToken(err) {
  return err && (err.code === 'PGRST204' || err.code === '42703'
    || /client_token/i.test(err.message || ''));
}

// INSERT com token de idempotência e degradação graciosa.
// Se a coluna client_token ainda não existir no banco, refaz o INSERT sem ela —
// assim o sistema funciona antes e depois da migration 17, sem quebrar o deploy.
async function inserirIdempotente(sb, tabela, payload, chaveToken, selectStr = '*') {
  const comToken = { ...payload, client_token: tokenCarrinho(chaveToken) };
  let r = await sb.from(tabela).insert(comToken).select(selectStr).single();

  if (r.error && faltaColunaToken(r.error) && !ehEnvioDuplicado(r.error)) {
    console.warn('[idempotência] coluna client_token ausente — rode a migration 17. Gravando sem token.');
    r = await sb.from(tabela).insert(payload).select(selectStr).single();
  }
  return r;
}

// =====================================================================
// AVISO DE CONEXÃO
// =====================================================================
// O sistema exige internet para gravar. Sem service worker não há fila
// offline — então o mínimo é avisar o usuário antes que ele perca o que
// digitou. Chame instalarAvisoConexao() no load de cada tela.

// =====================================================================
// SELEÇÃO AUTOMÁTICA EM CAMPO DE QUANTIDADE
// =====================================================================
// No celular, tocar num campo que já tem valor põe o cursor no meio do
// número — a pessoa precisa apagar dígito por dígito antes de digitar o
// certo. Selecionar o conteúdo ao focar faz o primeiro toque substituir
// tudo, que é o que se espera de um campo de quantidade.
//
// O adiamento é necessário: no toque, o navegador dá o foco e SÓ DEPOIS
// posiciona o cursor. Selecionar direto no focus seria desfeito em seguida.
// Usamos setTimeout e não requestAnimationFrame porque o rAF não dispara
// quando a aba está em segundo plano — o campo ficaria sem seleção.
//
// Listener único no document — vale para campo criado depois, que é o
// caso de todas as listas montadas por innerHTML.
document.addEventListener('focusin', e => {
  const el = e.target;
  if (el instanceof HTMLInputElement && el.type === 'number' && el.value !== '') {
    setTimeout(() => {
      // O campo pode ter perdido o foco entre o evento e agora
      if (document.activeElement === el) { try { el.select(); } catch {} }
    }, 0);
  }
});

// =====================================================================
// DETALHE DE UM REGISTRO
// =====================================================================
// As listas mostravam a linha (data, PDV, status, nº de itens) mas não
// deixavam abrir: para saber O QUE tinha dentro do pedido, não havia
// caminho. Isso valia para quase toda tela — só a fila da Comissaria
// abria. Aqui fica o modal, criado uma vez e reaproveitado; cada tela
// só monta o conteúdo.
//
//   abrirDetalhe('PO-00012 — FABENE', '<table>...</table>')
//   abrirDetalhe('Carregando...', null)   → mostra o estado de carga

function abrirDetalhe(titulo, corpoHtml) {
  let mod = document.getElementById('detalheModal');
  if (!mod) {
    mod = document.createElement('div');
    mod.className = 'modal-overlay';
    mod.id = 'detalheModal';
    mod.innerHTML = `
      <div class="modal" style="width:840px;max-width:96vw">
        <div class="modal-header">
          <span id="detalheTitulo"></span>
          <button class="modal-close" onclick="fecharDetalhe()">✕</button>
        </div>
        <div class="modal-body" id="detalheCorpo"></div>
        <div class="modal-footer">
          <button class="btn btn-outline" onclick="fecharDetalhe()">Fechar</button>
        </div>
      </div>`;
    document.body.appendChild(mod);
    // fechar clicando fora e com Esc — o usuário espera as duas coisas
    mod.addEventListener('click', e => { if (e.target === mod) fecharDetalhe(); });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && mod.classList.contains('open')) fecharDetalhe();
    });
  }
  document.getElementById('detalheTitulo').textContent = titulo;
  document.getElementById('detalheCorpo').innerHTML =
    corpoHtml ?? '<div class="loading-text">Carregando...</div>';
  mod.classList.add('open');
}

function fecharDetalhe() {
  document.getElementById('detalheModal')?.classList.remove('open');
}

// Tabela de itens no formato que o detalhe usa.
// colunas: [{ rotulo, campo | valor(item), classe }]
function tabelaDetalhe(itens, colunas, vazio = 'Nenhum item.') {
  if (!itens || !itens.length) return `<div class="empty-text">${vazio}</div>`;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  return `<table class="data-table tabela-cards">
    <thead><tr>${colunas.map(c =>
      `<th class="${c.classe || ''}">${esc(c.rotulo)}</th>`).join('')}</tr></thead>
    <tbody>${itens.map(it => `<tr>${colunas.map((c, i) => {
      const v = c.valor ? c.valor(it) : it[c.campo];
      const cls = i === 0 ? 'td-titulo' : (c.classe || '');
      const lbl = i === 0 ? '' : ` data-label="${esc(c.rotulo)}"`;
      return `<td class="${cls}"${lbl}>${c.valor ? (v ?? '') : esc(v ?? '—')}</td>`;
    }).join('')}</tr>`).join('')}</tbody></table>`;
}

// ── Detalhes que Chef, Gerente e PDV mostram igual ────────────────
// Ficam aqui para não existirem três cópias que envelhecem separado.
// Recebem o cliente `sb` por parâmetro, como inserirIdempotente.

const _esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const _data = s => s ? new Date(s + 'T00:00:00').toLocaleDateString('pt-BR') : '—';
const _qtd = v => { const n = parseFloat(v) || 0; return n % 1 === 0 ? String(n) : String(n); };

const LABEL_STATUS_SOLC = {
  rascunho:'Rascunho', enviada:'Aguardando aprovação', aprovada:'Aprovada',
  rejeitada:'Rejeitada', entregue:'Entregue',
};
const LABEL_STATUS_REQ = {
  enviado:'Aguardando', separacao:'Em separação', entregue:'Entregue', cancelada:'Cancelada',
};

async function verSolicitacaoCompra(sb, id) {
  abrirDetalhe('Carregando...', null);
  // A FK precisa ser nomeada: a tabela aponta para usuarios em mais de uma
  // coluna (quem criou, quem aprovou), e sem isso o PostgREST recusa o embed
  const { data: s, error } = await sb.from('solicitacoes_compra')
    .select(`*, pdvs(nome), solicitacao_compra_itens(*, itens(fornecedor_principal)),
             usuarios!solicitacoes_compra_usuario_id_fkey(nome)`)
    .eq('id', id).single();
  if (error) { abrirDetalhe('Erro', '<div class="empty-text">' + _esc(error.message) + '</div>'); return; }

  const itens = (s.solicitacao_compra_itens || [])
    .sort((a, b) => a.item_nome.localeCompare(b.item_nome));
  const atendidos = itens.filter(i => i.ordem_compra_id).length;

  abrirDetalhe(
    'Solicitação de compra — ' + (s.pdvs?.nome || ''),
    `<div class="email-campo"><b>Situação</b><span>${LABEL_STATUS_SOLC[s.status] || s.status}</span></div>
     <div class="email-campo"><b>Criada</b><span>${new Date(s.created_at).toLocaleString('pt-BR')}${
       s.usuarios?.nome ? ' por ' + _esc(s.usuarios.nome) : ''}</span></div>
     <div class="email-campo"><b>Entra na lista de</b><span>${_data(s.data_competencia)}${
       s.data_entrega_desejada ? ' · entrega pedida ' + _data(s.data_entrega_desejada) : ''}</span></div>
     ${atendidos ? `<div class="email-campo"><b>Compra</b><span>${atendidos} de ${itens.length}
       item(ns) já em ordem de compra</span></div>` : ''}
     ${s.observacao ? `<div class="obs-box mt-2">${_esc(s.observacao)}</div>` : ''}
     ${s.motivo_rejeicao ? `<div class="aviso aviso-warn mt-2">Rejeitada — ${
       _esc(s.motivo_rejeicao)}</div>` : ''}

     <div class="section-title mt-3"><span>Itens (${itens.length})</span></div>
     <table class="data-table tabela-cards">
       <thead><tr><th>Item</th><th>Categoria</th><th>Fornecedor</th>
         <th class="num">Quantidade</th><th>Comentário</th></tr></thead>
       <tbody>${itens.map(i => `<tr>
         <td class="td-titulo">${_esc(i.item_nome)}</td>
         <td data-label="Categoria">${_esc(i.item_categoria || '—')}</td>
         <td data-label="Fornecedor">${_esc(i.itens?.fornecedor_principal || '—')}</td>
         <td class="num" data-label="Quantidade">${_qtd(i.quantidade_solicitada)} ${_esc(i.item_unidade || '')}</td>
         <td data-label="Comentário">${_esc(i.comentario || '—')}</td>
       </tr>`).join('')}</tbody>
     </table>`
  );
}

async function verRequisicaoInterna(sb, id) {
  abrirDetalhe('Carregando...', null);
  const { data: r, error } = await sb.from('requisicoes')
    .select('*, pdvs(nome), requisicao_itens(*), usuarios!requisicoes_usuario_id_fkey(nome)')
    .eq('id', id).single();
  if (error) { abrirDetalhe('Erro', '<div class="empty-text">' + _esc(error.message) + '</div>'); return; }

  const itens = (r.requisicao_itens || []).sort((a, b) => a.item_nome.localeCompare(b.item_nome));
  const entregue = ['entregue', 'cancelada'].includes(r.status);
  const divs = itens.filter(i => i.divergencia).length;

  abrirDetalhe(
    'Requisição — ' + (r.pdvs?.nome || ''),
    `<div class="email-campo"><b>Situação</b><span>${LABEL_STATUS_REQ[r.status] || r.status}${
       divs ? ' · ' + divs + ' item(ns) com divergência' : ''}</span></div>
     <div class="email-campo"><b>Criada</b><span>${new Date(r.created_at).toLocaleString('pt-BR')}${
       r.usuarios?.nome ? ' por ' + _esc(r.usuarios.nome) : ''}</span></div>
     ${r.entregue_em ? `<div class="email-campo"><b>Entregue</b><span>${
       new Date(r.entregue_em).toLocaleString('pt-BR')}</span></div>` : ''}
     ${r.observacao ? `<div class="obs-box mt-2">${_esc(r.observacao)}</div>` : ''}
     ${r.motivo_cancelamento ? `<div class="aviso aviso-warn mt-2">Cancelada — ${
       _esc(r.motivo_cancelamento)}</div>` : ''}

     <div class="section-title mt-3"><span>Itens (${itens.length})</span></div>
     <table class="data-table tabela-cards">
       <thead><tr><th>Item</th><th>Categoria</th><th class="num">Pedido</th>
         ${entregue ? '<th class="num">Entregue</th><th>Divergência</th>' : ''}</tr></thead>
       <tbody>${itens.map(i => {
         // Item de pacote tem duas grandezas: pacotes (o que foi pedido) e
         // peso (o que a balança disse). A falta se mede nos pacotes.
         const pct = ehPacote(i);
         const rot = _esc(rotuloPacote(i));
         const un = _esc(i.item_unidade || '');
         const falta = pct
           ? (entregue && i.pacotes_entregues != null
               ? (+i.quantidade_solicitada) - (+i.pacotes_entregues) : 0)
           : (entregue && i.quantidade_entregue != null
               ? (+i.quantidade_solicitada) - (+i.quantidade_entregue) : 0);
         const uPeso = _esc(unidadePeso(i));
         const est = estimativaPeso(i.quantidade_solicitada, i.peso_medio_pacote, unidadePeso(i));
         return `<tr>
           <td class="td-titulo">${_esc(i.item_nome)}${pct ? ` <span class="pct-badge">por ${rot}</span>` : ''}${
             i.comentario ? `<br><em style="color:var(--muted);font-size:11px">${_esc(i.comentario)}</em>` : ''}</td>
           <td data-label="Categoria">${_esc(i.item_categoria || '—')}</td>
           <td class="num" data-label="Pedido">${_qtd(i.quantidade_solicitada)} ${pct ? rot : un}${
             pct && est ? `<br><span class="est-peso">${est}</span>` : ''}</td>
           ${entregue ? `
             <td class="num" data-label="Entregue">${pct
               ? (i.pacotes_entregues != null
                   ? `<span class="${falta > 0.0001 ? 'text-error' : ''}">${_qtd(i.pacotes_entregues)} ${rot}</span>${
                       i.quantidade_entregue != null
                         ? `<br><span class="est-peso">${_qtd(i.quantidade_entregue)} ${uPeso} pesado</span>` : ''}`
                   : '—')
               : (i.quantidade_entregue != null
                   ? `<span class="${falta > 0.0001 ? 'text-error' : ''}">${_qtd(i.quantidade_entregue)} ${un}</span>`
                   : '—')}</td>
             <td data-label="Divergência">${i.motivo_divergencia
               ? '<span class="text-error">' + _esc(i.motivo_divergencia) + '</span>'
               : '<span class="text-muted">—</span>'}</td>` : ''}
         </tr>`;
       }).join('')}</tbody>
     </table>`
  );
}

function instalarAvisoConexao() {
  const barra = document.createElement('div');
  barra.id = 'barra-offline';
  barra.textContent = '⚠  Sem conexão — não envie pedidos até a internet voltar';
  barra.style.cssText = [
    'position:fixed', 'top:0', 'left:0', 'right:0', 'z-index:9999',
    'background:#B03B3B', 'color:#fff', 'text-align:center',
    'padding:10px 16px', 'font-size:14px', 'font-weight:600',
    'letter-spacing:0.5px', 'display:none',
  ].join(';');
  document.body.appendChild(barra);

  const sync = () => {
    const off = !navigator.onLine;
    barra.style.display = off ? 'block' : 'none';
    document.body.style.paddingTop = off ? '42px' : '';
  };
  window.addEventListener('online', sync);
  window.addEventListener('offline', sync);
  sync();
}
