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
// Os termos são os das SOPs do hotel (19/09/2026): o sistema fala a língua da
// cozinha. Só o rótulo muda; o código do perfil continua o mesmo no banco.
const LABEL_PERFIL = {
  master_sistema:  'Master de Sistema',
  gerente_compras: 'Gerente de Compras',
  executivo:       'Chef',
  pdv:             'Cozinheiro',
  estoque:         'Comissária',
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
// "VOCÊ QUIS DIZER?" — antes de nascer um item pendente
// =====================================================================
// DECISOES H3 (19/09/2026): o item livre nasce quando a pessoa não acha o
// item na busca e digita o que já existe ("file mignon limpo" para o FILE
// MIGNON LIMPO PORCIONADO). O mesmo casamento aproximado da market list
// acerta esses nomes com folga: palavras em comum e, para erro de
// digitação, a distância entre os textos. Item que não nasce não entra na
// fila do gerente.
function _levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  let p = Array.from({ length: n + 1 }, (_, i) => i), c = new Array(n + 1);
  for (let i = 1; i <= m; i++) {
    c[0] = i;
    for (let j = 1; j <= n; j++) c[j] = Math.min(p[j] + 1, c[j - 1] + 1, p[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    [p, c] = [c, p];
  }
  return p[n];
}

function itensParecidos(nome, lista, max = 4) {
  const alvo = normalizarBusca(nome).split(' ').filter(t => t.length >= 3 && !_ehTokenEmbalagem(t));
  if (!alvo.length) return [];
  const alvoTxt = alvo.join(' ');
  const nota = texto => {
    const t = normalizarBusca(texto);
    if (!t) return 0;
    const palavras = t.split(' ');
    // palavra digitada que casa com alguma do item, aceitando erro de uma
    // letra em palavra comprida ("mignom" = "mignon")
    const casa = alvo.filter(a => palavras.some(p => p === a || (p.startsWith(a) && a.length >= 4)
      || (a.length >= 5 && Math.abs(p.length - a.length) <= 1 && _levenshtein(p, a) <= 1))).length;
    const cobertura = casa / alvo.length;
    const semEmb = palavras.filter(p => p.length >= 3 && !_ehTokenEmbalagem(p)).join(' ');
    const l = Math.max(semEmb.length, alvoTxt.length);
    const prox = l ? 1 - _levenshtein(semEmb, alvoTxt) / l : 0;
    return Math.max(cobertura, prox);
  };
  return (lista || [])
    .map(i => ({ item: i, nota: Math.max(nota(i.nome), nota(i.nome_curto || ''), nota(i.nome_inventario || '')) }))
    .filter(x => x.nota >= 0.6)
    .sort((a, b) => b.nota - a.nota || a.item.nome.localeCompare(b.item.nome))
    .slice(0, max);
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
// DOIS NOMES, DUAS LISTAS
// =====================================================================
// O mesmo alimento tem nomes diferentes conforme quem fala dele:
//
//   compradora   QUEIJO BURRATA (CX C/6 DE 100G) - REF.: 3688
//   cozinha      QUEIJO BURRATA
//
// A parte entre parênteses não é lixo — é o que impede o fornecedor de
// separar errado. Só não serve para quem vai pegar o queijo na câmara.
// Por isso o item guarda os dois nomes e cada tela mostra o que serve.
//
// E as duas listas também são diferentes: a de requisição é o que a
// Comissaria tem em estoque (as duas planilhas que a cozinha usa), a de
// compras é o catálogo inteiro. Misturar as duas foi o que fez o
// cozinheiro pedir "PICANHA CONG.FRIBOI BACK(ATÉ 1,35KG)" seis vezes.
//
// Enquanto a migration 30 não roda, as colunas não existem: nome_curto
// vem indefinido (cai no nome) e req_ativo idem (o !== false deixa passar).
// Tudo se comporta como antes.

function nomeExibicao(item) {
  return item?.nome_curto || item?.nome || '';
}

// O inventário é o TERCEIRO vocabulário. Cai no nome da cozinha, e só
// depois no de compra — quem conta a câmara fala como a cozinha, não
// como o fornecedor.
function nomeInventario(item) {
  return item?.nome_inventario || item?.nome_curto || item?.nome || '';
}

// true quando o item deve aparecer na lista de REQUISIÇÃO
function ehDeRequisicao(item) {
  return item?.req_ativo !== false;
}

// true quando o item deve aparecer na lista de COMPRA (compradora e PDV).
// Item transformado nasce dentro da cozinha (peixe porcionado, carne
// porcionada) e não tem o que comprar — quem se compra é o item bruto.
// "DA CASA" (produção própria) é a mesma lógica por outro campo: o item
// só existe pela receita, nunca por nota fiscal de fornecedor.
// Compartilhada entre comprador.html e pdv.html — antes só existia lá.
function ehCompravel(item) {
  // 'externo' = comprado por outra equipe, em outro sistema (secos das fichas
  // da Comissaria). Existe no catálogo para a ficha ligar e custear, mas não
  // é autoridade nossa comprar — migration 70.
  return !['transformado', 'externo'].includes(item?.tipo_aquisicao) && !item?.producao_propria;
}

// =====================================================================
// EDITOR DE ITEM — a paridade feita na tela, não na planilha
// =====================================================================
// Uma tela só, aberta do Catálogo (gerente) ou da matriz (comprador),
// com tudo que descreve o item nos três vocabulários. Antes disso a
// paridade só existia exportando planilha, revisando fora e carregando
// de volta por script; qualquer ajuste de um item pedia a volta inteira.
//
// abrirEditorItem(itemId, catalogo, aoSalvar)
//   catalogo  usado só para montar a lista de "vem de qual item"
//   aoSalvar  chamado com o item atualizado, para a tela se redesenhar
//
// O item é relido do banco ao abrir: as duas telas carregam colunas
// diferentes de `itens`, e editar em cima de um objeto parcial apagaria
// o que não veio no SELECT.

const _CAT_ITEM = { proteina:'Proteína', laticinios:'Laticínios',
                    hortifruti:'Hortifruti', diversos:'Diversos' };
const _ROTULOS_PACOTE = ['PCT', 'UN', 'CX', 'BDJ', 'PT', 'SC'];

function _escEd(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}

// =====================================================================
// DEVOLUÇÃO DE MERCADORIA JÁ RECEBIDA
// =====================================================================
// Recusar a carga na doca o sistema já sabia. O que faltava é o caso real:
// a mercadoria entra, e dois dias depois a cozinha abre a caixa e devolve
// parte. Migration 45.
//
// A quantidade recebida NÃO é sobrescrita — ela é o que foi conferido na
// doca, e a auditoria pergunta por ela. O líquido é recebido menos devolvido.

const MOTIVOS_DEVOLUCAO = [
  ['qualidade',      'Qualidade'],
  ['validade',       'Validade'],
  ['produto_errado', 'Produto errado'],
  ['embalagem',      'Embalagem'],
  ['temperatura',    'Temperatura'],
  ['excesso',        'Veio a mais'],
  ['outro',          'Outro'],
];

const ROTULO_DEVOLUCAO = Object.fromEntries(MOTIVOS_DEVOLUCAO);

let _devRec = null;      // recebimento aberto
let _devAoSalvar = null;

function _montarModalDevolucao() {
  if (document.getElementById('devolucaoModal')) return;
  const div = document.createElement('div');
  div.className = 'modal-overlay';
  div.id = 'devolucaoModal';
  div.innerHTML = `
    <div class="modal modal-lg">
      <div class="modal-header">
        <span id="devTitulo">Registrar devolução</span>
        <button class="modal-close" onclick="fecharModal('devolucaoModal')">×</button>
      </div>
      <div class="modal-body">
        <div id="devItens"></div>

        <div class="form-row col3 mt-3">
          <div>
            <label class="field-label">Motivo</label>
            <select class="select" id="dev-motivo">
              ${MOTIVOS_DEVOLUCAO.map(([v, r]) => `<option value="${v}">${r}</option>`).join('')}
            </select>
          </div>
          <div>
            <label class="field-label">Data da devolução</label>
            <input class="input" id="dev-data" type="date">
          </div>
          <div>
            <label class="field-label">NF de devolução</label>
            <input class="input" id="dev-nf" placeholder="opcional">
          </div>
        </div>

        <label class="field-label mt-2">Observação</label>
        <input class="input" id="dev-obs" placeholder="opcional">

        <label class="ed-checks mt-3" style="display:flex;gap:8px;align-items:center">
          <input type="checkbox" id="dev-recompra" checked>
          Recomprar o que foi devolvido
        </label>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="fecharModal('devolucaoModal')">Cancelar</button>
        <button class="btn btn-gold" id="dev-salvar" onclick="salvarDevolucao()">Registrar</button>
      </div>
    </div>`;
  document.body.appendChild(div);
}

async function abrirDevolucao(recebimentoId, aoSalvar) {
  _montarModalDevolucao();
  _devAoSalvar = aoSalvar || null;

  const { data: rec, error } = await sb.from('recebimentos')
    .select('*, ordens_compra(numero, fornecedor_id, fornecedores(nome)), recebimento_itens(*)')
    .eq('id', recebimentoId).single();
  if (error) { showToast('Erro: ' + error.message, 'error'); return; }

  // O que já foi devolvido antes entra na conta: ninguém pode devolver
  // 5 kg de um item do qual só sobraram 2.
  const { data: jaDev } = await sb.from('devolucoes')
    .select('recebimento_item_id, quantidade').eq('recebimento_id', recebimentoId);
  const devolvido = {};
  (jaDev || []).forEach(d => {
    devolvido[d.recebimento_item_id] = (devolvido[d.recebimento_item_id] || 0) + parseFloat(d.quantidade);
  });

  _devRec = {
    rec,
    itens: (rec.recebimento_itens || [])
      .map(i => ({
        ...i,
        jaDevolvido: devolvido[i.id] || 0,
        disponivel: (parseFloat(i.quantidade_recebida) || 0) - (devolvido[i.id] || 0),
        devolver: '',
      }))
      .filter(i => i.disponivel > 0.0001)
      .sort((a, b) => String(a.item_nome).localeCompare(String(b.item_nome))),
  };

  document.getElementById('devTitulo').textContent =
    'Devolução — ' + fmtPO(rec.ordens_compra?.numero) + ' · ' + (rec.ordens_compra?.fornecedores?.nome || '');
  document.getElementById('dev-data').value = new Date().toISOString().slice(0, 10);
  document.getElementById('dev-nf').value = '';
  document.getElementById('dev-obs').value = '';
  document.getElementById('dev-recompra').checked = true;
  document.getElementById('dev-motivo').value = 'qualidade';

  _renderItensDevolucao();
  abrirModal('devolucaoModal');
}

function _renderItensDevolucao() {
  const cont = document.getElementById('devItens');
  if (!_devRec.itens.length) {
    cont.innerHTML = '<div class="empty-text">Não há saldo para devolver nesta entrega.</div>';
    return;
  }
  cont.innerHTML = `
    <div class="dev-linha dev-cabecalho">
      <div>ITEM</div><div class="right">RECEBIDO</div><div class="right">DEVOLVER</div>
    </div>
    ${_devRec.itens.map((i, n) => `
      <div class="dev-linha">
        <div>${_escEd(i.item_nome)}
          ${i.jaDevolvido ? `<div class="linha-origem">já devolvido: ${i.jaDevolvido}</div>` : ''}
        </div>
        <div class="right">${i.disponivel} ${_escEd(i.item_unidade || '')}</div>
        <input class="po-inp" type="number" step="0.001" min="0" max="${i.disponivel}"
               value="${i.devolver}" placeholder="0"
               onchange="_mudarDevolucao(${n}, this.value)">
      </div>`).join('')}`;
}

function _mudarDevolucao(n, valor) {
  const it = _devRec.itens[n];
  const v = parseFloat(String(valor).replace(',', '.'));
  if (!isNaN(v) && v > it.disponivel) {
    showToast(`Só há ${it.disponivel} ${it.item_unidade || ''} disponível deste item.`, 'error');
    it.devolver = it.disponivel;
    _renderItensDevolucao();
    return;
  }
  it.devolver = isNaN(v) ? '' : v;
}

async function salvarDevolucao() {
  const linhas = _devRec.itens.filter(i => parseFloat(i.devolver) > 0);
  if (!linhas.length) { showToast('Informe a quantidade de ao menos um item.', 'error'); return; }

  const btn = document.getElementById('dev-salvar');
  btn.disabled = true; btn.textContent = 'Registrando...';

  const motivo = document.getElementById('dev-motivo').value;
  const data   = document.getElementById('dev-data').value || new Date().toISOString().slice(0, 10);
  const nf     = document.getElementById('dev-nf').value.trim() || null;
  const obs    = document.getElementById('dev-obs').value.trim() || null;
  const recomprar = document.getElementById('dev-recompra').checked;

  const { error } = await sb.from('devolucoes').insert(linhas.map(i => ({
    recebimento_id:      _devRec.rec.id,
    recebimento_item_id: i.id,
    item_id:             i.item_id,
    item_nome:           i.item_nome,
    item_unidade:        i.item_unidade,
    quantidade:          parseFloat(i.devolver),
    motivo_codigo:       motivo,
    observacao:          obs,
    nota_fiscal_numero:  nf,
    data_devolucao:      data,
    gerou_pendencia:     recomprar,
    registrado_por:      window.state?.perfil?.id ?? null,
  })));

  btn.disabled = false; btn.textContent = 'Registrar';
  if (error) {
    showToast(error.code === 'PGRST204' || error.code === '42P01'
      ? 'Rode a migration 45 para habilitar a devolução.'
      : 'Erro: ' + error.message, 'error');
    return;
  }

  // A devolução vira pendência de recompra, do mesmo jeito que a falta na
  // entrega — quem devolveu continua precisando do produto.
  if (recomprar) {
    const { error: ep } = await sb.from('pendencias_compra').insert(linhas.map(i => ({
      origem_recebimento_id: _devRec.rec.id,
      origem_ordem_id:       _devRec.rec.ordem_id,
      item_id:               i.item_id,
      item_nome:             i.item_nome,
      item_unidade:          i.item_unidade,
      quantidade:            parseFloat(i.devolver),
      fornecedor_id:         _devRec.rec.ordens_compra?.fornecedor_id ?? null,
      motivo_codigo:         motivo === 'excesso' ? 'outro' : motivo,
      observacao:            'Devolvido em ' + data + (obs ? ' — ' + obs : ''),
      criada_por:            window.state?.perfil?.id ?? null,
    })));
    if (ep) showToast('Devolução registrada, mas a recompra não entrou na fila: ' + ep.message, 'error');
  }

  // Uma entrega com devolução é divergente por definição, mesmo que tenha
  // sido aceita limpa na doca.
  if (_devRec.rec.status === 'aceito') {
    await sb.from('recebimentos')
      .update({ status: 'aceito_com_divergencia' }).eq('id', _devRec.rec.id);
  }

  fecharModal('devolucaoModal');
  showToast(`Devolução registrada — ${linhas.length} item(ns).`, 'success');
  if (_devAoSalvar) _devAoSalvar();
}

// Total devolvido por recebimento, para as telas mostrarem o líquido.
async function devolucoesPorRecebimento(ids) {
  if (!ids?.length) return {};
  const { data, error } = await sb.from('devolucoes')
    .select('recebimento_id, quantidade').in('recebimento_id', ids);
  if (error) return {};
  const t = {};
  (data || []).forEach(d => {
    t[d.recebimento_id] = (t[d.recebimento_id] || 0) + parseFloat(d.quantidade);
  });
  return t;
}

function _montarEditorItem() {
  if (document.getElementById('itemEditorModal')) return;
  const div = document.createElement('div');
  div.className = 'modal-overlay';
  div.id = 'itemEditorModal';
  div.innerHTML = `
    <div class="modal modal-lg">
      <div class="modal-header">
        <span>Editar item</span>
        <button class="modal-close" onclick="fecharModal('itemEditorModal')">×</button>
      </div>
      <div class="modal-body">
        <div class="ed-secao">Nome</div>
        <div class="field">
          <label class="field-label">Nome de compra</label>
          <input class="input" id="ed-nome">
        </div>
        <div class="form-row col2 so-gerente">
          <div><label class="field-label">Nome na requisição</label>
            <input class="input" id="ed-curto" placeholder="vazio = usa o nome de compra"></div>
          <div><label class="field-label">Nome no inventário</label>
            <input class="input" id="ed-inv-nome" placeholder="vazio = usa o nome da requisição"></div>
        </div>

        <div class="ed-secao">Cadastro</div>
        <div class="form-row col3">
          <div><label class="field-label">Categoria</label>
            <select class="select" id="ed-cat">
              <option value="proteina">Proteína</option>
              <option value="laticinios">Laticínios</option>
              <option value="hortifruti">Hortifruti</option>
              <option value="diversos">Diversos</option>
            </select></div>
          <div><label class="field-label">Subgrupo na tela de pedido</label>
            <input class="input" id="ed-sub" list="ed-sub-lista"
                   placeholder="vazio = OUTROS">
            <datalist id="ed-sub-lista"></datalist></div>
          <div><label class="field-label">Unidade de compra</label>
            <input class="input" id="ed-unid" placeholder="KG, UN, CX..."></div>
        </div>

        <div class="ed-secao">Fornecedores deste item</div>
        <div id="ed-forn-lista"></div>
        <div class="ed-nota" id="ed-nota-forn"></div>
        <button class="btn btn-sm btn-secondary mt-2" onclick="_edAddFornecedor()">+ Adicionar fornecedor</button>

        <div class="form-row col2 so-gerente">
          <div><label class="field-label">Tipo de aquisição</label>
            <select class="select" id="ed-tipo" onchange="_edSincCheck()">
              <option value="comprado">Comprado</option>
              <option value="transformado">Transformado na cozinha</option>
              <option value="ambos">Ambos</option>
              <option value="externo">Comprado por outra equipe</option>
            </select></div>
          <div></div>
        </div>

        <div class="ed-checks so-gerente">
          <label><input type="checkbox" id="ed-compra" onchange="_edSincTipo()">
            Aparece na lista de compras</label>
          <label><input type="checkbox" id="ed-req"> Aparece na lista de requisição</label>
          <label><input type="checkbox" id="ed-chk"> Entra no checklist da Comissaria</label>
          <label><input type="checkbox" id="ed-inv"> Conta no inventário</label>
        </div>

        <div class="ed-secao so-gerente">Como a cozinha pede</div>
        <div class="form-row col3 so-gerente">
          <div><label class="field-label">Pede por</label>
            <select class="select" id="ed-pede" onchange="_edPedePor()">
              <option value="peso">Peso / unidade simples</option>
              <option value="pacote">Pacote (a Comissaria pesa)</option>
            </select></div>
          <div id="ed-box-rotulo"><label class="field-label">Rótulo do pacote</label>
            <select class="select" id="ed-rotulo">${
              _ROTULOS_PACOTE.map(r => `<option value="${r}">${r}</option>`).join('')}</select></div>
          <div id="ed-box-peso"><label class="field-label">Peso de 1 pacote (kg)</label>
            <input class="input" id="ed-peso" type="number" step="0.001" min="0"
                   placeholder="em branco = o sistema aprende pesando"></div>
        </div>
        <div class="ed-nota so-gerente" id="ed-nota-pacote"></div>

        <div class="ed-secao so-gerente">Aproveitamento — usado no fechamento do inventário</div>
        <div class="form-row col2 so-gerente">
          <div><label class="field-label">Aproveitamento (%)</label>
            <input class="input" id="ed-aprov" type="number" step="1" min="1" max="100"
                   placeholder="62 = sobram 62% do peso comprado"
                   oninput="_edAproveitamento()"></div>
          <div><label class="field-label">Vem de qual item bruto</label>
            <select class="select" id="ed-origem"></select></div>
        </div>
        <div class="ed-nota so-gerente" id="ed-nota-aprov">Deixe em branco quando o item é
          contado do mesmo jeito que é comprado.</div>

      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="fecharModal('itemEditorModal')">Cancelar</button>
        <button class="btn btn-gold" id="ed-salvar" onclick="salvarEditorItem()">Salvar</button>
      </div>
    </div>`;
  document.body.appendChild(div);
}

let _edItem = null, _edAoSalvar = null;

async function abrirEditorItem(itemId, catalogo, aoSalvar) {
  _montarEditorItem();
  const { data, error } = await sb.from('itens').select('*').eq('id', itemId).single();
  if (error) { showToast('Não consegui ler o item: ' + error.message, 'error'); return; }
  _edItem = data; _edAoSalvar = aoSalvar || null;

  // Só o gerente enxerga e edita o que é gestão de cozinha.
  const soGerente = ['gerente_compras', 'master_sistema'].includes(window.state?.perfil?.perfil);
  document.querySelectorAll('#itemEditorModal .so-gerente')
    .forEach(el => el.style.display = soGerente ? '' : 'none');
  const v = (id, val) => document.getElementById(id).value = val ?? '';
  const c = (id, val) => document.getElementById(id).checked = !!val;
  v('ed-nome', data.nome);
  v('ed-curto', data.nome_curto);
  v('ed-inv-nome', data.nome_inventario);
  v('ed-cat', data.categoria || 'proteina');
  v('ed-sub', data.subcategoria);
  v('ed-unid', data.unidade);
  // O subgrupo e o que separa "BOVINOS" de "PESCADOS" na tela de pedido.
  // Digitado livre viraria grupo novo por causa de um acento, entao a lista
  // oferece os que ja existem na mesma categoria.
  const subs = [...new Set((catalogo || [])
    .filter(i => i.categoria === data.categoria && i.subcategoria)
    .map(i => String(i.subcategoria).trim()))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  document.getElementById('ed-sub-lista').innerHTML =
    subs.map(x => `<option value="${_escEd(x)}">`).join('');
  // Preço e prazo são do PAR item + fornecedor, então moram aqui dentro:
  // é a mesma tela onde se decide quem é o principal.
  const { data: vinc } = await sb.from('item_fornecedores')
    .select('id, fornecedor_id, preco_unitario, prazo_entrega_dias, preferencia, fornecedores(nome)')
    .eq('item_id', itemId).eq('ativo', true);

  _edForn = (vinc || []).map(x => ({
    id: x.id,
    fornecedor_id: x.fornecedor_id,
    nome: x.fornecedores?.nome || '(fornecedor removido)',
    preco: x.preco_unitario ?? '',
    prazo: x.prazo_entrega_dias ?? '',
    preferencia: x.preferencia ?? 2,
    remover: false,
    original: {
      preco: x.preco_unitario, prazo: x.prazo_entrega_dias, preferencia: x.preferencia,
    },
  })).sort((a, b) => a.preferencia - b.preferencia || a.nome.localeCompare(b.nome));

  // Lista de fornecedores para o seletor de novos vínculos
  const { data: todosF } = await sb.from('fornecedores')
    .select('id, nome').eq('ativo', true).order('nome');
  _edTodosForn = todosF || [];

  _edRenderForn();

  v('ed-tipo', data.tipo_aquisicao || 'comprado');
  c('ed-req', ehDeRequisicao(data));
  c('ed-compra', ehCompravel(data));
  c('ed-chk', data.no_checklist_estoque);
  c('ed-inv', data.inventario);
  v('ed-pede', data.pede_por === 'pacote' ? 'pacote' : 'peso');
  v('ed-rotulo', rotuloPacote(data));
  v('ed-peso', data.peso_medio_pacote);
  v('ed-aprov', data.aproveitamento_pct);

  // Origem: só itens da MESMA categoria. Um filé de peixe vem de um peixe;
  // oferecer o catálogo inteiro só aumenta a chance de escolher errado.
  const irmaos = (catalogo || [])
    .filter(i => i.id !== data.id && i.categoria === data.categoria)
    .sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
  document.getElementById('ed-origem').innerHTML =
    '<option value="">— nenhum, é o próprio item comprado —</option>'
    + irmaos.map(i => `<option value="${i.id}">${_escEd(i.nome)}</option>`).join('');
  v('ed-origem', data.item_origem_id);

  _edPedePor(); _edAproveitamento();
  abrirModal('itemEditorModal');
}

// ── Fornecedores do item ─────────────────────────────────────────
let _edForn = [];
let _edTodosForn = [];

function _edRenderForn() {
  const cont = document.getElementById('ed-forn-lista');
  const visiveis = _edForn.filter(f => !f.remover);

  if (!visiveis.length) {
    cont.innerHTML = '<div class="empty-text" style="padding:10px">Nenhum fornecedor cadastrado.</div>';
  } else {
    cont.innerHTML = `
      <div class="ed-forn-linha ed-forn-cab">
        <div>FORNECEDOR</div><div class="right">PREÇO UN. (R$)</div>
        <div class="right">PRAZO (DIAS)</div><div>PREFERÊNCIA</div><div></div>
      </div>
      ${_edForn.map((f, n) => f.remover ? '' : `
        <div class="ed-forn-linha">
          <div>${_escEd(f.nome)}</div>
          <input class="po-inp" type="number" step="0.01" min="0" value="${f.preco}"
                 onchange="_edMudarForn(${n},'preco',this.value)">
          <input class="po-inp" type="number" step="1" min="0" value="${f.prazo}"
                 placeholder="padrão" onchange="_edMudarForn(${n},'prazo',this.value)">
          <select class="select" onchange="_edMudarForn(${n},'preferencia',this.value)">
            <option value="1" ${f.preferencia === 1 ? 'selected' : ''}>Principal</option>
            <option value="2" ${f.preferencia === 2 ? 'selected' : ''}>Secundário</option>
            <option value="3" ${f.preferencia === 3 ? 'selected' : ''}>Esporádico</option>
          </select>
          <button class="po-del" title="Tirar este fornecedor do item"
                  onclick="_edMudarForn(${n},'remover',true)">✕</button>
        </div>`).join('')}`;
  }

  const principais = visiveis.filter(f => f.preferencia === 1).length;
  const nota = document.getElementById('ed-nota-forn');
  nota.className = principais > 1 ? 'ed-nota ed-nota-erro' : 'ed-nota';
  nota.textContent = principais > 1
    ? 'Mais de um fornecedor marcado como principal — só um pode ser.'
    : '';
}

function _edMudarForn(n, campo, valor) {
  const f = _edForn[n];
  if (campo === 'preferencia') {
    const novo = parseInt(valor, 10);
    // Principal é exclusivo: marcar um rebaixa o anterior, em vez de deixar
    // dois principais e a PO escolher no sorteio.
    if (novo === 1) _edForn.forEach(o => { if (o !== f && o.preferencia === 1) o.preferencia = 2; });
    f.preferencia = novo;
  } else if (campo === 'remover') {
    f.remover = true;
  } else {
    f[campo] = valor === '' ? '' : parseFloat(String(valor).replace(',', '.'));
  }
  _edRenderForn();
}

function _edAddFornecedor() {
  const jaTem = new Set(_edForn.filter(f => !f.remover).map(f => f.fornecedor_id));
  const livres = _edTodosForn.filter(f => !jaTem.has(f.id));
  if (!livres.length) { showToast('Todos os fornecedores já estão neste item.', 'info'); return; }

  const cont = document.getElementById('ed-forn-lista');
  const div = document.createElement('div');
  div.className = 'ed-forn-linha';
  div.id = 'ed-forn-novo';
  div.innerHTML = `
    <select class="select" id="ed-forn-novo-id">
      ${livres.map(f => `<option value="${f.id}">${_escEd(f.nome)}</option>`).join('')}
    </select>
    <input class="po-inp" type="number" step="0.01" min="0" id="ed-forn-novo-preco" placeholder="preço">
    <input class="po-inp" type="number" step="1" min="0" id="ed-forn-novo-prazo" placeholder="padrão">
    <select class="select" id="ed-forn-novo-pref">
      <option value="1">Principal</option>
      <option value="2" selected>Secundário</option>
      <option value="3">Esporádico</option>
    </select>
    <button class="po-del" onclick="_edConfirmarNovoForn()" title="Incluir">✓</button>`;
  cont.appendChild(div);
  document.getElementById('ed-forn-novo-id').focus();
}

function _edConfirmarNovoForn() {
  const id = document.getElementById('ed-forn-novo-id').value;
  const f = _edTodosForn.find(x => x.id === id);
  if (!f) return;
  const preco = document.getElementById('ed-forn-novo-preco').value;
  const prazo = document.getElementById('ed-forn-novo-prazo').value;
  const pref  = parseInt(document.getElementById('ed-forn-novo-pref').value, 10);

  if (pref === 1) _edForn.forEach(o => { if (o.preferencia === 1) o.preferencia = 2; });
  _edForn.push({
    id: null, fornecedor_id: f.id, nome: f.nome,
    preco: preco === '' ? '' : parseFloat(preco),
    prazo: prazo === '' ? '' : parseInt(prazo, 10),
    preferencia: pref, remover: false, original: null,
  });
  _edRenderForn();
}

// Grava os vínculos. Só toca no que mudou — reescrever tudo carimbaria
// preco_atualizado_em em linha que ninguém editou, e a data do preço é
// exatamente o que a compradora usa para decidir se a referência vale.
async function _edSalvarFornecedores(itemId) {
  const hoje = new Date().toISOString().slice(0, 10);
  const erros = [];

  for (const f of _edForn) {
    const preco = f.preco === '' ? null : f.preco;
    const prazo = f.prazo === '' ? null : f.prazo;

    if (f.remover) {
      if (f.id) {
        const { error } = await sb.from('item_fornecedores').update({ ativo: false }).eq('id', f.id);
        if (error) erros.push(f.nome + ': ' + error.message);
      }
      continue;
    }

    if (!f.id) {
      const { error } = await sb.from('item_fornecedores').insert({
        item_id: itemId, fornecedor_id: f.fornecedor_id,
        preco_unitario: preco, prazo_entrega_dias: prazo,
        preferencia: f.preferencia, ativo: true,
        preco_atualizado_em: preco != null ? hoje : null,
      });
      if (error) erros.push(f.nome + ': ' + error.message);
      continue;
    }

    const mudou = preco !== f.original.preco || prazo !== f.original.prazo
               || f.preferencia !== f.original.preferencia;
    if (!mudou) continue;

    const patch = { preco_unitario: preco, prazo_entrega_dias: prazo, preferencia: f.preferencia };
    if (preco !== f.original.preco && preco != null) patch.preco_atualizado_em = hoje;
    const { error } = await sb.from('item_fornecedores').update(patch).eq('id', f.id);
    if (error) erros.push(f.nome + ': ' + error.message);
  }

  return erros;
}

// Rótulo e peso só existem no regime de pacote.
function _edPedePor() {
  const pac = document.getElementById('ed-pede').value === 'pacote';
  document.getElementById('ed-box-rotulo').style.visibility = pac ? '' : 'hidden';
  document.getElementById('ed-box-peso').style.visibility   = pac ? '' : 'hidden';
  document.getElementById('ed-nota-pacote').textContent = pac
    ? 'Pacote abre dois campos para a Comissaria: quantos pacotes vieram e quanto pesou. '
    + 'Só use quando a cozinha pede embalagem e a entrega é por peso.'
    : '';
}

// O erro que a faixa do banco não pega sozinha: digitar 0,62 achando que é
// fator. Aqui isso vira aviso antes de virar inventário errado.
function _edAproveitamento() {
  const el = document.getElementById('ed-aprov');
  const n = parseFloat(String(el.value).replace(',', '.'));
  const nota = document.getElementById('ed-nota-aprov');
  if (!el.value) {
    nota.className = 'ed-nota';
    nota.textContent = 'Deixe em branco quando o item é contado do mesmo jeito que é comprado.';
  // Piso 1, igual ao do banco: 0,62 é o fator digitado no lugar da
  // porcentagem, e passaria por qualquer teste de "maior que zero".
  } else if (isNaN(n) || n < 1 || n > 100) {
    nota.className = 'ed-nota ed-nota-erro';
    nota.textContent = 'Use a porcentagem inteira, de 1 a 100. 62 quer dizer 62%.';
  } else {
    nota.className = 'ed-nota';
    nota.textContent = `Contou 10 kg deste item? São ${(10 / (n / 100)).toFixed(1)} kg do item bruto — `
      + 'é esse peso que multiplica o preço no fechamento.';
  }
}

// O checkbox e o seletor de tipo descrevem a MESMA regra. Sincronizo os
// dois na tela para nao existir estado impossivel: "Comprado" marcado com
// a caixa de compras desmarcada nao quer dizer nada.
function _edSincTipo() {
  const marcado = document.getElementById('ed-compra').checked;
  const sel = document.getElementById('ed-tipo');
  if (!sel) return;
  if (marcado) {
    // Sai de transformado/externo; 'ambos' ja aparece na compra, entao fica.
    if (sel.value === 'transformado' || sel.value === 'externo') sel.value = 'comprado';
  } else if (sel.value !== 'externo') {
    // Desmarcar num item externo nao o transforma em "feito na cozinha".
    sel.value = 'transformado';
  }
}

function _edSincCheck() {
  const el = document.getElementById('ed-compra');
  if (el) el.checked = !['transformado', 'externo'].includes(document.getElementById('ed-tipo').value);
}

async function salvarEditorItem() {
  if (!_edItem) return;
  const t = id => document.getElementById(id).value.trim();
  const b = id => document.getElementById(id).checked;

  const nome = t('ed-nome');
  if (!nome) { showToast('O nome de compra não pode ficar vazio.', 'error'); return; }

  const pacote = document.getElementById('ed-pede').value === 'pacote';
  const peso   = parseFloat(String(t('ed-peso')).replace(',', '.'));
  const aprov  = t('ed-aprov') ? parseFloat(String(t('ed-aprov')).replace(',', '.')) : null;
  if (aprov != null && (isNaN(aprov) || aprov < 1 || aprov > 100)) {
    showToast('Aproveitamento tem que ser uma porcentagem de 1 a 100. '
            + 'Para 62%, escreva 62 — não 0,62.', 'error'); return;
  }

  const soGerente = ['gerente_compras', 'master_sistema'].includes(window.state?.perfil?.perfil);

  // O comprador manda só nos campos de compra. Os de cozinha nem entram no
  // patch — enviar o valor da tela escondida gravaria o que estava em branco.
  const patch = {
    nome,
    categoria:       document.getElementById('ed-cat').value,
    subcategoria:    t('ed-sub') || null,
    unidade:         t('ed-unid') || _edItem.unidade,
    // Deixa de ser digitado: é o fornecedor marcado como principal na lista.
    fornecedor_principal:
      _edForn.find(f => !f.remover && f.preferencia === 1)?.nome
      ?? _edItem.fornecedor_principal ?? null,
  };

  // Gestão de cozinha — só o gerente escreve. Para o comprador estes campos
  // estão escondidos, e um <input> escondido devolve o valor que estava nele:
  // incluí-los no patch gravaria em branco o que ele nem viu.
  if (soGerente) {
    Object.assign(patch, {
      nome_curto:           t('ed-curto') || null,
      nome_inventario:      t('ed-inv-nome') || null,
      tipo_aquisicao:       document.getElementById('ed-tipo').value || 'comprado',
      req_ativo:            b('ed-req'),
      no_checklist_estoque: b('ed-chk'),
      inventario:           b('ed-inv'),
      pede_por:             pacote ? 'pacote' : 'peso',
      rotulo_pacote:        pacote ? document.getElementById('ed-rotulo').value : _edItem.rotulo_pacote,
      // Fora do regime de pacote o peso médio é inerte — nenhuma tela lê. Não
      // apago: em 9 itens ele foi medido na balança, e apagar medição real
      // para limpar campo que ninguém lê é perda pura.
      peso_medio_pacote: pacote ? (isNaN(peso) || peso <= 0 ? null : peso) : _edItem.peso_medio_pacote,
      aproveitamento_pct: aprov,
      item_origem_id:     document.getElementById('ed-origem').value || null,
      // Editado à mão resolve a ambiguidade que a carga automática deixou.
      req_revisar: false,
    });
  }

  const btn = document.getElementById('ed-salvar');
  btn.disabled = true; btn.textContent = 'Salvando...';
  let { data, error } = await sb.from('itens')
    .update(patch).eq('id', _edItem.id).select().maybeSingle();
  // Sem a migration 44 a coluna tipo_aquisicao nao existe. Grava o resto em
  // vez de recusar o salvamento inteiro por causa de um campo novo.
  if (error && (error.code === 'PGRST204' || error.code === '42703')) {
    const { tipo_aquisicao, ...semTipo } = patch;
    ({ data, error } = await sb.from('itens')
      .update(semTipo).eq('id', _edItem.id).select().maybeSingle());
  }
  btn.disabled = false; btn.textContent = 'Salvar';

  if (error) { showToast(_msgErroEditor(error, patch), 'error'); return; }

  const errosForn = await _edSalvarFornecedores(_edItem.id);
  if (errosForn.length) showToast('Fornecedores: ' + errosForn[0], 'error');
  // A RLS não dá erro em UPDATE bloqueado: devolve zero linhas e a tela
  // acharia que salvou. Quem não pode editar precisa saber disso.
  if (!data) {
    showToast('Seu perfil não tem permissão para editar o catálogo.', 'error');
    return;
  }
  _edItem = data;
  fecharModal('itemEditorModal');
  showToast('Item atualizado.', 'success');
  if (_edAoSalvar) _edAoSalvar(data);
}

function _msgErroEditor(err, patch) {
  const m = err.message || '';
  // Nome repetido: o banco so diz o nome da constraint. Quem esta na tela
  // precisa saber QUAL nome ja esta em uso — senao a mensagem nao ajuda.
  // Nada foi gravado: o UPDATE inteiro foi recusado.
  if (err.code === '23505' && /itens_nome_categoria_key/.test(m)) {
    const cat = _CAT_ITEM[patch?.categoria] || patch?.categoria || '';
    return `Já existe outro item chamado "${patch?.nome}" em ${cat}. `
         + 'Dois itens não podem ter o mesmo nome dentro da mesma categoria. '
         + 'Nada foi alterado — mude o nome ou desative o repetido.';
  }
  if (err.code === 'PGRST204' || err.code === '42703'
      || /aproveitamento_pct|item_origem_id|nome_inventario/.test(m)) {
    return 'Os campos de aproveitamento e nome de inventário ainda não existem no banco — falta rodar a migration 40.';
  }
  if (/itens_aproveitamento_faixa/.test(m)) return 'Aproveitamento tem que ficar entre 1% e 100%.';
  if (/itens_origem_nao_circular/.test(m)) return 'O item não pode vir dele mesmo.';
  return 'Erro: ' + m;
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

// =====================================================================
// QUANTIDADE PARA O INVENTÁRIO
// =====================================================================
// O relatório alimenta o inventário, e inventário se mede em PESO. Um item
// pedido em pacote tem duas grandezas na mesma linha:
//
//   pacotes_entregues   3 PCT     <- controle de separação, NÃO é estoque
//   quantidade_entregue 0,21 kg   <- isto é o que entra no inventário
//
// Somar "3" junto com quilos na mesma coluna foi o que fez o relatório
// mostrar 3 unidades de hambúrguer kids onde havia 210 gramas. Some
// pacote com quilo e o total não significa nada.
//
// A exceção são os itens que a Comissaria conta e entrega em unidade
// mesmo (iogurte 170 g, ovo, tablete de manteiga): esses continuam em UN,
// porque é assim que o inventário os conta.
//
// O SISTEMA NÃO ESTIMA. Decisão do Fernando em 2026-08-16: a resposta da
// Comissaria é sempre o peso pesado, e o relatório mostra esse peso ou não
// mostra nada. Cheguei a implementar a conversão por peso médio da
// embalagem e tirei — um número calculado no meio de uma coluna de números
// medidos é indistinguível deles, e essa coluna vira inventário e depois
// vira valor para a auditoria. Falta de peso tem que aparecer como falta.
//
// Devolve { qtd, unidade, semPeso }.

// Mes corrente pelo relogio LOCAL, nao pelo UTC.
// toISOString() converte para UTC antes de formatar: as 21h de 31/08 em
// Brasilia ja e 01/09 em Londres, e a tela abriria setembro. Como a
// contagem do mes acontece justamente na virada, o erro so apareceria na
// pior noite possivel.
function mesCorrente() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString().slice(0, 7);
}

function qtdInventario(it) {
  const pacote = it?.pedido_por === 'pacote' || it?.pede_por === 'pacote';
  const entregue = it?.quantidade_entregue;

  if (!pacote) {
    const q = entregue != null ? parseFloat(entregue)
            : parseFloat(it?.quantidade_solicitada ?? 0);
    return { qtd: q || 0, unidade: it?.item_unidade || it?.unidade || '', semPeso: false };
  }

  const un = unidadePeso(it);
  if (entregue != null) return { qtd: parseFloat(entregue) || 0, unidade: un, semPeso: false };

  // Pedido em pacote e ninguém pesou: a quantidade é desconhecida. Devolver
  // a contagem de pacotes somaria pacote com quilo na mesma coluna, que foi
  // o que fez 3 pacotes de hambúrguer kids virarem "3" no relatório.
  return { qtd: 0, unidade: un, semPeso: true };
}

// Peso que não faz sentido nenhum para a linha. Devolve o texto do aviso,
// ou '' quando está tudo bem. Não bloqueia — confirma: peso de verdade
// varia muito, e travar a Comissaria numa entrega legítima é pior.
//
// Duas peneiras, porque foram dois erros diferentes de digitação:
//   fator 1000  grama digitada no campo de quilo (avocado 0,3 -> 660)
//   fora de faixa  qualquer coisa acima de 2 toneladas numa requisição
function pesoAbsurdo(item, entrega) {
  const peso = parseFloat(entrega?.qtdEntregue);
  if (!(peso > 0)) return '';

  if (peso > 2000) {
    return `O peso informado foi ${peso.toLocaleString('pt-BR')} kg. `
         + 'Uma requisição de cozinha não chega a isso.';
  }
  const pm = parseFloat(item?.peso_medio_pacote ?? 0) || 0;
  const pct = parseFloat(entrega?.pacotesEntregues ?? entrega?.pedido ?? 0) || 0;
  if (pm > 0 && pct > 0) {
    const esperado = pm * pct;
    if (peso > esperado * 20) {
      return `O peso informado foi ${peso.toLocaleString('pt-BR')} kg, mas ${pct} `
           + `embalagem(ns) deste item pesa(m) por volta de `
           + `${esperado.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} kg. `
           + 'Confira se o valor não foi digitado em gramas.';
    }
  }
  const pedido = parseFloat(entrega?.pedido ?? 0) || 0;
  if (!pm && pedido > 0 && peso > pedido * 100) {
    return `Pediram ${pedido} e o peso informado foi `
         + `${peso.toLocaleString('pt-BR')} kg. Confira se não está em gramas.`;
  }
  return '';
}

// "≈ 4,4 kg". Devolve vazio quando ninguém informou nem pesou ainda —
// é melhor não mostrar estimativa nenhuma do que mostrar uma inventada.
//
// DESLIGADA em 19/09/2026, decisão do Fernando (DECISOES_PENDENTES G2):
// agosto, o primeiro mês de operação, teve muitas pesagens erradas, e a
// média aprendida com elas não é confiável. O sistema continua aprendendo
// (registrar_peso_pacote) e as pesagens brutas ficam em requisicao_itens;
// para religar, recalcular a média só a partir de setembro e trocar
// MOSTRAR_ESTIMATIVA_PESO para true. Lembrete agendado para dezembro.
const MOSTRAR_ESTIMATIVA_PESO = false;
function estimativaPeso(qtd, pesoMedio, unidade) {
  if (!MOSTRAR_ESTIMATIVA_PESO) return '';
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
// DATA AINDA SENDO DIGITADA
// =====================================================================
// Num <input type="date">, o navegador dispara change a cada segmento que
// a pessoa completa — inclusive com o ano pela metade. Se o handler grava e
// redesenha a tela, o campo é recriado no meio da digitação e a pessoa nunca
// termina de escrever o ano. Foi o que aconteceu na validade do recebimento
// e de novo na validade da proposta, na cotação.
//
// A regra é simples: enquanto o ano não fizer sentido, ignore o evento.
function dataIncompleta(iso) {
  const ano = parseInt(String(iso || '').slice(0, 4), 10);
  return !ano || ano < 1900;
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

// =====================================================================
// TIMELINE DO ITEM — onde o pedido está, sem precisar perguntar
// =====================================================================
// Hoje quem quer saber onde está o pedido pergunta para alguém, e a
// resposta some quando a conversa acaba. A timeline responde sozinha.
//
// Fica ABAIXO da tabela, não como linha dela: no celular a tabela vira
// card, e uma linha de colspan quebraria o layout — e a checagem de
// consistência de tabela, que compara <th> com <td>.
//
// O conteúdo vem inteiro do servidor (migration 47). A tela não decide o
// que mostrar nem calcula etapa: recebe a lista pronta e desenha. É o que
// garante que preço não apareça — não é a tela que esconde, é o servidor
// que não manda.

const _ICONE_TIMELINE = { true: '●', false: '✕', null: '○' };

async function abrirTimelineItem(sb, tipo, itemId, botao) {
  const alvo = document.getElementById('timelineItem');
  if (!alvo) return;

  // Segundo clique no mesmo item fecha — é o que a pessoa espera.
  if (alvo.dataset.itemId === itemId && alvo.innerHTML.trim()) {
    alvo.innerHTML = ''; alvo.dataset.itemId = '';
    document.querySelectorAll('.linha-item-detalhe.aberta').forEach(l => l.classList.remove('aberta'));
    return;
  }
  document.querySelectorAll('.linha-item-detalhe.aberta').forEach(l => l.classList.remove('aberta'));
  botao?.closest('.linha-item-detalhe')?.classList.add('aberta');

  alvo.dataset.itemId = itemId;
  alvo.innerHTML = '<div class="loading-text">Carregando o caminho deste item...</div>';

  const fn = tipo === 'req' ? 'timeline_item_requisicao' : 'timeline_item_compra';
  const { data, error } = await sb.rpc(fn, { p_item_id: itemId });

  if (error) {
    // Sem a migration 47 a função não existe. Diz isso em vez de mostrar
    // um erro de banco que ninguém na cozinha sabe interpretar.
    const faltaFn = error.code === 'PGRST202' || /timeline_item/.test(error.message || '');
    alvo.innerHTML = `<div class="aviso aviso-warn">${faltaFn
      ? 'O acompanhamento do item ainda não foi habilitado no banco (migration 47).'
      : 'Não consegui carregar: ' + _esc(error.message)}</div>`;
    return;
  }
  if (data?.erro) { alvo.innerHTML = `<div class="aviso aviso-warn">${_esc(data.erro)}</div>`; return; }

  const eventos = data?.eventos || [];
  alvo.innerHTML = `
    <div class="section-title mt-3"><span>Onde está: ${_esc(data.item)}</span></div>
    <div class="timeline">
      ${eventos.map(e => {
        const estado = e.ok === true ? 'feito' : e.ok === false ? 'ruim' : 'esperando';
        const quando = e.em ? _dataHoraCurta(e.em) : '';
        return `
          <div class="tl-linha ${estado}${e.atual ? ' atual' : ''}">
            <div class="tl-marca">${_ICONE_TIMELINE[String(e.ok)]}</div>
            <div class="tl-texto">
              <div class="tl-rotulo">${_esc(e.rotulo)}${
                e.atual ? '<span class="tl-agora">agora</span>' : ''}</div>
              ${e.detalhe ? `<div class="tl-detalhe">${_esc(e.detalhe)}</div>` : ''}
            </div>
            <div class="tl-quando">${quando}${
              e.aproximado ? '<br><span class="tl-aprox">aprox.</span>' : ''}</div>
          </div>`;
      }).join('')}
    </div>`;
}

// Data curta para a timeline: dia/mês e hora quando é timestamp, só
// dia/mês quando é date. Ano só aparece se não for o ano corrente —
// numa lista de etapas o ano repetido é ruído.
function _dataHoraCurta(v) {
  if (!v) return '';
  const soData = /^\d{4}-\d{2}-\d{2}$/.test(String(v));
  const d = new Date(soData ? v + 'T12:00:00' : v);
  if (isNaN(d)) return '';
  const ano = d.getFullYear() !== new Date().getFullYear() ? '/' + String(d.getFullYear()).slice(2) : '';
  const dm = String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + ano;
  return soData ? dm : dm + '<br><span class="tl-hora">' +
    String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') + '</span>';
}

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

// ── Quem pediu ──────────────────────────────────────────────────────────
// O embed `usuarios!..._usuario_id_fkey(nome)` volta NULL pra todo mundo que
// não é gerente: o RLS de `usuarios` só libera a própria linha. Quem precisa
// ver o autor é justamente a Comissaria. A view v_autores (migration 35) tem
// nome e perfil, sem e-mail, e é legível por qualquer perfil logado.
let _autores = null;

async function carregarAutores(sb) {
  if (_autores) return _autores;
  const { data, error } = await sb.from('v_autores').select('id,nome,perfil');
  // Sem a migration 35 a view não existe — degrada pra "—" em vez de quebrar
  _autores = new Map((error ? [] : data).map(u => [u.id, u]));
  return _autores;
}

function nomeAutor(usuarioId) {
  return _autores?.get(usuarioId)?.nome || '';
}

// "Fulano" ou "Fulano (Chef)" — o perfil separa o pedido do cozinheiro do que
// o Chef ou a Comissaria lançou em nome do PDV
const _ROTULO_PERFIL = { executivo: 'Chef', gerente_compras: 'Gerente', estoque: 'Comissária', pdv: 'Cozinheiro' };

function autorComPerfil(usuarioId) {
  const u = _autores?.get(usuarioId);
  if (!u) return '';
  const r = _ROTULO_PERFIL[u.perfil];
  return u.nome + (r ? ' (' + r + ')' : '');
}

async function verSolicitacaoCompra(sb, id) {
  abrirDetalhe('Carregando...', null);
  await carregarAutores(sb);
  const { data: s, error } = await sb.from('solicitacoes_compra')
    .select(`*, pdvs(nome), solicitacao_compra_itens(*, itens(fornecedor_principal))`)
    .eq('id', id).single();
  if (error) { abrirDetalhe('Erro', '<div class="empty-text">' + _esc(error.message) + '</div>'); return; }

  const itens = (s.solicitacao_compra_itens || [])
    .sort((a, b) => a.item_nome.localeCompare(b.item_nome));
  const atendidos = itens.filter(i => i.ordem_compra_id).length;

  abrirDetalhe(
    'Solicitação de compra — ' + (s.pdvs?.nome || ''),
    `<div class="email-campo"><b>Situação</b><span>${LABEL_STATUS_SOLC[s.status] || s.status}</span></div>
     <div class="email-campo"><b>Criada</b><span>${new Date(s.created_at).toLocaleString('pt-BR')}${
       autorComPerfil(s.usuario_id) ? ' por ' + _esc(autorComPerfil(s.usuario_id)) : ''}</span></div>
     <div class="email-campo"><b>Entra na lista de</b><span>${_data(s.data_competencia)}${
       s.data_entrega_desejada ? ' · entrega pedida ' + _data(s.data_entrega_desejada) : ''}</span></div>
     ${atendidos ? `<div class="email-campo"><b>Compra</b><span>${atendidos} de ${itens.length}
       item(ns) já em ordem de compra</span></div>` : ''}
     ${s.observacao ? `<div class="obs-box mt-2">${_esc(s.observacao)}</div>` : ''}
     ${s.motivo_rejeicao ? `<div class="aviso aviso-warn mt-2">Rejeitada — ${
       _esc(s.motivo_rejeicao)}</div>` : ''}

     <div class="section-title mt-3"><span>Itens (${itens.length})</span>
       <span class="text-muted" style="font-size:11px">clique no item para ver onde ele está</span></div>
     <table class="data-table tabela-cards">
       <thead><tr><th>Item</th><th>Categoria</th><th>Fornecedor</th>
         <th class="num">Quantidade</th><th>Comentário</th></tr></thead>
       <tbody>${itens.map(i => `<tr class="linha-item-detalhe"
           onclick="abrirTimelineItem(sb,'compra','${i.id}',this)">
         <td class="td-titulo">${_esc(i.item_nome)}</td>
         <td data-label="Categoria">${_esc(i.item_categoria || '—')}</td>
         <td data-label="Fornecedor">${_esc(i.itens?.fornecedor_principal || '—')}</td>
         <td class="num" data-label="Quantidade">${_qtd(i.quantidade_solicitada)} ${_esc(i.item_unidade || '')}</td>
         <td data-label="Comentário">${_esc(i.comentario || '—')}</td>
       </tr>`).join('')}</tbody>
     </table>
     <div id="timelineItem"></div>`
  );
}

// =====================================================================
// CORRIGIR O PESO DE UMA ENTREGA JÁ REGISTRADA
// =====================================================================
// Um dígito errado na balança contamina o relatório, que vira inventário,
// que vira valor para a auditoria. Antes disso o único conserto era
// cancelar a requisição e refazer — jogando fora o histórico de quem
// pediu e quando por causa de um número.
//
// Quem corrige: a Comissaria (pesou) e o gerente (fecha o mês e vê o erro
// no relatório). O PDV não — ele não estava na balança.
//
// A correção nunca é silenciosa: guarda o peso anterior, quem mudou,
// quando e por quê. Número que muda sem rastro é o que a auditoria recusa.

const _PERFIS_CORRIGEM_PESO = ['estoque', 'gerente_compras', 'master_sistema'];

function podeCorrigirPeso() {
  const p = window.state?.perfil?.perfil;
  return _PERFIS_CORRIGEM_PESO.includes(p);
}

function _montarModalPeso() {
  if (document.getElementById('pesoModal')) return;
  const d = document.createElement('div');
  d.className = 'modal-overlay';
  d.id = 'pesoModal';
  d.innerHTML = `
    <div class="modal" style="width:480px">
      <div class="modal-header">
        <span>Corrigir peso entregue</span>
        <button class="modal-close" onclick="fecharModal('pesoModal')">×</button>
      </div>
      <div class="modal-body">
        <div class="ed-secao" id="pk-item"></div>
        <div class="form-row col2">
          <div><label class="field-label">Peso registrado</label>
            <input class="input" id="pk-antes" disabled></div>
          <div><label class="field-label">Peso correto</label>
            <input class="input" id="pk-novo" type="number" step="0.001" min="0" autofocus></div>
        </div>
        <label class="field-label">Por que está sendo corrigido</label>
        <select class="select" id="pk-motivo">
          <option value="Erro de digitação na pesagem">Erro de digitação na pesagem</option>
          <option value="Peso informado em gramas no lugar de quilos">Peso informado em gramas no lugar de quilos</option>
          <option value="Peso lançado na linha do item errado">Peso lançado na linha do item errado</option>
          <option value="Repesagem após a entrega">Repesagem após a entrega</option>
          <option value="outro">Outro — descrever abaixo</option>
        </select>
        <input class="input mt-2" id="pk-obs" placeholder="detalhe (opcional)">
        <div class="ed-nota mt-2">
          O peso anterior fica guardado junto com seu nome e a data. A correção
          aparece no detalhe da requisição e no relatório do mês.
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="fecharModal('pesoModal')">Cancelar</button>
        <button class="btn btn-gold" id="pk-salvar" onclick="salvarCorrecaoPeso()">Salvar correção</button>
      </div>
    </div>`;
  document.body.appendChild(d);
}

let _pkCtx = null;

function corrigirPeso(sb, itemId, nome, pesoAtual, unidade, reqId) {
  _montarModalPeso();
  _pkCtx = { sb, itemId, reqId };
  document.getElementById('pk-item').textContent = nome;
  document.getElementById('pk-antes').value = pesoAtual + ' ' + (unidade || '');
  document.getElementById('pk-novo').value = '';
  document.getElementById('pk-obs').value = '';
  abrirModal('pesoModal');
  setTimeout(() => document.getElementById('pk-novo')?.focus(), 60);
}

async function salvarCorrecaoPeso() {
  if (!_pkCtx) return;
  const novo = parseFloat(String(document.getElementById('pk-novo').value).replace(',', '.'));
  if (isNaN(novo) || novo < 0) {
    showToast('Informe o peso correto.', 'error'); return;
  }
  const sel = document.getElementById('pk-motivo').value;
  const obs = document.getElementById('pk-obs').value.trim();
  if (sel === 'outro' && !obs) {
    showToast('Descreva o motivo da correção.', 'error'); return;
  }
  const motivo = (sel === 'outro' ? obs : sel + (obs ? ' — ' + obs : ''));

  const btn = document.getElementById('pk-salvar');
  btn.disabled = true; btn.textContent = 'Salvando...';
  const { sb, itemId, reqId } = _pkCtx;

  // Lê o peso atual na hora de gravar, não o que estava na tela: entre
  // abrir o modal e salvar, outra pessoa pode ter corrigido.
  const { data: atual, error: e0 } = await sb.from('requisicao_itens')
    .select('quantidade_entregue, peso_anterior').eq('id', itemId).single();
  if (e0) { btn.disabled = false; btn.textContent = 'Salvar correção';
            showToast('Erro: ' + e0.message, 'error'); return; }

  const { data, error } = await sb.from('requisicao_itens').update({
    quantidade_entregue: novo,
    // A primeira correção guarda o original. As seguintes preservam ele —
    // o que interessa à auditoria é de onde o número partiu.
    peso_anterior: atual.peso_anterior ?? atual.quantidade_entregue,
    corrigido_por: window.state?.perfil?.id ?? null,
    corrigido_em: new Date().toISOString(),
    motivo_correcao: motivo,
  }).eq('id', itemId).select('id').maybeSingle();

  btn.disabled = false; btn.textContent = 'Salvar correção';
  if (error) {
    showToast(error.code === 'PGRST204' || error.code === '42703'
      ? 'A correção de peso ainda não existe no banco — falta rodar a migration 41.'
      : 'Erro: ' + error.message, 'error');
    return;
  }
  if (!data) { showToast('Seu perfil não pode corrigir peso de entrega.', 'error'); return; }

  fecharModal('pesoModal');
  showToast('Peso corrigido.', 'success');
  if (reqId) verRequisicaoInterna(sb, reqId);
}

async function verRequisicaoInterna(sb, id) {
  abrirDetalhe('Carregando...', null);
  await carregarAutores(sb);
  const { data: r, error } = await sb.from('requisicoes')
    .select('*, pdvs(nome), requisicao_itens(*)')
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
       autorComPerfil(r.usuario_id) ? ' por ' + _esc(autorComPerfil(r.usuario_id)) : ''}</span></div>
     ${r.entregue_em ? `<div class="email-campo"><b>Entregue</b><span>${
       new Date(r.entregue_em).toLocaleString('pt-BR')}</span></div>` : ''}
     ${r.observacao ? `<div class="obs-box mt-2">${_esc(r.observacao)}</div>` : ''}
     ${r.motivo_cancelamento ? `<div class="aviso aviso-warn mt-2">Cancelada — ${
       _esc(r.motivo_cancelamento)}</div>` : ''}

     <div class="section-title mt-3"><span>Itens (${itens.length})</span>
       <span class="text-muted" style="font-size:11px">clique no item para ver onde ele está</span></div>
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
         return `<tr class="linha-item-detalhe" onclick="abrirTimelineItem(sb,'req','${i.id}',this)">
           <td class="td-titulo">${_esc(i.item_nome)}${pct ? ` <span class="pct-badge">por ${rot}</span>` : ''}${
             i.comentario ? `<span class="item-obs">${_esc(i.comentario)}</span>` : ''}${
             // A Comissaria trocou o item (migration 74): quem pediu vê o que
             // pediu, quem trocou e por quê.
             i.trocado_em ? `<span class="item-obs" style="color:var(--orange)">pediu ${_esc(i.item_nome_original || 'item livre')}${
               i.quantidade_original != null ? ' ' + _qtd(i.quantidade_original) + ' ' + _esc(i.unidade_original || '') : ''} · trocado${
               autorComPerfil(i.trocado_por) ? ' por ' + _esc(autorComPerfil(i.trocado_por)) : ''} · ${_esc(i.motivo_troca || '')}</span>` : ''}</td>
           <td data-label="Categoria">${_esc(i.item_categoria || '—')}</td>
           <td class="num" data-label="Pedido">${_qtd(i.quantidade_solicitada)} ${pct ? rot : un}${
             pct && est ? `<br><span class="est-peso">${est}</span>` : ''}</td>
           ${entregue ? `
             <td class="num" data-label="Entregue">${pct
               // O PESO é a resposta da Comissaria; o pacote é o controle de
               // separação. Estava invertido: o pacote vinha grande e o peso
               // em letra pequena, dando a entender que ela tinha respondido
               // em pacotes — o que ela nunca pode fazer.
               ? (i.quantidade_entregue != null
                   ? `<span class="${falta > 0.0001 ? 'text-error' : ''}">${_qtd(i.quantidade_entregue)} ${uPeso}</span>${
                       i.pacotes_entregues != null
                         ? `<br><span class="est-peso">${_qtd(i.pacotes_entregues)} ${rot} separados</span>`
                         : ''}`
                   : `<span class="text-error">não pesado</span>${
                       i.pacotes_entregues != null
                         ? `<br><span class="est-peso">${_qtd(i.pacotes_entregues)} ${rot} separados</span>`
                         : ''}`)
               : (i.quantidade_entregue != null
                   ? `<span class="${falta > 0.0001 ? 'text-error' : ''}">${_qtd(i.quantidade_entregue)} ${un}</span>`
                   : '—')}${
               // Trilha da correção: fica à vista de quem abre a requisição,
               // e é o que a auditoria precisa ver quando o número mudou.
               i.corrigido_em ? `<br><span class="est-peso" title="${_esc(i.motivo_correcao || '')}">corrigido de ${
                 _qtd(i.peso_anterior)} · ${_esc(autorComPerfil(i.corrigido_por) || 'sistema')}</span>` : ''}${
               podeCorrigirPeso() && i.quantidade_entregue != null
                 ? `<br><button class="btn btn-sm btn-outline" style="font-size:10px;padding:2px 7px;margin-top:4px"
                      onclick="event.stopPropagation();corrigirPeso(sb,'${i.id}','${_esc(i.item_nome).replace(/'/g, "\\'")}',${
                        i.quantidade_entregue},'${pct ? uPeso : un}','${r.id}')">corrigir peso</button>` : ''}</td>
             <td data-label="Divergência">${i.motivo_divergencia
               ? '<span class="text-error">' + _esc(i.motivo_divergencia) + '</span>'
               : '<span class="text-muted">—</span>'}</td>` : ''}
         </tr>`;
       }).join('')}</tbody>
     </table>
     ${await _insumosDaRequisicaoHtml(sb, itens)}
     <div id="timelineItem"></div>`
  );
}

// Ingredientes que a ficha carregou em cada produto da Comissaria desta
// requisição (migration 69). Fechado por padrão: quem abre a requisição
// quer ver primeiro o que foi pedido; o detalhe da receita é para quem
// precisa entender o custo.
async function _insumosDaRequisicaoHtml(sb, itens) {
  const ids = itens.map(i => i.id);
  if (!ids.length) return '';
  const { data, error } = await sb.from('requisicao_item_insumos')
    .select('requisicao_item_id, item_id, descricao, quantidade, unidade, custeavel, ficha_nome, ficha_versao, produto_kg, ordem, itens(nome)')
    .in('requisicao_item_id', ids).order('ordem');
  if (error || !data || !data.length) {
    // Quem não é do PDV da ficha não vê a receita (migration 71), mas o chef
    // de outra cozinha e o gerente continuam precisando do custo da linha.
    if (!perfilVePreco()) return '';
    const custos = await custosPelaFicha(sb, ids);
    const comCusto = itens.filter(i => custos[i.id]);
    if (!comCusto.length) return '';
    const fmtR = v => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return `<div class="section-title mt-3"><span>Custo pela ficha técnica</span></div>
      <table class="data-table tabela-cards">
        <thead><tr><th>Produto</th><th class="num">Custo dos ingredientes</th></tr></thead>
        <tbody>${comCusto.map(i => {
          const c = custos[i.id], pend = c.semPreco + c.abertos;
          return `<tr><td class="td-titulo">${_esc(i.item_nome)}</td>
            <td class="num" data-label="Custo">${fmtR(c.valor)}${
              pend ? `<br><span class="ficha-tag parcial">parcial — ${pend} sem valor</span>` : ''}</td></tr>`;
        }).join('')}</tbody>
      </table>`;
  }

  const vePreco = perfilVePreco();
  let precos = {};
  if (vePreco) {
    const itIds = [...new Set(data.map(x => x.item_id).filter(Boolean))];
    const { data: pr } = await sb.from('precos').select('item_id, preco_unitario')
      .eq('vigente', true).in('item_id', itIds);
    precos = Object.fromEntries((pr || []).map(p => [p.item_id, parseFloat(p.preco_unitario) || 0]));
  }
  const fmtR = v => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  // Ingrediente vem com 4 casas do banco; na tela, 3 bastam (grama).
  const fmtQ = v => Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 3 });

  const porLinha = {};
  data.forEach(x => { (porLinha[x.requisicao_item_id] ||= []).push(x); });

  return `<div class="section-title mt-3"><span>Ingredientes pela ficha técnica</span></div>`
    + itens.filter(i => porLinha[i.id]).map(i => {
      const ins = porLinha[i.id];
      const c = custoPelaFicha(ins, id => precos[id]);
      const parcial = c.semPreco + c.abertos;
      return `<details class="req-insumos">
        <summary><strong>${_esc(i.item_nome)}</strong>
          <span class="text-muted">· ficha ${_esc(ins[0].ficha_nome || '')}${
            ins[0].ficha_versao ? ' v' + ins[0].ficha_versao : ''} · ${fmtQ(ins[0].produto_kg)} kg${
            vePreco ? ` · custo ${fmtR(c.valor)}${parcial ? ` (parcial: ${parcial} sem valor)` : ''}` : ''}</span>
        </summary>
        <table class="data-table tabela-cards">
          <thead><tr><th>Ingrediente</th><th class="num">Quantidade</th>${vePreco ? '<th class="num">Custo</th>' : ''}</tr></thead>
          <tbody>${ins.map(x => {
            const aberto = !x.item_id || x.quantidade == null;
            const p = precos[x.item_id];
            return `<tr>
              <td class="td-titulo">${_esc(x.itens?.nome || x.descricao || '—')}${
                aberto ? ' <span class="ft-tag ft-tag-aberto">em aberto</span>' : ''}</td>
              <td class="num" data-label="Quantidade">${x.quantidade == null ? '—' : fmtQ(x.quantidade) + ' ' + _esc(x.unidade || '')}</td>
              ${vePreco ? `<td class="num" data-label="Custo">${
                aberto ? '<span class="text-muted">—</span>'
                : x.custeavel && p > 0 ? fmtR(x.quantidade * p)
                : '<span class="text-muted">sem preço</span>'}</td>` : ''}
            </tr>`;
          }).join('')}</tbody>
        </table>
      </details>`;
    }).join('');
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

// =====================================================================
// INVENTÁRIO — a contagem no celular
// =====================================================================
// Substitui imprimir 725 linhas, preencher à mão e redigitar. Mora aqui
// porque roda em duas telas: o chef conta pelo executivo.html e o
// cozinheiro pelo pdv.html — desde a migration 53 as duas coisas valem em
// todas as cozinhas. Duplicar isso em dois arquivos garantiria que um
// ficasse para trás do outro.
//
// A contagem é CEGA: nada de contagem anterior nem saldo teórico na tela.
// O inventário existe para achar a diferença; mostrar o número esperado
// ancora quem conta e a diferença some.
//
// Decisão do Fernando em 2026-08-25: item que ninguém contou é item que a
// cozinha não tem. Por isso não existe botão de "zero" — deixar em branco
// já diz isso, e pedir o gesto extra em 700 itens tornaria a contagem
// impraticável. O banco continua sabendo distinguir (contagem existe ou
// não existe), o que preserva a informação se um dia a regra mudar.
//
//   montarInventario('#invRoot', { pdvId, pdvNome, competencia })

const _INV = {
  raiz: null, pdvId: null, pdvNome: '', competencia: null,
  inventarioId: null, status: 'aberto', concluido: false, livres: [],
  linhas: [],          // linhas da planilha do financeiro
  producoes: [],       // itens de produção do açougue (aba 2)
  contagem: new Map(), // chave -> { id, qtd }
  commodity: null,     // filtro atual
  busca: '',
  salvando: new Set(),
};

const _invChave = (l) => (l.linha_id ? 'L' + l.linha_id : 'I' + l.item_id);

// Os campos de quantidade são type="text", não type="number", e é de
// propósito: <input type="number"> RECUSA vírgula. Quem digita "1,8" no
// celular em português vê o campo esvaziar sem aviso nenhum. Aqui a
// validação é nossa, e aceita vírgula e ponto.
function _invNum(v) {
  const t = String(v == null ? '' : v).trim().replace(',', '.');
  if (t === '') return null;
  if (!/^[0-9]+(.[0-9]+)?$/.test(t)) return null;
  const n = parseFloat(t);
  return isNaN(n) || n < 0 ? null : n;
}

async function montarInventario(seletor, opts) {
  const raiz = typeof seletor === 'string' ? document.querySelector(seletor) : seletor;
  if (!raiz) return;
  _INV.raiz = raiz;
  _INV.pdvId = opts.pdvId;
  _INV.pdvNome = opts.pdvNome || '';
  // O inventário é do mês CORRENTE: conta-se no dia 30 o estoque de
  // agosto, e isso é o inventário de agosto. Não confundir com o
  // fechamento da requisição, que é do mês que terminou — copiei essa
  // regra de lá por engano e a primeira contagem de teste caiu em julho.
  // Quem conta no dia 1º ou 2 troca o mês no seletor do cabeçalho.
  _INV.competencia = opts.competencia || (mesCorrente() + '-01');

  raiz.innerHTML = '<div class="loading-text">Abrindo a contagem...</div>';

  const { data: inv, error: eI } = await sb.rpc('abrir_inventario',
    { p_pdv_id: _INV.pdvId, p_competencia: _INV.competencia });
  if (eI) {
    // Quem lê isto está de pé na câmara com o celular na mão. A frase tem
    // que dizer o que fazer; o texto do Postgres fica embaixo, pequeno,
    // para quando a pessoa mandar print pra mim.
    const m = String(eI.message || '');
    const humano =
      /schema cache|does not exist/i.test(m) ? 'O inventário ainda não foi liberado neste sistema. Avise o gerente de compras.'
      : /permiss|denied|policy/i.test(m)     ? 'Seu usuário não conta a câmara desta cozinha.'
      : !navigator.onLine                     ? 'Sem internet. A contagem abre assim que a conexão voltar.'
      : 'Não consegui abrir a contagem deste mês.';
    raiz.innerHTML =
      '<div class="empty-text">' + escapeHtml(humano) + '</div>'
      + '<div class="text-muted" style="font-size:11px;text-align:center;margin-top:6px">'
      + escapeHtml(m) + '</div>';
    return;
  }
  _INV.inventarioId = inv.id;
  _INV.status = inv.status;
  _INV.concluido = !!inv.concluido_em;

  // Linhas da planilha ativa, na ordem dela — é a ordem da prateleira que
  // a equipe já usa no papel.
  let linhas = [];
  for (let i = 0; i < 4000; i += 1000) {
    const { data } = await sb.from('planilha_modelo_linhas')
      .select('id, linha, nome, commodity, uom')
      .eq('modelo_id', inv.modelo_id).order('linha').range(i, i + 999);
    if (!data || !data.length) break;
    linhas = linhas.concat(data);
  }
  _INV.linhas = linhas.map(l => ({ ...l, linha_id: l.id, item_id: null }));

  _INV.producoes = await _invCarregarProducoes();

  const { data: cont } = await sb.from('inventario_contagens')
    .select('id, linha_id, item_id, quantidade').eq('inventario_id', inv.id);
  _INV.contagem = new Map((cont || []).map(c =>
    [_invChave(c), { id: c.id, qtd: parseFloat(c.quantidade) }]));

  await _invCarregarLivres();

  _INV.commodity = null;
  _INV.busca = '';
  _invRender();
}

// As produções do açougue não têm linha entre os 725 itens da planilha —
// o lugar delas é a aba 2, por receita. Aqui elas aparecem como itens
// nossos, e a exportação soma os que caem na mesma receita.
async function _invCarregarProducoes() {
  const { data: mod } = await sb.from('planilha_modelos')
    .select('id').eq('tipo', 'receitas').eq('ativo', true).maybeSingle();
  if (!mod) return [];
  const { data: lin } = await sb.from('planilha_modelo_linhas')
    .select('id, linha, nome').eq('modelo_id', mod.id).order('linha');
  const { data: lig } = await sb.from('planilha_receita_itens')
    .select('linha_id, item_id, itens(id, nome, unidade)');
  const porLinha = {};
  (lig || []).forEach(x => { (porLinha[x.linha_id] = porLinha[x.linha_id] || []).push(x); });

  const out = [];
  (lin || []).forEach(l => {
    const ligados = (porLinha[l.id] || []).filter(x => x.itens);
    if (ligados.length) {
      // Linha com item nosso: conta-se o item, e a exportação soma os que
      // caem na mesma receita (hambúrguer 180g + kids).
      ligados.forEach(x => out.push({
        linha_id: null, item_id: x.itens.id,
        nome: x.itens.nome, uom: x.itens.unidade,
        commodity: 'PRODUÇÃO DO AÇOUGUE', receita: l.nome,
      }));
    } else {
      // Sem item no catálogo: conta-se a própria linha da receita. É o que
      // permite pesar o bacon e o salame da casa sem antes inventar um item
      // de catálogo que ninguém confirmou que existe.
      out.push({
        linha_id: l.id, item_id: null,
        nome: l.nome, uom: 'KG',
        commodity: 'PRODUÇÃO DO AÇOUGUE', receita: 'sem item no catálogo',
      });
    }
  });
  return out;
}

function _invTodos() { return _INV.linhas.concat(_INV.producoes); }

function _invFiltrados() {
  const q = normalizarBusca(_INV.busca || '');
  return _invTodos().filter(l => {
    if (_INV.commodity && String(l.commodity || '').trim() !== _INV.commodity) return false;
    if (!q) return true;
    return itemCasaBusca(l.nome, q);
  });
}

function _invRender() {
  const contados = _INV.contagem.size;
  const total = _invTodos().length;
  const fechado = _INV.status === 'fechado';

  const commodities = [...new Set(_invTodos()
    .map(l => String(l.commodity || '').trim()).filter(Boolean))];
  const contadosDe = (c) => _invTodos()
    .filter(l => String(l.commodity || '').trim() === c && _INV.contagem.has(_invChave(l))).length;
  const totalDe = (c) => _invTodos()
    .filter(l => String(l.commodity || '').trim() === c).length;

  const lista = _invFiltrados();

  _INV.raiz.innerHTML = ''
    + '<div class="inv-topo">'
    +   '<div class="inv-titulo">'
    +     '<div><div class="inv-pdv">' + escapeHtml(_INV.pdvNome) + '</div>'
    +     '<div class="inv-mes"><input type="month" class="inv-mes-sel" value="'
    +       _INV.competencia.slice(0, 7) + '" onchange="_invTrocarMes(this.value)">'
    +       (fechado ? ' <span>contagem fechada</span>' : '') + '</div></div>'
    +     '<div class="inv-progresso"><strong>' + contados + '</strong><span>/ ' + total + '</span></div>'
    +   '</div>'
    +   (fechado ? ''
        : '<button class="btn ' + (_INV.concluido ? 'btn-outline' : 'btn-gold') + ' inv-concluir"'
          + ' onclick="_invConcluir(' + (_INV.concluido ? 'false' : 'true') + ')">'
          + (_INV.concluido ? '✓ Concluído — clique para voltar a contar'
                            : 'Marcar inventário como concluído')
          + '</button>')
    +   '<input class="input inv-busca" id="inv-busca" placeholder="Buscar item pelo nome"'
    +     ' value="' + escapeHtml(_INV.busca) + '" oninput="_invBuscar(this.value)"'
    +     ' autocomplete="off" spellcheck="false">'
    +   '<div class="inv-chips">'
    +     '<button class="inv-chip' + (_INV.commodity ? '' : ' on') + '"'
    +       ' onclick="_invFiltrar(null)">Tudo <em>' + contados + '/' + total + '</em></button>'
    +     commodities.map(c =>
          '<button class="inv-chip' + (_INV.commodity === c ? ' on' : '') + '"'
        + ' onclick="_invFiltrar(\'' + _escEd(c) + '\')">' + escapeHtml(c)
        + ' <em>' + contadosDe(c) + '/' + totalDe(c) + '</em></button>').join('')
    +   '</div>'
    + '</div>'
    + '<div class="inv-lista" id="inv-lista">'
    +   (lista.length ? lista.map(l => _invLinha(l, fechado)).join('')
                      : '<div class="empty-text">Nenhum item com esse nome.</div>')
    + '</div>'
    + '<div class="inv-livres" id="inv-livres"></div>'
    + '<div class="inv-rodape">'
    +   (fechado
        ? '<span class="text-muted">Contagem fechada pelo gerente. Não dá mais para alterar.</span>'
        : '<span class="text-muted">' + (total - contados) + ' item(ns) ainda sem contagem</span>'
          + '<span class="text-muted" style="font-size:11px">grava sozinho a cada item</span>')
    + '</div>';

  _invRenderLivres();
}

function _invLinha(l, fechado) {
  const k = _invChave(l);
  const c = _INV.contagem.get(k);
  const tem = !!c;
  const zero = tem && c.qtd === 0;
  return ''
    + '<div class="inv-item' + (tem ? ' contado' : '') + (zero ? ' zerado' : '') + '" id="inv-' + k + '">'
    +   '<div class="inv-nome">' + escapeHtml(l.nome)
    +     (l.receita ? '<span class="inv-receita">' + escapeHtml(l.receita) + '</span>' : '')
    +   '</div>'
    +   '<div class="inv-campo">'
    +     '<input class="input inv-qtd" type="text" inputmode="decimal"'
    +       ' value="' + (tem ? c.qtd : '') + '" placeholder="—" ' + (fechado ? 'disabled' : '')
    +       ' onchange="_invSalvar(\'' + k + '\', this.value)" onclick="this.select()">'
    +     '<span class="inv-uom">' + escapeHtml(l.uom || '') + '</span>'
    +     (fechado ? ''
        : '<button class="inv-apagar" onclick="_invApagar(\'' + k + '\')"'
          + ' title="Apagar o que foi digitado"' + (tem ? '' : ' disabled') + '>×</button>')
    +   '</div>'
    + '</div>';
}

function _invBuscar(v) {
  _INV.busca = v;
  const lista = _invFiltrados();
  document.getElementById('inv-lista').innerHTML =
    lista.length ? lista.map(l => _invLinha(l, _INV.status === 'fechado')).join('')
                 : '<div class="empty-text">Nenhum item com esse nome.</div>';
}

function _invFiltrar(c) { _INV.commodity = c; _invRender(); }

// Avisa o gerente que esta cozinha terminou. Não tranca nada: se aparecer
// um item esquecido, é só clicar de novo e continuar contando. Quem tranca
// é o gerente, ao fechar para mandar ao financeiro.
async function _invConcluir(concluir) {
  // Sem aviso sobre o que ficou em branco: item não contado quer dizer que
  // a cozinha não tem. Alertar sobre 700 "faltando" toda vez seria alarme
  // sobre a situação normal, e alarme normal ninguém lê.
  if (concluir && !confirm('Marcar o inventário como concluído?')) return;

  const { error } = await sb.rpc('concluir_inventario',
    { p_inventario_id: _INV.inventarioId, p_concluir: !!concluir });
  if (error) { showToast('Não consegui: ' + error.message, 'error'); return; }
  _INV.concluido = !!concluir;
  showToast(concluir ? 'Avisado ao gerente: contagem concluída.'
                     : 'Voltou para em andamento.', 'success');
  _invRender();
}

// Trocar o mês reabre a contagem daquele mês — cada uma é um registro
// separado, então nada do que já foi contado se mistura.
async function _invTrocarMes(ym) {
  if (!ym) return;
  await montarInventario(_INV.raiz, {
    pdvId: _INV.pdvId, pdvNome: _INV.pdvNome, competencia: ym + '-01' });
}

// Grava item a item. O celular na câmara fria perde conexão o tempo todo;
// um "salvar tudo" no fim perderia a contagem inteira.
async function _invSalvar(chave, valor) {
  if (_INV.status === 'fechado') return;
  const qtd = _invNum(valor);
  if (qtd === null) { showToast('Quantidade inválida.', 'error'); return; }
  if (_INV.salvando.has(chave)) return;
  _INV.salvando.add(chave);

  const alvo = _invTodos().find(l => _invChave(l) === chave);
  const atual = _INV.contagem.get(chave);
  const eu = (window.state && window.state.perfil && window.state.perfil.id) || null;

  try {
    if (atual) {
      const { data, error } = await sb.from('inventario_contagens')
        .update({ quantidade: qtd, contado_por: eu, contado_em: new Date().toISOString() })
        .eq('id', atual.id).select('id').maybeSingle();
      if (error || !data) throw error || new Error('sem permissão para gravar');
      _INV.contagem.set(chave, { id: atual.id, qtd });
    } else {
      const { data, error } = await sb.from('inventario_contagens').insert({
        inventario_id: _INV.inventarioId,
        linha_id: (alvo && alvo.linha_id) || null,
        item_id: (alvo && alvo.item_id) || null,
        quantidade: qtd, contado_por: eu,
      }).select('id').single();
      if (error) {
        // 23505 = o índice único recusou: a linha JÁ tem contagem no
        // servidor e este aparelho não sabia. Acontece de verdade — a
        // cozinha conta em dois celulares com o mesmo login, e quem abriu
        // a tela primeiro ficou com o mapa velho.
        if (error.code === '23505' && await _invReaproveitar(alvo, chave, qtd, eu)) {
          _invAtualizarLinha(chave);
          return;
        }
        throw error;
      }
      _INV.contagem.set(chave, { id: data.id, qtd });
    }
    _invAtualizarLinha(chave);
  } catch (e) {
    showToast('Não gravou: ' + (e.message || e), 'error');
  } finally {
    _INV.salvando.delete(chave);
  }
}

// Acha a contagem que já existe para esta linha/item e grava por cima.
// Devolve true se conseguiu.
//
// Sobrescrever é o certo aqui: quem está digitando agora está com o
// produto na mão. Mas não pode ser calado — se duas pessoas contaram a
// mesma prateleira, as duas precisam saber, senão uma delas conta o dobro
// achando que a outra não passou por ali.
async function _invReaproveitar(alvo, chave, qtd, eu) {
  if (!alvo) return false;
  let q = sb.from('inventario_contagens')
    .select('id, quantidade')
    .eq('inventario_id', _INV.inventarioId);
  q = alvo.linha_id ? q.eq('linha_id', alvo.linha_id) : q.eq('item_id', alvo.item_id);

  const { data: achou, error } = await q.maybeSingle();
  if (error || !achou) return false;

  const { data, error: e2 } = await sb.from('inventario_contagens')
    .update({ quantidade: qtd, contado_por: eu, contado_em: new Date().toISOString() })
    .eq('id', achou.id).select('id').maybeSingle();
  if (e2 || !data) return false;

  _INV.contagem.set(chave, { id: achou.id, qtd });
  const fmt = n => Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
  const antes = parseFloat(achou.quantidade);
  showToast(antes === qtd
    ? 'Este item já tinha sido contado com o mesmo valor.'
    : 'Este item já tinha contagem de ' + fmt(antes) + '. Atualizei para ' + fmt(qtd) + '.',
    'info');
  return true;
}

async function _invApagar(chave) {
  const atual = _INV.contagem.get(chave);
  if (!atual) return;
  const { error } = await sb.from('inventario_contagens').delete().eq('id', atual.id);
  if (error) { showToast('Não apagou: ' + error.message, 'error'); return; }
  _INV.contagem.delete(chave);
  _invAtualizarLinha(chave);
}

// Redesenha só a linha e o contador. Redesenhar as 725 a cada número
// digitado trava o celular e fecha o teclado no meio da contagem.
function _invAtualizarLinha(chave) {
  const alvo = _invTodos().find(l => _invChave(l) === chave);
  const el = document.getElementById('inv-' + chave);
  if (alvo && el) el.outerHTML = _invLinha(alvo, _INV.status === 'fechado');
  const prog = _INV.raiz.querySelector('.inv-progresso');
  if (prog) prog.innerHTML = '<strong>' + _INV.contagem.size + '</strong><span>/ ' + _invTodos().length + '</span>';
  const falta = _INV.raiz.querySelector('.inv-rodape .text-muted');
  if (falta && _INV.status !== 'fechado') {
    falta.textContent = (_invTodos().length - _INV.contagem.size) + ' item(ns) ainda sem contagem';
  }
}

// Não existe "fechar" aqui de propósito. Decisão do Fernando em 2026-08-25:
// a contagem fica aberta até ele exportar e mandar o e-mail para o
// financeiro — quem fecha é o gerente, na tela Fechar o Mês. Se o chef
// fechasse, uma correção de última hora exigiria pedir reabertura, e o
// número que foi para o financeiro poderia não ser o número contado.

// =====================================================================
// ITENS FORA DA PLANILHA
// =====================================================================
// A cozinha às vezes tem em câmara um produto que a planilha do financeiro
// não prevê. Ele não cabe na coluna colada — cairia em linha errada — e vai
// no corpo do e-mail, com a planilha em anexo. Aqui a pessoa anota na hora
// da contagem, com o produto na mão, em vez de lembrar depois.

function _invRenderLivres() {
  const cx = document.getElementById('inv-livres');
  if (!cx) return;
  const fechado = _INV.status === 'fechado';
  const l = _INV.livres || [];

  cx.innerHTML = ''
    + '<div class="inv-livres-titulo">Itens que não estão na planilha'
    +   (l.length ? ' <em>' + l.length + '</em>' : '') + '</div>'
    + (l.length
        ? '<div class="inv-livres-lista">' + l.map(x =>
            '<div class="inv-livre">'
          +   '<span class="inv-livre-nome">' + escapeHtml(x.nome) + '</span>'
          +   '<span class="inv-livre-qtd">' + x.quantidade + ' ' + escapeHtml(x.unidade) + '</span>'
          +   (fechado ? '' : '<button class="inv-apagar" title="Remover"'
              + ' onclick="_invApagarLivre(\'' + x.id + '\')">×</button>')
          + '</div>').join('') + '</div>'
        : '')
    + (fechado ? ''
        : '<div class="inv-livre-form">'
        +   '<input class="input" id="lv-nome" placeholder="Nome do item" autocomplete="off">'
        +   '<input class="input" id="lv-qtd" type="text" inputmode="decimal" placeholder="Qtd">'
        +   '<input class="input" id="lv-un" placeholder="KG" list="lv-unidades" autocomplete="off">'
        +   '<datalist id="lv-unidades">'
        +     ['KG', 'UN', 'CX', 'L', 'PCT', 'BDJ'].map(u => '<option value="' + u + '">').join('')
        +   '</datalist>'
        +   '<button class="btn btn-secondary" onclick="_invAddLivre()">Adicionar</button>'
        + '</div>');
}

async function _invCarregarLivres() {
  const { data } = await sb.rpc('inventario_livres_do_mes',
    { p_pdv_id: _INV.pdvId, p_competencia: _INV.competencia });
  _INV.livres = data || [];
}

async function _invAddLivre() {
  const nome = (document.getElementById('lv-nome').value || '').trim();
  const qtd  = _invNum(document.getElementById('lv-qtd').value);
  const un   = ((document.getElementById('lv-un').value || 'KG').trim() || 'KG').toUpperCase();
  if (!nome) { showToast('Escreva o nome do item.', 'error'); return; }
  if (qtd === null) { showToast('Quantidade inválida.', 'error'); return; }

  const eu = (window.state && window.state.perfil && window.state.perfil.id) || null;
  const { data, error } = await sb.from('inventario_livres').insert({
    inventario_id: _INV.inventarioId, nome, quantidade: qtd, unidade: un, anotado_por: eu,
  }).select('id, nome, quantidade, unidade').single();
  if (error) { showToast('Não gravou: ' + error.message, 'error'); return; }

  _INV.livres.push({ ...data, quantidade: parseFloat(data.quantidade) });
  _invRenderLivres();
  // O foco volta pro nome: quem está anotando geralmente tem mais de um.
  const n = document.getElementById('lv-nome');
  if (n) n.focus();
}

async function _invApagarLivre(id) {
  const { error } = await sb.from('inventario_livres').delete().eq('id', id);
  if (error) { showToast('Não apagou: ' + error.message, 'error'); return; }
  _INV.livres = (_INV.livres || []).filter(x => x.id !== id);
  _invRenderLivres();
}

// =====================================================================
// FICHAS TÉCNICAS — a receita registrada
// =====================================================================
// Mora aqui pelo mesmo motivo do inventário: roda no executivo.html (chef)
// e no pdv.html (cozinheiro). Duplicar garantiria que uma das duas ficasse
// para trás.
//
// A tela existe para três coisas que o Fernando prometeu aos chefs:
// consultar a ficha, calcular os insumos de N produções, e registrar o que
// foi produzido. E, no fim do mês, é ela que deixa o inventário pesar a
// produção em vez de contar ingrediente por ingrediente.
//
// DUAS GRANDEZAS QUE NÃO SÃO A MESMA COISA, e a tela precisa deixar isso
// óbvio para quem preenche:
//   fator de correção   por LINHA — bruto ÷ líquido do ingrediente
//   rendimento          por RECEITA — quanto sai de produto pronto
// Ver migration 66.

const _FT = {
  raiz: null, pdvId: null, pdvNome: null, pdvCodigo: '', pdvs: null,
  lista: [], catalogo: [], categoria: null, busca: '', filtroStatus: null,
  revisoes: {},        // ficha_id -> alteração aberta (ficha publicada em revisão)
  fila: [],            // o que espera o aprovador, em todas as cozinhas
  ficha: null,         // a ficha como está no banco (a publicada, se houver)
  rev: null,           // a alteração aberta dela
  vendo: 'ficha',      // ficha | revisao | versao
  aberta: null, linhas: [], linhasFicha: [], usada: [], eventos: [], salvando: false,
  original: null, publicadaEstado: null, custo: null, gerencial: null,
  precos: null,        // item_id -> preço vigente; só carrega para quem vê preço
};

// =====================================================================
// CUSTO PELA FICHA — compartilhado por fichas, requisição e relatórios
// =====================================================================
// Quando o PDV pede um produto da Comissaria, o custo dele é o dos
// ingredientes que a receita consumiu, com o rendimento já aplicado
// (migration 69). É o que os sistemas de cozinha central fazem: o produto
// pronto vale a soma dos insumos dividida pelo rendimento.

// Mesma tabela da função converter_unidade do banco. NULL quando não há
// conversão segura — nunca inventa o número.
function converterUnidade(qtd, de, para) {
  if (qtd == null) return null;
  const n = u => ({ gr: 'g', grs: 'g', kgs: 'kg', lt: 'l', lts: 'l', litro: 'l',
                    und: 'un', unid: 'un', unidade: 'un' }[String(u || '').trim().toLowerCase()]
                 || String(u || '').trim().toLowerCase());
  const a = n(de), b = n(para);
  if (a === b) return qtd;
  if (a === 'g'  && b === 'kg') return qtd / 1000;
  if (a === 'kg' && b === 'g')  return qtd * 1000;
  if (a === 'ml' && b === 'l')  return qtd / 1000;
  if (a === 'l'  && b === 'ml') return qtd * 1000;
  if (a === 'ml' && b === 'kg') return qtd / 1000;
  if (a === 'l'  && b === 'kg') return qtd;
  return null;
}

// Cozinheiro e Comissaria não veem valor. Chef, compras e master veem —
// decisão do Fernando em 10/09 para os chefs.
function perfilVePreco() {
  const p = window.state && window.state.perfil && window.state.perfil.perfil;
  return ['gerente_compras', 'master_sistema', 'executivo', 'comprador'].includes(p);
}

// Soma os ingredientes de UMA linha de requisição. `precoDe(itemId)` devolve
// o preço vigente. Linha em aberto e ingrediente sem preço não somam, mas
// são contados — um custo parcial precisa dizer que é parcial.
// O custo pela ficha de várias linhas de requisição, SEM a lista de
// ingredientes. A receita só é visível para quem é do PDV dela (migration
// 71); o chef de outra cozinha e o relatório precisam do valor, não da
// receita. Devolve { requisicao_item_id: { valor, semPreco, abertos, temFicha } }.
async function custosPelaFicha(sb, ids) {
  const mapa = {};
  const unicos = [...new Set((ids || []).filter(Boolean))];
  for (let i = 0; i < unicos.length; i += 200) {
    const { data, error } = await sb.rpc('custo_ficha_linhas', { p_ids: unicos.slice(i, i + 200) });
    if (error) { console.warn('[ficha] custo por linha indisponível:', error.message); break; }
    (data || []).forEach(r => {
      mapa[r.requisicao_item_id] = { valor: parseFloat(r.valor) || 0,
        semPreco: r.sem_preco || 0, abertos: r.abertos || 0, temFicha: true };
    });
  }
  return mapa;
}

function custoPelaFicha(insumos, precoDe) {
  let valor = 0, semPreco = 0, abertos = 0;
  (insumos || []).forEach(x => {
    if (!x.item_id || x.quantidade == null) { abertos++; return; }
    const p = parseFloat(precoDe(x.item_id)) || 0;
    if (!x.custeavel || !(p > 0)) { semPreco++; return; }
    valor += parseFloat(x.quantidade) * p;
  });
  return { valor, semPreco, abertos, temFicha: (insumos || []).length > 0 };
}

// A mesma lista da RWSPO-KIT-GENERAL-09 e da RDC 26/2015, com cada castanha
// em separado: hóspede alérgico a pistache não é alérgico a toda castanha, e
// "castanhas" genérico obrigava o salão a recusar o prato inteiro. A ordem é
// a da SOP. "Castanhas (outras)" existe para não invalidar ficha antiga.
const _FT_ALERGENOS = [
  ['gluten', 'Glúten (trigo, centeio, cevada, aveia)'], ['crustaceos', 'Crustáceos'],
  ['ovos', 'Ovos'], ['peixes', 'Peixes'], ['amendoim', 'Amendoim'], ['soja', 'Soja'],
  ['leite', 'Leite (todas as espécies)'], ['lactose', 'Lactose'],
  ['amendoa', 'Amêndoa'], ['avela', 'Avelã'], ['castanha_caju', 'Castanha-de-caju'],
  ['castanha_para', 'Castanha-do-pará'], ['macadamia', 'Macadâmia'], ['nozes', 'Nozes'],
  ['peca', 'Pecã'], ['pistache', 'Pistache'], ['pinoli', 'Pinoli'],
  ['castanhas', 'Castanhas (outras)'],
  ['latex', 'Látex natural'], ['gergelim', 'Gergelim'], ['sulfitos', 'Sulfitos'],
];

// Motivos de desperdício — lista única das SOPs (GENERAL-03, 10 e 11, LJ-04,
// LJ-06 e Manual LJ). Antes eram três listas diferentes e duas SOPs mandavam
// descartar por um motivo que nenhuma lista tinha. O grupo é o que o relatório
// da Controladoria soma; o banco só aceita o código (migration 72).
const _DESP_MOTIVOS = [
  ['vencimento', 'Vencimento', 'Validade e identificação'],
  ['sem_identificacao', 'Sem etiqueta ou etiqueta ilegível', 'Validade e identificação'],
  ['temperatura', 'Fora do binômio tempo-temperatura', 'Segurança dos alimentos'],
  ['contaminacao', 'Contaminação', 'Segurança dos alimentos'],
  ['falha_equipamento', 'Falha de equipamento', 'Segurança dos alimentos'],
  ['queima', 'Queimado', 'Execução'],
  ['corte_incorreto', 'Corte incorreto', 'Execução'],
  ['erro_preparo', 'Erro de preparo', 'Execução'],
  ['qualidade_abaixo_padrao', 'Qualidade abaixo do padrão', 'Execução'],
  ['quebra_queda', 'Quebra ou queda', 'Execução'],
  ['excesso_producao', 'Excesso de produção', 'Planejamento'],
  ['sobra_evento', 'Sobra de evento', 'Planejamento'],
  ['devolucao_cliente', 'Devolução do cliente', 'Salão'],
  ['erro_lancamento_salao', 'Erro de lançamento do salão', 'Salão'],
  ['avaria_recebimento', 'Avaria no recebimento', 'Recebimento'],
  ['outro', 'Outro', 'Outro'],
];
const _FT_UNIDADES = ['g', 'kg', 'ml', 'L', 'un'];

// Aceita vírgula: <input type="number"> recusa "1,8" e a cozinha digita
// com vírgula. Mesma correção que o inventário precisou.
function _ftNum(v) {
  const t = String(v == null ? '' : v).trim().replace(',', '.');
  if (t === '') return null;
  if (!/^[0-9]+(\.[0-9]+)?$/.test(t)) return null;
  const n = parseFloat(t);
  return isNaN(n) || n <= 0 ? null : n;
}
const _ftFmt = n => n == null ? '' :
  Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
const _ftNorm = s => String(s || '').toUpperCase().normalize('NFD')
  .replace(/[̀-ͯ]/g, '');

// ---------------------------------------------------------------------
// O FLUXO DA FICHA — RWSPO-KIT-GENERAL-09 (migration 73)
// ---------------------------------------------------------------------
// rascunho → em degustação → validação de custo → publicada (ou reprovada).
// Quem elabora: quem responde pela cozinha (a regra da contagem,
// pode_contar_pdv). Quem aprova: o gerente de compras, no papel de
// Executive Chef e de Cost Controller (decisão do Fernando, 18/09). O
// banco confere tudo de novo — os botões aqui só evitam oferecer o que vai
// dar "sem permissão".
//
// Ficha publicada que é alterada NÃO sai do ar: a alteração vai para
// ficha_revisoes e a publicada continua valendo — custo da requisição,
// produção e PDF — até a nova ser aprovada.

const _FT_STATUS = {
  rascunho:        { rot: 'Rascunho',           cls: 'st-rascunho' },
  degustacao:      { rot: 'Em degustação',      cls: 'st-degustacao' },
  validacao_custo: { rot: 'Validação de custo', cls: 'st-validacao' },
  publicada:       { rot: 'Publicada',          cls: 'st-publicada' },
  reprovada:       { rot: 'Reprovada',          cls: 'st-reprovada' },
};
const _FT_EVENTOS = {
  criada: 'criou a ficha', importada: 'importou da planilha',
  alteracao_iniciada: 'começou uma alteração', reaberta: 'voltou para rascunho',
  enviar_degustacao: 'enviou para degustação', aprovar_degustacao: 'aprovou a degustação',
  publicar: 'publicou', devolver: 'devolveu para ajustes', reprovar: 'reprovou',
  descartar: 'descartou a alteração', sharepoint: 'salvou o PDF no SharePoint',
};
const _FT_ABERTAS = ['rascunho', 'degustacao', 'validacao_custo'];

function _ftStatusPill(st, prefixo) {
  const s = _FT_STATUS[st];
  return s ? `<span class="ft-status ${s.cls}">${prefixo ? escapeHtml(prefixo) + ' ' : ''}${s.rot}</span>` : '';
}
// Onde a ficha está no fluxo: a alteração aberta manda, se houver.
function _ftEtapa(f) { return (_FT.revisoes[f.id] || {}).status || f.status; }
// O custo da ficha — o "CMV do prato" que o Fernando liberou em 19/09 para
// chef e cozinheiro. A Comissária continua sem ver valor: é a decisão de
// 10/09, e a ficha dela é a produção da casa, não um prato de cardápio.
function _ftVeCusto() {
  const p = window.state && window.state.perfil && window.state.perfil.perfil;
  return perfilVePreco() || p === 'pdv';
}

// Preço de venda, CMV % e margem: só compras e master (RLS da migration 73).
function _ftVeGerencial() {
  const p = window.state && window.state.perfil && window.state.perfil.perfil;
  return p === 'gerente_compras' || p === 'master_sistema';
}
const _ftFmtR = v => v == null || !isFinite(v) ? '—'
  : 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const _ftDataBR = d => d ? new Date(String(d).length <= 10 ? d + 'T12:00:00' : d).toLocaleDateString('pt-BR') : '';
const _ftTexto = t => escapeHtml(t || '').replace(/\n/g, '<br>');

// ---------------------------------------------------------------------
async function montarFichas(seletor, opts) {
  const raiz = typeof seletor === 'string' ? document.querySelector(seletor) : seletor;
  if (!raiz) return;
  _FT.raiz = raiz;
  if (opts.pdvs) _FT.pdvs = opts.pdvs;
  _FT.pdvId = opts.pdvId;
  _FT.pdvNome = opts.pdvNome || (_FT.pdvs || []).find(p => p.id === opts.pdvId)?.nome || '';
  raiz.innerHTML = '<div class="loading-text">Carregando fichas...</div>';

  const { data, error } = await sb.from('fichas_tecnicas')
    .select('id, nome, categoria, tipo, status, rendimento, rendimento_un, porcoes, versao, atualizada_em, item_id, criada_em, sharepoint_versao')
    .eq('pdv_id', _FT.pdvId).eq('ativa', true).order('categoria').order('nome');
  if (error) {
    raiz.innerHTML = '<div class="empty-text">Não consegui carregar as fichas.</div>'
      + '<div class="text-muted" style="font-size:11px;text-align:center;margin-top:6px">'
      + escapeHtml(error.message) + '</div>';
    return;
  }
  _FT.lista = data || [];
  _FT.revisoes = {};
  const ids = _FT.lista.map(f => f.id);
  for (let i = 0; i < ids.length; i += 150) {
    const { data: rv } = await sb.from('ficha_revisoes').select('id, ficha_id, status, atualizada_em')
      .in('ficha_id', ids.slice(i, i + 150)).in('status', _FT_ABERTAS);
    (rv || []).forEach(r => { _FT.revisoes[r.ficha_id] = r; });
  }
  _FT.aberta = null;

  // Ver é de quem é do PDV; editar é de quem responde por ele (a mesma regra
  // da contagem); aprovar é do gerente de compras.
  const [pode, aprova, pdv] = await Promise.all([
    sb.rpc('pode_contar_pdv', { p_pdv: _FT.pdvId }),
    sb.rpc('pode_aprovar_fichas'),
    sb.from('pdvs').select('nome, codigo').eq('id', _FT.pdvId).maybeSingle(),
  ]);
  _FT.podeEditar = pode.data === true;
  _FT.aprova = aprova.data === true;
  _FT.pdvCodigo = pdv.data?.codigo || '';
  if (pdv.data?.nome) _FT.pdvNome = pdv.data.nome;
  if (!_FT.catalogo.length) await _ftCarregarCatalogo();
  if (perfilVePreco() && !_FT.precos) {
    const { data: pr } = await sb.from('precos').select('item_id, preco_unitario').eq('vigente', true);
    _FT.precos = Object.fromEntries((pr || []).map(p => [p.item_id, parseFloat(p.preco_unitario) || 0]));
  }
  _FT.fila = _FT.aprova ? await _ftCarregarFila() : [];
  _ftRenderLista();
}

// O catálogo inteiro de uma vez: são centenas de itens e a busca tem que
// responder enquanto se digita, sem ida ao servidor por tecla. Os nomes
// alternativos entram porque é por eles que a planilha da cozinha chama o
// item ("Pastrami", e não "PASTRAMI DA CASA").
async function _ftCarregarCatalogo() {
  let todos = [];
  for (let i = 0; ; i += 1000) {
    const { data } = await sb.from('itens')
      .select('id, nome, nome_curto, nome_inventario, unidade, categoria').eq('ativo', true)
      .order('nome').range(i, i + 999);
    todos = todos.concat(data || []);
    if (!data || data.length < 1000) break;
  }
  _FT.catalogo = todos;
}

function _ftTrocarPdv(id) {
  const p = (_FT.pdvs || []).find(x => x.id === id);
  _FT.categoria = null; _FT.busca = ''; _FT.filtroStatus = null;
  montarFichas(_FT.raiz, { pdvId: id, pdvNome: p?.nome || '' });
}

// O que espera o aprovador em TODAS as cozinhas — é a caixa de entrada dele.
async function _ftCarregarFila() {
  const [a, b] = await Promise.all([
    sb.from('fichas_tecnicas').select('id, nome, status, pdv_id, atualizada_em, pdvs(nome)')
      .eq('ativa', true).in('status', ['degustacao', 'validacao_custo']),
    sb.from('ficha_revisoes').select('ficha_id, status, atualizada_em, fichas_tecnicas!inner(nome, pdv_id, ativa, pdvs(nome))')
      .in('status', ['degustacao', 'validacao_custo']),
  ]);
  const fila = (a.data || []).map(f => ({ id: f.id, nome: f.nome, etapa: f.status, pdvId: f.pdv_id,
    pdvNome: f.pdvs?.nome || '', quando: f.atualizada_em, alteracao: false }));
  (b.data || []).filter(r => r.fichas_tecnicas?.ativa).forEach(r => fila.push({
    id: r.ficha_id, nome: r.fichas_tecnicas.nome, etapa: r.status, pdvId: r.fichas_tecnicas.pdv_id,
    pdvNome: r.fichas_tecnicas.pdvs?.nome || '', quando: r.atualizada_em, alteracao: true }));
  return fila.sort((x, y) => String(x.quando).localeCompare(String(y.quando)));
}

async function _ftAbrirDaFila(pdvId, fichaId, alteracao) {
  if (pdvId !== _FT.pdvId) {
    const p = (_FT.pdvs || []).find(x => x.id === pdvId);
    await montarFichas(_FT.raiz, { pdvId, pdvNome: p?.nome || '' });
  }
  await _ftAbrir(fichaId, { revisao: alteracao });
}

// ---------------------------------------------------------------------
// A LISTA
// ---------------------------------------------------------------------
function _ftRenderLista() {
  const cats = [...new Set(_FT.lista.map(f => f.categoria).filter(Boolean))].sort();
  const q = _ftNorm(_FT.busca);
  const emAprovacao = f => ['degustacao', 'validacao_custo'].includes(_ftEtapa(f));
  const passaStatus = f => {
    switch (_FT.filtroStatus) {
      case 'aprovacao': return emAprovacao(f);
      case 'rascunho':  return _ftEtapa(f) === 'rascunho';
      case 'publicada': return f.status === 'publicada';
      case 'reprovada': return f.status === 'reprovada';
      default: return true;
    }
  };
  const vis = _FT.lista.filter(f =>
    (!_FT.categoria || f.categoria === _FT.categoria) && passaStatus(f) &&
    (!q || _ftNorm(f.nome).includes(q)));

  const chip = (rot, val, n, fn) => `<button class="filter-chip${
    (fn === '_ftFiltrarStatus' ? _FT.filtroStatus : _FT.categoria) === val ? ' active' : ''}"
    onclick="${fn}(${val === null ? 'null' : "'" + String(val).replace(/'/g, "\\'") + "'"})"
    >${escapeHtml(rot)}${n != null ? ` <span class="text-muted">${n}</span>` : ''}</button>`;
  const conta = fn => _FT.lista.filter(fn).length;
  const nAprov = conta(emAprovacao), nRasc = conta(f => _ftEtapa(f) === 'rascunho'),
        nRepr = conta(f => f.status === 'reprovada');

  const fila = (_FT.fila || []);
  _FT.raiz.innerHTML = `
    ${fila.length ? `<div class="ft-fila">
      <div class="ft-fila-titulo">Aguardando sua aprovação <span class="text-muted">${fila.length}</span></div>
      ${fila.map(x => `<button class="ft-fila-item" onclick="_ftAbrirDaFila('${x.pdvId}','${x.id}',${x.alteracao})">
        <span class="ft-fila-nome">${escapeHtml(x.nome)}${x.alteracao ? ' <span class="ft-tag">alteração</span>' : ''}</span>
        <span class="text-muted">${escapeHtml(x.pdvNome)}</span>
        ${_ftStatusPill(x.etapa)}
      </button>`).join('')}
    </div>` : ''}
    <div class="ft-topo">
      ${_FT.pdvs && _FT.pdvs.length > 1 ? `<select class="select ft-pdv" onchange="_ftTrocarPdv(this.value)">
        ${_FT.pdvs.map(p => `<option value="${p.id}"${p.id === _FT.pdvId ? ' selected' : ''}>${escapeHtml(p.nome)}</option>`).join('')}
      </select>` : ''}
      ${_FT.podeEditar ? `<button class="btn btn-primary" onclick="_ftNova()">+ Nova ficha</button>
        <button class="btn btn-outline" onclick="_ftImportar()">Importar planilha</button>` : ''}
      <input class="input ft-busca" id="ft-busca" placeholder="Buscar receita pelo nome"
             value="${escapeHtml(_FT.busca)}" oninput="_ftBuscar(this.value)" autocomplete="off">
    </div>
    ${nAprov || nRasc || nRepr ? `<div class="ft-chips">
      ${chip('Todas as situações', null, null, '_ftFiltrarStatus')}
      ${nAprov ? chip('Em aprovação', 'aprovacao', nAprov, '_ftFiltrarStatus') : ''}
      ${nRasc ? chip('Rascunho', 'rascunho', nRasc, '_ftFiltrarStatus') : ''}
      ${chip('Publicadas', 'publicada', conta(f => f.status === 'publicada'), '_ftFiltrarStatus')}
      ${nRepr ? chip('Reprovadas', 'reprovada', nRepr, '_ftFiltrarStatus') : ''}
    </div>` : ''}
    <div class="ft-chips">
      ${chip('Todas', null, _FT.lista.length, '_ftFiltrar')}
      ${cats.map(c => chip(c, c, _FT.lista.filter(f => f.categoria === c).length, '_ftFiltrar')).join('')}
    </div>
    ${vis.length ? `<div class="ft-lista">${vis.map(f => {
      const rev = _FT.revisoes[f.id];
      const pdfVelho = f.status === 'publicada' && f.sharepoint_versao != null && f.sharepoint_versao !== f.versao;
      return `
      <div class="ft-card" onclick="_ftAbrir('${f.id}')">
        <div class="ft-card-nome">${escapeHtml(f.nome)}</div>
        <div class="ft-card-meta">
          ${f.status !== 'publicada' ? _ftStatusPill(f.status) : ''}
          ${rev ? _ftStatusPill(rev.status, 'alteração:') : ''}
          ${f.tipo === 'prato' ? '<span class="ft-tag ft-tag-prato">prato</span>' : ''}
          ${f.categoria ? `<span class="ft-tag">${escapeHtml(f.categoria)}</span>` : ''}
          ${f.rendimento ? `<span>rende ${_ftFmt(f.rendimento)} ${escapeHtml(f.rendimento_un)}</span>` : ''}
          ${f.porcoes ? `<span>${f.porcoes} porç.</span>` : ''}
          ${pdfVelho ? '<span class="ft-tag ft-tag-aberto">PDF desatualizado</span>' : ''}
        </div>
      </div>`; }).join('')}</div>`
      : `<div class="empty-text">${_FT.lista.length
          ? 'Nenhuma receita com esse filtro.'
          : (_FT.podeEditar ? 'Nenhuma ficha cadastrada ainda. Comece por "Nova ficha" ou "Importar planilha".' : 'Nenhuma ficha cadastrada para esta cozinha.')}</div>`}`;
}

function _ftFiltrar(cat) { _FT.categoria = cat; _ftRenderLista(); }
function _ftFiltrarStatus(st) { _FT.filtroStatus = st; _ftRenderLista(); }
function _ftBuscar(v) {
  _FT.busca = v;
  const el = document.getElementById('ft-busca');
  const pos = el && el.selectionStart;
  _ftRenderLista();
  const novo = document.getElementById('ft-busca');
  if (novo) { novo.focus(); if (pos != null) novo.setSelectionRange(pos, pos); }
}

// ---------------------------------------------------------------------
// ABRIR
// ---------------------------------------------------------------------
function _ftNova() {
  _FT.ficha = null;
  _FT.rev = null;
  _FT.vendo = 'ficha';
  _FT.aberta = { id: null, nome: '', categoria: '', tipo: 'base', rendimento: null,
                 rendimento_un: 'kg', porcoes: null, modo_preparo: '', historia: '',
                 validade_secundaria: '', alergenos: [], versao: 0, item_id: null,
                 observacao: '', status: 'rascunho' };
  _FT.linhas = [];
  _FT.usada = [];
  _FT.original = null;
  _FT.publicadaEstado = null;
  _ftRenderEditor();
}

// Linhas a partir do banco (ficha_itens com join) ou de um retrato (versão
// antiga, alteração pendente). O retrato traz os nomes que guardou — o item
// pode ter mudado de nome desde então.
function _ftLinhasDe(rows, doRetrato) {
  return (rows || []).map(l => ({
    id: l.id || null, item_id: l.item_id || null, sub_ficha_id: l.sub_ficha_id || null,
    descricao: l.descricao || null, observacao: l.observacao || null,
    nome: l.item_id ? ((doRetrato ? l.item_nome : l.itens?.nome) || l.descricao || '?')
        : l.sub_ficha_id ? ((doRetrato ? l.sub_ficha_nome : l.fichas_tecnicas?.nome) || l.descricao || '?')
        : (l.descricao || 'Linha em aberto'),
    // Quantidade NULL = valor ainda não confirmado. Number(null) daria 0 e
    // gravaria um zero que a tabela recusa.
    quantidade: l.quantidade == null ? null : Number(l.quantidade), unidade: l.unidade || 'g',
    fator_correcao: Number(l.fator_correcao || 1),
  }));
}

async function _ftAbrir(id, opcoes = {}) {
  _FT.raiz.innerHTML = '<div class="loading-text">Abrindo...</div>';
  const { data: f } = await sb.from('fichas_tecnicas').select('*').eq('id', id).maybeSingle();
  if (!f) { showToast('Ficha não encontrada.', 'error'); return montarFichas(_FT.raiz, _FT); }
  const [{ data: linhas }, { data: usada }, { data: rev }, { data: ev }] = await Promise.all([
    sb.from('ficha_itens')
      .select('id, item_id, sub_ficha_id, descricao, observacao, quantidade, unidade, fator_correcao, ordem, itens(nome, unidade), fichas_tecnicas!ficha_itens_sub_ficha_id_fkey(nome)')
      .eq('ficha_id', id).order('ordem'),
    // Onde esta receita é usada — é o que avisa do impacto antes de mexer.
    sb.rpc('fichas_que_usam', { p_ficha_id: id }),
    sb.from('ficha_revisoes').select('*').eq('ficha_id', id).in('status', _FT_ABERTAS).maybeSingle(),
    sb.from('ficha_eventos').select('evento, de_status, para_status, motivo, usuario_id, criado_em, revisao_id')
      .eq('ficha_id', id).order('criado_em', { ascending: false }).limit(20),
  ]);
  await carregarAutores(sb);

  _FT.ficha = f;
  _FT.rev = rev || null;
  _FT.eventos = ev || [];
  _FT.usada = usada || [];
  _FT.linhasFicha = _ftLinhasDe(linhas, false);
  _FT.publicadaEstado = _ftEstadoDe(f, _FT.linhasFicha);
  _FT.original = null;
  _FT.custo = null;

  if (opcoes.revisao && rev) {
    _FT.vendo = 'revisao';
    _FT.aberta = { ...f, ...rev.dados, id: f.id, versao: f.versao, status: rev.status,
                   pdv_id: f.pdv_id, atualizada_em: rev.atualizada_em };
    _FT.linhas = _ftLinhasDe(rev.dados.linhas, true);
  } else {
    _FT.vendo = 'ficha';
    _FT.aberta = f;
    _FT.linhas = _FT.linhasFicha.map(l => ({ ...l }));
  }
  _ftRenderVisualizar();
  window.scrollTo({ top: 0 });
  _ftCarregarCusto();
  if (_ftVeGerencial()) _ftCarregarGerencial();
}

// =====================================================================
// VER A FICHA — sem nada que altere
// =====================================================================
// Pedido do Fernando em 15/09: abrir a ficha tem de ser só olhar. Editar é
// um botão, e cada gravação guarda a versão anterior.
function _ftRenderVisualizar(versaoAntiga) {
  const f = _FT.aberta;
  const vendoRev = _FT.vendo === 'revisao';
  const produto = f.item_id ? _FT.catalogo.find(i => i.id === f.item_id) : null;
  const alerg = _FT_ALERGENOS.filter(([v]) => (f.alergenos || []).includes(v)).map(([, r]) => r);
  const vePreco = perfilVePreco();
  const temFc = _FT.linhas.some(l => l.fator_correcao && l.fator_correcao !== 1);
  const fcy = _ftFcy(f, _FT.linhas);
  const voltar = versaoAntiga || vendoRev ? `_ftAbrir('${f.id}')` : '_ftVoltar()';

  _FT.raiz.innerHTML = `
    <div class="ft-editor ft-leitura">
      <div class="ft-editor-topo">
        <button class="btn btn-secondary btn-sm" onclick="${voltar}">← ${
          versaoAntiga ? 'Versão atual' : vendoRev ? 'Versão publicada' : 'Voltar'}</button>
        <span class="text-muted" style="font-size:12px">REV ${String(f.versao).padStart(2, '0')}${
          f.atualizada_em ? ' · ' + _ftDataBR(f.atualizada_em) : ''}</span>
      </div>

      ${versaoAntiga ? `<div class="aviso aviso-warn">
        Você está vendo a <strong>versão ${f.versao}</strong>, salva em ${_ftDataBR(versaoAntiga.criada_em)}${
          versaoAntiga.autor ? ' por ' + escapeHtml(versaoAntiga.autor) : ''}. Ela não vale mais.</div>` : ''}
      ${vendoRev ? `<div class="aviso aviso-info">
        Alteração em aprovação. A versão publicada continua valendo até esta ser aprovada.</div>` : ''}

      <div class="ft-ver-titulo">${escapeHtml(f.nome)}</div>
      <div class="ft-ver-meta">
        ${versaoAntiga ? '' : _ftStatusPill(vendoRev ? _FT.rev.status : f.status)}
        ${f.tipo === 'prato' ? '<span class="ft-tag ft-tag-prato">prato</span>' : ''}
        ${f.categoria ? `<span class="ft-tag" title="Categoria de Menu">${escapeHtml(f.categoria)}</span>` : ''}
        <span>${f.rendimento != null
          ? `rende <strong>${_ftFmt(f.rendimento)} ${escapeHtml(f.rendimento_un || '')}</strong>`
          : '<span class="ft-tag ft-tag-aberto">rendimento em aberto</span>'}</span>
        ${f.porcoes ? `<span><strong>${f.porcoes}</strong> ${f.porcoes === 1 ? 'porção' : 'porções'}</span>` : ''}
        ${fcy ? `<span title="FCy — Fator de Cocção: peso pronto ÷ peso líquido cru">FCy <strong>${_ftFmt(fcy)}</strong></span>` : ''}
        ${f.validade_secundaria ? `<span>validade <strong>${escapeHtml(f.validade_secundaria)}</strong></span>` : ''}
        ${produto || versaoAntiga?.produto_nome || f.produto_nome ? `<span>produz <strong>${
          escapeHtml(produto?.nome || versaoAntiga?.produto_nome || f.produto_nome)}</strong></span>` : ''}
      </div>

      ${versaoAntiga ? '' : _ftSituacaoHtml()}
      ${versaoAntiga ? '' : `<div class="ft-ver-acoes" id="ft-acoes">${_ftAcoesHtml()}</div>`}
      <div id="ft-motivo"></div>

      <div class="section-title mt-3"><span>Ingredientes (${_FT.linhas.length})</span></div>
      <div class="table-wrap"><table class="data-table tabela-cards ft-ver-tabela">
        <thead><tr><th>Ingrediente</th>
          <th class="num" title="Peso Líquido — pronto para uso">PL</th>
          ${temFc ? '<th class="num" title="FC — Fator de Correção: PB ÷ PL">FC</th><th class="num" title="Peso Bruto — como sai da câmara">PB</th>' : ''}
          ${vePreco && !versaoAntiga ? '<th class="num">Custo</th>' : ''}</tr></thead>
        <tbody>${_FT.linhas.map((l, i) => `<tr class="${!l.item_id && !l.sub_ficha_id ? 'ft-linha-aberta' : ''}">
          <td class="td-titulo">${escapeHtml(l.nome)}
            ${l.sub_ficha_id ? '<span class="ft-tag ft-tag-rec">sub-receita</span>' : ''}
            ${!l.item_id && !l.sub_ficha_id ? '<span class="ft-tag ft-tag-aberto">a vincular</span>' : ''}
            ${l.observacao ? `<div class="ft-linha-obs">${escapeHtml(l.observacao)}</div>` : ''}</td>
          <td class="num" data-label="PL">${l.quantidade == null
            ? '<span class="ft-tag ft-tag-aberto">a completar</span>'
            : _ftFmt(l.quantidade) + ' ' + escapeHtml(l.unidade || '')}</td>
          ${temFc ? `<td class="num" data-label="FC">${_ftFmt(l.fator_correcao)}</td>
            <td class="num" data-label="PB">${l.quantidade == null ? '—'
              : _ftFmt(l.quantidade * (l.fator_correcao || 1)) + ' ' + escapeHtml(l.unidade || '')}</td>` : ''}
          ${vePreco && !versaoAntiga ? `<td class="num" data-label="Custo" id="ft-cl-${i}">…</td>` : ''}
        </tr>`).join('')}</tbody>
      </table></div>
      ${versaoAntiga || !_ftVeCusto() ? '' : '<div id="ft-custo"><div class="ft-custo"><span class="text-muted">Calculando o custo...</span></div></div>'}
      ${versaoAntiga || !_ftVeGerencial() || f.tipo !== 'prato' ? '' : '<div id="ft-gerencial"></div>'}

      ${versaoAntiga || f.tipo !== 'prato' ? '' : `<div class="section-title mt-3"><span>Foto do prato</span></div>
        <div class="ft-foto-vazia">
          <span>Espaço reservado para as duas fotos da GENERAL-09 — vista superior e 45°.</span>
        </div>`}

      ${f.modo_preparo ? `<div class="section-title mt-3"><span>Modo de Preparo</span></div>
        <div class="ft-ver-texto">${_ftTexto(f.modo_preparo)}</div>` : ''}

      <div class="section-title mt-3"><span>Alergênicos</span></div>
      <div class="ft-ver-meta">${alerg.length
        ? alerg.map(a => `<span class="ft-tag ft-tag-alerg">${escapeHtml(a)}</span>`).join('')
        : '<span class="text-muted">nenhum marcado</span>'}</div>

      ${f.observacao ? `<div class="section-title mt-3"><span>Observações</span></div>
        <div class="ft-ver-texto">${_ftTexto(f.observacao)}</div>` : ''}
      ${f.historia ? `<div class="section-title mt-3"><span>História do prato</span></div>
        <div class="ft-ver-texto">${_ftTexto(f.historia)}</div>` : ''}

      ${!versaoAntiga && !vendoRev && f.status === 'publicada' ? `<div id="ft-sharepoint">${_ftSharepointHtml()}</div>` : ''}

      ${!versaoAntiga && _FT.usada.length ? `<div class="aviso aviso-info mt-3">
        Esta receita é usada em: ${_FT.usada.map(u =>
          escapeHtml(u.nome) + (u.nivel > 1 ? ` (via ${u.nivel} níveis)` : '')).join(' · ')}.</div>` : ''}

      <div id="ft-producao"></div>
    </div>`;
}

// FCy — Fator de Cocção (GENERAL-09, Passo 5): peso pronto ÷ peso líquido
// cru. Só existe quando dá para somar tudo em peso: basta uma linha em ml,
// em unidade ou sem quantidade para a conta não ter sentido.
function _ftFcy(f, linhas) {
  const rend = converterUnidade(f.rendimento, f.rendimento_un, 'g');
  if (!rend || !linhas.length) return null;
  let cru = 0;
  for (const l of linhas) {
    const g = l.quantidade == null ? null : converterUnidade(l.quantidade, l.unidade, 'g');
    if (g == null || !['g', 'kg'].includes(String(l.unidade).toLowerCase())) return null;
    cru += g;
  }
  return cru > 0 ? Math.round(rend / cru * 100) / 100 : null;
}

// Onde a ficha está e por quê — o motivo da última devolução ou reprovação
// fica à vista de quem vai corrigir.
function _ftSituacaoHtml() {
  const f = _FT.ficha || _FT.aberta;
  const rev = _FT.rev;
  const partes = [];
  if (_FT.vendo === 'ficha' && f.status === 'publicada' && rev) {
    partes.push(`<div class="aviso aviso-warn ft-situacao">
      Há uma alteração desta ficha em <strong>${_FT_STATUS[rev.status].rot.toLowerCase()}</strong>.
      A versão abaixo é a publicada e continua valendo.
      <button class="btn btn-sm btn-outline" onclick="_ftAbrir('${f.id}',{revisao:true})">Ver a alteração</button></div>`);
  }
  const alvoRev = _FT.vendo === 'revisao' ? rev?.id : null;
  const ult = (_FT.eventos || []).find(e => ['devolver', 'reprovar'].includes(e.evento)
    && (alvoRev ? e.revisao_id === alvoRev : !e.revisao_id));
  const etapa = _FT.vendo === 'revisao' ? rev?.status : f.status;
  if (ult && ['rascunho', 'reprovada'].includes(etapa)) {
    partes.push(`<div class="aviso ${ult.evento === 'reprovar' ? 'aviso-error' : 'aviso-warn'} ft-situacao">
      ${ult.evento === 'reprovar' ? 'Reprovada' : 'Devolvida para ajustes'} em ${_ftDataBR(ult.criado_em)}${
        autorComPerfil(ult.usuario_id) ? ' por ' + escapeHtml(autorComPerfil(ult.usuario_id)) : ''}:
      <strong>${escapeHtml(ult.motivo || '')}</strong></div>`);
  }
  return partes.join('');
}

function _ftAcoesHtml() {
  const f = _FT.ficha || _FT.aberta;
  const rev = _FT.rev;
  const vendoRev = _FT.vendo === 'revisao';
  const etapa = vendoRev ? rev.status : f.status;
  const b = [];
  const botao = (rot, fn, cls = 'btn-outline') => `<button class="btn ${cls} btn-sm" onclick="${fn}">${rot}</button>`;

  if (_FT.podeEditar && !(etapa === 'publicada' && rev)) {
    b.push(botao(vendoRev ? 'Editar alteração' : 'Editar ficha', '_ftEditar()', 'btn-primary'));
  }
  if (etapa === 'rascunho' && _FT.podeEditar) b.push(botao('Enviar para degustação', "_ftAvancar('enviar_degustacao')", 'btn-gold'));
  if (etapa === 'degustacao' && _FT.aprova) {
    b.push(botao('Aprovar degustação', "_ftAvancar('aprovar_degustacao')", 'btn-gold'));
    b.push(botao('Devolver para ajustes', "_ftPedirMotivo('devolver')"));
    b.push(botao('Reprovar', "_ftPedirMotivo('reprovar')"));
  }
  if (etapa === 'validacao_custo' && _FT.aprova) {
    b.push(botao('Publicar', "_ftAvancar('publicar')", 'btn-gold'));
    b.push(botao('Devolver para ajustes', "_ftPedirMotivo('devolver')"));
    b.push(botao('Reprovar', "_ftPedirMotivo('reprovar')"));
  }
  if (vendoRev && etapa === 'rascunho' && (_FT.podeEditar || _FT.aprova)) {
    b.push(botao('Descartar alteração', "_ftAvancar('descartar')", 'btn-secondary'));
  }
  if (!vendoRev && etapa === 'publicada') {
    b.push(botao('Calcular produção', '_ftProduzir()'));
    b.push(botao('Imprimir PDF', '_ftImprimir(false)'));
    if (_ftVeGerencial()) b.push(botao('PDF gerencial', '_ftImprimir(true)'));
  }
  b.push(botao('Histórico', '_ftHistorico()', 'btn-secondary'));

  const espera = etapa === 'degustacao' && !_FT.aprova ? 'Aguardando a degustação com o Executive Chef.'
    : etapa === 'validacao_custo' && !_FT.aprova ? 'Aguardando a validação de custo.' : '';
  return b.join('') + (espera ? `<span class="text-muted ft-espera">${espera}</span>` : '');
}

// ── Custo da receita e da porção ──────────────────────────────────
// Pelo banco (custo_receita), porque é lá que as sub-receitas descem:
// o pastel custa o recheio, que custa o mix de cogumelos. Quem vê a ficha
// vê o custo — é o "CMV do prato" que o Fernando liberou para chefs e
// cozinheiros. O custo linha a linha fica com quem já via preço.
function _ftLinhasParaCusto(linhas) {
  return linhas.map(l => ({ item_id: l.item_id, sub_ficha_id: l.sub_ficha_id,
    quantidade: l.quantidade, unidade: l.unidade, fator_correcao: l.fator_correcao }));
}

async function _ftCarregarCusto() {
  if (!_ftVeCusto()) return;
  const pdv = (_FT.ficha && _FT.ficha.pdv_id) || _FT.pdvId;
  const { data, error } = await sb.rpc('custo_receita', { p_pdv: pdv, p_linhas: _ftLinhasParaCusto(_FT.linhas) });
  const cx = document.getElementById('ft-custo');
  if (error) { if (cx) cx.innerHTML = `<div class="ft-custo"><span class="text-muted">Custo indisponível: ${escapeHtml(error.message)}</span></div>`; return; }
  _FT.custo = data;
  (data.linhas || []).forEach(x => {
    const td = document.getElementById('ft-cl-' + x.i);
    if (td) td.innerHTML = x.custo != null ? _ftFmtR(x.custo)
      + (x.motivo === 'base_parcial' ? ' <span class="ft-tag ft-tag-aberto" title="a base tem ingrediente sem preço">parcial</span>' : '')
      : `<span class="text-muted">${_FT_MOTIVO_CUSTO[x.motivo] || '—'}</span>`;
  });
  if (cx) cx.innerHTML = _ftCustoResumoHtml(_FT.aberta, data);
  _ftRenderGerencial();
}

const _FT_MOTIVO_CUSTO = {
  aberta: 'a vincular', sem_quantidade: 'a completar', unidade: 'unidade não converte',
  sem_preco: 'sem preço', base_sem_rendimento: 'base sem rendimento', base_parcial: 'parcial',
};

function _ftCustoResumoHtml(f, custo) {
  const faltas = (custo.linhas || []).filter(x => x.motivo);
  const rendKg = converterUnidade(f.rendimento, f.rendimento_un, 'kg');
  const porcao = f.porcoes ? custo.total / f.porcoes : null;
  const conta = {};
  faltas.forEach(x => { const r = _FT_MOTIVO_CUSTO[x.motivo] || x.motivo; conta[r] = (conta[r] || 0) + 1; });
  const falta = Object.entries(conta).map(([r, n]) => `${n} ${r}`).join(' · ');
  // Nenhuma linha com custo: "R$ 0,00" pareceria uma receita de graça.
  if (!(custo.total > 0) && faltas.length) {
    return `<div class="ft-custo"><span class="text-muted">Custo ainda sem base para calcular</span>
      <span class="ft-custo-falta">${falta}</span></div>`;
  }
  return `<div class="ft-custo">
    <span>Custo da receita <strong>${_ftFmtR(custo.total)}</strong>${
      porcao != null ? ` · Custo da Porção <strong>${_ftFmtR(porcao)}</strong>`
      : f.tipo === 'prato' ? ' · <span class="text-muted">Custo da Porção: falta o rendimento em porções</span>' : ''}${
      !porcao && rendKg ? ` · <strong>${_ftFmtR(custo.total / rendKg)}</strong> por kg pronto` : ''}</span>
    ${falta ? `<span class="ft-custo-falta">parcial — ${falta}</span>` : ''}
  </div>`;
}

// ── Preço de venda, CMV % e margem (só compras e master) ──────────
async function _ftCarregarGerencial() {
  const f = _FT.ficha || _FT.aberta;
  const [{ data: pv }, { data: meta }] = await Promise.all([
    sb.from('ficha_precos_venda').select('preco_venda').eq('ficha_id', f.id).maybeSingle(),
    sb.from('pdv_metas_cmv').select('meta_cmv_pct').eq('pdv_id', f.pdv_id).maybeSingle(),
  ]);
  _FT.gerencial = { preco: pv ? Number(pv.preco_venda) : null, meta: meta ? Number(meta.meta_cmv_pct) : null };
  _ftRenderGerencial();
}

function _ftIndicadores() {
  const f = _FT.aberta;
  const g = _FT.gerencial || {};
  const porcao = _FT.custo && f.porcoes ? _FT.custo.total / f.porcoes : null;
  const cmv = porcao != null && g.preco ? porcao / g.preco * 100 : null;
  return { porcao, preco: g.preco, meta: g.meta, cmv,
           margem: porcao != null && g.preco ? g.preco - porcao : null,
           acima: cmv != null && g.meta != null && cmv > g.meta };
}

function _ftRenderGerencial() {
  const cx = document.getElementById('ft-gerencial');
  if (!cx || !_FT.gerencial) return;
  const k = _ftIndicadores();
  const pct = v => v == null ? '—' : v.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%';
  cx.innerHTML = `<div class="ft-gerencial">
    <div class="ft-gerencial-titulo">Cost Controller de A&amp;B <span class="text-muted">— só compras e master veem</span></div>
    <div class="ft-gerencial-grade">
      <label>Preço de venda líquido<input class="input ft-mini" id="ft-pv" inputmode="decimal"
        value="${k.preco != null ? _ftFmt(k.preco) : ''}" placeholder="R$"></label>
      <label>Meta de CMV da cozinha<input class="input ft-mini" id="ft-meta" inputmode="decimal"
        value="${k.meta != null ? _ftFmt(k.meta) : ''}" placeholder="%"></label>
      <button class="btn btn-sm btn-outline" onclick="_ftSalvarGerencial()">Salvar</button>
    </div>
    <div class="ft-gerencial-kpis">
      <span>Custo da Porção <strong>${_ftFmtR(k.porcao)}</strong></span>
      <span>CMV <strong class="${k.acima ? 'text-error' : ''}">${pct(k.cmv)}</strong></span>
      <span>Margem de contribuição <strong>${_ftFmtR(k.margem)}</strong></span>
    </div>
    ${k.acima ? `<div class="aviso aviso-warn mt-2">CMV acima da meta de ${pct(k.meta)}. A GENERAL-09 manda rever
      porcionamento ou guarnição antes da aprovação final.</div>` : ''}
  </div>`;
}

async function _ftSalvarGerencial() {
  const f = _FT.ficha || _FT.aberta;
  const pv = _ftNum(document.getElementById('ft-pv')?.value);
  const meta = _ftNum(document.getElementById('ft-meta')?.value);
  const eu = window.state?.perfil?.id || null;
  const erros = [];
  if (pv != null) {
    const { error } = await sb.from('ficha_precos_venda').upsert({ ficha_id: f.id, preco_venda: pv,
      atualizado_em: new Date().toISOString(), atualizado_por: eu });
    if (error) erros.push(error.message);
  }
  if (meta != null) {
    if (meta >= 100) erros.push('A meta de CMV é um percentual abaixo de 100.');
    else {
      const { error } = await sb.from('pdv_metas_cmv').upsert({ pdv_id: f.pdv_id, meta_cmv_pct: meta,
        atualizado_em: new Date().toISOString(), atualizado_por: eu });
      if (error) erros.push(error.message);
    }
  }
  if (erros.length) { showToast('Não gravou: ' + erros.join(' · '), 'error'); return; }
  showToast('Salvo.', 'success');
  await _ftCarregarGerencial();
}


// =====================================================================
// EDITAR
// =====================================================================
function _ftEditar() {
  const etapa = _FT.vendo === 'revisao' ? _FT.rev?.status : _FT.aberta.status;
  if (['degustacao', 'validacao_custo'].includes(etapa)
      && !confirm('Esta ficha está em aprovação. Alterar agora faz ela voltar para rascunho. Continuar?')) return;
  // Ficha publicada sem alteração aberta: a edição parte da publicada e vira
  // uma alteração — a publicada não muda até ser aprovada.
  _FT.original = _ftEstadoDe(_FT.aberta, _FT.linhas);
  _ftRenderEditor();
}

async function _ftCancelarEdicao() {
  if (_FT.original && JSON.stringify(_ftColetarEdicao()) !== JSON.stringify(_FT.original)
      && !confirm('Descartar as alterações desta ficha?')) return;
  if (_FT.aberta.id) await _ftAbrir(_FT.aberta.id, { revisao: _FT.vendo === 'revisao' });
  else _ftVoltar();
}

function _ftRenderEditor() {
  const f = _FT.aberta;
  const novo = !f.id;
  const publicada = !novo && _FT.ficha && _FT.ficha.status === 'publicada';
  const cats = [...new Set(_FT.lista.map(x => x.categoria).filter(Boolean))].sort();

  _FT.raiz.innerHTML = `
    <div class="ft-editor">
      <div class="ft-editor-topo">
        <button class="btn btn-secondary btn-sm" onclick="_ftCancelarEdicao()">← Cancelar</button>
        <span class="ft-modo-edicao">${novo ? 'nova ficha'
          : publicada ? `alteração da REV ${String(f.versao).padStart(2, '0')} · vai para aprovação`
          : `editando rascunho · versão ${f.versao} → ${f.versao + 1}`}</span>
      </div>

      <div class="form-row col2">
        <div class="form-group">
          <label>Nome da receita</label>
          <input class="input" id="ft-nome" value="${escapeHtml(f.nome)}" autocomplete="off">
        </div>
        <div class="form-group">
          <label>Categoria de Menu</label>
          <input class="input" id="ft-cat" value="${escapeHtml(f.categoria || '')}"
                 list="ft-cats" autocomplete="off" placeholder="Entrada, Principal, Sobremesa...">
          <datalist id="ft-cats">${cats.map(c => `<option value="${escapeHtml(c)}">`).join('')}</datalist>
        </div>
      </div>

      <div class="form-row col3">
        <div class="form-group">
          <label>Tipo</label>
          <select class="select" id="ft-tipo">
            <option value="prato"${f.tipo === 'prato' ? ' selected' : ''}>Prato vendável</option>
            <option value="base"${f.tipo !== 'prato' ? ' selected' : ''}>Base / sub-receita</option>
          </select>
        </div>
        <div class="form-group">
          <label>Rendimento</label>
          <div style="display:flex;gap:6px">
            <input class="input" id="ft-rend" inputmode="decimal" autocomplete="off" style="flex:1"
                   value="${f.rendimento == null ? '' : _ftFmt(f.rendimento)}"
                   placeholder="quanto sai pronto" onchange="_ftRedesenharLinhas()">
            <select class="select" id="ft-rend-un" style="width:74px" onchange="_ftRedesenharLinhas()">
              ${_FT_UNIDADES.map(u => `<option value="${u}"${
                f.rendimento_un === u ? ' selected' : ''}>${u}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="form-group">
          <label>Rendimento em porções</label>
          <input class="input" id="ft-porcoes" inputmode="numeric" autocomplete="off"
                 value="${f.porcoes || ''}" onchange="_ftRedesenharLinhas()">
        </div>
      </div>

      <div class="form-row col2">
        <div class="form-group">
          <label>Validade Secundária</label>
          <input class="input" id="ft-validade" autocomplete="off" value="${escapeHtml(f.validade_secundaria || '')}"
                 placeholder="ex.: 3 dias refrigerado (≤ 4 °C)">
        </div>
        <div class="form-group">
          <label>Produto que esta ficha produz</label>
          <div id="ft-produto">${_ftProdutoHtml()}</div>
        </div>
      </div>

      <div class="section-title"><span>Ingredientes</span></div>
      <div class="ft-ing-cabec">
        <span>Ingrediente</span><span class="num" title="Peso Líquido">PL</span>
        <span>Un</span><span class="num" title="FC — Fator de Correção: PB ÷ PL">FC</span><span></span>
      </div>
      <div id="ft-linhas">${_ftLinhasHtml()}</div>
      <div id="ft-custo"></div>

      <div class="ft-add">
        <input class="input" id="ft-add-busca" autocomplete="off"
               placeholder="Digite para achar um item ou uma sub-receita..."
               oninput="_ftSugerir(this.value)">
        <div id="ft-sug" class="ft-sug"></div>
        <div class="ft-add-aberto">
          <input class="input" id="ft-add-aberto" autocomplete="off"
                 placeholder="Ou descreva uma linha em aberto — ex.: proteína a definir">
          <button class="btn btn-sm btn-secondary" onclick="_ftAdicionarAberto()">Adicionar em aberto</button>
        </div>
      </div>

      <div class="form-group mt-3">
        <label>Modo de Preparo</label>
        <textarea class="input" id="ft-modo" rows="6"></textarea>
      </div>

      <div class="section-title mt-3"><span>Alergênicos</span></div>
      <div class="ft-alerg">${_FT_ALERGENOS.map(([v, r]) => `
        <label class="ft-alerg-item">
          <input type="checkbox" value="${v}"${
            (f.alergenos || []).includes(v) ? ' checked' : ''}> ${r}
        </label>`).join('')}</div>

      <div class="form-group mt-3">
        <label>Observações</label>
        <textarea class="input" id="ft-obs" rows="3"></textarea>
      </div>
      <div class="form-group">
        <label>História do prato</label>
        <textarea class="input" id="ft-historia" rows="2"></textarea>
      </div>

      ${_FT.usada.length ? `
        <div class="aviso aviso-info mt-3">
          Esta receita é usada em: ${_FT.usada.map(u =>
            escapeHtml(u.nome) + (u.nivel > 1 ? ` (via ${u.nivel} níveis)` : '')).join(' · ')}.
          Mudar as quantidades muda o cálculo dessas também.
        </div>` : ''}

      <div class="ft-rodape">
        <button class="btn btn-primary" onclick="_ftSalvar()">
          ${novo ? 'Criar rascunho' : publicada ? 'Salvar alteração' : 'Salvar rascunho'}</button>
        <button class="btn btn-outline" onclick="_ftCancelarEdicao()">Cancelar</button>
        ${novo || _FT.vendo === 'revisao' ? '' : '<button class="btn btn-secondary" onclick="_ftArquivar()">Arquivar</button>'}
      </div>
      <div id="ft-producao"></div>
    </div>`;

  // O textarea recebe o valor por .value, nunca por innerHTML: a primeira
  // quebra de linha é descartada na análise do HTML e o texto sobe uma
  // linha inteira. Já mordeu no bloco do fechamento.
  const setv = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };
  setv('ft-modo', f.modo_preparo);
  setv('ft-obs', f.observacao);
  setv('ft-historia', f.historia);
  _ftAgendarCusto();
}

