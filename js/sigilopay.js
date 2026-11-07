/**
 * SigiloPay — integração Pix para "Rifa Donna Gina Moda Plus"
 * ----------------------------------------------------------------------------
 * Como obter suas credenciais / link de checkout no painel SigiloPay:
 *   1. Acesse https://app.sigilopay.com.br e crie/faça login na sua conta.
 *   2. No painel, gere sua chave de API (API Key / Secret Key) e sua chave Pix.
 *   3. Para o checkout por link (caminho oficial simples): no painel, crie um
 *      produto/valor (ex.: R$ 10,00 por número) ou copie o link de checkout
 *      gerado pelo painel e cole em `checkoutUrlBase` no config.js.
 *   4. Cole a API Key e o endpoint em `window.SIGILO_CONFIG` no config.js:
 *         window.SIGILO_CONFIG = {
 *           apiKey: 'SUA_API_KEY_AQUI',          // nunca commitar secret real no git
 *           endpoint: 'https://app.sigilopay.com.br/api/pix',
 *           checkoutUrlBase: 'https://app.sigilopay.com.br/checkout/SEU_LINK',
 *           modoDemo: false                       // false = modo real
 *         };
 *
 * ⚠️  AVISO DE SEGURANÇA (PRODUÇÃO):
 *   - Em produção, NÃO exponha a secret key no frontend. O ideal é um
 *     backend/proxy próprio (ex.: /api/criar-pix) que guarda a secret e
 *     chama o SigiloPay, retornando só o QR Code / link de checkout ao site.
 *   - Nunca commite secret key real no repositório. Use variáveis de
 *     ambiente no backend. Este arquivo só funciona com chave pública ou
 *     via proxy — em modo demo (modoDemo: true ou apiKey vazio) ele gera
 *     dados fictícios e nunca chama o gateway.
 * ----------------------------------------------------------------------------
 */
