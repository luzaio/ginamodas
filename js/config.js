/**
 * config.js — Configuração central do site "Rifa Donna Gina Moda Plus"
 * ----------------------------------------------------------------------------
 * Este arquivo centraliza TODAS as informações da rifa e do pagamento.
 * Os demais arquivos (HTML/JS) leem apenas daqui — não duplique valores em outro lugar.
 *
 * Expõe globalmente:
 *   - window.RIFA_CONFIG
 *   - window.SIGILO_CONFIG
 *   - window.formatBRL(valor)
 *   - window.getTotal(selectedCount)
 *
 * COMO CONFIGURAR O SIGILOPAY (passo-a-passo):
 *   1. Crie sua conta / faça cadastro em: https://app.sigilopay.com.br
 *   2. No painel do SigiloPay, acesse as área de chaves/API e copie sua chave pública / token.
 *   3. Cole a chave em SIGILO_CONFIG.apiKey abaixo. Se você preferir não usar API,
 *      gere um link de checkout no painel e cole em SIGILO_CONFIG.checkoutUrlBase.
 *      Ajuste SIGILO_CONFIG.endpoint apenas se o painel mostrar outro endpoint.
 *   4. Teste primeiro com modoDemo: true (gera QR demo, sem chamar a API real).
 *      Quando validar tudo, mude para modoDemo: false para usar a API real.
 *
 * ⚠️  SEGURANÇA: Nunca exponha segredos no frontend em produção — o ideal é um
 *     backend/proxy para gerar a cobrança PIX. A chave abaixo deve ser apenas a
 *     chave pública / token do painel, nunca segredo de servidor.
 *     O campo webhookSecret é apenas referência e NÃO deve ser usado no frontend.
 *
 * Carregamento: este script deve ser incluído ANTES dos demais scripts da página.
 * Ele é protegido: se for carregado 2x, não sobrescreve a configuração existente.
 */
(function () {
  'use strict';

  // --------------------------------------------------------------------------
  // Proteção contra carregamento duplicado
  // Se o script já foi carregado antes, não sobrescreve nada.
  // --------------------------------------------------------------------------
  if (window.RIFA_CONFIG && window.SIGILO_CONFIG) {
    return;
  }

  // --------------------------------------------------------------------------
  // Configuração da loja / rifa
  // --------------------------------------------------------------------------
  window.RIFA_CONFIG = {
    loja: 'Donna Gina Moda Plus',
    premio: '10 peças grátis',
    precoPorNumero: 10, // em R$ (reais) — preço de cada número da rifa
    totalNumeros: 100,  // quantidade total de números disponíveis
    whatsapp: '5500999999999',       // número com DDI+DDD, só dígitos, formato wa.me
    whatsappExibicao: '(00) 99999-9999', // texto para mostrar na tela / footer
    moeda: 'BRL' // código ISO da moeda usada na formatação
  };

  // --------------------------------------------------------------------------
  // Configuração do SigiloPay
  // PREENCHA com suas chaves do painel em app.sigilopay.com.br
  // Nunca exponha segredos no frontend em produção — o ideal é um backend/proxy.
  // --------------------------------------------------------------------------
  window.SIGILO_CONFIG = {
    apiKey: '',        // sua chave pública / token do painel SigiloPay
    endpoint: 'https://app.sigilopay.com.br/api/pix', // ajuste se o painel mostrar outro endpoint
    checkoutUrlBase: '', // ex: 'https://pay.sigilopay.com.br/checkout/SEU_LINK' se você gerar link de checkout no painel
    webhookSecret: '', // apenas referência, não usar no frontend
    modoDemo: true // true = gera QR demo sem chamar API real; mude para false quando configurar
  };

  // --------------------------------------------------------------------------
  // Helper: formata número para moeda brasileira
  // Exemplo: formatBRL(10)  -> 'R$ 10,00'
  //          formatBRL(1234.5) -> 'R$ 1.234,50'
  // --------------------------------------------------------------------------
  window.formatBRL = function (valor) {
    var numero = Number(valor) || 0;
    var moeda = (window.RIFA_CONFIG && window.RIFA_CONFIG.moeda) || 'BRL';

    try {
      return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: moeda,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(numero);
    } catch (e) {
      // Fallback simples caso Intl não suporte a moeda
      return 'R$ ' + numero.toFixed(2).replace('.', ',');
    }
  };

  // --------------------------------------------------------------------------
  // Helper: calcula o total a pagar com base na quantidade de números
  // Exemplo: getTotal(3) -> 30  (3 números × R$ 10,00)
  // --------------------------------------------------------------------------
  window.getTotal = function (selectedCount) {
    var quantidade = Number(selectedCount) || 0;
    var preco = (window.RIFA_CONFIG && Number(window.RIFA_CONFIG.precoPorNumero)) || 0;
    return quantidade * preco;
  };

  // --------------------------------------------------------------------------
  // Logs informativos (só quando modoDemo está ativo)
  // --------------------------------------------------------------------------
  if (window.SIGILO_CONFIG.modoDemo) {
    console.info('[RIFA_CONFIG] Modo DEMO ativo — nenhum pagamento real será feito.');
    console.info(
      '[RIFA_CONFIG] Loja:',
      window.RIFA_CONFIG.loja,
      '| Prêmio:',
      window.RIFA_CONFIG.premio,
      '| Preço por número:',
      window.formatBRL(window.RIFA_CONFIG.precoPorNumero),
      '| Total de números:',
      window.RIFA_CONFIG.totalNumeros
    );
    console.info(
      '[SIGILO_CONFIG] modoDemo=true — QR code de demonstração será gerado. ' +
      'Para ativar o pagamento real: 1) crie conta em app.sigilopay.com.br, ' +
      '2) copie sua chave, 3) cole em apiKey (ou gere link checkout), 4) mude modoDemo para false.'
    );
  }

})();