// ── Produto que a ficha produz ─────────────────────────────────────
// É por ele que a requisição acha a receita: o PDV pede PASTRAMI DA CASA
// e os ingredientes desta ficha entram na linha, com o rendimento aplicado.
function _ftProdutoHtml() {
  const f = _FT.aberta;
  const it = f.item_id ? _FT.catalogo.find(i => i.id === f.item_id) : null;
  // Duas fichas ativas para o mesmo produto: o banco usa a mais antiga.
  const irmas = f.item_id ? _FT.lista.filter(x => x.item_id === f.item_id && x.id !== f.id) : [];
  const todas = [..._FT.lista.filter(x => x.item_id === f.item_id)];
  if (f.id == null && f.item_id) todas.push({ id: null, nome: f.nome || 'esta ficha', criada_em: '9999' });
  const vale = todas.sort((a, b) => String(a.criada_em).localeCompare(String(b.criada_em)))[0];

  return it
    ? `<div class="ft-produto-sel">
         <span>${escapeHtml(it.nome)}</span>
         <button class="ft-del" onclick="_ftSetProduto(null)" title="Desligar">×</button>
       </div>
       ${irmas.length ? `<div class="aviso aviso-warn mt-2" style="font-size:12px">
         Outra ficha ativa produz o mesmo item: ${irmas.map(x => escapeHtml(x.nome)).join(', ')}.
         O custo da requisição usa <strong>${escapeHtml(vale.nome)}</strong>, a mais antiga.
         Arquive a que não vale.</div>` : ''}`
    : `<input class="input" id="ft-prod-busca" autocomplete="off"
              placeholder="Item do catálogo que o PDV pede (opcional)"
              oninput="_ftSugerirProduto(this.value)">
       <div id="ft-prod-sug" class="ft-sug"></div>`;
}

