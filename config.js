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
};

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
