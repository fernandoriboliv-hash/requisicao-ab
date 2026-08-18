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
          <label class="field-label">Nome de compra — o que a compradora manda ao fornecedor</label>
          <input class="input" id="ed-nome">
        </div>
        <div class="form-row col2 so-gerente">
          <div><label class="field-label">Nome na requisição — o que o cozinheiro vê</label>
            <input class="input" id="ed-curto" placeholder="vazio = usa o nome de compra"></div>
          <div><label class="field-label">Nome no inventário — o que aparece na contagem</label>
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
          <div><label class="field-label">Unidade de compra</label>
            <input class="input" id="ed-unid" placeholder="KG, UN, CX..."></div>
          <div><label class="field-label">Fornecedor principal</label>
            <select class="select" id="ed-forn"></select></div>
        </div>
        <div class="ed-nota" id="ed-nota-forn"></div>

        <div class="ed-secao so-gerente">Como este item é adquirido</div>
        <div class="form-row col2 so-gerente">
          <div><label class="field-label">Tipo de aquisição</label>
            <select class="select" id="ed-tipo">
              <option value="comprado">Comprado — aparece na lista de compras</option>
              <option value="transformado">Transformado na cozinha — não se compra</option>
              <option value="ambos">Ambos — comprado pronto e também produzido</option>
            </select></div>
          <div class="ed-nota" style="align-self:end;padding-bottom:8px">
            Transformado sai da lista de compras: quem se compra é o item bruto.
          </div>
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
        <div class="ed-nota" id="ed-aviso-perfil" style="display:none">
          Os campos de cozinha — nome do cozinheiro, inventário, aproveitamento —
          são editados pelo Gerente de Compras.
        </div>
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
  const avisoPerfil = document.getElementById('ed-aviso-perfil');
  if (avisoPerfil) avisoPerfil.style.display = soGerente ? 'none' : '';

  const v = (id, val) => document.getElementById(id).value = val ?? '';
  const c = (id, val) => document.getElementById(id).checked = !!val;
  v('ed-nome', data.nome);
  v('ed-curto', data.nome_curto);
  v('ed-inv-nome', data.nome_inventario);
  v('ed-cat', data.categoria || 'proteina');
  v('ed-unid', data.unidade);
  // Fornecedor principal: escolha entre os que atendem ESTE item, não texto
  // livre. Nome digitado à mão não casa com a matriz e vira fornecedor
  // fantasma na hora de gerar a PO.
  const { data: vinc } = await sb.from('item_fornecedores')
    .select('fornecedor_id, preferencia, fornecedores(nome)')
    .eq('item_id', itemId).eq('ativo', true);
  const opcoes = (vinc || [])
    .map(x => ({ nome: x.fornecedores?.nome, pref: x.preferencia }))
    .filter(x => x.nome)
    .sort((a, b) => a.pref - b.pref || a.nome.localeCompare(b.nome));

  const atual = data.fornecedor_principal;
  const nomes = opcoes.map(o => o.nome);
  // O que está gravado hoje pode não estar na matriz. Some-lo seria apagar
  // dado por efeito colateral, então ele entra na lista marcado.
  if (atual && !nomes.includes(atual)) nomes.unshift(atual);

  document.getElementById('ed-forn').innerHTML =
    '<option value="">— sem fornecedor principal —</option>'
    + nomes.map(n => {
        const o = opcoes.find(x => x.nome === n);
        const rot = !o ? ' (fora da matriz)'
                  : o.pref === 1 ? ' · principal'
                  : o.pref === 3 ? ' · esporádico' : ' · secundário';
        return `<option value="${_escEd(n)}">${_escEd(n)}${rot}</option>`;
      }).join('');
  v('ed-forn', atual);

  document.getElementById('ed-nota-forn').textContent = opcoes.length
    ? opcoes.length + ' fornecedor(es) cadastrado(s) para este item. '
      + 'Para incluir outro, use Itens × Fornecedores.'
    : 'Nenhum fornecedor cadastrado para este item ainda — cadastre em Itens × Fornecedores '
      + 'para ele poder entrar numa ordem de compra.';

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
    fornecedor_principal: document.getElementById('ed-forn').value || null,
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
                      onclick="corrigirPeso(sb,'${i.id}','${_esc(i.item_nome).replace(/'/g, "\\'")}',${
                        i.quantidade_entregue},'${pct ? uPeso : un}','${r.id}')">corrigir peso</button>` : ''}</td>
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