function _ftSugerirProduto(v) {
  const cx = document.getElementById('ft-prod-sug');
  const q = _ftNorm(v).trim();
  if (!cx) return;
  if (q.length < 2) { cx.innerHTML = ''; return; }
  const achados = _FT.catalogo.filter(i => _ftNorm(i.nome).includes(q)).slice(0, 10);
  cx.innerHTML = achados.length
    ? achados.map(i => `<button class="ft-sug-item" onclick="_ftSetProduto('${i.id}')">${escapeHtml(i.nome)}</button>`).join('')
    : '<div class="text-muted" style="font-size:12px;padding:8px">Nada encontrado.</div>';
}

function _ftSetProduto(id) {
  _FT.aberta.item_id = id;
  const el = document.getElementById('ft-produto');
  if (el) el.innerHTML = _ftProdutoHtml();
}

// O custo no editor acompanha o que se digita, sem ida ao banco por tecla.
let _ftTimerCusto = null;
function _ftAgendarCusto() {
  clearTimeout(_ftTimerCusto);
  _ftTimerCusto = setTimeout(async () => {
    const cx = document.getElementById('ft-custo');
    if (!cx || !_ftVeCusto()) return;
    if (!_FT.linhas.length) { cx.innerHTML = ''; return; }
    const { data, error } = await sb.rpc('custo_receita',
      { p_pdv: _FT.pdvId, p_linhas: _ftLinhasParaCusto(_FT.linhas) });
    if (error || !document.getElementById('ft-custo')) return;
    const rend = _ftNum(document.getElementById('ft-rend')?.value);
    const porc = parseInt(document.getElementById('ft-porcoes')?.value || '', 10);
    const f = { ..._FT.aberta, rendimento: rend,
                rendimento_un: document.getElementById('ft-rend-un')?.value || _FT.aberta.rendimento_un,
                porcoes: porc > 0 ? porc : null, tipo: document.getElementById('ft-tipo')?.value };
    document.getElementById('ft-custo').innerHTML = _ftCustoResumoHtml(f, data);
  }, 400);
}