(function () {
  'use strict';

  // Config lida de config.js (window.SIGILO_CONFIG). Defaults seguros = demo.
  function getConfig() {
    var cfg = (typeof window !== 'undefined' && window.SIGILO_CONFIG) || {};
    return {
      apiKey: cfg.apiKey || '',
      endpoint: cfg.endpoint || 'https://app.sigilopay.com.br/api/pix',
      checkoutUrlBase: cfg.checkoutUrlBase || '',
      modoDemo: cfg.modoDemo !== undefined ? !!cfg.modoDemo : true
    };
  }

  function isDemo(cfg) {
    cfg = cfg || getConfig();
    return cfg.modoDemo || !cfg.apiKey;
  }

  function nowId() {
    return 'demo-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }

  function cents(amount) {
    var n = Number(amount);
    if (!isFinite(n)) return 0;
    return Math.round(n * 100);
  }

  // Resposta demo determinística (sempre fictícia e claramente marcada).
  function demoResponse(opts) {
    opts = opts || {};
    var amount = Number(opts.amount) || 0;
    var cfg = getConfig();
    var id = nowId();
    return {
      ok: true,
      id: id,
      qrCode: null, // sem QR real em demo — a UI pode gerar via pixCode ou mostrar só o código
      pixCode: '00020126580014BR.GOV.BCB.PIX.0136DEMO-DONNA-GINA-RIFA-FAKE-' +
        String(cents(amount)).padStart(6, '0') + '5204FAKE5303986.00' +
        '5802BR5913DONNA GINA RIFA6009SAO PAULO62070503***6304FAKE',
      checkoutUrl: buildCheckoutUrl(opts, cfg),
      demo: true,
      message: 'Modo demonstração: nenhum pagamento real foi criado.'
    };
  }

  // Monta URL de checkout a partir de checkoutUrlBase, se existir.
  // No painel SigiloPay: copie o link de checkout e cole em checkoutUrlBase (config.js).
  function buildCheckoutUrl(params, cfgOverride) {
    var cfg = cfgOverride || getConfig();
    var base = (cfg.checkoutUrlBase || '').trim();
    if (!base) return null;
    var p = params || {};
    var q = [];
    var amount = Number(p.amount);
    if (isFinite(amount) && amount > 0) q.push('amount=' + encodeURIComponent(String(amount)));
    if (p.description) q.push('description=' + encodeURIComponent(String(p.description)));
    if (p.buyer) {
      if (p.buyer.name) q.push('name=' + encodeURIComponent(String(p.buyer.name)));
      if (p.buyer.email) q.push('email=' + encodeURIComponent(String(p.buyer.email)));
      if (p.buyer.phone) q.push('phone=' + encodeURIComponent(String(p.buyer.phone)));
    }
    if (!q.length) return base;
    var sep = base.indexOf('?') === -1 ? '?' : '&';
    return base + sep + q.join('&');
  }

  // Extrai campos padronizados de respostas variadas do gateway.
  function normalizeResponse(json, cfg) {
    if (!json || typeof json !== 'object') return null;
    var data = json.data && typeof json.data === 'object' ? json.data : json;
    var id = data.id || data.payment_id || data.transaction_id || data.uuid || null;
    var qrCode = data.qr_code || data.qrcode || data.qrCode || data.image || null;
    var pixCode = data.pix_code || data.pixCode || data.copy_paste || data.copia_e_cola ||
                  data.brcode || data.emv || null;
    var checkoutUrl = data.payment_url || data.checkout_url || data.checkoutUrl ||
                      data.url || data.link || null;
    if (!checkoutUrl) checkoutUrl = buildCheckoutUrl({ amount: data.amount }, cfg);
    if (!id && !pixCode && !qrCode && !checkoutUrl) return null;
    return { ok: true, id: id, qrCode: qrCode, pixCode: pixCode, checkoutUrl: checkoutUrl, demo: false, raw: json };
  }

  /**
   * createPix({ amount, buyer:{name,email,phone}, description })
   * Nunca lança erro: em falha de rede/gateway retorna ok:false com mensagem
   * para a UI cair para o WhatsApp.
   */
  async function createPix(params) {
    var p = params || {};
    var amount = Number(p.amount);
    if (!isFinite(amount) || amount <= 0) {
      return { ok: false, demo: isDemo(), message: 'Valor inválido.' };
    }
    var cfg = getConfig();

    // Modo demo ou sem chave: resposta fictícia, sem chamar o gateway.
    if (isDemo(cfg)) return demoResponse(p);

    var buyer = p.buyer || {};
    var phone = String(buyer.phone || buyer.telefone || '').replace(/\D/g, '');
    var email = String(buyer.email || '').trim();
    if (!email) email = phone + '@clientes.ginamodas.com.br';
    var document = String(buyer.document || buyer.documento || buyer.cpf || '').replace(/\D/g, '');
    var externalId = 'rifa-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
    var body = {
      identifier: externalId,
      amount: amount,
      client: {
        name: buyer.name || buyer.nome || '',
        email: email,
        phone: phone,
        document: document
      },
      products: [{
        id: 'rifa-donna-gina',
        name: p.description || 'Rifa Donna Gina Moda Plus',
        quantity: 1,
        price: amount
      }]
    };

    try {
      var controller = new AbortController();
      var timer = setTimeout(function () { controller.abort(); }, 20000);
      var resp;
      try {
        resp = await fetch(cfg.endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: controller.signal
        });
      } finally {
        clearTimeout(timer);
      }

      var json = null;
      try { json = await resp.json(); } catch (e) { json = null; }
      var pix = json && json.pix;
      var pixCode = pix && (pix.code || pix.pixCode);
      if (pixCode) {
        return {
          ok: true,
          demo: false,
          id: json.transactionId || externalId,
          pixCode: pixCode,
          qrCode: pix.image || null,
          message: 'Pix criado.'
        };
      }
      var apiMsg = (json && (json.message || json.error)) || 'Não foi possível gerar o Pix.';
      return { ok: false, demo: false, message: String(apiMsg).trim() };
    } catch (err) {
      return { ok: false, demo: false, message: 'Não foi possível falar com a Oasy.fy. Tente de novo.' };
    }
  }

  /**
   * getStatus(paymentId): consulta GET endpoint + '/' + paymentId.
   * Sem configuração ou em demo: { status:'pending', demo:true }.
   */
  async function getStatus(paymentId) {
    var cfg = getConfig();
    if (isDemo(cfg) || !paymentId) return { status: 'pending', demo: true };
    try {
      var controller = new AbortController();
      var timer = setTimeout(function () { controller.abort(); }, 15000);
      var resp;
      try {
        resp = await fetch(cfg.endpoint + '/' + encodeURIComponent(String(paymentId)), {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + cfg.apiKey,
            'x-api-key': cfg.apiKey
          },
          signal: controller.signal
        });
      } finally {
        clearTimeout(timer);
      }
      var json = null;
      try { json = await resp.json(); } catch (e) { json = null; }
      if (!resp.ok || !json) return { status: 'pending', demo: false };
      var data = json.data && typeof json.data === 'object' ? json.data : json;
      var status = String(data.status || data.state || 'pending').toLowerCase();
      if (status.indexOf('paid') !== -1 || status.indexOf('approved') !== -1 || status.indexOf('conclu') !== -1) status = 'paid';
      else if (status.indexOf('cancel') !== -1 || status.indexOf('expir') !== -1) status = 'expired';
      else status = 'pending';
      return { status: status, demo: false, id: paymentId, raw: json };
    } catch (err) {
      return { status: 'pending', demo: false };
    }
  }

  window.SigiloPay = {
    createPix: createPix,
    getStatus: getStatus,
    buildCheckoutUrl: buildCheckoutUrl
  };

  (function logMode() {
    try {
      var cfg = getConfig();
      if (isDemo(cfg)) {
        console.info('[SigiloPay] modo demo (configure apiKey/endpoint em config.js para modo real)');
      } else {
        console.info('[SigiloPay] modo real endpoint ' + cfg.endpoint);
      }
    } catch (e) { /* nunca quebrar o site por log */ }
  })();
})();
