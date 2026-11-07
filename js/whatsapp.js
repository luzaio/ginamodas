/**
 * whatsapp.js — Donna Gina Moda Plus (Rifa)
 * Integração com WhatsApp via wa.me
 *
 * Pré-requisitos esperados em window (opcional, com fallbacks):
 *  - window.RIFA_CONFIG.whatsapp (ex.: "5500999999999")
 *  - window.RIFA_CONFIG.price / pricePerNumber — preço por número (padrão R$ 10)
 *  - window.Rifa.getSelected() — retorna array de números selecionados
 *  - window.formatBRL(valor) — formata número para "R$ 1.234,56"
 *
 * Expõe:
 *  - window.buildWhatsAppMessage(selected, total, buyer?)
 *  - window.openWhatsApp(message?)
 *  - window.updateWhatsAppLinks()
 */
(function () {
  'use strict';

  /* ------------------------------------------------------------------ */
  /* Helpers                                                             */
  /* ------------------------------------------------------------------ */

  // Número padrão da loja: (00) 99999-9999 -> 5500999999999
  var FALLBACK_NUMBER = '5500999999999';

  // Preço padrão por número da rifa
  var FALLBACK_PRICE = 10;

  // Mensagem genérica quando não há números selecionados
  var GENERIC_MESSAGE = 'Olá! Quero saber mais da Rifa da Gina';

  /**
   * Obtém o número do WhatsApp apenas com dígitos (DDI + DDD + número).
   * Lê window.RIFA_CONFIG.whatsapp; se não houver, usa o fallback.
   */
  function getWhatsAppNumber() {
    var raw = '';
    if (typeof window !== 'undefined' && window.RIFA_CONFIG && window.RIFA_CONFIG.whatsapp) {
      raw = String(window.RIFA_CONFIG.whatsapp);
    }
    if (!raw) raw = FALLBACK_NUMBER;

    var digits = raw.replace(/\D/g, '');

    if (!digits) return FALLBACK_NUMBER;

    // Se vier só DDD + número (ex.: 00999999999 / 999999999), prefixa o 55.
    if (digits.length <= 11 && digits.indexOf('55') !== 0) {
      digits = '55' + digits;
    }

    return digits;
  }

  /**
   * Preço de um número (R$ 10 por padrão).
   * Aceita RIFA_CONFIG.price, pricePerNumber ou value.
   */
  function getPricePerNumber() {
    var cfg = (typeof window !== 'undefined' && window.RIFA_CONFIG) || {};
    var price = cfg.precoPorNumero !== undefined ? cfg.precoPorNumero : (cfg.price !== undefined ? cfg.price : (cfg.pricePerNumber !== undefined ? cfg.pricePerNumber : cfg.value));
    var n = Number(price);
    return isNaN(n) || n <= 0 ? FALLBACK_PRICE : n;
  }

  /**
   * Busca os números selecionados via window.Rifa.getSelected(),
   * quando disponível; senão retorna [].
   */
  function getSelectedNumbers() {
    try {
      if (typeof window !== 'undefined' && window.Rifa && typeof window.Rifa.getSelected === 'function') {
        var list = window.Rifa.getSelected();
        return Array.isArray(list) ? normalizeSelected(list) : [];
      }
    } catch (e) { /* ignora e cai no fallback */ }
    return [];
  }

  /**
   * Normaliza a seleção: aceita [1, 5] ou [{ number: 1 }] e devolve
   * array ordenado de números.
   */
  function normalizeSelected(selected) {
    if (!Array.isArray(selected)) return [];
    return selected
      .map(function (item) {
        if (item !== null && typeof item === 'object') {
          return Number(item.number !== undefined ? item.number : item.value);
        }
        return Number(item);
      })
      .filter(function (n) { return !isNaN(n); })
      .sort(function (a, b) { return a - b; });
  }

  /**
   * Formata o total como "R$ X,XX" usando window.formatBRL quando houver.
   */
  function formatTotal(total, selected) {
    var value = Number(total);
    if (isNaN(value)) {
      // Sem total informado: calcula pela quantidade de números.
      value = (Array.isArray(selected) ? selected.length : 0) * getPricePerNumber();
    }

    if (typeof window !== 'undefined' && typeof window.formatBRL === 'function') {
      try {
        var formatted = window.formatBRL(value);
        if (formatted) return String(formatted);
      } catch (e) { /* cai no fallback abaixo */ }
    }

    // Fallback manual: "R$ 1.234,56"
    return 'R$ ' + value.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }

  /** Formata um número com zero à esquerda: 1 -> "01", 105 -> "105". */
  function pad(n) {
    return String(n).padStart(2, '0');
  }

  /* ------------------------------------------------------------------ */
  /* Monta a mensagem                                                    */
  /* ------------------------------------------------------------------ */

  /**
   * Monta a mensagem do WhatsApp em pt-BR (texto puro, sem encode).
   * - Com números: "Olá Donna Gina 👑 Quero participar da Rifa! Números: ..."
   * - Sem números: mensagem genérica "Olá! Quero saber mais da Rifa da Gina"
   *
   * @param {Array}  [selected] Números selecionados (padrão: Rifa.getSelected())
   * @param {Number} [total]    Total em R$ (padrão: qtd × preço)
   * @param {String} [buyer]    Nome do comprador (opcional)
   * @returns {String} Mensagem formatada
   */
  function buildWhatsAppMessage(selected, total, buyer) {
    var numbers = Array.isArray(selected) ? normalizeSelected(selected) : getSelectedNumbers();

    if (!numbers.length) {
      return GENERIC_MESSAGE;
    }

    var totalFormatted = formatTotal(total, numbers);
    var qtyText = numbers.length === 1 ? '1 número' : numbers.length + ' números';

    var msg = 'Olá Donna Gina 👑 Quero participar da Rifa! ' +
      'Números: ' + numbers.map(pad).join(', ') + '. ' +
      'Total: ' + totalFormatted + ' (' + qtyText + '). ' +
      'Pode reservar pra mim?';

    if (buyer && String(buyer).trim()) {
      msg += ' Nome: ' + String(buyer).trim();
    }

    return msg;
  }

  /**
   * Monta a mensagem de envio do comprovante após Pix ({ pix:created }).
   */
  function buildReceiptMessage(detail) {
    var d = detail || {};
    var numbers = d.selected || d.numbers || getSelectedNumbers();
    var normalized = normalizeSelected(numbers);
    var totalFormatted = formatTotal(d.total !== undefined ? d.total : d.amount, normalized);
    var buyer = d.buyer || d.name || '';

    var msg = 'Olá Donna Gina 👑 Acabei de pagar via Pix! Segue o comprovante. ' +
      (normalized.length ? 'Números: ' + normalized.map(pad).join(', ') + '. ' : '') +
      'Total: ' + totalFormatted + '. ' +
      (buyer ? 'Nome: ' + String(buyer).trim() + '. ' : '') +
      'Pode confirmar pra mim?';

    if (d.txid || d.id) {
      msg += ' ID: ' + (d.txid || d.id);
    }

    return msg;
  }

  /* ------------------------------------------------------------------ */
  /* Abre o WhatsApp                                                     */
  /* ------------------------------------------------------------------ */

  /**
   * Abre o WhatsApp em nova aba com a mensagem (wa.me + encodeURIComponent).
   * @param {String} [message] Mensagem opcional; sem ela, monta da seleção atual.
   */
  function openWhatsApp(message) {
    var msg = (typeof message === 'string' && message.trim()) ? message : buildWhatsAppMessage();
    var number = getWhatsAppNumber();
    var url = 'https://wa.me/' + number + '?text=' + encodeURIComponent(msg);
    window.open(url, '_blank');
    return url;
  }

  /* ------------------------------------------------------------------ */
  /* Liga todos os pontos: float, .btn-whatsapp e [data-whatsapp]        */
  /* ------------------------------------------------------------------ */

  /** Seletor único de todos os pontos que devem falar no WhatsApp. */
  var WHATSAPP_SELECTOR = '#btn-whatsapp-float, .btn-whatsapp, [data-whatsapp]';

  /** Recolhe os elementos que devem apontar para o wa.me. */
  function findWhatsAppElements() {
    return Array.prototype.slice.call(document.querySelectorAll(WHATSAPP_SELECTOR));
  }

  /**
   * Calcula a mensagem ideal para um clique:
   *  - números selecionados -> mensagem com números e total;
   *  - senão, usa data-whatsapp personalizado (se houver) ou a genérica.
   */
  function messageForElement(el) {
    var selected = getSelectedNumbers();
    if (selected.length) return buildWhatsAppMessage(selected);

    var custom = el && el.getAttribute ? (el.getAttribute('data-whatsapp') || '') : '';
    if (custom && custom.toLowerCase() !== 'true') return String(custom).trim();

    return GENERIC_MESSAGE;
  }

  /**
   * Atualiza o href de todos os links Âncora com o wa.me + mensagem
   * do momento (assim o href estático também contém "wa.me/").
   */
  function updateWhatsAppLinks() {
    var number = getWhatsAppNumber();
    findWhatsAppElements().forEach(function (el) {
      // Só links <a> têm href; botões são tratados pelo clique.
      if (el && el.tagName === 'A') {
        var url = 'https://wa.me/' + number + '?text=' + encodeURIComponent(messageForElement(el));
        el.setAttribute('href', url);
        el.setAttribute('target', '_blank');
        el.setAttribute('rel', 'noopener noreferrer');
      }
    });
  }

  /** Liga o clique de um elemento (float, botão ou link) ao WhatsApp. */
  function bindWhatsAppElement(el, index) {
    if (!el || el.dataset.waBound) return;
    el.dataset.waBound = '1';

    el.addEventListener('click', function (ev) {
      // Links <a> já tiveram o href atualizado; o clique monta a URL
      // do instante (com os números selecionados) e abre em nova aba.
      if (el.tagName === 'A') {
        ev.preventDefault();
        var url = 'https://wa.me/' + getWhatsAppNumber() + '?text=' +
          encodeURIComponent(messageForElement(el));
        window.open(url, '_blank');
      } else {
        // Botões: se for <a> sem href ou <button>, abre direto.
        ev.preventDefault();
        openWhatsApp(messageForElement(el));
      }
    });
  }

  /** Liga todos os pontos e atualiza os hrefs estáticos. */
  function initWhatsApp() {
    findWhatsAppElements().forEach(bindWhatsAppElement);
    updateWhatsAppLinks();
  }

  /* ------------------------------------------------------------------ */
  /* Pix: sugere enviar o comprovante (evento opcional 'pix:created')     */
  /* ------------------------------------------------------------------ */

  /** link do comprovante Pix (pode ser lido por outros scripts). */
  function onPixCreated(ev) {
    var detail = (ev && ev.detail) || {};
    var message = buildReceiptMessage(detail);
    var url = 'https://wa.me/' + getWhatsAppNumber() + '?text=' + encodeURIComponent(message);

    // Guarda o link para outros scripts / para o float usar em seguida.
    window._whatsappReceiptLink = url;

    // Aponta o botão flutuante (e possíveis placeholders) para o comprovante.
    var targets = Array.prototype.slice.call(
      document.querySelectorAll('#btn-whatsapp-float, [data-whatsapp-comprovante], [data-whatsapp-receipt]')
    );
    targets.forEach(function (el) {
      if (!el) return;
      if (el.tagName === 'A') {
        el.setAttribute('href', url);
        el.setAttribute('target', '_blank');
        el.setAttribute('rel', 'noopener noreferrer');
      }
      el.setAttribute('data-whatsapp-comprovante-link', url);
      // Se houver um aviso/link junto, mostra o texto de sugestão.
      var label = el.querySelector('.whatsapp-comprovante-label');
      if (label) label.textContent = 'Enviar comprovante do Pix 💚';
    });

    // Também atualiza os demais links com a mensagem de comprovante
    // quando um comprovante existe (clicar abre com números + Pix).
    window._whatsappReceiptMessage = message;
  }

  /* ------------------------------------------------------------------ */
  /* Inicialização                                                       */
  /* ------------------------------------------------------------------ */

  document.addEventListener('pix:created', onPixCreated);
  window.addEventListener('pix:created', onPixCreated);

  // Sempre que a seleção mudar, refresca os hrefs estáticos.
  ['rifa:change', 'rifa:selected', 'change'].forEach(function (evtName) {
    document.addEventListener(evtName, function () { updateWhatsAppLinks(); });
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initWhatsApp);
  } else {
    initWhatsApp();
  }

  /* ------------------------------------------------------------------ */
  /* API pública                                                         */
  /* ------------------------------------------------------------------ */

  window.buildWhatsAppMessage = buildWhatsAppMessage;
  window.openWhatsApp = openWhatsApp;
  window.updateWhatsAppLinks = updateWhatsAppLinks;
  window.buildReceiptMessage = buildReceiptMessage;
  window.getWhatsAppNumber = getWhatsAppNumber;
})();