function _ftLinhasHtml() {
  if (!_FT.linhas.length) {
    return '<div class="empty-text" style="padding:14px">Nenhum ingrediente ainda.</div>';
  }
  const vePreco = perfilVePreco() && _FT.precos;
  return _FT.linhas.map((l, i) => `
    <div class="ft-linha${!l.item_id && !l.sub_ficha_id ? ' ft-linha-aberta' : ''}">
      <div class="ft-linha-nome">
        ${escapeHtml(l.nome)}
        ${l.sub_ficha_id ? '<span class="ft-tag ft-tag-rec">sub-receita</span>' : ''}
        ${!l.item_id && !l.sub_ficha_id
          ? `<button class="ft-vincular" onclick="_ftVincular(${i})">vincular</button>`
          : l.quantidade == null ? '<span class="ft-tag ft-tag-aberto">a completar</span>' : ''}
        ${vePreco && l.item_id && !(_FT.precos[l.item_id] > 0) ? '<span class="ft-tag">sem preço</span>' : ''}
        ${l.observacao ? `<div class="ft-linha-obs">${escapeHtml(l.observacao)}</div>` : ''}
        <div class="ft-vinc-caixa" id="ft-vinc-${i}"></div>
      </div>
      <input class="input ft-mini" inputmode="decimal" value="${l.quantidade == null ? '' : _ftFmt(l.quantidade)}"
             placeholder="—" onchange="_ftSetQtd(${i}, this.value)" onclick="this.select()">
      <select class="select ft-mini" onchange="_ftSetUn(${i}, this.value)">
        ${_FT_UNIDADES.map(u => `<option value="${u}"${
          String(l.unidade).toLowerCase() === u.toLowerCase() ? ' selected' : ''}>${u}</option>`).join('')}
      </select>
      <input class="input ft-mini" inputmode="decimal" value="${_ftFmt(l.fator_correcao)}"
             title="FC — Fator de Correção: PB ÷ PL. 1 = não há perda no pré-preparo."
             onchange="_ftSetFator(${i}, this.value)" onclick="this.select()">
      <button class="ft-del" onclick="_ftRemover(${i})" title="Remover">×</button>
    </div>`).join('');
}

