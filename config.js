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
  return item?.tipo_aquisicao !== 'transformado' && !item?.producao_propria;
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
        <div class="form-row col2">
          <div><label class="field-label">Categoria</label>
            <select class="select" id="ed-cat">
              <option value="proteina">Proteína</option>
              <option value="laticinios">Laticínios</option>
              <option value="hortifruti">Hortifruti</option>
              <option value="diversos">Diversos</option>
            </select></div>
          <div><label class="field-label">Unidade de compra</label>
            <input class="input" id="ed-unid" placeholder="KG, UN, CX..."></div>
        </div>

        <div class="ed-secao">Fornecedores deste item</div>
        <div id="ed-forn-lista"></div>
        <div class="ed-nota" id="ed-nota-forn"></div>
        <button class="btn btn-sm btn-secondary mt-2" onclick="_edAddFornecedor()">+ Adicionar fornecedor</button>

        <div class="form-row col2 so-gerente">
          <div><label class="field-label">Tipo de aquisição</label>
            <select class="select" id="ed-tipo">
              <option value="comprado">Comprado</option>
              <option value="transformado">Transformado na cozinha</option>
              <option value="ambos">Ambos</option>
            </select></div>
          <div></div>
        </div>

        <div class="ed-checks so-gerente">
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
  v('ed-unid', data.unidade);
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

  if (error) { showToast(_msgErroEditor(error), 'error'); return; }

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

function _msgErroEditor(err) {
  const m = err.message || '';
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
const _ROTULO_PERFIL = { executivo: 'Chef', gerente_compras: 'Gerente', estoque: 'Comissaria' };

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
             i.comentario ? `<span class="item-obs">${_esc(i.comentario)}</span>` : ''}</td>
           <td data-label="Categoria">${_esc(i.item_categoria || '—')}</td>
           <td class="num" data-label="Pedido">${_qtd(i.quantidade_solicitada)} ${pct ? rot : un}${
             pct && est ? `<br><span class="est-peso">${est}</span>` : ''}</td>
           ${entregue ? `
             <td class="num" data-label="Entregue">${pct
               ? (i.pacotes_entregues != null
                   ? `<span class="${falta > 0.0001 ? 'text-error' : ''}">${_qtd(i.pacotes_entregues)} ${rot}</span>${
                       i.quantidade_entregue != null
                         ? `<br><span class="est-peso">${_qtd(i.quantidade_entregue)} ${uPeso} pesado</span>`
                         : '<br><span class="text-error" style="font-size:11px">não pesado</span>'}`
                   : '—')
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
     <div id="timelineItem"></div>`
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

// =====================================================================
// INVENTÁRIO — a contagem no celular
// =====================================================================
// Substitui imprimir 725 linhas, preencher à mão e redigitar. Mora aqui
// porque roda em duas telas: o chef conta pelo executivo.html, e nas duas
// cozinhas sem chef (Emerald Pool e Bela Vista) o cozinheiro conta pelo
// pdv.html. Duplicar isso em dois arquivos garantiria que um ficasse para
// trás do outro.
//
// A contagem é CEGA: nada de contagem anterior nem saldo teórico na tela.
// O inventário existe para achar a diferença; mostrar o número esperado
// ancora quem conta e a diferença some.
//
// "Não contei" e "não tenho" são estados diferentes e ficam separados no
// banco: não contei = sem linha; não tenho = linha com zero. Na planilha
// do financeiro os dois virariam a mesma célula vazia, e um item esquecido
// seria lido como item que acabou.
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
  _INV.competencia = opts.competencia || (new Date().toISOString().slice(0, 7) + '-01');

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
        : '<button class="inv-zero" onclick="_invSalvar(\'' + k + '\', 0)"'
          + ' title="Não tenho este item">0</button>'
          + '<button class="inv-apagar" onclick="_invApagar(\'' + k + '\')"'
          + ' title="Voltar para não contado"' + (tem ? '' : ' disabled') + '>×</button>')
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
  const falta = _invTodos().length - _INV.contagem.size;
  if (concluir && falta && !confirm(
      'Ainda faltam ' + falta + ' item(ns) sem contagem.\n\n'
    + 'Marcar como concluído mesmo assim? Eles vão para o financeiro '
    + 'como célula vazia, não como zero.')) return;

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
      if (error) throw error;
      _INV.contagem.set(chave, { id: data.id, qtd });
    }
    _invAtualizarLinha(chave);
  } catch (e) {
    showToast('Não gravou: ' + (e.message || e), 'error');
  } finally {
    _INV.salvando.delete(chave);
  }
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
