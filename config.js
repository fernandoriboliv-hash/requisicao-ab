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