function _ftRedesenharLinhas() {
  const el = document.getElementById('ft-linhas');
  if (el) el.innerHTML = _ftLinhasHtml();
  _ftAgendarCusto();
}

function _ftSetQtd(i, v) {
  // Campo vazio é válido: a linha fica "a completar" até alguém confirmar o
  // valor — foi como o Fernando pediu o sal grosso do parma e a papada.
  if (String(v || '').trim() === '') { _FT.linhas[i].quantidade = null; _ftRedesenharLinhas(); return; }
  const n = _ftNum(v);
  if (n === null) { showToast('Quantidade inválida.', 'error'); _ftRedesenharLinhas(); return; }
  _FT.linhas[i].quantidade = n;
  _ftRedesenharLinhas();
}

function _ftAdicionarAberto() {
  const el = document.getElementById('ft-add-aberto');
  const txt = (el?.value || '').trim();
  if (!txt) { showToast('Descreva o que falta definir.', 'error'); return; }
  _FT.linhas.push({ id: null, item_id: null, sub_ficha_id: null, descricao: txt,
                    observacao: null, nome: txt, quantidade: null, unidade: 'g', fator_correcao: 1 });
  el.value = '';
  _ftRedesenharLinhas();
}
function _ftSetUn(i, v) { _FT.linhas[i].unidade = v; _ftAgendarCusto(); }
function _ftSetFator(i, v) {
  const n = _ftNum(v);
  // FC é bruto ÷ líquido: nunca menor que 1. Aceitar 0,8 aqui seria gravar
  // um número que subavalia o estoque sem ninguém perceber.
  if (n === null || n < 1) {
    showToast('O FC vai de 1 para cima (PB ÷ PL).', 'error');
    _ftRedesenharLinhas(); return;
  }
  _FT.linhas[i].fator_correcao = n;
  _ftAgendarCusto();
}
function _ftRemover(i) { _FT.linhas.splice(i, 1); _ftRedesenharLinhas(); }

