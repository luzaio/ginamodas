/**
 * numbers.js — Grade da rifa "Donna Gina Moda Plus" (100 números, R$10 cada).
 *
 * Responsabilidades:
 *  - gerar os 100 botões (01–100) dentro de #numbers-grid;
 *  - guardar a seleção em um Set persistido no localStorage;
 *  - atualizar contador/total na página;
 *  - emitir o evento global 'rifa:change' para carrinho/checkout/WhatsApp;
 *  - expor a API window.Rifa (getSelected, clear, set, total).
 *
 * Depende apenas de config.js (window.RIFA_CONFIG / window.formatBRL, opcionais).
 */
(function () {
  'use strict';

  /* ------------------------------------------------------------------ *
   * Constantes
   * ------------------------------------------------------------------ */

  var TOTAL_NUMEROS = 100;               // rifa de 01 a 100
  var STORAGE_KEY = 'donnaGina:selected';
  var PRECO_FALLBACK = 10;               // usado se config.js não definir o preço

  // Números já vendidos: hoje não há backend, então nasce vazio.
  // Futuro (com backend): preencher aqui, ex. const SOLD = new Set([7, 23]);
  // ou carregar via fetch e chamar marcarVendidos([...]). Botões de vendidos
  // nascem desabilitados e não entram na seleção.
  var SEED_SOLD = [4, 9, 11, 17, 23, 28, 34, 39, 41, 48, 52, 57, 61, 69, 74, 82, 86, 91, 96, 100];
  var SOLD = new Set(SEED_SOLD);
  var HELD_KEY = 'donnaGina:held';
  var HELD = new Set();

  /* ------------------------------------------------------------------ *
   * Estado
   * ------------------------------------------------------------------ */

  // Set de números selecionados (inteiros de 1 a 100).
  var selected = new Set();

  /* ------------------------------------------------------------------ *
   * Helpers
   * ------------------------------------------------------------------ */

  // Preço de cada número: config.js tem prioridade, senão o fallback.
  function precoPorNumero() {
    var cfg = window.RIFA_CONFIG;
    var preco = cfg && Number(cfg.precoPorNumero);
    return Number.isFinite(preco) && preco > 0 ? preco : PRECO_FALLBACK;
  }

  // Formata em reais usando window.formatBRL (config.js), com fallback local.
  function formatBRL(valor) {
    if (typeof window.formatBRL === 'function') {
      return window.formatBRL(valor);
    }
    return 'R$ ' + valor.toFixed(2).replace('.', ',');
  }

  // Formata o número com dois dígitos: 1 -> "01", 100 -> "100".
  function pad(n) {
    return String(n).padStart(2, '0');
  }

  // Seleção ordenada (crescente) como array — formato usado no evento e no checkout.
  function sortedList() {
    return Array.from(selected).sort(function (a, b) { return a - b; });
  }

  // Valor total da seleção atual.
  function calcTotal() {
    return selected.size * precoPorNumero();
  }

  // Toast opcional: só usa se outra parte da página (ex. main.js) expôs.
  function toast(msg) {
    if (typeof window.showToast === 'function') {
      window.showToast(msg);
    }
  }

  // Número válido para seleção: inteiro, dentro da faixa e não vendido.
  function isSelectable(n) {
    return Number.isInteger(n) && n >= 1 && n <= TOTAL_NUMEROS && !SOLD.has(n);
  }

  /* ------------------------------------------------------------------ *
   * Persistência (localStorage com proteção try/catch)
   * ------------------------------------------------------------------ */

  function save() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sortedList()));
    } catch (err) {
      /* storage indisponível (modo privado/quotas): segue só em memória */
    }
  }

  function restore() {
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      var list = JSON.parse(raw);
      if (!Array.isArray(list)) return;
      list.forEach(function (n) {
        if (isSelectable(n)) selected.add(n);
      });
    } catch (err) {
      /* JSON inválido ou storage bloqueado: começa sem seleção */
    }
  }

  /* ------------------------------------------------------------------ *
   * Renderização
   * ------------------------------------------------------------------ */

  function updateCounters() {
    var countEl = document.getElementById('selected-count');
    if (countEl) {
      countEl.textContent =
        selected.size + (selected.size === 1 ? ' selecionado' : ' selecionados');
    }
    var totalCountEl = document.getElementById('total-count');
    if (totalCountEl) totalCountEl.textContent = selected.size + (selected.size === 1 ? ' número' : ' números');
    var totalPriceEl = document.getElementById('total-price');
    if (totalPriceEl) totalPriceEl.textContent = formatBRL(calcTotal());
  }

  // Reflete a seleção atual nos botões da grade (classe + aria-pressed).
  function syncButtons() {
    var grid = document.getElementById('numbers-grid');
    if (!grid) return;
    grid.querySelectorAll('.number-btn').forEach(function (btn) {
      var n = Number(btn.getAttribute('data-number'));
      var on = selected.has(n);
      btn.classList.toggle('selected', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  // Desenha os chips do carrinho (#selected-list), se existir na página.
  function renderList() {
    var list = document.getElementById('selected-list');
    if (!list) return;
    list.textContent = ''; // limpa chips anteriores
    if (selected.size === 0) {
      var placeholder = document.createElement('span');
      placeholder.className = 'selected-empty';
      placeholder.textContent = 'Nenhum número selecionado';
      list.appendChild(placeholder);
      return;
    }
    sortedList().forEach(function (n) {
      var chip = document.createElement('span');
      chip.className = 'selected-chip';
      chip.textContent = pad(n);
      list.appendChild(chip);
    });
  }

  /* ------------------------------------------------------------------ *
   * Evento global 'rifa:change'
   * ------------------------------------------------------------------ */

  function dispatchChange() {
    window.dispatchEvent(new CustomEvent('rifa:change', {
      detail: {
        selected: sortedList(),
        count: selected.size,
        total: calcTotal()
      }
    }));
  }

  // Atualiza a lista do carrinho sempre que a seleção mudar (inclusive
  // alterações feitas por checkout/cart via window.Rifa.set/clear).
  window.addEventListener('rifa:change', renderList);

  /* ------------------------------------------------------------------ *
   * Interação
   * ------------------------------------------------------------------ */

  function toggle(n) {
    if (!isSelectable(n)) {
      toast('Número ' + pad(n) + ' indisponível');
      return;
    }
    if (selected.has(n)) {
      selected.delete(n);
    } else {
      selected.add(n);
    }
    save();
    syncButtons();
    updateCounters();
    dispatchChange();
  }

  /* ------------------------------------------------------------------ *
   * Geração da grade
   * ------------------------------------------------------------------ */

  function generate() {
    var grid = document.getElementById('numbers-grid');
    if (!grid) return;
    grid.textContent = ''; // garante grade limpa antes de gerar

    for (var i = 1; i <= TOTAL_NUMEROS; i++) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'number-btn';
      btn.dataset.number = String(i);
      btn.textContent = pad(i);
      btn.setAttribute('aria-label', 'Número ' + pad(i));

      var sold = SOLD.has(i);
      if (sold) {
        // Futuro: números vendidos nascem desabilitados (sem backend por ora).
        btn.classList.add('sold');
        btn.disabled = true;
        btn.setAttribute('aria-pressed', 'false');
        btn.setAttribute('aria-label', 'Número ' + pad(i) + ' (vendido)');
      } else {
        btn.setAttribute('aria-pressed', selected.has(i) ? 'true' : 'false');
        if (selected.has(i)) btn.classList.add('selected');
        // Closure captura o número da vez (i é var, mas o clique usa bind).
        btn.addEventListener('click', toggle.bind(null, i));
      }
      grid.appendChild(btn);
    }
  }

  /* ------------------------------------------------------------------ *
   * API pública: window.Rifa (usada por checkout/whatsapp/cart)
   * ------------------------------------------------------------------ */

  function set(list) {
    selected.clear();
    if (Array.isArray(list)) {
      list.forEach(function (n) {
        var num = Number(n);
        if (isSelectable(num)) selected.add(num);
      });
    }
    save();
    syncButtons();
    updateCounters();
    dispatchChange();
  }

  function clear() {
    set([]);
  }

  function rememberHeld(list) {
    list.forEach(function (n) { HELD.add(Number(n)); });
    try { sessionStorage.setItem(HELD_KEY, JSON.stringify(Array.from(HELD))); } catch (e) {}
  }

  function restoreHeld() {
    try {
      var raw = sessionStorage.getItem(HELD_KEY);
      var list = raw ? JSON.parse(raw) : [];
      if (Array.isArray(list)) list.forEach(function (n) { HELD.add(Number(n)); });
    } catch (e) {}
  }

  function sameSet(a, b) {
    if (a.size !== b.size) return false;
    var ok = true;
    a.forEach(function (n) { if (!b.has(n)) ok = false; });
    return ok;
  }

  function applyTaken(soldList, reservedList) {
    var sold = new Set((soldList || []).map(Number));
    var reserved = new Set((reservedList || []).map(Number));
    var nextSold = new Set();
    sold.forEach(function (n) { HELD.delete(n); nextSold.add(n); });
    reserved.forEach(function (n) { if (!HELD.has(n)) nextSold.add(n); });
    SEED_SOLD.forEach(function (n) { nextSold.add(n); });
    var dropped = [];
    Array.from(selected).forEach(function (n) {
      if (nextSold.has(n)) {
        selected.delete(n);
        dropped.push(n);
      }
    });
    var changed = !sameSet(SOLD, nextSold) || dropped.length > 0;
    SOLD = nextSold;
    if (!changed) return;
    save();
    rememberHeld([]);
    generate();
    updateCounters();
    renderList();
    dispatchChange();
    if (dropped.length) toast('O número ' + dropped.map(pad).join(', ') + ' já foi reservado.');
  }

  function apiBase() {
    var cfg = window.SIGILO_CONFIG || {};
    return String(cfg.endpoint || '').replace(/\/pix\/?$/, '');
  }

  function pullNumbers() {
    var base = apiBase();
    if (!base) return;
    fetch(base + '/numbers', { cache: 'no-store' })
      .then(function (resp) { return resp.ok ? resp.json() : null; })
      .then(function (data) {
        if (!data) return;
        applyTaken(data.sold, data.reserved);
      })
      .catch(function () {});
  }

  window.Rifa = {
    getSelected: sortedList,
    clear: clear,
    set: set,
    total: calcTotal,
    hold: rememberHeld,
    refresh: pullNumbers
  };

  /* ------------------------------------------------------------------ *
   * Inicialização
   * ------------------------------------------------------------------ */

  function init() {
    restoreHeld();
    restore();
    generate();
    updateCounters();
    renderList();
    dispatchChange();
    pullNumbers();
    setInterval(pullNumbers, 8000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