// ── Vincular uma linha em aberto ───────────────────────────────────
// A linha que veio da planilha sem par no catálogo ("Azeite de Ervas")
// ganha o item ou a sub-receita, mantendo quantidade e unidade. O nome da
// planilha fica guardado na linha: é por ele que a próxima importação
// reconhece o vínculo e não pede de novo.
function _ftVincular(i) {
  const cx = document.getElementById('ft-vinc-' + i);
  if (!cx) return;
  if (cx.innerHTML) { cx.innerHTML = ''; return; }
  cx.innerHTML = `<input class="input" id="ft-vinc-in-${i}" autocomplete="off"
      value="${escapeHtml(_FT.linhas[i].descricao || '')}" oninput="_ftVincularSugerir(${i}, this.value)">
    <div class="ft-sug" id="ft-vinc-sug-${i}"></div>`;
  const inp = document.getElementById('ft-vinc-in-' + i);
  inp.focus(); inp.select();
  _ftVincularSugerir(i, inp.value);
}

function _ftCandidatos(v, excluir) {
  const palavras = _ftNorm(v).split(/\s+/).filter(p => p.length >= 3);
  if (!palavras.length) return [];
  const nota = nome => { const n = _ftNorm(nome); return palavras.filter(p => n.includes(p)).length; };
  const recs = _FT.lista.filter(f => f.id !== (_FT.aberta && _FT.aberta.id) && !excluir.has(f.id))
    .map(f => ({ tipo: 'rec', id: f.id, nome: f.nome, n: nota(f.nome) }));
  const itens = _FT.catalogo.filter(i => !excluir.has(i.id))
    .map(i => ({ tipo: 'item', id: i.id, nome: i.nome,
                 n: Math.max(nota(i.nome), nota(i.nome_curto || ''), nota(i.nome_inventario || '')) }));
  return [...recs, ...itens].filter(x => x.n > 0)
    .sort((a, b) => b.n - a.n || (a.tipo === 'rec' ? -1 : 1) || a.nome.localeCompare(b.nome)).slice(0, 12);
}

function _ftVincularSugerir(i, v) {
  const cx = document.getElementById('ft-vinc-sug-' + i);
  if (!cx) return;
  const todos = _ftCandidatos(v, new Set());
  cx.innerHTML = todos.length
    ? todos.map(x => `<button class="ft-sug-item" onclick="_ftVincularEscolher(${i},'${x.tipo}','${x.id}')">
        ${escapeHtml(x.nome)}${x.tipo === 'rec' ? ' <span class="ft-tag ft-tag-rec">sub-receita</span>' : ''}</button>`).join('')
    : '<div class="text-muted" style="font-size:12px;padding:8px">Nada encontrado. Se o item não existe no catálogo, avise o gerente de compras.</div>';
}

function _ftVincularEscolher(i, tipo, id) {
  const o = tipo === 'rec' ? _FT.lista.find(f => f.id === id) : _FT.catalogo.find(x => x.id === id);
  if (!o) return;
  const l = _FT.linhas[i];
  l.item_id = tipo === 'item' ? id : null;
  l.sub_ficha_id = tipo === 'rec' ? id : null;
  l.nome = o.nome;
  _ftRedesenharLinhas();
}

// ---------------------------------------------------------------------
// Busca de ingrediente: itens do catálogo E outras receitas do PDV
// ---------------------------------------------------------------------
function _ftSugerir(v) {
  const cx = document.getElementById('ft-sug');
  const q = _ftNorm(v).trim();
  if (!cx) return;
  if (q.length < 2) { cx.innerHTML = ''; return; }

  const jaTem = new Set(_FT.linhas.map(l => l.item_id || l.sub_ficha_id));
  const recs = _FT.lista
    .filter(f => f.id !== (_FT.aberta && _FT.aberta.id) && !jaTem.has(f.id)
              && _ftNorm(f.nome).includes(q))
    .slice(0, 5)
    .map(f => ({ tipo: 'rec', id: f.id, nome: f.nome }));
  const itens = _FT.catalogo
    .filter(i => !jaTem.has(i.id) && _ftNorm(i.nome).includes(q))
    .slice(0, 12)
    .map(i => ({ tipo: 'item', id: i.id, nome: i.nome }));

  const todos = [...recs, ...itens];
  cx.innerHTML = todos.length
    ? todos.map(x => `
        <button class="ft-sug-item" onclick="_ftAdicionar('${x.tipo}','${x.id}')">
          ${escapeHtml(x.nome)}
          ${x.tipo === 'rec' ? '<span class="ft-tag ft-tag-rec">sub-receita</span>' : ''}
        </button>`).join('')
    : '<div class="text-muted" style="font-size:12px;padding:8px">'
      + 'Nada encontrado. Se o ingrediente não existe no catálogo, avise o gerente de compras.</div>';
}

function _ftAdicionar(tipo, id) {
  const o = tipo === 'rec'
    ? _FT.lista.find(f => f.id === id)
    : _FT.catalogo.find(i => i.id === id);
  if (!o) return;
  _FT.linhas.push({
    id: null,
    item_id: tipo === 'item' ? id : null,
    sub_ficha_id: tipo === 'rec' ? id : null,
    descricao: null, observacao: null,
    nome: o.nome, quantidade: 100, unidade: 'g', fator_correcao: 1,
  });
  const b = document.getElementById('ft-add-busca');
  if (b) b.value = '';
  const s = document.getElementById('ft-sug');
  if (s) s.innerHTML = '';
  _ftRedesenharLinhas();
  if (b) b.focus();
}

// ── O estado comparável de uma ficha ──────────────────────────────
function _ftEstadoDe(f, linhas) {
  const n = v => (v === '' || v === undefined) ? null : v;
  return {
    nome: String(f.nome || '').trim(), categoria: n(f.categoria), tipo: f.tipo || 'base',
    rendimento: f.rendimento == null ? null : Number(f.rendimento),
    rendimento_un: f.rendimento_un || 'kg', porcoes: f.porcoes ? Number(f.porcoes) : null,
    validade_secundaria: n(f.validade_secundaria),
    modo_preparo: n(f.modo_preparo), observacao: n(f.observacao), historia: n(f.historia),
    item_id: n(f.item_id), alergenos: [...(f.alergenos || [])].sort(),
    linhas: linhas.map(l => ({
      item_id: n(l.item_id), sub_ficha_id: n(l.sub_ficha_id),
      descricao: n(l.descricao), observacao: n(l.observacao), nome: l.nome,
      quantidade: l.quantidade == null ? null : Number(l.quantidade),
      unidade: l.unidade, fator_correcao: Number(l.fator_correcao || 1),
    })),
  };
}

function _ftColetarEdicao() {
  const val = id => (document.getElementById(id)?.value || '').trim();
  return _ftEstadoDe({
    nome: val('ft-nome'), categoria: val('ft-cat'), tipo: val('ft-tipo') || 'base',
    rendimento: _ftNum(val('ft-rend')), rendimento_un: val('ft-rend-un') || 'kg',
    porcoes: val('ft-porcoes') ? parseInt(val('ft-porcoes'), 10) : null,
    validade_secundaria: val('ft-validade'),
    modo_preparo: val('ft-modo'), observacao: val('ft-obs'), historia: val('ft-historia'),
    item_id: _FT.aberta.item_id,
    alergenos: [...document.querySelectorAll('.ft-alerg input:checked')].map(x => x.value),
  }, _FT.linhas);
}

// O "logzinho" da versão: o que mudou, em português, sem precisar abrir as
// duas versões lado a lado.
function _ftResumoMudancas(antes, depois) {
  if (!antes) return 'Ficha criada';
  const m = [];
  const rot = { nome: 'nome', categoria: 'categoria de menu', tipo: 'tipo', rendimento: 'rendimento',
                rendimento_un: 'unidade do rendimento', porcoes: 'porções',
                validade_secundaria: 'validade secundária' };
  Object.keys(rot).forEach(k => {
    if (String(antes[k] ?? '') !== String(depois[k] ?? '')) {
      m.push(`${rot[k]}: ${antes[k] ?? '—'} → ${depois[k] ?? '—'}`);
    }
  });
  if (antes.item_id !== depois.item_id) {
    const nome = id => _FT.catalogo.find(i => i.id === id)?.nome || '—';
    m.push(`produto: ${antes.item_id ? nome(antes.item_id) : '—'} → ${depois.item_id ? nome(depois.item_id) : '—'}`);
  }
  if (antes.observacao !== depois.observacao) m.push('observações alteradas');
  if (antes.modo_preparo !== depois.modo_preparo) m.push('modo de preparo alterado');
  if (antes.historia !== depois.historia) m.push('história do prato alterada');
  if (antes.alergenos.join() !== depois.alergenos.join()) m.push('alergênicos alterados');

  const chave = l => l.item_id || l.sub_ficha_id || ('aberto:' + l.descricao);
  const qtd = l => l.quantidade == null ? 'a completar' : _ftFmt(l.quantidade) + ' ' + l.unidade;
  const ant = Object.fromEntries(antes.linhas.map(l => [chave(l), l]));
  const dep = Object.fromEntries(depois.linhas.map(l => [chave(l), l]));
  // Linha em aberto que ganhou vínculo não é "saiu X, entrou Y".
  const vinculadas = new Set();
  depois.linhas.forEach(l => {
    if (!ant[chave(l)] && l.descricao && ant['aberto:' + l.descricao]) {
      vinculadas.add('aberto:' + l.descricao);
      m.push(`${l.descricao} vinculado a ${l.nome}`);
    }
  });
  depois.linhas.forEach(l => {
    if (!ant[chave(l)] && !(l.descricao && vinculadas.has('aberto:' + l.descricao))) m.push(`entrou ${l.nome} (${qtd(l)})`);
  });
  antes.linhas.forEach(l => { if (!dep[chave(l)] && !vinculadas.has(chave(l))) m.push(`saiu ${l.nome}`); });
  depois.linhas.forEach(l => {
    const a = ant[chave(l)] || (l.descricao && ant['aberto:' + l.descricao]);
    if (!a) return;
    if (qtd(a) !== qtd(l)) m.push(`${l.nome}: ${qtd(a)} → ${qtd(l)}`);
    if (a.fator_correcao !== l.fator_correcao) m.push(`${l.nome}: FC ${_ftFmt(a.fator_correcao)} → ${_ftFmt(l.fator_correcao)}`);
    if ((a.observacao || '') !== (l.observacao || '')) m.push(`${l.nome}: observação alterada`);
  });
  return m.join('; ');
}

// ---------------------------------------------------------------------
// Gravar
// ---------------------------------------------------------------------
async function _ftSalvar() {
  if (_FT.salvando) return;
  const estado = _ftColetarEdicao();
  if (!estado.nome) { showToast('Dê um nome à receita.', 'error'); return; }
  if (!estado.linhas.length) { showToast('Adicione ao menos um ingrediente.', 'error'); return; }

  const publicada = _FT.aberta.id && _FT.ficha && _FT.ficha.status === 'publicada';
  if (_FT.aberta.id && _FT.original && JSON.stringify(estado) === JSON.stringify(_FT.original)) {
    showToast('Nada mudou — nenhuma versão nova foi criada.', 'info');
    return _ftAbrir(_FT.aberta.id, { revisao: _FT.vendo === 'revisao' });
  }
  // A alteração de uma publicada se descreve contra a publicada, que é o
  // que o aprovador vai comparar. O rascunho, contra o que estava salvo.
  const resumo = _ftResumoMudancas(publicada ? _FT.publicadaEstado : _FT.original, estado)
    || (publicada ? 'Sem diferença da versão publicada' : 'Sem mudanças');

  _FT.salvando = true;
  try {
    const { data, error } = await sb.rpc('salvar_ficha_rascunho', {
      p_ficha_id: _FT.aberta.id || null,
      p_pdv: _FT.pdvId,
      p_cabecalho: {
        nome: estado.nome, categoria: estado.categoria, tipo: estado.tipo,
        rendimento: estado.rendimento, rendimento_un: estado.rendimento_un,
        porcoes: estado.porcoes, validade_secundaria: estado.validade_secundaria,
        modo_preparo: estado.modo_preparo, observacao: estado.observacao, historia: estado.historia,
        data_referencia: _FT.aberta.data_referencia || null,
        item_id: estado.item_id, alergenos: estado.alergenos,
      },
      p_linhas: estado.linhas.map(l => ({
        item_id: l.item_id, sub_ficha_id: l.sub_ficha_id, descricao: l.descricao,
        observacao: l.observacao, quantidade: l.quantidade, unidade: l.unidade,
        fator_correcao: l.fator_correcao,
      })),
      p_resumo: resumo,
      p_origem: 'tela',
    });
    if (error) throw error;
    showToast(publicada ? 'Alteração salva. A versão publicada continua valendo até a aprovação.'
      : _FT.aberta.id ? 'Rascunho salvo.' : 'Rascunho criado.', 'success');
    await montarFichas(_FT.raiz, _FT);
    await _ftAbrir(data.ficha_id, { revisao: !!data.revisao_id });
  } catch (e) {
    showToast('Não gravou: ' + (e.message || e), 'error');
  } finally {
    _FT.salvando = false;
  }
}

async function _ftArquivar() {
  if (!_FT.aberta.id) return;
  if (!confirm('Arquivar esta ficha? Ela sai da lista, mas o histórico continua.')) return;
  const { error } = await sb.rpc('arquivar_ficha', { p_ficha: _FT.aberta.id });
  if (error) { showToast('Não arquivou: ' + error.message, 'error'); return; }
  showToast('Ficha arquivada.', 'success');
  await montarFichas(_FT.raiz, _FT);
}

function _ftVoltar() { montarFichas(_FT.raiz, _FT); }

// =====================================================================
// ANDAR NO FLUXO
// =====================================================================
function _ftPedirMotivo(acao) {
  const cx = document.getElementById('ft-motivo');
  if (!cx) return;
  cx.innerHTML = `<div class="form-panel ft-motivo" style="display:block">
    <label>${acao === 'reprovar' ? 'Motivo da reprovação' : 'O que precisa ser ajustado'}</label>
    <textarea class="input" id="ft-motivo-txt" rows="3"></textarea>
    <div class="ft-rodape" style="margin-top:10px">
      <button class="btn btn-primary btn-sm" onclick="_ftAvancar('${acao}')">${
        acao === 'reprovar' ? 'Reprovar' : 'Devolver para ajustes'}</button>
      <button class="btn btn-outline btn-sm" onclick="document.getElementById('ft-motivo').innerHTML=''">Cancelar</button>
    </div></div>`;
  document.getElementById('ft-motivo-txt').focus();
}

async function _ftAvancar(acao) {
  const f = _FT.ficha;
  if (!f || _FT.avancando) return;
  let motivo = null;
  if (acao === 'devolver' || acao === 'reprovar') {
    motivo = (document.getElementById('ft-motivo-txt')?.value || '').trim();
    if (!motivo) { showToast('Escreva o motivo.', 'error'); return; }
  }
  if (acao === 'enviar_degustacao') {
    const faltam = [];
    if (_FT.aberta.rendimento == null) faltam.push('o rendimento');
    const abertas = _FT.linhas.filter(l => !l.item_id && !l.sub_ficha_id).length;
    const semQtd = _FT.linhas.filter(l => l.quantidade == null).length;
    if (abertas) faltam.push(abertas + ' ingrediente(s) a vincular');
    if (semQtd) faltam.push(semQtd + ' quantidade(s) a completar');
    if (faltam.length && !confirm('Falta ' + faltam.join(', ') + '.\n\nEnviar para degustação assim mesmo?')) return;
  }
  if (acao === 'publicar') {
    const k = _ftIndicadores();
    if (k.acima && !confirm(`O CMV desta porção (${k.cmv.toFixed(1)}%) está acima da meta da cozinha (${k.meta}%). `
        + 'A GENERAL-09 manda rever porcionamento ou guarnição antes da aprovação.\n\nPublicar assim mesmo?')) return;
    if (_FT.custo && _FT.custo.faltas && !confirm(`O custo desta ficha está parcial (${_FT.custo.faltas} linha(s) fora da conta). Publicar assim mesmo?`)) return;
  }
  if (acao === 'descartar' && !confirm('Descartar esta alteração? A versão publicada continua como está.')) return;

  _FT.avancando = true;
  try {
    const { data: para, error } = await sb.rpc('avancar_ficha', { p_ficha_id: f.id, p_acao: acao, p_motivo: motivo });
    if (error) throw error;
    // Ficha publicada passa a valer no mês aberto: as requisições deste
    // produto desde o dia 1 são remontadas pela receita nova. Meses
    // anteriores ficam como estavam — já foram fechados com o outro número.
    if (para === 'publicada' && (f.item_id || _FT.aberta.item_id)) {
      const hoje = new Date();
      const dia1 = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
      const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')
                     + '-' + String(d.getDate()).padStart(2, '0');
      const { error: eR } = await sb.rpc('remontar_insumos_requisicoes',
        { p_de: iso(dia1), p_ate: iso(hoje), p_ficha: f.id });
      if (eR) console.warn('[ficha] custo do mês não remontado:', eR.message);
    }
    const msg = { degustacao: 'Enviada para degustação.', validacao_custo: 'Degustação aprovada — segue para validação de custo.',
                  publicada: 'Ficha publicada.', rascunho: 'Devolvida para ajustes.', reprovada: 'Ficha reprovada.',
                  descartada: 'Alteração descartada.' }[para] || 'Feito.';
    showToast(msg, 'success');
    await montarFichas(_FT.raiz, _FT);
    await _ftAbrir(f.id, { revisao: _FT_ABERTAS.includes(para) && _FT.vendo === 'revisao' });
  } catch (e) {
    showToast('Não foi: ' + (e.message || e), 'error');
  } finally {
    _FT.avancando = false;
  }
}

// ── Histórico: versões e aprovações, numa linha do tempo só ────────
async function _ftHistorico() {
  const cx = document.getElementById('ft-producao');
  if (!cx) return;
  cx.innerHTML = '<div class="loading-text">Carregando histórico...</div>';
  const id = (_FT.ficha || _FT.aberta).id;
  const [{ data: vs, error }, { data: ev }] = await Promise.all([
    sb.from('ficha_versoes').select('versao, resumo, usuario_id, criada_em')
      .eq('ficha_id', id).order('versao', { ascending: false }),
    sb.from('ficha_eventos').select('evento, de_status, para_status, versao, motivo, usuario_id, criado_em, revisao_id')
      .eq('ficha_id', id).order('criado_em', { ascending: false }),
  ]);
  if (error) { cx.innerHTML = '<div class="empty-text">' + escapeHtml(error.message) + '</div>'; return; }
  await carregarAutores(sb);
  const atual = (_FT.ficha || _FT.aberta).versao;
  const itens = [
    ...(vs || []).map(v => ({ quando: v.criada_em, tipo: 'versao', v })),
    // A criação e a importação já aparecem como a versão 1; o evento repetiria.
    ...(ev || []).filter(e => !(['criada', 'importada'].includes(e.evento) && !e.revisao_id && e.versao === 1))
      .map(e => ({ quando: e.criado_em, tipo: 'evento', e })),
  ].sort((a, b) => String(b.quando).localeCompare(String(a.quando)));
  const autor = u => autorComPerfil(u) ? ' · ' + escapeHtml(autorComPerfil(u)) : '';
  cx.innerHTML = `
    <div class="form-panel ft-prod" style="display:block">
      <div class="section-title" style="margin-top:0"><span>Histórico</span></div>
      ${itens.length ? `<div class="ft-hist">${itens.map(x => x.tipo === 'versao' ? `
        <div class="ft-hist-linha">
          <div class="ft-hist-cab">
            <strong>versão ${x.v.versao}</strong>${x.v.versao === atual ? ' <span class="ft-tag">atual</span>' : ''}
            <span class="text-muted">${new Date(x.v.criada_em).toLocaleString('pt-BR')}${autor(x.v.usuario_id)}</span>
            ${x.v.versao !== atual ? `<button class="btn btn-sm btn-secondary" onclick="_ftVerVersao(${x.v.versao})">Ver</button>` : ''}
          </div>
          <div class="ft-hist-resumo">${escapeHtml(x.v.resumo || 'sem descrição')}</div>
        </div>` : `
        <div class="ft-hist-linha ft-hist-evento">
          <div class="ft-hist-cab">
            ${_FT_STATUS[x.e.para_status] ? _ftStatusPill(x.e.para_status) : ''}
            <span>${escapeHtml(_FT_EVENTOS[x.e.evento] || x.e.evento)}${x.e.revisao_id ? ' (alteração)' : ''}</span>
            <span class="text-muted">${new Date(x.e.criado_em).toLocaleString('pt-BR')}${autor(x.e.usuario_id)}</span>
          </div>
          ${x.e.motivo ? `<div class="ft-hist-resumo">${escapeHtml(x.e.motivo)}</div>` : ''}
        </div>`).join('')}</div>`
        : '<div class="empty-text">Nenhum registro.</div>'}
    </div>`;
  cx.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function _ftVerVersao(versao) {
  const id = (_FT.ficha || _FT.aberta).id;
  const { data: v, error } = await sb.from('ficha_versoes')
    .select('versao, dados, usuario_id, criada_em')
    .eq('ficha_id', id).eq('versao', versao).maybeSingle();
  if (error || !v) { showToast('Versão não encontrada.', 'error'); return; }
  await carregarAutores(sb);
  const d = v.dados || {};
  _FT.vendo = 'versao';
  _FT.aberta = { ...d, id, versao: v.versao, atualizada_em: v.criada_em };
  _FT.linhas = _ftLinhasDe(d.linhas, true);
  _FT.usada = [];
  _ftRenderVisualizar({ criada_em: v.criada_em, autor: autorComPerfil(v.usuario_id), produto_nome: d.produto_nome });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}


// =====================================================================
// PDF E SHAREPOINT (GENERAL-09, Passos 12 e 13) — sem integração
// =====================================================================
// O sistema imprime; quem salva no SharePoint é a pessoa. O que o sistema
// guarda é "a REV NN foi salva em DD/MM por X" e avisa quando a ficha mudou
// depois disso, que é quando o PDF da praça fica velho.

// [COD_UNIDADE]-[CATEGORIA]-[NOME_DO_PRATO]-REV[NN]-[DDMMAAAA]
// Exemplo da SOP: RWSPO-LJ-PRIN-FILET_MIGNON_ROTI-REV02-27082026
function _ftNomeArquivo(f, gerencial) {
  const limpa = s => String(s || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  const cat = limpa(f.categoria).split('_')[0].slice(0, 4) || 'GERAL';
  const d = new Date(f.atualizada_em || Date.now());
  const data = String(d.getDate()).padStart(2, '0') + String(d.getMonth() + 1).padStart(2, '0') + d.getFullYear();
  return ['RWSPO', limpa(_FT.pdvCodigo || _FT.pdvNome), cat, limpa(f.nome),
          'REV' + String(f.versao).padStart(2, '0'), data].filter(Boolean).join('-')
    + (gerencial ? '-GERENCIAL' : '');
}

function _ftSharepointHtml() {
  const f = _FT.ficha;
  if (!f || f.status !== 'publicada') return '';
  const podeMarcar = _FT.podeEditar || _FT.aprova;
  const rev = n => 'REV ' + String(n).padStart(2, '0');
  const estado = f.sharepoint_versao == null
    ? '<span class="text-muted">Ainda não salva no SharePoint.</span>'
    : f.sharepoint_versao === f.versao
      ? `<span class="text-success">✓ ${rev(f.versao)} salva em ${_ftDataBR(f.sharepoint_em)}${
          autorComPerfil(f.sharepoint_por) ? ' por ' + escapeHtml(autorComPerfil(f.sharepoint_por)) : ''}</span>`
      : `<span class="text-error">A ficha mudou depois do PDF salvo (${rev(f.sharepoint_versao)}). Imprima a ${rev(f.versao)} e substitua o arquivo.</span>`;
  return `<div class="ft-sp">
    <div class="ft-sp-titulo">SharePoint</div>
    <div>${estado}</div>
    <div class="ft-sp-arquivo">${escapeHtml(_ftNomeArquivo(f, false))}.pdf</div>
    <div class="text-muted ft-sp-pasta">Documents › Public › Culinary › Fichas_Tecnicas › ${
      escapeHtml(_FT.pdvNome)} › ${escapeHtml(f.categoria || 'sem categoria')}</div>
    ${podeMarcar && f.sharepoint_versao !== f.versao ? `<button class="btn btn-sm btn-outline" onclick="_ftMarcarSharepoint()">
      Salvei a ${rev(f.versao)} no SharePoint</button>` : ''}
  </div>`;
}

async function _ftMarcarSharepoint() {
  const f = _FT.ficha;
  if (!confirm(`Confirma que o PDF da REV ${String(f.versao).padStart(2, '0')} foi salvo no SharePoint?`)) return;
  const { error } = await sb.rpc('marcar_ficha_sharepoint', { p_ficha_id: f.id });
  if (error) { showToast('Não registrou: ' + error.message, 'error'); return; }
  showToast('Registrado.', 'success');
  await montarFichas(_FT.raiz, _FT);
  await _ftAbrir(f.id);
}

// Imprime pela janela de impressão do navegador ("Salvar como PDF"). O
// título da página vira o nome do arquivo sugerido — por isso ele é trocado
// pelo nome da SOP durante a impressão e volta depois.
//   operacional  a da praça: gramaturas, modo de preparo, alergênicos, sem custo
//   gerencial    com custo por linha, custo da porção, preço, CMV e margem
async function _ftImprimir(gerencial) {
  const f = _FT.ficha;
  if (!f) return;
  if (!_FT.custo) await _ftCarregarCusto();
  if (gerencial && !_FT.gerencial) await _ftCarregarGerencial();
  const linhas = _FT.linhasFicha;
  const custo = _FT.custo || { total: 0, linhas: [] };
  const k = gerencial ? _ftIndicadores() : {};
  const pct = v => v == null ? '—' : v.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%';
  const fcy = _ftFcy(f, linhas);
  const nome = _ftNomeArquivo(f, gerencial);
  const rev = 'REV ' + String(f.versao).padStart(2, '0');
  const cl = i => (custo.linhas || []).find(x => x.i === i);

  const html = `
    <div class="fp-cab">
      <div>
        <div class="fp-hotel">Rosewood São Paulo · ${escapeHtml(_FT.pdvNome)}</div>
        <div class="fp-titulo">${escapeHtml(f.nome)}</div>
        <div class="fp-sub">Ficha Técnica ${gerencial ? 'Gerencial' : 'Operacional'} · ${rev} · publicada em ${_ftDataBR(f.atualizada_em)}</div>
      </div>
      <div class="fp-cod">${escapeHtml(nome)}</div>
    </div>
    <table class="fp-meta"><tr>
      <td><b>Categoria de Menu</b>${escapeHtml(f.categoria || '—')}</td>
      <td><b>Tipo</b>${f.tipo === 'prato' ? 'Prato vendável' : 'Base / sub-receita'}</td>
      <td><b>Rendimento</b>${f.rendimento != null ? _ftFmt(f.rendimento) + ' ' + escapeHtml(f.rendimento_un) : '—'}</td>
      <td><b>Rendimento em porções</b>${f.porcoes || '—'}</td>
      <td><b>FCy</b>${fcy ? _ftFmt(fcy) : '—'}</td>
      <td><b>Validade Secundária</b>${escapeHtml(f.validade_secundaria || '—')}</td>
    </tr></table>
    <table class="fp-ing">
      <thead><tr><th>Ingrediente</th><th>PB</th><th>PL</th><th>FC</th>${gerencial ? '<th>Custo</th>' : ''}</tr></thead>
      <tbody>${linhas.map((l, i) => `<tr>
        <td>${escapeHtml(l.nome)}${l.sub_ficha_id ? ' <i>(sub-receita)</i>' : ''}${
          l.observacao ? `<div class="fp-obs">${escapeHtml(l.observacao)}</div>` : ''}</td>
        <td>${l.quantidade == null ? '—' : _ftFmt(l.quantidade * (l.fator_correcao || 1)) + ' ' + escapeHtml(l.unidade)}</td>
        <td>${l.quantidade == null ? '—' : _ftFmt(l.quantidade) + ' ' + escapeHtml(l.unidade)}</td>
        <td>${_ftFmt(l.fator_correcao || 1)}</td>
        ${gerencial ? `<td>${cl(i)?.custo != null ? _ftFmtR(cl(i).custo) : (_FT_MOTIVO_CUSTO[cl(i)?.motivo] || '—')}</td>` : ''}
      </tr>`).join('')}</tbody>
    </table>
    ${gerencial ? `<table class="fp-meta fp-kpi"><tr>
      <td><b>Custo da receita</b>${_ftFmtR(custo.total)}${custo.faltas ? ' (parcial)' : ''}</td>
      <td><b>Custo da Porção</b>${_ftFmtR(k.porcao)}</td>
      <td><b>Preço de venda líquido</b>${_ftFmtR(k.preco)}</td>
      <td><b>CMV</b>${pct(k.cmv)}</td>
      <td><b>Meta de CMV</b>${pct(k.meta)}</td>
      <td><b>Margem de contribuição</b>${_ftFmtR(k.margem)}</td>
    </tr></table>` : ''}
    ${gerencial || f.tipo !== 'prato' ? '' : '<h3>Foto do prato</h3><div class="fp-foto"><span>vista superior</span><span>vista 45°</span></div>'}
    ${f.modo_preparo ? `<h3>Modo de Preparo</h3><div class="fp-texto">${_ftTexto(f.modo_preparo)}</div>` : ''}
    <h3>Alergênicos</h3>
    <table class="fp-alerg"><tbody>${(() => {
      const l = _FT_ALERGENOS.map(([v, r]) => `<td class="${(f.alergenos || []).includes(v) ? 'sim' : ''}">${
        escapeHtml(r)}<b>${(f.alergenos || []).includes(v) ? 'SIM' : 'NÃO'}</b></td>`);
      const out = [];
      for (let i = 0; i < l.length; i += 3) out.push('<tr>' + l.slice(i, i + 3).join('') + '</tr>');
      return out.join('');
    })()}</tbody></table>
    ${f.historia ? `<h3>História do prato</h3><div class="fp-texto">${_ftTexto(f.historia)}</div>` : ''}
    <div class="fp-rodape">Gerado pelo Sistema de Gestão de Cozinha em ${new Date().toLocaleString('pt-BR')} ·
      versão vigente ${rev}. Cópia impressa sem este selo de versão não vale (GENERAL-09).</div>`;

  let cx = document.getElementById('ft-print');
  if (!cx) { cx = document.createElement('div'); cx.id = 'ft-print'; document.body.appendChild(cx); }
  cx.innerHTML = html;
  const tituloAntes = document.title;
  document.title = nome;
  document.body.classList.add('imprimindo-ficha');
  const volta = () => {
    document.title = tituloAntes;
    document.body.classList.remove('imprimindo-ficha');
    cx.innerHTML = '';
    window.removeEventListener('afterprint', volta);
  };
  window.addEventListener('afterprint', volta);
  setTimeout(() => window.print(), 50);
}

// ---------------------------------------------------------------------
// "Quero produzir N" — e registrar o que foi produzido
// ---------------------------------------------------------------------
async function _ftProduzir() {
  const cx = document.getElementById('ft-producao');
  if (!cx || !_FT.aberta.id) return;
  cx.innerHTML = `
    <div class="form-panel ft-prod" style="display:block">
      <div class="section-title" style="margin-top:0"><span>Calcular produção</span></div>
      <div class="ft-prod-topo">
        <label>Quantas receitas?</label>
        <input class="input ft-mini" id="ft-qtd" inputmode="decimal" value="1"
               onclick="this.select()" onchange="_ftCalcular()">
        <button class="btn btn-sm btn-outline" onclick="_ftCalcular()">Calcular</button>
      </div>
      <div id="ft-prod-res"></div>
    </div>`;
  _ftCalcular();
}

async function _ftCalcular() {
  const n = _ftNum(document.getElementById('ft-qtd').value);
  const res = document.getElementById('ft-prod-res');
  if (n === null) { res.innerHTML = '<div class="empty-text">Quantidade inválida.</div>'; return; }
  res.innerHTML = '<div class="loading-text">Calculando...</div>';

  const { data, error } = await sb.rpc('explodir_ficha',
    { p_ficha_id: _FT.aberta.id, p_quantidade: n });
  if (error) { res.innerHTML = '<div class="empty-text">' + escapeHtml(error.message) + '</div>'; return; }
  if (!data || !data.length) { res.innerHTML = '<div class="empty-text">Nada a calcular.</div>'; return; }

  res.innerHTML = `
    <table class="data-table">
      <thead><tr><th>Insumo</th><th class="num">PL</th>
        <th class="num">PB — retirar da câmara</th><th>Un</th></tr></thead>
      <tbody>${data.map(x => `
        <tr>
          <td data-label="Insumo">${escapeHtml(x.nome)}</td>
          <td class="num text-muted" data-label="PL">${_ftFmt(x.qtd_liquida)}</td>
          <td class="num" style="font-weight:500" data-label="PB">${_ftFmt(x.qtd_bruta)}</td>
          <td class="text-muted">${escapeHtml(x.unidade || '')}</td>
        </tr>`).join('')}</tbody>
    </table>
    <div class="text-muted" style="font-size:12px;margin-top:8px">
      PB = PL × FC de cada linha. Sub-receitas aparecem explodidas nos insumos delas.
    </div>
    <div class="ft-prod-acoes">
      <button class="btn btn-primary btn-sm" onclick="_ftRegistrarProducao()">
        Registrar produção de ${_ftFmt(n)} receita(s)</button>
    </div>`;
}

async function _ftRegistrarProducao() {
  const n = _ftNum(document.getElementById('ft-qtd').value);
  if (n === null) return;
  if (!confirm(`Registrar que foram produzidas ${_ftFmt(n)} receita(s) de "${_FT.aberta.nome}"?`)) return;

  const { error } = await sb.from('producoes').insert({
    ficha_id: _FT.aberta.id, pdv_id: _FT.pdvId, quantidade: n,
    // Guarda a versão usada: mudar a receita depois não pode reescrever
    // o que já foi produzido.
    ficha_versao: _FT.aberta.versao,
    usuario_id: (window.state && window.state.perfil && window.state.perfil.id) || null,
  });
  if (error) { showToast('Não registrou: ' + error.message, 'error'); return; }
  showToast('Produção registrada.', 'success');
}

// <IMPORTADOR>
// ---------------------------------------------------------------------
// IMPORTADOR — o Excel das fichas ("Template ficha técnica Rosewood")
// ---------------------------------------------------------------------
// Uma ficha por aba. Layout (conferido nas 137 abas da Kosher, 19/09):
//   A1 nome · C3 outlet · C4 porções · C5 preço de venda · C8 data ·
//   C9 categoria · C10 alergênicos (texto livre) · cabeçalho "INGREDIENT"
//   na linha 13 · linha "Rendimento" (D) com o valor em E · "STORY BEHIND
//   THIS FOOD" · "Steps" com o modo de preparo na coluna B.
// As linhas são achadas pelo texto, não pelo número: três abas do arquivo
// da Kosher têm o cabeçalho uma linha acima ou abaixo.
//
// Decisões do Fernando (plano da etapa 4): genérico fica em BRANCO.
//   - E29 = 25 é resto do template ("$ 25,00"), não rendimento.
//   - "qb" vira quantidade em branco — a linha fica "a completar".
//   - A coluna UNIT não vale para peso: "Focaccia · Kg · 120" é 120 g,
//     porque o cabeçalho da coluna diz QUANTITY (GR). Volume (ml, L) e
//     unidade (und, un) continuam valendo — 3 gemas não são 3 g.
//   - Nome igual NÃO garante item certo: ingrediente só é ligado ao
//     catálogo quando o nome casa com UM item só. O resto fica a vincular.

const _FT_IMP_IGNORAR = /^(planilha\s*\d*|base\s*\(\d+\))$/i;
const _FT_IMP_RENDIMENTO_TEMPLATE = 25;

// "ALHO PORÓ " -> "alho poro"
function _ftImpChave(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ').trim();
}
// Mais solta, só para achar sub-receita: "Mix cogumelos" = "Mix de cogumelos".
function _ftImpChaveSolta(s) {
  return _ftImpChave(s).replace(/\b(de|da|do|das|dos|e|com|c)\b/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

const _FT_IMP_ALERG = [
  [/gl[uú]ten|trigo|centeio|cevada|aveia/i, 'gluten'], [/crust|camar[aã]o|lagosta/i, 'crustaceos'],
  [/\bovos?\b/i, 'ovos'], [/peixe/i, 'peixes'], [/amendoim/i, 'amendoim'], [/\bsoja\b/i, 'soja'],
  [/lactose/i, 'lactose'], [/\bleite|latic/i, 'leite'], [/am[eê]ndoa/i, 'amendoa'], [/avel[aã]/i, 'avela'],
  [/caju/i, 'castanha_caju'], [/par[aá]|brasil/i, 'castanha_para'], [/macad[aâ]mia/i, 'macadamia'],
  [/\bnoz(es)?\b/i, 'nozes'], [/pec[aã]/i, 'peca'], [/pistache/i, 'pistache'], [/pinoli|pinh[aã]o/i, 'pinoli'],
  [/oleaginosa|castanha/i, 'castanhas'], [/l[aá]tex/i, 'latex'], [/gergelim|s[eé]samo/i, 'gergelim'],
  [/sulfit/i, 'sulfitos'],
];

function _ftImpAlergenos(texto) {
  const lista = [], fora = [];
  String(texto || '').split(/[\/,;+]|\s+e\s+/).map(t => t.trim()).filter(Boolean).forEach(t => {
    const hit = _FT_IMP_ALERG.find(([re]) => re.test(t));
    if (hit) { if (!lista.includes(hit[1])) lista.push(hit[1]); }
    else fora.push(t);
  });
  return { lista, fora };
}

function _ftImpNumero(v) {
  if (typeof v === 'number') return isFinite(v) ? v : null;
  const t = String(v || '').trim();
  if (!t) return null;
  const m = t.replace(/\s/g, '').match(/^(\d+(?:[.,]\d+)?)/);
  return m ? parseFloat(m[1].replace(',', '.')) : null;
}

function _ftImpData(v, XLSX) {
  if (typeof v === 'number' && v > 20000 && v < 80000 && XLSX && XLSX.SSF) {
    const d = XLSX.SSF.parse_date_code(v);
    if (d) return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
  }
  if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0, 10);
  const m = String(v || '').trim().match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
  if (m) {
    const a = m[3].length === 2 ? '20' + m[3] : m[3];
    return `${a}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  return null;
}

// Lê UMA aba. Devolve { ficha } ou { ignorada: motivo }.
function _ftImpLerAba(ws, nomeAba, XLSX) {
  if (_FT_IMP_IGNORAR.test(String(nomeAba).trim())) return { ignorada: 'aba de rascunho do arquivo' };
  if (!ws || !ws['!ref']) return { ignorada: 'aba vazia' };
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true });
  const cel = (r, c) => (rows[r] && rows[r][c] != null ? rows[r][c] : '');
  const txt = (r, c) => String(cel(r, c)).trim();

  const nome = txt(0, 0);
  if (!nome) return { ignorada: 'sem nome em A1' };
  const iCab = rows.findIndex(r => String(r[1]).trim().toUpperCase() === 'INGREDIENT');
  if (iCab < 0) return { ignorada: 'sem a tabela de ingredientes' };
  const cabQtd = String(rows[iCab][4] || '').toUpperCase();
  if (!/\bGR\b|GRAMA/.test(cabQtd)) {
    return { ignorada: `a coluna de quantidade diz "${String(rows[iCab][4]).trim()}", não gramas — conferir à mão` };
  }
  let iRend = rows.findIndex((r, i) => i > iCab && /rendimento/i.test(String(r[3])));
  const fimLinhas = iRend > 0 ? iRend : Math.min(rows.length, iCab + 16);

  // Cabeçalho: rótulo na coluna A, valor na C (o modelo mescla C:D).
  const valorDe = re => {
    const i = rows.findIndex((r, k) => k < iCab && re.test(String(r[0])));
    return i >= 0 ? cel(i, 2) : '';
  };
  const avisos = [];
  const outlet = String(valorDe(/^outlet/i)).trim();
  const porcoesBrutas = valorDe(/^servings/i);
  let porcoes = null;
  if (String(porcoesBrutas).trim() !== '') {
    const n = typeof porcoesBrutas === 'number' ? porcoesBrutas
      : /portion|por[cç]/i.test(String(porcoesBrutas)) || /^\d+$/.test(String(porcoesBrutas).trim())
        ? _ftImpNumero(porcoesBrutas) : null;
    if (n && Number.isInteger(n) && n > 0) porcoes = n;
    else avisos.push(`porções "${String(porcoesBrutas).trim()}" não é um número de porções — ficou em branco`);
  }
  const precoBruto = valorDe(/selling price/i);
  const preco_venda = _ftImpNumero(precoBruto) > 0 ? _ftImpNumero(precoBruto) : null;
  const dataBruta = valorDe(/^updated/i);
  const data_referencia = _ftImpData(dataBruta, XLSX);
  if (String(dataBruta).trim() && !data_referencia) avisos.push(`data "${String(dataBruta).trim()}" não é data — ficou em branco`);
  const categoria = String(valorDe(/^category/i)).trim() || null;
  const alergTexto = String(valorDe(/^alerg/i)).trim();
  const alerg = _ftImpAlergenos(alergTexto);

  const linhas = [];
  for (let i = iCab + 1; i < fimLinhas; i++) {
    const r = rows[i] || [];
    const ing = String(r[1] || '').trim();
    if (!ing) continue;
    const un = String(r[2] || '').trim().toLowerCase();
    const bruto = r[4];
    const brutoTxt = String(bruto == null ? '' : bruto).trim();
    let unidade = 'g', quantidade = null, aCompletar = false, obs = null;
    if (/^(qb|qd|q\.b\.?)$/i.test(un) || /^(qb|qd|q\.b\.?)$/i.test(brutoTxt)) {
      aCompletar = true; obs = 'qb na planilha';
    } else {
      if (un === 'ml') unidade = 'ml';
      else if (un === 'l' || un === 'lt') { unidade = 'L'; obs = 'conferir: a planilha diz L numa coluna em gramas'; }
      else if (/^(und|un|um|unid|unit|unidade)$/.test(un)) unidade = 'un';
      else if (/fava/i.test(brutoTxt)) unidade = 'un';
      quantidade = _ftImpNumero(bruto);
      if (quantidade == null || quantidade <= 0) { quantidade = null; aCompletar = true; }
    }
    linhas.push({ nome: ing, quantidade, unidade, aCompletar, observacao: obs });
  }
  if (!linhas.length) return { ignorada: 'nenhum ingrediente preenchido' };

  let rendimento = null;
  if (iRend > 0) {
    const v = cel(iRend, 4);
    const n = _ftImpNumero(v);
    if (n != null && n > 0 && n !== _FT_IMP_RENDIMENTO_TEMPLATE) rendimento = n;
  }
  if (rendimento == null) avisos.push('rendimento em branco');

  // História: a linha logo abaixo de "STORY BEHIND THIS FOOD".
  const iStory = rows.findIndex(r => /story behind/i.test(String(r[0])));
  const iPrep = rows.findIndex(r => /preparation method/i.test(String(r[0])));
  let historia = null;
  if (iStory >= 0) {
    const fim = iPrep > iStory ? iPrep : iStory + 2;
    historia = rows.slice(iStory + 1, fim).map(r => r.map(x => String(x).trim()).filter(Boolean).join(' '))
      .filter(Boolean).join('\n') || null;
    const naMesma = (rows[iStory] || []).slice(1).map(x => String(x).trim()).filter(Boolean).join(' ');
    if (naMesma) historia = [naMesma, historia].filter(Boolean).join('\n');
  }
  // Modo de preparo: da linha "Steps" até o fim, colunas B em diante.
  const iSteps = rows.findIndex(r => /^steps/i.test(String(r[0]).trim()));
  let modo_preparo = null;
  if (iSteps >= 0) {
    modo_preparo = rows.slice(iSteps).map(r => r.slice(1).map(x => String(x).trim()).filter(Boolean).join(' '))
      .filter(Boolean).join('\n') || null;
  }

  const obsFicha = [];
  if (alerg.fora.length) obsFicha.push('Alergênicos na planilha fora da lista: ' + alerg.fora.join(', ') + '.');
  if (alerg.lista.includes('castanhas') && /oleaginosa/i.test(alergTexto)) {
    obsFicha.push('A planilha diz "Oleaginosas": marcar a castanha específica.');
  }

  return { ficha: {
    aba: nomeAba, nome, outlet, porcoes, preco_venda, data_referencia, categoria,
    alergenos: alerg.lista, alergTexto, observacao: obsFicha.join('\n') || null,
    tipo: /p\.?\s*f\.?\s*$/i.test(String(nomeAba).trim()) ? 'prato' : 'base',
    rendimento, rendimento_un: 'g', historia, modo_preparo, linhas, avisos,
  } };
}

function _ftImpLerArquivo(wb, XLSX) {
  const fichas = [], ignoradas = [];
  wb.SheetNames.forEach(n => {
    const r = _ftImpLerAba(wb.Sheets[n], n, XLSX);
    if (r.ficha) fichas.push(r.ficha); else ignoradas.push({ aba: n, motivo: r.ignorada });
  });
  // Duas abas com o mesmo nome em A1 gravariam uma por cima da outra.
  const vistos = {};
  fichas.forEach(f => {
    const k = _ftImpChave(f.nome);
    if (vistos[k]) { f.nome = f.nome + ' (' + f.aba + ')'; f.avisos.push('nome repetido em outra aba — renomeada'); }
    vistos[k] = true;
  });
  return { fichas, ignoradas };
}

// Liga cada ingrediente: 1) outra ficha do arquivo ou do PDV (sub-receita),
// 2) item do catálogo com o MESMO nome e só um, 3) a vincular.
// `existentes`: fichas ativas do PDV [{id, nome}]; `catalogo`: itens ativos.
function _ftImpResolver(lidas, existentes, catalogo) {
  const porNomeArquivo = {}, porNomeSolto = {};
  lidas.fichas.forEach(f => {
    [f.nome, f.aba].forEach(n => {
      const k = _ftImpChave(n), s = _ftImpChaveSolta(n);
      if (k) (porNomeArquivo[k] = porNomeArquivo[k] || new Set()).add(f);
      if (s) (porNomeSolto[s] = porNomeSolto[s] || new Set()).add(f);
    });
  });
  const existe = {};
  (existentes || []).forEach(e => { existe[_ftImpChave(e.nome)] = e; });
  const itens = {};
  (catalogo || []).forEach(i => {
    [i.nome, i.nome_curto, i.nome_inventario].filter(Boolean).forEach(n => {
      const k = _ftImpChave(n);
      (itens[k] = itens[k] || new Set()).add(i);
    });
  });

  lidas.fichas.forEach(f => {
    f.existente = existe[_ftImpChave(f.nome)] || null;
    f.linhas.forEach(l => {
      l.sub = null; l.subExistente = null; l.item = null;
      const k = _ftImpChave(l.nome), s = _ftImpChaveSolta(l.nome);
      const cand = [...(porNomeArquivo[k] || porNomeSolto[s] || [])].filter(x => x !== f);
      if (cand.length === 1) { l.sub = cand[0]; return; }
      if (existe[k] && existe[k].nome !== f.nome) { l.subExistente = existe[k]; return; }
      const it = [...(itens[k] || [])];
      if (it.length === 1) l.item = it[0];
    });
  });

  // Ordem de gravação: base antes de quem a usa.
  const ordem = [], marca = new Map();
  const visita = f => {
    if (marca.get(f) === 2) return;
    marca.set(f, 1);
    f.linhas.forEach(l => {
      if (!l.sub) return;
      // Uma base que volta a usar quem a usa: o banco recusaria. Fica a vincular.
      if (marca.get(l.sub) === 1) { l.sub = null; l.ciclo = true; return; }
      visita(l.sub);
    });
    marca.set(f, 2);
    ordem.push(f);
  };
  lidas.fichas.forEach(visita);
  lidas.ordem = ordem;
  return lidas;
}
// </IMPORTADOR>


// =====================================================================
// IMPORTAR A PLANILHA DE FICHAS
// =====================================================================
// O chef escolhe o .xlsx; o navegador lê (nada sobe para servidor), mostra
// a prévia e só grava quando ele confirma. Cada ficha entra pela mesma
// função da tela (salvar_ficha_rascunho): nasce rascunho, e a que já existe
// com o mesmo nome ganha versão nova em vez de duplicar.

function _ftCarregarScript(src) {
  return new Promise((ok, falha) => {
    if ([...document.scripts].some(s => s.src === src)) return ok();
    const s = document.createElement('script');
    s.src = src; s.onload = () => ok(); s.onerror = () => falha(new Error('não carregou ' + src));
    document.head.appendChild(s);
  });
}

function _ftImportar() {
  _FT.imp = null;
  _FT.raiz.innerHTML = `
    <div class="ft-editor">
      <div class="ft-editor-topo">
        <button class="btn btn-secondary btn-sm" onclick="_ftVoltar()">← Voltar</button>
        <span class="ft-modo-edicao">importar para ${escapeHtml(_FT.pdvNome)}</span>
      </div>
      <div class="ft-ver-titulo">Importar planilha de fichas</div>
      <label class="ft-imp-arquivo">
        <input type="file" accept=".xlsx,.xlsm,.xls" onchange="_ftImpArquivo(this)">
        <span>Escolher o arquivo .xlsx</span>
      </label>
      <div class="text-muted" style="font-size:12px;margin-top:6px">Modelo "Template ficha técnica Rosewood": uma ficha por aba.</div>
      <div id="ft-imp-res"></div>
    </div>`;
}

async function _ftImpArquivo(input) {
  const arq = input.files && input.files[0];
  const res = document.getElementById('ft-imp-res');
  if (!arq || !res) return;
  res.innerHTML = '<div class="loading-text">Lendo a planilha...</div>';
  try {
    if (!window.XLSX) await _ftCarregarScript('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js');
    const buf = await arq.arrayBuffer();
    const wb = window.XLSX.read(buf, { type: 'array' });
    const lidas = _ftImpLerArquivo(wb, window.XLSX);

    // As fichas do PDV que têm o mesmo nome: trazer as linhas para saber o
    // que mudou e para reaproveitar o vínculo que alguém já fez à mão.
    const existentes = _FT.lista.map(f => ({ id: f.id, nome: f.nome, item_id: f.item_id }));
    _ftImpResolver(lidas, existentes, _FT.catalogo);
    const ids = lidas.fichas.filter(f => f.existente).map(f => f.existente.id);
    const antigas = {};
    for (let i = 0; i < ids.length; i += 100) {
      const [{ data: fs }, { data: ls }] = await Promise.all([
        sb.from('fichas_tecnicas').select('*').in('id', ids.slice(i, i + 100)),
        sb.from('ficha_itens').select('ficha_id, item_id, sub_ficha_id, descricao, observacao, quantidade, unidade, fator_correcao, ordem')
          .in('ficha_id', ids.slice(i, i + 100)).order('ordem'),
      ]);
      (fs || []).forEach(f => { antigas[f.id] = { ficha: f, linhas: [] }; });
      (ls || []).forEach(l => antigas[l.ficha_id] && antigas[l.ficha_id].linhas.push(l));
    }
    lidas.fichas.forEach(f => {
      if (!f.existente) return;
      const a = antigas[f.existente.id];
      if (!a) return;
      f.antiga = a;
      const vinc = {};
      a.linhas.forEach(l => { if (l.descricao && (l.item_id || l.sub_ficha_id)) vinc[_ftImpChave(l.descricao)] = l; });
      f.linhas.forEach(l => {
        if (l.sub || l.subExistente || l.item) return;
        const v = vinc[_ftImpChave(l.nome)];
        if (v) { l.vinculoAntigo = { item_id: v.item_id, sub_ficha_id: v.sub_ficha_id }; }
      });
    });
    _FT.imp = { arquivo: arq.name, lidas };
    _ftImpRenderPrevia();
  } catch (e) {
    res.innerHTML = `<div class="aviso aviso-error">Não consegui ler o arquivo: ${escapeHtml(e.message || e)}</div>`;
  }
}

// O que vai para o banco. Campo que a planilha traz em branco NÃO apaga o
// que já está no sistema — genérico fica em branco na primeira carga, mas
// quem completou o rendimento na tela não pode perdê-lo numa reimportação.
function _ftImpPayload(f, ids) {
  const a = f.antiga && f.antiga.ficha;
  const ou = (novo, velho) => (novo == null || novo === '' ? (velho ?? null) : novo);
  const cab = {
    nome: f.nome, categoria: ou(f.categoria, a?.categoria), tipo: f.tipo,
    rendimento: f.rendimento != null ? f.rendimento : (a?.rendimento ?? null),
    rendimento_un: f.rendimento != null ? f.rendimento_un : (a?.rendimento_un || f.rendimento_un),
    porcoes: ou(f.porcoes, a?.porcoes), modo_preparo: ou(f.modo_preparo, a?.modo_preparo),
    observacao: ou(f.observacao, a?.observacao), historia: ou(f.historia, a?.historia),
    validade_secundaria: a?.validade_secundaria || null,
    data_referencia: ou(f.data_referencia, a?.data_referencia),
    item_id: a?.item_id || null,
    alergenos: f.alergenos.length ? f.alergenos : (a?.alergenos || []),
    preco_venda: f.preco_venda,
  };
  const linhas = f.linhas.map(l => {
    const sub = l.sub ? ids.get(l.sub) : (l.subExistente ? l.subExistente.id : l.vinculoAntigo?.sub_ficha_id);
    const item = l.item ? l.item.id : (sub ? null : l.vinculoAntigo?.item_id);
    return { item_id: item || null, sub_ficha_id: sub || null,
      // O nome da planilha fica na linha mesmo depois de vinculada.
      descricao: l.nome, observacao: l.observacao, quantidade: l.quantidade,
      unidade: l.unidade, fator_correcao: 1 };
  });
  return { cab, linhas };
}

function _ftImpContas(f) {
  const vinc = l => l.sub || l.subExistente || l.item || l.vinculoAntigo;
  return {
    sub: f.linhas.filter(l => l.sub || l.subExistente || l.vinculoAntigo?.sub_ficha_id).length,
    item: f.linhas.filter(l => l.item || l.vinculoAntigo?.item_id).length,
    vincular: f.linhas.filter(l => !vinc(l)).length,
    completar: f.linhas.filter(l => l.quantidade == null).length,
  };
}

// Sem mudança: mesmo cabeçalho que a planilha traz e mesmas linhas.
function _ftImpIgual(f) {
  const a = f.antiga;
  if (!a) return false;
  const p = _ftImpPayload(f, new Map());
  const x = a.ficha;
  const n = v => v == null ? '' : String(v);
  if (n(p.cab.categoria) !== n(x.categoria) || n(p.cab.rendimento != null ? Number(p.cab.rendimento) : '') !== n(x.rendimento != null ? Number(x.rendimento) : '')
      || n(p.cab.porcoes) !== n(x.porcoes) || n(p.cab.modo_preparo) !== n(x.modo_preparo)
      || (p.cab.tipo || 'base') !== (x.tipo || 'base')) return false;
  if (p.linhas.length !== a.linhas.length) return false;
  return p.linhas.every((l, i) => {
    const o = a.linhas[i];
    return _ftImpChave(l.descricao) === _ftImpChave(o.descricao || '')
      && n(l.quantidade != null ? Number(l.quantidade) : '') === n(o.quantidade != null ? Number(o.quantidade) : '')
      && String(l.unidade).toLowerCase() === String(o.unidade).toLowerCase();
  });
}

function _ftImpRenderPrevia() {
  const res = document.getElementById('ft-imp-res');
  const { lidas, arquivo } = _FT.imp;
  const fichas = lidas.fichas;
  fichas.forEach(f => { f.acao = !f.existente ? 'nova' : _ftImpIgual(f) ? 'igual' : 'versao'; });
  const tot = fichas.reduce((s, f) => { const c = _ftImpContas(f);
    s.sub += c.sub; s.item += c.item; s.vincular += c.vincular; s.completar += c.completar; return s; },
    { sub: 0, item: 0, vincular: 0, completar: 0 });
  const conta = a => fichas.filter(f => f.acao === a).length;
  const semRend = fichas.filter(f => f.rendimento == null && !(f.antiga && f.antiga.ficha.rendimento)).length;
  const pdv = _ftImpChave(_FT.pdvNome);
  const outrosOutlets = [...new Set(fichas.map(f => f.outlet).filter(o => o && !pdv.includes(_ftImpChave(o))
    && !_ftImpChave(o).includes(pdv)))];

  const linhaHtml = l => {
    const tag = l.sub ? `<span class="ft-tag ft-tag-rec">sub-receita: ${escapeHtml(l.sub.nome)}</span>`
      : l.subExistente ? `<span class="ft-tag ft-tag-rec">sub-receita: ${escapeHtml(l.subExistente.nome)}</span>`
      : l.item ? `<span class="ft-tag">${escapeHtml(l.item.nome)}</span>`
      : l.vinculoAntigo ? '<span class="ft-tag">vínculo já feito</span>'
      : `<span class="ft-tag ft-tag-aberto">a vincular</span>`;
    return `<li>${escapeHtml(l.nome)} · ${l.quantidade == null ? '<span class="ft-tag ft-tag-aberto">a completar</span>'
      : _ftFmt(l.quantidade) + ' ' + escapeHtml(l.unidade)} ${tag}${l.ciclo ? ' <span class="text-muted">(voltaria para a própria receita)</span>' : ''}${
      l.observacao ? ` <span class="text-muted">— ${escapeHtml(l.observacao)}</span>` : ''}</li>`;
  };

  res.innerHTML = `
    <div class="ft-imp-resumo">
      <div><strong>${fichas.length}</strong> fichas em "${escapeHtml(arquivo)}" — ${fichas.filter(f => f.tipo === 'prato').length} pratos, ${
        fichas.filter(f => f.tipo !== 'prato').length} bases</div>
      <div>${conta('nova')} novas · ${conta('versao')} já existem e ganham versão nova · ${conta('igual')} sem mudança</div>
      <div>Ingredientes: ${tot.item} ligados ao catálogo · ${tot.sub} sub-receitas · <strong>${tot.vincular} a vincular</strong> · ${tot.completar} a completar</div>
      <div>${semRend} fichas com rendimento em branco${lidas.ignoradas.length ? ` · ${lidas.ignoradas.length} abas ignoradas` : ''}</div>
    </div>
    ${outrosOutlets.length ? `<div class="aviso aviso-warn">A planilha diz outlet "${outrosOutlets.map(escapeHtml).join('", "')}" e você está importando em <strong>${escapeHtml(_FT.pdvNome)}</strong>.</div>` : ''}
    <div class="aviso aviso-info">Todas entram como <strong>rascunho</strong>. Ficha publicada que já existe continua valendo; a importação vira uma alteração para aprovar.</div>
    <div class="ft-rodape" style="margin:14px 0">
      <button class="btn btn-primary" id="ft-imp-go" onclick="_ftImpGravar()"${conta('nova') + conta('versao') ? '' : ' disabled'}>
        Importar ${conta('nova') + conta('versao')} fichas</button>
      <button class="btn btn-outline" onclick="_ftImportar()">Escolher outro arquivo</button>
    </div>
    <div id="ft-imp-prog"></div>
    <div class="ft-imp-lista">${fichas.map(f => { const c = _ftImpContas(f); return `
      <details class="ft-imp-ficha">
        <summary>
          <span class="ft-imp-nome">${escapeHtml(f.nome)}</span>
          <span class="ft-tag ${f.acao === 'nova' ? '' : f.acao === 'versao' ? 'ft-tag-rec' : ''}">${
            f.acao === 'nova' ? 'nova' : f.acao === 'versao' ? 'nova versão' : 'sem mudança'}</span>
          ${f.tipo === 'prato' ? '<span class="ft-tag ft-tag-prato">prato</span>' : ''}
          <span class="text-muted">${f.linhas.length} ingr.${c.vincular ? ` · ${c.vincular} a vincular` : ''}${
            c.completar ? ` · ${c.completar} a completar` : ''}${f.rendimento == null ? ' · sem rendimento' : ''}</span>
        </summary>
        <div class="ft-imp-det">
          <div class="text-muted">aba "${escapeHtml(f.aba)}"${f.categoria ? ' · ' + escapeHtml(f.categoria) : ''}${
            f.rendimento != null ? ` · rende ${_ftFmt(f.rendimento)} g` : ''}${f.porcoes ? ` · ${f.porcoes} porções` : ''}</div>
          ${f.avisos.filter(a => a !== 'rendimento em branco').map(a => `<div class="ft-custo-falta">${escapeHtml(a)}</div>`).join('')}
          ${f.observacao ? `<div class="ft-custo-falta">${escapeHtml(f.observacao)}</div>` : ''}
          <ul>${f.linhas.map(linhaHtml).join('')}</ul>
        </div>
      </details>`; }).join('')}</div>
    ${lidas.ignoradas.length ? `<div class="section-title mt-3"><span>Abas ignoradas</span></div>
      <ul class="ft-imp-ign">${lidas.ignoradas.map(x => `<li>${escapeHtml(x.aba)} — ${escapeHtml(x.motivo)}</li>`).join('')}</ul>` : ''}`;
}

async function _ftImpGravar() {
  const { lidas, arquivo } = _FT.imp;
  const btn = document.getElementById('ft-imp-go');
  const prog = document.getElementById('ft-imp-prog');
  if (btn) btn.disabled = true;
  const ids = new Map();
  const feitas = { nova: 0, versao: 0, igual: 0 };
  const erros = [];
  const fila = lidas.ordem;
  for (let i = 0; i < fila.length; i++) {
    const f = fila[i];
    if (prog) prog.innerHTML = `<div class="loading-text">Gravando ${i + 1} de ${fila.length}: ${escapeHtml(f.nome)}</div>`;
    if (f.acao === 'igual') { ids.set(f, f.existente.id); feitas.igual++; continue; }
    const { cab, linhas } = _ftImpPayload(f, ids);
    const { data, error } = await sb.rpc('salvar_ficha_rascunho', {
      p_ficha_id: f.existente ? f.existente.id : null, p_pdv: _FT.pdvId,
      p_cabecalho: cab, p_linhas: linhas,
      p_resumo: `Importada da planilha "${arquivo}", aba "${f.aba}"`, p_origem: 'importacao',
    });
    if (error) { erros.push({ f, msg: error.message }); continue; }
    ids.set(f, data.ficha_id);
    feitas[f.acao]++;
  }
  const pend = lidas.fichas.filter(f => ids.has(f)).map(f => ({ f, c: _ftImpContas(f) }))
    .filter(x => x.c.vincular || x.c.completar || x.f.rendimento == null);
  if (prog) prog.innerHTML = `
    <div class="aviso ${erros.length ? 'aviso-warn' : 'aviso-info'}">
      <strong>${feitas.nova} fichas criadas · ${feitas.versao} com versão nova · ${feitas.igual} sem mudança${
        erros.length ? ` · ${erros.length} com erro` : ''}.</strong>
      ${pend.length ? `<br>${pend.length} fichas ainda têm pendência (ingrediente a vincular, quantidade a completar ou rendimento).` : ''}
      ${erros.map(x => `<br>• ${escapeHtml(x.f.nome)}: ${escapeHtml(x.msg)}`).join('')}
    </div>
    <button class="btn btn-primary btn-sm" onclick="_ftVoltar()">Ver as fichas</button>`;
  // A lista de fundo precisa saber das fichas novas antes de qualquer outra ação.
  const { data } = await sb.from('fichas_tecnicas').select('id, nome, categoria, tipo, status, rendimento, rendimento_un, porcoes, versao, atualizada_em, item_id, criada_em, sharepoint_versao')
    .eq('pdv_id', _FT.pdvId).eq('ativa', true);
  if (data) _FT.lista = data;
}

// =====================================================================
// ÚLTIMOS PEDIDOS DO ITEM — "quanto eu pedi da última vez?"
// =====================================================================
// A pergunta aparece na hora de montar o pedido, não depois. Quem não
// tinha a resposta chutava, e o chute vira sobra ou falta. Mostra os três
// últimos deste PDV para este item, no mesmo processo em que a pessoa
// está — pedido de compra não ajuda quem está fazendo requisição.
//
// Só leitura, e sem preço: a tela do cozinheiro nunca mostra valor.

function _upModal() {
  let el = document.getElementById('ultimosPedidosModal');
  if (el) return el;
  el = document.createElement('div');
  el.className = 'modal-overlay';
  el.id = 'ultimosPedidosModal';
  el.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <span id="up-titulo">Últimos pedidos</span>
        <button class="modal-close" onclick="_upFechar()">&times;</button>
      </div>
      <div class="modal-body" id="up-corpo"></div>
    </div>`;
  el.addEventListener('click', ev => { if (ev.target === el) _upFechar(); });
  document.body.appendChild(el);
  return el;
}

function _upFechar() {
  document.getElementById('ultimosPedidosModal')?.classList.remove('open');
}

function _upData(v) {
  if (!v) return '';
  const d = new Date(String(v).length <= 10 ? v + 'T12:00:00' : v);
  return isNaN(d) ? '' : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function _upQtd(n) {
  const v = Number(n);
  if (!isFinite(v)) return '—';
  return v.toLocaleString('pt-BR', { maximumFractionDigits: 3 });
}

const _UP_STATUS = {
  rascunho: 'rascunho', enviada: 'enviada', aprovada: 'aprovada',
  rejeitada: 'rejeitada', entregue: 'entregue',
  enviado: 'enviada', separacao: 'em separação', cancelada: 'cancelada',
};

// pdvIdExplicito: a Comissaria pede em nome de outro PDV, entao o
// historico que interessa a ela e o do PDV de destino, nao o dela.
async function abrirUltimosPedidos(aba, itemId, pdvIdExplicito) {
  const el = _upModal();
  const corpo = document.getElementById('up-corpo');
  const item = (window.state?.catalogo || []).find(i => i.id === itemId);
  const pdvId = pdvIdExplicito || window.state?.pdvId || window.state?.perfil?.pdv_id || null;

  document.getElementById('up-titulo').textContent =
    item ? (aba === 'req' && item.nome_curto ? item.nome_curto : item.nome) : 'Últimos pedidos';
  corpo.innerHTML = '<div class="loading-text">Buscando os últimos pedidos...</div>';
  el.classList.add('open');

  if (!pdvId) {
    corpo.innerHTML = '<div class="aviso aviso-warn">Escolha primeiro o PDV de destino '
      + 'para eu saber de quem é o histórico.</div>';
    return;
  }

  const req = aba === 'req';
  const q = req
    ? sb.from('requisicao_itens')
        .select('quantidade_solicitada,quantidade_entregue,item_unidade,pedido_por,comentario,created_at,'
              + 'requisicoes!inner(id,pdv_id,status,data_competencia)')
        .eq('item_id', itemId).eq('requisicoes.pdv_id', pdvId)
    : sb.from('solicitacao_compra_itens')
        .select('quantidade_solicitada,item_unidade,pedido_por,comentario,created_at,'
              + 'solicitacoes_compra!inner(id,pdv_id,status,data_competencia)')
        .eq('item_id', itemId).eq('solicitacoes_compra.pdv_id', pdvId)
        .neq('solicitacoes_compra.status', 'rascunho');

  const { data, error } = await q.order('created_at', { ascending: false }).limit(3);

  if (error) {
    corpo.innerHTML = `<div class="aviso aviso-warn">Não consegui carregar: ${_esc(error.message)}</div>`;
    return;
  }
  if (!data || !data.length) {
    corpo.innerHTML = `<div class="empty-text" style="padding:18px">
      Este PDV ainda não pediu este item ${req ? 'por requisição' : 'por compra'}.</div>`;
    return;
  }

  const linhas = data.map(l => {
    const pai = req ? l.requisicoes : l.solicitacoes_compra;
    const un = l.pedido_por === 'pacote' ? (item ? rotuloPacote(item) : 'PCT') : (l.item_unidade || '');
    // Na requisição o que interessa é o par: o que pediu e o que chegou.
    // Em pedido por pacote o que chega é peso; nos outros a unidade é a
    // mesma em que se pediu.
    const unEntregue = l.pedido_por === 'pacote'
      ? (item ? unidadePeso(item) : 'kg')
      : (l.item_unidade || '');
    const entregue = req && l.quantidade_entregue != null
      ? `<span class="up-entregue">chegou ${_upQtd(l.quantidade_entregue)} ${_esc(unEntregue)}</span>`
      : '';
    return `
      <div class="up-linha">
        <div class="up-quando">${_upData(pai?.data_competencia || l.created_at)}</div>
        <div class="up-qtd">${_upQtd(l.quantidade_solicitada)} <span class="up-un">${_esc(un)}</span>${
          entregue ? '<br>' + entregue : ''}</div>
        <div class="up-status">${_esc(_UP_STATUS[pai?.status] || pai?.status || '')}</div>
      </div>
      ${l.comentario ? `<div class="up-coment">“${_esc(l.comentario)}”</div>` : ''}`;
  }).join('');

  const media = data.reduce((s, l) => s + Number(l.quantidade_solicitada || 0), 0) / data.length;
  corpo.innerHTML = `
    <div class="up-cabec"><span>Quando</span><span>Pediu</span><span>Situação</span></div>
    ${linhas}
    <div class="up-media">Média dos ${data.length === 1 ? 'último pedido' : data.length + ' últimos'}:
      <strong>${_upQtd(media)}</strong></div>`;
}

// =====================================================================
// A BUSCA MANDA; A CATEGORIA É FILTRO
// =====================================================================
// Quem digita um nome quer procurar no catálogo inteiro. Enquanto a
// categoria vinha primeiro, procurar "flor de abobrinha" na aba Proteína
// devolvia lista vazia — e a pessoa concluía que o item não existe e
// mandava cadastrar de novo um item que já estava lá.
//
// Por isso, começar a digitar leva a lista para "Todas". Só na transição
// de vazio → com texto: se a pessoa escolher uma categoria de propósito
// no meio da digitação, o filtro dela fica de pé até limpar a busca.

const _buscaAnterior = {};

function buscaAbriuCatalogo(chave, valor) {
  const antes = String(_buscaAnterior[chave] || '').trim();
  const agora = String(valor || '').trim();
  _buscaAnterior[chave] = valor || '';
  return !antes && !!agora;
}

// Agrupa por categoria — é o cabeçalho que diz onde o item mora quando o
// resultado vem de várias.
function blocoPorCategoria(lista, renderLinha) {
  const porCat = {};
  lista.forEach(it => { (porCat[it.categoria] = porCat[it.categoria] || []).push(it); });
  return Object.keys(_CAT_ITEM).filter(c => porCat[c]).map(c => `
    <div class="subgroup-head">
      <span>${_escEd(_CAT_ITEM[c] || c)}</span>
      <span class="count">${porCat[c].length} ${porCat[c].length === 1 ? 'item' : 'itens'}</span>
    </div>
    ${porCat[c].map(i => renderLinha(i)).join('')}`).join('');
}

// Rede de segurança para quem estreitou a busca de propósito: o que ficou
// fora da categoria escolhida aparece embaixo, separado, em vez de sumir.
function blocoForaDaCategoria(fora, quantosDentro, cat, renderLinha) {
  if (!fora.length) return '';
  return `
    <div class="fora-cat-aviso">${quantosDentro
      ? 'Também achei em outras categorias:'
      : 'Nada em ' + _escEd(_CAT_ITEM[cat] || cat) + '. Achei em outras categorias:'}</div>
    ${blocoPorCategoria(fora, renderLinha)}`;
}

// =====================================================================
// NÚMERO DIGITADO EM PORTUGUÊS
// =====================================================================
// `<input type="number">` recusa vírgula: quem digita "1,8" tem o campo
// recusado pelo navegador ou lido como 1. Nas telas o padrão passa a ser
// `type="text" inputmode="decimal"` — o teclado do celular continua
// numérico — e a leitura vem por aqui.
//
// Devolve null para vazio e para lixo, nunca NaN: NaN escapava para o
// banco como null silencioso ou quebrava a conta na tela.
function numBR(v) {
  if (v === null || v === undefined) return null;
  const t = String(v).trim();
  if (t === '') return null;
  // "1.234,56" (formato pt-BR) e "1234.56" (o que o input devolve)
  const limpo = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t;
  const n = parseFloat(limpo);
  return isFinite(n) ? n : null;
}
